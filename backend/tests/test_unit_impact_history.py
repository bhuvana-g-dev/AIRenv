"""Unit tests for impact calculations and historical analytics."""

import asyncio
from statistics import mean

import pytest
from pydantic import ValidationError

from app.db.store import get_store
from app.services import historical_analytics as ha
from app.services import impact_calculator as ic

# --------------------------------------------------------------------------- trip_emissions


def test_trip_vehicle_factor_is_shared_by_occupants_but_passenger_factor_is_not():
    r = ic.trip_emissions(
        ic.TripRequest(
            baseline_mode="petrol_car",
            alternative_mode="metro",
            distance_km=10,
            trips_per_week=5,
            baseline_occupants=2,
            alternative_occupants=4,
        )
    )
    assert r["km_per_week"] == 50
    assert r["baseline_kg_per_week"] == pytest.approx(0.164 / 2 * 50, abs=0.005)  # 4.1
    assert r["alternative_kg_per_week"] == pytest.approx(0.035 * 50, abs=0.005)  # 1.75, occupants ignored
    week = r["avoided_kg"]["week"]
    assert week["estimate"] == pytest.approx(2.35, abs=0.005)
    assert week["low"] == pytest.approx(2.35 * 0.75, abs=0.006)
    assert week["high"] == pytest.approx(2.35 * 1.25, abs=0.006)
    assert r["avoided_kg"]["month"]["estimate"] == pytest.approx(2.35 * 4.345, abs=0.006)
    assert r["avoided_kg"]["year"]["estimate"] == pytest.approx(2.35 * 52.14, abs=0.006)
    assert r["factors"]["baseline"]["occupants"] == 2
    assert r["factors"]["alternative"]["per"] == "passenger"


def test_trip_carpool_halves_per_person_emissions():
    r = ic.trip_emissions(
        ic.TripRequest(
            baseline_mode="diesel_car",
            alternative_mode="diesel_car",
            distance_km=20,
            trips_per_week=1,
            alternative_occupants=2,
        )
    )
    assert r["baseline_kg_per_week"] == pytest.approx(3.36, abs=0.005)
    assert r["alternative_kg_per_week"] == pytest.approx(1.68, abs=0.005)
    assert r["avoided_kg"]["week"]["estimate"] == pytest.approx(1.68, abs=0.005)


def test_trip_walk_cycle_avoids_everything():
    r = ic.trip_emissions(
        ic.TripRequest(baseline_mode="two_wheeler", alternative_mode="walk_cycle", distance_km=4, trips_per_week=10)
    )
    assert r["alternative_kg_per_week"] == 0
    assert r["avoided_kg"]["week"]["estimate"] == r["baseline_kg_per_week"] == pytest.approx(4.52, abs=0.005)


def test_electric_mode_factors_use_indian_grid():
    assert ic.TRANSPORT_FACTORS["electric_car"]["kg_per_km"] == 0.107
    assert ic.TRANSPORT_FACTORS["electric_two_wheeler"]["kg_per_km"] == 0.025


@pytest.mark.parametrize("base, alt", [("rocket", "metro"), ("petrol_car", "teleport")])
def test_trip_unknown_mode_raises(base, alt):
    with pytest.raises(ValueError, match="Unknown transport mode"):
        ic.trip_emissions(ic.TripRequest(baseline_mode=base, alternative_mode=alt, distance_km=1, trips_per_week=1))


@pytest.mark.parametrize(
    "field, value", [("distance_km", 0), ("distance_km", 501), ("trips_per_week", 0), ("baseline_occupants", 9)]
)
def test_trip_request_validation(field, value):
    kwargs = {"baseline_mode": "bus", "alternative_mode": "metro", "distance_km": 5, "trips_per_week": 2, field: value}
    with pytest.raises(ValidationError):
        ic.TripRequest(**kwargs)


def test_trip_band_is_ordered_when_alternative_is_dirtier():
    r = ic.trip_emissions(
        ic.TripRequest(baseline_mode="metro", alternative_mode="petrol_car", distance_km=10, trips_per_week=5)
    )
    week = r["avoided_kg"]["week"]
    assert week["estimate"] < 0
    assert week["low"] <= week["estimate"] <= week["high"]


