"""Deterministic impact calculations. All factors, assumptions and uncertainty are returned with results.

Personal exposure (inhaled dose) is separate from emissions. Neither is presented
as a change in neighbourhood air quality.
"""
from __future__ import annotations

from statistics import mean
from typing import Any

from pydantic import BaseModel, Field

from app.services import pollution_analyzer as pa

# Adult inhalation rates by activity level, m³/hour.
# Approximate means for adults (21-<31 yrs) from US EPA Exposure Factors Handbook (2011), Table 6-2.
INHALATION_RATES = {"sedentary": 0.25, "light": 0.72, "moderate": 1.56, "high": 3.0}
INHALATION_SOURCE = "US EPA Exposure Factors Handbook (2011), Chapter 6, Table 6-2 (adult means, rounded)"

# kg CO2e per passenger-km (per vehicle-km for car modes before dividing by occupants).
# Values approximate the UK DESNZ 2024 GHG conversion factors; Indian fleets differ, hence the ±25% band.
# Electric modes use India's grid factor (CEA CO2 Baseline Database v19: 0.716 kg CO2/kWh).
GRID_FACTOR_IN = 0.716
TRANSPORT_FACTORS: dict[str, dict[str, Any]] = {
    "petrol_car": {"label": "Petrol car", "kg_per_km": 0.164, "per": "vehicle"},
    "diesel_car": {"label": "Diesel car", "kg_per_km": 0.168, "per": "vehicle"},
    "cng_car": {"label": "CNG car", "kg_per_km": 0.140, "per": "vehicle"},
    "two_wheeler": {"label": "Petrol two-wheeler", "kg_per_km": 0.113, "per": "vehicle"},
    "auto_rickshaw": {"label": "Auto-rickshaw (CNG)", "kg_per_km": 0.10, "per": "vehicle"},
    "electric_car": {"label": "Electric car (Indian grid)", "kg_per_km": round(0.15 * GRID_FACTOR_IN, 3),
                     "per": "vehicle"},
    "electric_two_wheeler": {"label": "Electric two-wheeler (Indian grid)",
                             "kg_per_km": round(0.035 * GRID_FACTOR_IN, 3), "per": "vehicle"},
    "bus": {"label": "City bus", "kg_per_km": 0.10, "per": "passenger"},
    "metro": {"label": "Metro / rail", "kg_per_km": 0.035, "per": "passenger"},
    "walk_cycle": {"label": "Walking or cycling", "kg_per_km": 0.0, "per": "passenger"},
}
TRANSPORT_SOURCE = ("Approximate factors based on UK DESNZ 2024 GHG conversion factors; electric modes use "
                    "CEA CO2 Baseline Database v19 grid factor (0.716 kg/kWh).")
LPG_KG_CO2_PER_KG = 2.985  # IPCC 2006 default: 63.1 t CO2/TJ × 47.3 TJ/kt
UNCERTAINTY = 0.25


class ExposureRequest(BaseModel):
    activity_hours: float = Field(1.0, ge=0.25, le=12)
    intensity: str = Field("moderate", pattern="^(sedentary|light|moderate|high)$")
    planned_start: str | None = Field(None, description="Local ISO hour, e.g. 2026-11-20T08:00")


class TripRequest(BaseModel):
    baseline_mode: str
    alternative_mode: str
    distance_km: float = Field(gt=0, le=500, description="One-way trip distance")
    trips_per_week: float = Field(gt=0, le=50)
    baseline_occupants: int = Field(1, ge=1, le=8)
    alternative_occupants: int = Field(1, ge=1, le=8)


class EnergyRequest(BaseModel):
    electricity_kwh_saved_per_month: float = Field(0, ge=0, le=10000)
    lpg_kg_saved_per_month: float = Field(0, ge=0, le=500)


def exposure_comparison(times: list[str], pm25: list[float | None], now_index: int,
                        req: ExposureRequest) -> dict[str, Any]:
    hours = max(1, round(req.activity_hours))
    rate = INHALATION_RATES[req.intensity]
    future_times = times[now_index: now_index + 48]
    future_vals = pm25[now_index: now_index + 48]

    def dose_at(start_i: int) -> dict[str, Any] | None:
        vals = future_vals[start_i: start_i + hours]
        if len(vals) < hours or any(v is None for v in vals):
            return None
        conc = mean(vals)  # type: ignore[arg-type]
        return {"start": future_times[start_i], "mean_pm2_5": round(conc, 1),
                "inhaled_ug": round(conc * rate * req.activity_hours, 1),
                "sub_index": pa.sub_index("pm2_5", conc)}

    planned_i = 0
    if req.planned_start:
        prefix = req.planned_start[:13]
        planned_i = next((i for i, t in enumerate(future_times) if t[:13] == prefix), 0)
    planned = dose_at(planned_i)
    windows = pa.best_windows(future_times, future_vals, hours)  # type: ignore[arg-type]
    alternatives = [d for d in (dose_at(w["start_index"]) for w in windows) if d]
    best = alternatives[0] if alternatives else None
    reduction = None
    if planned and best and planned["inhaled_ug"] > 0:
        reduction = round((planned["inhaled_ug"] - best["inhaled_ug"]) / planned["inhaled_ug"] * 100, 1)
    return {
        "planned": planned,
        "alternatives": alternatives,
        "best": best,
        "reduction_pct": reduction,
        "inhalation_rate_m3_per_h": rate,
        "assumptions": [
            f"Inhaled PM2.5 dose = outdoor PM2.5 concentration × inhalation rate ({rate} m³/h for "
            f"{req.intensity} activity) × duration ({req.activity_hours} h).",
            "Uses the CAMS model forecast for your grid cell; actual street-level concentrations vary.",
            "Assumes the activity happens outdoors for the full duration. Indoor air is not measured.",
            "Adult inhalation rates; children breathe more air per kg of body weight.",
            "This compares exposure only. It does not change the air quality in your area.",
        ],
        "sources": [INHALATION_SOURCE, "Open-Meteo Air Quality API (CAMS) forecast"],
        "uncertainty": "Forecast concentrations carry substantial uncertainty, especially beyond 24 hours.",
    }


