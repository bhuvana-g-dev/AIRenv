"""Unit tests for the deterministic pollution analysis and rule-based risk detection."""
import pytest

from app.services import pollution_analyzer as pa
from app.services import risk_detection as rd

# --------------------------------------------------------------------------- sub_index


@pytest.mark.parametrize("pollutant, upper_bounds", [
    ("pm10", [50, 100, 250, 350, 430, 600]),
    ("pm2_5", [30, 60, 90, 120, 250, 380]),
    ("no2", [40, 80, 180, 280, 400, 800]),
    ("o3", [50, 100, 168, 208, 748, 1000]),
    ("co", [1.0, 2.0, 10, 17, 34, 50]),
    ("so2", [40, 80, 380, 800, 1600, 2400]),
])
def test_sub_index_hits_band_top_at_every_breakpoint(pollutant, upper_bounds):
    expected_tops = [50, 100, 200, 300, 400, 500]
    assert [pa.sub_index(pollutant, c) for c in upper_bounds] == expected_tops
    assert pa.sub_index(pollutant, 0) == 0


@pytest.mark.parametrize("pollutant, conc, expected", [
    ("pm2_5", 30.1, 51),     # just above the Good band jumps to the bottom of Satisfactory
    ("pm2_5", 40, 67),       # 51 + 49 * 10/30
    ("pm10", 51, 52),        # 51 + 49 * 1/50
    ("co", 0.5, 25),         # half of the Good band
    ("so2", 20, 25),
    ("o3", 25, 25),
    ("no2", 20, 25),
])
def test_sub_index_interpolates_inside_bands(pollutant, conc, expected):
    assert pa.sub_index(pollutant, conc) == expected


@pytest.mark.parametrize("pollutant, conc", [("pm2_5", 1000), ("pm10", 5000), ("co", 99), ("so2", 9999)])
def test_sub_index_is_capped_at_500(pollutant, conc):
    assert pa.sub_index(pollutant, conc) == 500


def test_sub_index_rejects_negative_concentration():
    assert pa.sub_index("pm10", -1) is None


# --------------------------------------------------------------------------- category_for


@pytest.mark.parametrize("aqi, key", [
    (0, "good"), (50, "good"), (50.5, "satisfactory"), (51, "satisfactory"), (100, "satisfactory"),
    (101, "moderate"), (200, "moderate"), (201, "poor"), (300, "poor"), (301, "very_poor"), (400, "very_poor"),
    (401, "severe"), (500, "severe"), (900, "severe"),
])
def test_category_for_band_edges(aqi, key):
    assert pa.category_for(aqi)["key"] == key


def test_category_for_none():
    assert pa.category_for(None) is None


# --------------------------------------------------------------------------- compute_naqi


def test_naqi_uses_8h_window_for_co_and_o3():
    hist = {
        "pm2_5": [20.0] * 24,
        "co": [10.0] * 16 + [2.0] * 8,   # 8-h mean = 2.0 mg/m³ -> 100
        "o3": [168.0] * 16 + [50.0] * 8,  # 8-h mean = 50 -> 50
    }
    r = pa.compute_naqi(hist)
    assert r["averages"]["co"] == {"value": 2.0, "hours_used": 8, "period_hours": 8}
    assert r["averages"]["o3"] == {"value": 50.0, "hours_used": 8, "period_hours": 8}
    assert r["sub_indices"]["co"] == 100
    assert r["sub_indices"]["o3"] == 50
    assert r["dominant_pollutant"] == "co"
    assert r["dominant_label"] == "CO"
    assert r["valid"] is True
    assert r["scale"] == "IN_NAQI"


def test_naqi_uses_only_last_24h_for_particulates():
    hist = {"pm2_5": [500.0] * 24 + [30.0] * 24, "no2": [40.0] * 48, "so2": [40.0] * 48}
    r = pa.compute_naqi(hist)
    assert r["averages"]["pm2_5"] == {"value": 30.0, "hours_used": 24, "period_hours": 24}
    assert r["value"] == 50
    assert r["category"]["key"] == "good"


def test_naqi_24h_average_needs_16_hours_else_latest_value():
    enough = pa.compute_naqi({"pm10": [100.0] * 16})
    assert enough["averages"]["pm10"] == {"value": 100.0, "hours_used": 16, "period_hours": 24}
    short = pa.compute_naqi({"pm10": [500.0] * 14 + [100.0]})
    assert short["averages"]["pm10"] == {"value": 100.0, "hours_used": 1, "period_hours": 1}
    assert short["value"] == 100