# --------------------------------------------------------------------------- energy_emissions


def test_energy_electricity_only():
    r = ic.energy_emissions(ic.EnergyRequest(electricity_kwh_saved_per_month=100))
    assert r["electricity_kg_per_month"] == 71.6
    assert r["lpg_kg_per_month"] == 0
    assert r["total_kg_per_month"] == {"estimate": 71.6, "low": 60.9, "high": 82.3}
    assert r["total_kg_per_year"] == 859.2


def test_energy_lpg_only():
    r = ic.energy_emissions(ic.EnergyRequest(lpg_kg_saved_per_month=2))
    assert r["lpg_kg_per_month"] == 6.0
    assert r["total_kg_per_year"] == 71.6


def test_energy_zero():
    r = ic.energy_emissions(ic.EnergyRequest())
    assert r["total_kg_per_month"] == {"estimate": 0, "low": 0, "high": 0}
    assert r["total_kg_per_year"] == 0


# --------------------------------------------------------------------------- community_emissions


def test_community_emissions_uses_only_verified_records_with_distance():
    records = [
        {"verified": True, "km_shifted": 100, "baseline_mode": "petrol_car", "alternative_mode": "metro"},
        {"verified": False, "km_shifted": 1000, "baseline_mode": "petrol_car", "alternative_mode": "metro"},
        {"verified": True, "baseline_mode": "petrol_car", "alternative_mode": "metro"},
        {"verified": True, "km_shifted": 0, "baseline_mode": "petrol_car", "alternative_mode": "metro"},
        {"verified": True, "km_shifted": 50, "baseline_mode": "hovercraft", "alternative_mode": "metro"},
        {
            "verified": True,
            "km_shifted": 10,
            "baseline_mode": "petrol_car",
            "alternative_mode": "petrol_car",
            "occupants": 2,
        },
    ]
    r = ic.community_emissions(records)
    assert r["records_used"] == 2
    expected = (0.164 - 0.035) * 100 + (0.164 - 0.082) * 10  # 12.9 + 0.82
    assert r["estimate_kg"] == pytest.approx(expected, abs=0.05)
    assert r["low_kg"] == pytest.approx(expected * 0.75, abs=0.05)
    assert r["high_kg"] == pytest.approx(expected * 1.25, abs=0.05)


def test_community_emissions_empty():
    r = ic.community_emissions([])
    assert (r["estimate_kg"], r["records_used"]) == (0, 0)


# --------------------------------------------------------------------------- exposure_comparison

TIMES_48 = [f"2026-11-{20 + h // 24}T{h % 24:02d}:00" for h in range(48)]


def test_exposure_planned_hour_with_missing_value():
    vals = [100.0] * 48
    vals[8] = None
    r = ic.exposure_comparison(
        TIMES_48, vals, 0, ic.ExposureRequest(activity_hours=1, planned_start="2026-11-20T08:00")
    )
    assert r["planned"] is None
    assert r["reduction_pct"] is None
    assert r["best"] is not None


def test_exposure_planned_start_outside_range_uses_first_hour():
    vals = [100.0] * 48
    vals[0] = 80.0
    r = ic.exposure_comparison(
        TIMES_48, vals, 0, ic.ExposureRequest(activity_hours=1, intensity="sedentary", planned_start="2030-01-01T08:00")
    )
    assert r["planned"]["start"] == "2026-11-20T00:00"
    assert r["planned"]["inhaled_ug"] == 20.0  # 80 µg/m³ × 0.25 m³/h × 1 h
    assert r["inhalation_rate_m3_per_h"] == 0.25


def test_exposure_fractional_hours():
    vals = [100.0] * 48
    r = ic.exposure_comparison(
        TIMES_48, vals, 0, ic.ExposureRequest(activity_hours=1.5, intensity="light", planned_start="2026-11-20T10:00")
    )
    # The window spans round(1.5) = 2 hours, but the dose uses the real 1.5 h.
    assert r["planned"]["inhaled_ug"] == 108.0
    assert r["planned"]["mean_pm2_5"] == 100.0
    assert r["planned"]["sub_index"] == 234


