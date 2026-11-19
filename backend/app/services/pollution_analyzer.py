"""Deterministic pollution metrics: Indian National AQI (NAQI), severity, trends, dispersion.

NAQI breakpoints follow the Central Pollution Control Board (CPCB) National Air
Quality Index (2014). The official index uses 24-hour averages for PM2.5, PM10,
NO2 and SO2 and 8-hour averages for CO and O3. We compute those averages from
hourly values when enough hours are available, and report which averaging
period was actually used.
"""
from __future__ import annotations

from dataclasses import dataclass
from statistics import mean
from typing import Any, Sequence

# (concentration upper bounds per category) for Good..Severe. Severe upper bound is an
# extension used only to scale 401-500; the index is capped at 500.
BREAKPOINTS: dict[str, list[float]] = {
    "pm10": [50, 100, 250, 350, 430, 600],
    "pm2_5": [30, 60, 90, 120, 250, 380],
    "no2": [40, 80, 180, 280, 400, 800],
    "o3": [50, 100, 168, 208, 748, 1000],
    "co": [1.0, 2.0, 10, 17, 34, 50],  # mg/m3
    "so2": [40, 80, 380, 800, 1600, 2400],
}
INDEX_BANDS = [(0, 50), (51, 100), (101, 200), (201, 300), (301, 400), (401, 500)]
AVERAGING_HOURS = {"pm10": 24, "pm2_5": 24, "no2": 24, "so2": 24, "co": 8, "o3": 8}
MIN_HOURS = {24: 16, 8: 6}

CATEGORIES = [
    {"key": "good", "label": "Good", "range": [0, 50], "severity": 0,
     "health": "Minimal impact."},
    {"key": "satisfactory", "label": "Satisfactory", "range": [51, 100], "severity": 1,
     "health": "Minor breathing discomfort to sensitive people."},
    {"key": "moderate", "label": "Moderate", "range": [101, 200], "severity": 2,
     "health": "Breathing discomfort to people with lung disease such as asthma, and discomfort to "
               "people with heart disease, children and older adults."},
    {"key": "poor", "label": "Poor", "range": [201, 300], "severity": 3,
     "health": "Breathing discomfort to most people on prolonged exposure."},
    {"key": "very_poor", "label": "Very Poor", "range": [301, 400], "severity": 4,
     "health": "Respiratory illness on prolonged exposure."},
    {"key": "severe", "label": "Severe", "range": [401, 500], "severity": 5,
     "health": "Affects healthy people and seriously impacts those with existing diseases."},
]
HEALTH_SOURCE = "CPCB National Air Quality Index health statements"

POLLUTANT_LABELS = {"pm2_5": "PM2.5", "pm10": "PM10", "no2": "NO₂", "so2": "SO₂", "co": "CO", "o3": "O₃"}
WHO_24H_GUIDELINE = {"pm2_5": 15.0, "pm10": 45.0, "no2": 25.0, "so2": 40.0}  # WHO AQG 2021, µg/m³


def sub_index(pollutant: str, concentration: float | None) -> int | None:
    if concentration is None or concentration < 0:
        return None
    bps = BREAKPOINTS[pollutant]
    lo_c = 0.0
    for i, hi_c in enumerate(bps):
        if concentration <= hi_c or i == len(bps) - 1:
            lo_i, hi_i = INDEX_BANDS[i]
            c = min(concentration, hi_c)
            span = hi_c - lo_c
            value = lo_i + (hi_i - lo_i) * ((c - lo_c) / span if span else 0)
            return int(round(min(value, 500)))
        lo_c = hi_c
    return 500


def category_for(aqi: float | None) -> dict[str, Any] | None:
    if aqi is None:
        return None
    for cat in CATEGORIES:
        if aqi <= cat["range"][1]:
            return cat
    return CATEGORIES[-1]


def _clean(values: Sequence[float | None]) -> list[float]:
    return [v for v in values if v is not None]


@dataclass
class AveragedConcentration:
    value: float | None
    hours_used: int
    period_hours: int


def averaged(pollutant: str, hourly_values: Sequence[float | None]) -> AveragedConcentration:
    """Average over the standard NAQI period, using the most recent hours (oldest first input)."""
    period = AVERAGING_HOURS[pollutant]
    window = _clean(hourly_values[-period:])
    if len(window) >= MIN_HOURS[period]:
        return AveragedConcentration(round(mean(window), 2), len(window), period)
    latest = _clean(hourly_values[-1:])
    return AveragedConcentration(latest[0] if latest else None, len(latest), 1)