def test_naqi_8h_average_needs_6_hours():
    six = pa.compute_naqi({"co": [1.0] * 6})
    assert six["averages"]["co"]["period_hours"] == 8
    five = pa.compute_naqi({"co": [1.0] * 4 + [2.0]})
    assert five["averages"]["co"] == {"value": 2.0, "hours_used": 1, "period_hours": 1}


def test_naqi_ignores_missing_hours_and_drops_pollutant_when_latest_missing():
    # 15 valid hours in the 24-h window -> fallback to latest, which is None -> pollutant dropped.
    series = [None] * 9 + [80.0] * 14 + [None]
    r = pa.compute_naqi({"pm2_5": series, "pm10": [100.0] * 24, "no2": [40.0] * 24, "so2": [40.0] * 24})
    assert "pm2_5" not in r["sub_indices"]
    assert r["dominant_pollutant"] == "pm10"
    assert r["valid"] is True


def test_naqi_with_none_inside_window_averages_remaining_hours():
    series = [None] * 4 + [60.0] * 20
    r = pa.compute_naqi({"pm2_5": series})
    assert r["averages"]["pm2_5"] == {"value": 60.0, "hours_used": 20, "period_hours": 24}


@pytest.mark.parametrize("hist, valid", [
    ({"pm10": [100.0] * 24, "no2": [40.0] * 24, "so2": [40.0] * 24}, True),   # PM10 counts as PM
    ({"no2": [40.0] * 24, "so2": [40.0] * 24, "co": [1.0] * 8}, False),     # three, but no PM
    ({"pm2_5": [40.0] * 24, "no2": [40.0] * 24}, False),                    # PM, but only two
])
def test_naqi_validity_rules(hist, valid):
    r = pa.compute_naqi(hist)
    assert r["valid"] is valid
    assert r["value"] is not None


def test_naqi_empty_history():
    r = pa.compute_naqi({})
    assert r == {"value": None, "valid": False, "sub_indices": {}, "averages": {}, "dominant_pollutant": None,
                 "category": None}


def test_naqi_dominant_is_highest_sub_index():
    r = pa.compute_naqi({"pm2_5": [40.0] * 24, "pm10": [350.0] * 24, "no2": [40.0] * 24})
    assert r["sub_indices"] == {"pm10": 300, "pm2_5": 67, "no2": 50}
    assert r["dominant_pollutant"] == "pm10"
    assert r["dominant_label"] == "PM10"
    assert r["value"] == 300
    assert r["category"]["key"] == "poor"


def test_hourly_aqi_series_is_rolling():
    times = [f"2026-11-20T{h:02d}:00" for h in range(3)]
    out = pa.hourly_aqi_series({"pm2_5": [30.0, 60.0, 90.0]}, times)
    assert out == [50, 100, 200]  # fewer than 16 hours -> latest hourly value each time


# --------------------------------------------------------------------------- trend


def test_trend_insufficient_data():
    assert pa.trend([10, 10, 10, 10, 10]) == {"direction": "unknown", "change_pct": None, "window_hours": 3}


def test_trend_none_values_are_skipped_before_windowing():
    r = pa.trend([100, None, 100, 100, None, 105, 105, 105])
    assert r["direction"] == "steady"
    assert r["change_pct"] == 5.0
    assert r["recent_mean"] == 105.0
    assert r["prior_mean"] == 100.0


def test_trend_exactly_ten_percent_is_steady():
    assert pa.trend([100, 100, 100, 110, 110, 110])["direction"] == "steady"
    assert pa.trend([100, 100, 100, 90, 90, 90])["direction"] == "steady"


def test_trend_zero_prior_is_unknown():
    assert pa.trend([0, 0, 0, 5, 5, 5])["direction"] == "unknown"


def test_trend_custom_window():
    r = pa.trend([50, 50, 100, 100], window=2)
    assert r == {"direction": "rising", "change_pct": 100.0, "window_hours": 2, "recent_mean": 100.0,
                 "prior_mean": 50.0}


# --------------------------------------------------------------------------- forecast_outlook


def test_forecast_outlook_unknown_without_data():
    assert pa.forecast_outlook(None, [1, 2])["direction"] == "unknown"
    assert pa.forecast_outlook(100, [])["peak"] is None
    assert pa.forecast_outlook(100, [None, None])["direction"] == "unknown"