def test_exposure_quarter_hour_uses_one_hour_window():
    vals = [40.0] * 48
    r = ic.exposure_comparison(TIMES_48, vals, 0, ic.ExposureRequest(activity_hours=0.25, intensity="high"))
    assert r["planned"]["inhaled_ug"] == 30.0  # 40 × 3.0 × 0.25


def test_exposure_respects_now_index():
    vals = [200.0] * 48
    vals[2] = 10.0  # in the past relative to now_index=6, must be ignored
    vals[15] = 50.0
    r = ic.exposure_comparison(TIMES_48, vals, 6, ic.ExposureRequest(activity_hours=1))
    assert r["planned"]["start"] == "2026-11-20T06:00"
    assert r["best"]["start"] == "2026-11-20T15:00"
    assert r["reduction_pct"] == 75.0


def test_exposure_zero_dose_has_no_reduction():
    vals = [0.0] * 48
    r = ic.exposure_comparison(TIMES_48, vals, 0, ic.ExposureRequest(activity_hours=1))
    assert r["planned"]["inhaled_ug"] == 0
    assert r["reduction_pct"] is None


# --------------------------------------------------------------------------- comparisons


def _series():
    """8 days of hourly data, now = 2026-11-19T10:00 (index 178)."""
    times = [f"2026-11-{12 + h // 24}T{h % 24:02d}:00" for h in range(24 * 8)]
    hour_base = {5: 10.0, 14: 40.0, 15: 50.0, 16: 60.0, 21: 20.0}
    pm = [hour_base.get(h % 24, 100.0) for h in range(len(times))]
    now_i = 24 * 7 + 10
    pm[now_i] = 150.0
    pm[now_i - 24] = 120.0  # yesterday, same hour
    pm[now_i - 168] = 0.0  # one week ago, same hour (zero baseline)
    pm[1] = None
    aqi = [None] * 24 + [150] * (len(times) - 24)
    return {"times": times, "now_index": now_i, "hourly": {"pm2_5": pm, "aqi_in": aqi}}


def test_comparisons_yesterday_and_week_ago():
    r = ha.comparisons(_series())
    assert r["current_pm2_5"] == 150.0
    assert r["vs_yesterday_same_hour"] == {"value": 120.0, "change_pct": 25.0}
    assert r["vs_week_ago_same_hour"] == {"value": 0.0, "change_pct": None}  # zero baseline -> no pct


def test_comparisons_seven_day_mean():
    s = _series()
    r = ha.comparisons(s)
    window = [v for v in s["hourly"]["pm2_5"][10:179] if v is not None]
    expected = mean(window)
    assert r["seven_day_mean"] == round(expected, 1)
    assert r["vs_seven_day_mean_pct"] == round((150.0 - expected) / expected * 100, 1)


def test_comparisons_cleanest_daytime_hours_exclude_night():
    r = ha.comparisons(_series())
    assert [c["hour"] for c in r["typically_cleanest_daytime_hours"]] == [14, 15, 16]
    assert r["typically_cleanest_daytime_hours"][0]["pm2_5_mean"] == 40.0
    profile = {p["hour"]: p["pm2_5_mean"] for p in r["hour_of_day_profile"]}
    assert profile[5] == 10.0 and profile[21] == 20.0  # cleaner, but outside 06-20


def test_comparisons_daily_rows():
    r = ha.comparisons(_series())
    daily = r["daily"]
    assert daily[0]["date"] == "2026-11-12"
    assert daily[-1]["date"] == "2026-11-19"
    assert len(daily) == 8
    assert daily[0]["hours"] == 23  # one None hour skipped
    assert daily[0]["aqi_mean"] is None  # no AQI values on the first day
    assert daily[1]["aqi_mean"] == 150
    assert daily[-1]["hours"] == 11  # 00:00..10:00 only, never the future
    assert daily[-1]["pm2_5_max"] == 150.0