def _per_passenger(mode: str, occupants: int) -> float:
    f = TRANSPORT_FACTORS[mode]
    return f["kg_per_km"] / occupants if f["per"] == "vehicle" else f["kg_per_km"]


def trip_emissions(req: TripRequest) -> dict[str, Any]:
    if req.baseline_mode not in TRANSPORT_FACTORS or req.alternative_mode not in TRANSPORT_FACTORS:
        raise ValueError("Unknown transport mode")
    km_week = req.distance_km * req.trips_per_week
    base = _per_passenger(req.baseline_mode, req.baseline_occupants) * km_week
    alt = _per_passenger(req.alternative_mode, req.alternative_occupants) * km_week
    avoided_week = base - alt

    def band(v: float) -> dict[str, float]:
        return {"estimate": round(v, 2), "low": round(v * (1 - UNCERTAINTY), 2),
                "high": round(v * (1 + UNCERTAINTY), 2)}

    return {
        "km_per_week": round(km_week, 1),
        "baseline_kg_per_week": round(base, 2),
        "alternative_kg_per_week": round(alt, 2),
        "avoided_kg": {"week": band(avoided_week), "month": band(avoided_week * 4.345),
                       "year": band(avoided_week * 52.14)},
        "factors": {
            "baseline": {**TRANSPORT_FACTORS[req.baseline_mode], "occupants": req.baseline_occupants},
            "alternative": {**TRANSPORT_FACTORS[req.alternative_mode], "occupants": req.alternative_occupants},
        },
        "methodology": [
            "CO₂e per person = distance × emission factor (kg CO₂e/km), divided by occupants for shared vehicles.",
            "Avoided = baseline emissions − alternative emissions for the same distance.",
            f"Uncertainty band ±{int(UNCERTAINTY * 100)}% reflects vehicle age, load, congestion and regional "
            "factor differences.",
            "This is greenhouse-gas emissions, not local air-pollutant concentration.",
        ],
        "source": TRANSPORT_SOURCE,
    }


def energy_emissions(req: EnergyRequest) -> dict[str, Any]:
    elec = req.electricity_kwh_saved_per_month * GRID_FACTOR_IN
    lpg = req.lpg_kg_saved_per_month * LPG_KG_CO2_PER_KG
    total = elec + lpg
    return {
        "electricity_kg_per_month": round(elec, 1),
        "lpg_kg_per_month": round(lpg, 1),
        "total_kg_per_month": {"estimate": round(total, 1), "low": round(total * 0.85, 1),
                               "high": round(total * 1.15, 1)},
        "total_kg_per_year": round(total * 12, 1),
        "methodology": [
            f"Electricity: kWh saved × {GRID_FACTOR_IN} kg CO₂/kWh (CEA CO₂ Baseline Database v19, Indian grid).",
            f"LPG: kg saved × {LPG_KG_CO2_PER_KG} kg CO₂/kg (IPCC 2006 default emission factor).",
            "±15% band covers grid-mix variation and metering differences.",
        ],
    }


def community_emissions(records: list[dict[str, Any]]) -> dict[str, Any]:
    """Estimated CO2e from verified community initiative records that include distances."""
    total = 0.0
    used = 0
    for r in records:
        if not r.get("verified"):
            continue
        km = r.get("km_shifted")
        base, alt = r.get("baseline_mode"), r.get("alternative_mode")
        if km and base in TRANSPORT_FACTORS and alt in TRANSPORT_FACTORS:
            total += (_per_passenger(base, 1) - _per_passenger(alt, r.get("occupants") or 1)) * km
            used += 1
    return {"estimate_kg": round(total, 1), "low_kg": round(total * (1 - UNCERTAINTY), 1),
            "high_kg": round(total * (1 + UNCERTAINTY), 1), "records_used": used,
            "note": "Estimated from verified records with reported distances; not a measurement."}