@pytest.mark.parametrize("future, direction, change", [
    ([120, 130, 140], "worsening", 30.0),
    ([80, 80, 80], "improving", -20.0),
    ([110, 110], "similar", 10.0),
    ([114, 114], "similar", 14.0),
    ([84, 84], "improving", -16.0),
])
def test_forecast_outlook_direction(future, direction, change):
    r = pa.forecast_outlook(100, future)
    assert r["direction"] == direction
    assert r["change_pct"] == change


def test_forecast_outlook_peak_index_counts_none_slots():
    r = pa.forecast_outlook(100, [None, 150, 120])
    assert r["peak"] == 150
    assert r["peak_index"] == 1
    assert r["mean"] == 135.0


def test_forecast_outlook_respects_horizon():
    future = [100.0] * 24
    future[20] = 400.0
    assert pa.forecast_outlook(100, future, hours=12)["peak"] == 100.0
    r24 = pa.forecast_outlook(100, future, hours=24)
    assert r24["peak"] == 400.0
    assert r24["peak_index"] == 20
    assert r24["hours"] == 24


# --------------------------------------------------------------------------- dispersion


@pytest.mark.parametrize("wind, blh, level", [
    (3, None, "poor"),
    (3, 200, "poor"),
    (3, 800, "limited"),
    (20, 200, "limited"),
    (None, 200, "limited"),
    (5, 800, "moderate"),      # 5 km/h is no longer "poor wind"
    (11.9, 300, "moderate"),   # 300 m is no longer a shallow layer
    (12, 800, "good"),
    (None, 800, "good"),
])
def test_dispersion_levels_at_thresholds(wind, blh, level):
    r = pa.dispersion(wind, blh)
    assert r["level"] == level
    assert r["wind_speed_kmh"] == wind
    assert r["boundary_layer_m"] == blh
    assert r["explanation"]


# --------------------------------------------------------------------------- best_windows

TIMES_24 = [f"2026-11-20T{h:02d}:00" for h in range(24)]


def test_best_windows_skips_windows_containing_none():
    vals = [100.0] * 24
    vals[10] = 10.0
    vals[11] = None
    w = pa.best_windows(TIMES_24, vals, 2)
    starts = [c["start"] for c in w]
    assert "2026-11-20T10:00" not in starts and "2026-11-20T11:00" not in starts
    assert w[0]["start"] == "2026-11-20T09:00"
    assert w[0]["mean"] == 55.0


def test_best_windows_limited_to_daytime():
    vals = [100.0] * 24
    vals[5] = 1.0    # before 06:00
    vals[21] = 1.0   # 21:00-22:00 ends after day_end
    vals[20] = 50.0  # 20:00-21:00 is allowed
    w = pa.best_windows(TIMES_24, vals, 1)
    assert w[0]["start"] == "2026-11-20T20:00"
    assert w[0]["mean"] == 50.0
    assert all(6 <= int(c["start"][11:13]) <= 20 for c in w)


def test_best_windows_do_not_overlap_and_respect_limit():
    vals = [float(100 - h) for h in range(24)]  # later is cleaner
    w = pa.best_windows(TIMES_24, vals, 3, limit=2)
    assert len(w) == 2
    assert w[0]["start_index"] == 18  # 18:00-21:00 is the last allowed 3-h window
    assert abs(w[0]["start_index"] - w[1]["start_index"]) >= 3
    assert w[0]["end_index"] == 21


def test_best_windows_duration_longer_than_series():
    assert pa.best_windows(TIMES_24[:2], [1.0, 1.0], 3) == []


# --------------------------------------------------------------------------- severity_level


@pytest.mark.parametrize("aqi, level", [
    (None, "unknown"), (0, "low"), (75, "low"), (150, "moderate"), (250, "elevated"), (350, "high"),
    (450, "severe"),
])
def test_severity_level(aqi, level):
    assert pa.severity_level(aqi) == level


# --------------------------------------------------------------------------- risk_detection

TIMES = [f"2026-11-19T{h:02d}:00" for h in range(24)]
SERIES = {"now_index": 0, "times": TIMES}
SENSITIVE = {"family_context": {"children": True}}


def _cat(key):
    return next(c for c in pa.CATEGORIES if c["key"] == key)