def test_comparisons_short_history_has_no_baselines():
    times = [f"2026-11-19T{h:02d}:00" for h in range(12)]
    s = {"times": times, "now_index": 5, "hourly": {"pm2_5": [50.0] * 12, "aqi_in": [None] * 12}}
    r = ha.comparisons(s)
    assert r["vs_yesterday_same_hour"] == {"value": None, "change_pct": None}
    assert r["vs_week_ago_same_hour"] == {"value": None, "change_pct": None}
    assert r["seven_day_mean"] == 50.0
    assert r["vs_seven_day_mean_pct"] == 0.0


# --------------------------------------------------------------------------- recorded history


def _snapshot(hour="2026-11-19T10:00", loc_id="28.61_77.21", is_demo=False, pm=150.0):
    return {
        "location": {"id": loc_id},
        "is_demo": is_demo,
        "observed_local": hour,
        "aqi": {"value": 300},
        "us_aqi": 180,
        "pollutants": {"pm2_5": {"value": pm}, "pm10": {"value": 240.0}, "no2": {"value": 60.0}},
        "weather": {"temperature_c": 18.5, "wind_speed_kmh": 4.0},
        "sources": {"air": {"type": "model"}},
    }


def test_record_snapshot_one_row_per_hour():
    async def run():
        first = await ha.record_snapshot(_snapshot())
        again = await ha.record_snapshot(_snapshot(hour="2026-11-19T10:45", pm=160.0))
        other = await ha.record_snapshot(_snapshot(hour="2026-11-19T11:00"))
        rows = await get_store().query("history")
        doc = await get_store().get("history", "28.61_77.21_2026111910")
        return first, again, other, rows, doc

    first, again, other, rows, doc = asyncio.run(run())
    assert (first, again, other) == (True, False, True)
    assert len(rows) == 2
    assert doc["hour"] == "2026-11-19T10:00"
    assert doc["pm2_5"] == 160.0  # same hour is overwritten with the newer reading
    assert doc["aqi_in"] == 300
    assert doc["temperature_c"] == 18.5
    assert doc["source_type"] == "model"


@pytest.mark.parametrize("snap", [_snapshot(is_demo=True), _snapshot(hour=None)])
def test_record_snapshot_skips_demo_and_untimed(snap):
    async def run():
        return await ha.record_snapshot(snap), await get_store().query("history")

    stored, rows = asyncio.run(run())
    assert stored is False
    assert rows == []


def test_recorded_history_sorted_limited_and_filtered():
    async def run():
        for hour in ("2026-11-19T12:00", "2026-11-19T10:00", "2026-11-19T11:00"):
            await ha.record_snapshot(_snapshot(hour=hour))
        await ha.record_snapshot(_snapshot(hour="2026-11-19T09:00", loc_id="other"))
        return (await ha.recorded_history("28.61_77.21"), await ha.recorded_history("28.61_77.21", limit=2))

    full, limited = asyncio.run(run())
    assert [r["hour"] for r in full] == ["2026-11-19T10:00", "2026-11-19T11:00", "2026-11-19T12:00"]
    assert [r["hour"] for r in limited] == ["2026-11-19T11:00", "2026-11-19T12:00"]


def test_prune_deletes_only_old_rows():
    async def run():
        store = get_store()
        await store.set(
            "history",
            "old",
            {"location_id": "x", "hour": "2000-01-01T00:00", "recorded_at": "2000-01-01T00:00:00+00:00"},
        )
        await store.set(
            "history",
            "new",
            {"location_id": "x", "hour": "2999-01-01T00:00", "recorded_at": "2999-01-01T00:00:00+00:00"},
        )
        await store.set("history", "untimed", {"location_id": "x", "hour": "2999-01-02T00:00"})
        deleted = await ha.prune(30)
        remaining = sorted(r["id"] for r in await store.query("history"))
        return deleted, remaining

    deleted, remaining = asyncio.run(run())
    assert deleted == 1
    assert remaining == ["new", "untimed"]