def compute_naqi(history: dict[str, Sequence[float | None]]) -> dict[str, Any]:
    """history: pollutant -> hourly concentrations up to now (oldest first).

    Concentrations in µg/m³ except CO which must already be mg/m³.
    """
    subs: dict[str, int] = {}
    averages: dict[str, dict[str, Any]] = {}
    for pol in BREAKPOINTS:
        series = history.get(pol)
        if not series:
            continue
        avg = averaged(pol, series)
        idx = sub_index(pol, avg.value)
        if idx is not None:
            subs[pol] = idx
            averages[pol] = {"value": avg.value, "hours_used": avg.hours_used, "period_hours": avg.period_hours}
    has_pm = "pm2_5" in subs or "pm10" in subs
    valid = has_pm and len(subs) >= 3
    if not subs:
        return {"value": None, "valid": False, "sub_indices": {}, "averages": {}, "dominant_pollutant": None,
                "category": None}
    dominant = max(subs, key=lambda k: subs[k])
    value = subs[dominant]
    cat = category_for(value)
    return {
        "value": value,
        "valid": valid,
        "scale": "IN_NAQI",
        "sub_indices": subs,
        "averages": averages,
        "dominant_pollutant": dominant,
        "dominant_label": POLLUTANT_LABELS[dominant],
        "category": cat,
        "method_note": (
            "Indian NAQI computed by AIRenv from hourly concentrations using CPCB breakpoints "
            "(24-h means for PM2.5/PM10/NO₂/SO₂, 8-h means for CO/O₃). It is an estimate, not an "
            "official CPCB bulletin."
        ),
    }


def hourly_aqi_series(hourly: dict[str, list[float | None]], times: list[str]) -> list[int | None]:
    """Rolling NAQI value for every hour (uses trailing averaging windows)."""
    out: list[int | None] = []
    for i in range(len(times)):
        hist = {p: hourly[p][: i + 1] for p in BREAKPOINTS if p in hourly}
        out.append(compute_naqi(hist)["value"])
    return out


def trend(values: Sequence[float | None], window: int = 3) -> dict[str, Any]:
    """Compare the mean of the latest `window` hours with the previous `window` hours."""
    clean = _clean(values)
    if len(clean) < window * 2:
        return {"direction": "unknown", "change_pct": None, "window_hours": window}
    recent = mean(clean[-window:])
    prior = mean(clean[-2 * window: -window])
    if prior <= 0:
        return {"direction": "unknown", "change_pct": None, "window_hours": window}
    change = (recent - prior) / prior * 100
    direction = "rising" if change > 10 else "falling" if change < -10 else "steady"
    return {"direction": direction, "change_pct": round(change, 1), "window_hours": window,
            "recent_mean": round(recent, 1), "prior_mean": round(prior, 1)}


def forecast_outlook(current: float | None, future: Sequence[float | None], hours: int = 12) -> dict[str, Any]:
    clean = _clean(future[:hours])
    if current is None or not clean:
        return {"direction": "unknown", "peak": None, "peak_index": None, "mean": None, "hours": hours}
    peak = max(clean)
    avg = mean(clean)
    change = (avg - current) / current * 100 if current else 0
    direction = "worsening" if change > 15 else "improving" if change < -15 else "similar"
    return {"direction": direction, "peak": round(peak, 1), "peak_index": list(future[:hours]).index(peak),
            "mean": round(avg, 1), "change_pct": round(change, 1), "hours": hours}


def dispersion(wind_speed_kmh: float | None, boundary_layer_m: float | None) -> dict[str, Any]:
    """Qualitative dispersion potential. Low wind and a shallow mixing layer trap pollutants near the ground."""
    if wind_speed_kmh is None and boundary_layer_m is None:
        return {"level": "unknown", "explanation": "Wind and mixing-height data unavailable."}
    poor_wind = wind_speed_kmh is not None and wind_speed_kmh < 5
    poor_blh = boundary_layer_m is not None and boundary_layer_m < 300
    fair_wind = wind_speed_kmh is not None and wind_speed_kmh < 12
    if poor_wind and (poor_blh or boundary_layer_m is None):
        level = "poor"
        text = "Near-calm winds and a shallow mixing layer limit how quickly pollutants disperse."
    elif poor_wind or poor_blh:
        level = "limited"
        text = "Either light winds or a shallow mixing layer is limiting dispersion."
    elif fair_wind:
        level = "moderate"
        text = "Moderate winds allow some dispersion of local emissions."
    else:
        level = "good"
        text = "Stronger winds help disperse local emissions."
    return {"level": level, "explanation": text, "wind_speed_kmh": wind_speed_kmh,
            "boundary_layer_m": boundary_layer_m}


def best_windows(times: list[str], values: list[float | None], duration_hours: int,
                 day_start: int = 6, day_end: int = 21, limit: int = 3) -> list[dict[str, Any]]:
    """Lowest-mean contiguous windows within daytime hours. Times are local ISO strings."""
    candidates: list[dict[str, Any]] = []
    for i in range(len(times) - duration_hours + 1):
        window_vals = values[i: i + duration_hours]
        if any(v is None for v in window_vals):
            continue
        hour = int(times[i][11:13])
        end_hour = hour + duration_hours
        if hour < day_start or end_hour > day_end:
            continue
        candidates.append({"start": times[i], "end_index": i + duration_hours, "start_index": i,
                           "mean": round(mean(window_vals), 1)})  # type: ignore[arg-type]
    candidates.sort(key=lambda c: c["mean"])
    chosen: list[dict[str, Any]] = []
    for c in candidates:
        if all(abs(c["start_index"] - o["start_index"]) >= duration_hours for o in chosen):
            chosen.append(c)
        if len(chosen) >= limit:
            break
    return chosen


def severity_level(aqi: int | None) -> str:
    cat = category_for(aqi)
    if cat is None:
        return "unknown"
    return {0: "low", 1: "low", 2: "moderate", 3: "elevated", 4: "high", 5: "severe"}[cat["severity"]]