def _snap(aqi, cat_key, *, trend=None, outlook=None, dispersion=None, is_demo=False, errors=None):
    return {
        "location": {"id": "28.61_77.21", "name": "Test City"},
        "is_demo": is_demo,
        "observed_local": "2026-11-19T10:00",
        "aqi": {"value": aqi, "category": _cat(cat_key) if cat_key else None, "dominant_label": "PM2.5"},
        "pollutants": {"pm2_5": {"value": 150.0}},
        "analysis": {"trend_pm2_5": trend or {}, "outlook_12h": outlook or {}, "dispersion": dispersion or {}},
        "sources": {"air": {"name": "Test model"}},
        "errors": errors or [],
    }


RISING = {"direction": "rising", "change_pct": 30.0, "window_hours": 3, "recent_mean": 130.0, "prior_mean": 100.0}
FALLING = {"direction": "falling", "change_pct": -35.0, "window_hours": 3, "recent_mean": 65.0,
           "prior_mean": 100.0}


def test_bump_never_reaches_critical():
    assert rd.bump("info") == "low"
    assert rd.bump("medium") == "high"
    assert rd.bump("high") == "high"


@pytest.mark.parametrize("profile, expected", [
    (None, False), ({}, False), ({"family_context": {"children": False}}, False),
    ({"family_context": {"older_adults": True}}, True), ({"family_context": {"outdoor_workers": 1}}, True),
])
def test_has_sensitive_members(profile, expected):
    assert rd.has_sensitive_members(profile) is expected


def test_detect_very_poor_is_high_critical_signal():
    signals = rd.detect(_snap(350, "very_poor"), SERIES)
    assert len(signals) == 1
    s = signals[0]
    assert s["category"] == "critical"
    assert s["severity"] == "high"
    assert s["key"] == "critical:28.61_77.21:very_poor:2026-11-19"
    assert s["data"] == {"aqi": 350, "pm2_5": 150.0, "category": "very_poor"}


def test_detect_severe_is_critical_severity():
    assert rd.detect(_snap(450, "severe"), SERIES)[0]["severity"] == "critical"


def test_detect_poor_without_trend_is_silent():
    assert rd.detect(_snap(250, "poor"), SERIES) == []


def test_detect_rising_trend_severity_and_sensitive_bump():
    poor = rd.detect(_snap(250, "poor", trend=RISING), SERIES)
    assert [(s["category"], s["severity"]) for s in poor] == [("deterioration", "high")]
    assert rd.detect(_snap(250, "poor", trend=RISING), SERIES, SENSITIVE)[0]["severity"] == "high"
    moderate = rd.detect(_snap(150, "moderate", trend=RISING), SERIES)
    assert moderate[0]["severity"] == "medium"
    assert rd.detect(_snap(150, "moderate", trend=RISING), SERIES, SENSITIVE)[0]["severity"] == "high"


def test_detect_rising_trend_needs_25_pct_and_moderate():
    small = {**RISING, "change_pct": 24.9}
    assert rd.detect(_snap(250, "poor", trend=small), SERIES) == []
    assert rd.detect(_snap(80, "satisfactory", trend=RISING), SERIES) == []


def test_detect_forecast_signal_with_peak_time():
    outlook = {"direction": "worsening", "peak": 200.0, "peak_index": 3, "mean": 180.0}
    signals = rd.detect(_snap(150, "moderate", outlook=outlook), SERIES)
    assert len(signals) == 1
    s = signals[0]
    assert s["category"] == "forecast"
    assert s["severity"] == "high"  # PM2.5 200 -> sub-index 362 (Very Poor)
    assert s["data"] == {"peak_pm2_5": 200.0, "peak_time": "2026-11-19T04:00", "peak_sub_index": 362}
    assert s["key"] == "forecast:28.61_77.21:very_poor:2026-11-19T04"


def test_detect_forecast_poor_peak_is_medium_and_bumped_for_sensitive_but_not_critical():
    outlook = {"direction": "worsening", "peak": 100.0, "peak_index": 0, "mean": 100.0}
    assert rd.detect(_snap(150, "moderate", outlook=outlook), SERIES)[0]["severity"] == "medium"
    assert rd.detect(_snap(150, "moderate", outlook=outlook), SERIES, SENSITIVE)[0]["severity"] == "high"
    severe_peak = {"direction": "worsening", "peak": 300.0, "peak_index": 0, "mean": 300.0}
    sev = rd.detect(_snap(150, "moderate", outlook=severe_peak), SERIES, SENSITIVE)
    assert sev[0]["severity"] == "high"


def test_detect_forecast_requires_worsening_and_higher_category():
    similar = {"direction": "similar", "peak": 200.0, "peak_index": 0, "mean": 150.0}
    assert rd.detect(_snap(150, "moderate", outlook=similar), SERIES) == []
    not_higher = {"direction": "worsening", "peak": 100.0, "peak_index": 0, "mean": 100.0}
    assert rd.detect(_snap(250, "poor", outlook=not_higher), SERIES) == []


def test_detect_positive_signal_when_falling():
    signals = rd.detect(_snap(150, "moderate", trend=FALLING), SERIES)
    assert [(s["category"], s["severity"]) for s in signals] == [("positive", "info")]
    assert "35.0%" in signals[0]["message"]
    assert rd.detect(_snap(250, "poor", trend=FALLING), SERIES) == []


def test_detect_demo_snapshot_produces_nothing():
    outlook = {"direction": "worsening", "peak": 200.0, "peak_index": 0, "mean": 200.0}
    assert rd.detect(_snap(450, "severe", trend=RISING, outlook=outlook, is_demo=True), SERIES) == []


def test_feed_first_snapshot_starts_monitoring():
    events = rd.feed_events(None, _snap(150, "moderate"))
    assert len(events) == 1
    e = events[0]
    assert e["type"] == "monitoring_started"
    assert e["dedup"] == "start:28.61_77.21"
    assert "Estimated NAQI 150 (Moderate)" in e["detail"]
    assert "Source: Test model." in e["detail"]


def test_feed_demo_snapshot_is_silent():
    assert rd.feed_events(None, _snap(150, "moderate", is_demo=True)) == []


def test_feed_category_change_worse_and_better():
    worse = rd.feed_events(_snap(150, "moderate"), _snap(250, "poor"))
    assert [(e["type"], e["severity"]) for e in worse] == [("category_change", "medium")]
    assert worse[0]["title"] == "Air quality worsened to Poor"
    assert worse[0]["dedup"] == "cat:28.61_77.21:poor:2026-11-19T10"
    better = rd.feed_events(_snap(250, "poor"), _snap(150, "moderate"))
    assert [(e["type"], e["severity"]) for e in better] == [("category_change", "info")]
    assert better[0]["title"] == "Air quality improved to Moderate"


def test_feed_same_category_is_silent():
    assert rd.feed_events(_snap(150, "moderate"), _snap(160, "moderate")) == []


def test_feed_pollution_increase_threshold():
    rise = {**RISING, "change_pct": 20.0}
    events = rd.feed_events(_snap(150, "moderate"), _snap(150, "moderate", trend=rise))
    assert [e["type"] for e in events] == ["pollution_increase"]
    assert "(100.0 → 130.0 µg/m³)" in events[0]["detail"]
    small = {**RISING, "change_pct": 19.9}
    assert rd.feed_events(_snap(150, "moderate"), _snap(150, "moderate", trend=small)) == []


def test_feed_forecast_deterioration_only_on_transition():
    out = {"direction": "worsening", "mean": 180.0, "peak": 210.0, "hours": 12}
    events = rd.feed_events(_snap(150, "moderate"), _snap(150, "moderate", outlook=out))
    assert [e["type"] for e in events] == ["forecast_deterioration"]
    assert "averages 180.0 µg/m³ over the next 12 hours" in events[0]["detail"]
    assert rd.feed_events(_snap(150, "moderate", outlook=out), _snap(150, "moderate", outlook=out)) == []


def test_feed_poor_dispersion_only_on_transition():
    poor = {"level": "poor", "explanation": "Trapped."}
    events = rd.feed_events(_snap(150, "moderate", dispersion={"level": "moderate"}),
                            _snap(150, "moderate", dispersion=poor))
    assert [(e["type"], e["severity"], e["detail"]) for e in events] == [("poor_dispersion", "low", "Trapped.")]
    assert events[0]["dedup"] == "disp:28.61_77.21:2026-11-19"
    assert rd.feed_events(_snap(150, "moderate", dispersion=poor), _snap(150, "moderate", dispersion=poor)) == []


def test_feed_source_recovered():
    prev = _snap(150, "moderate", errors=[{"provider": "x", "message": "down"}])
    events = rd.feed_events(prev, _snap(150, "moderate"))
    assert [e["type"] for e in events] == ["source_recovered"]
    assert rd.feed_events(prev, _snap(150, "moderate", errors=[{"provider": "x", "message": "down"}])) == []
