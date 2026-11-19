from app.services import ai_engine
from app.services import impact_calculator as ic
from app.services import pollution_analyzer as pa
from app.services import risk_detection as rd


def test_sub_index_breakpoints():
    assert pa.sub_index("pm2_5", 0) == 0
    assert pa.sub_index("pm2_5", 30) == 50
    assert pa.sub_index("pm2_5", 60) == 100
    assert pa.sub_index("pm2_5", 90) == 200
    assert pa.sub_index("pm2_5", 120) == 300
    assert pa.sub_index("pm2_5", 250) == 400
    assert pa.sub_index("pm2_5", 2000) == 500
    assert pa.sub_index("pm10", 100) == 100
    assert pa.sub_index("co", 2.0) == 100
    assert pa.sub_index("pm2_5", None) is None


def test_naqi_uses_24h_average_and_dominant():
    hist = {"pm2_5": [100.0] * 24, "pm10": [120.0] * 24, "no2": [40.0] * 24}
    r = pa.compute_naqi(hist)
    assert r["valid"] is True
    assert r["dominant_pollutant"] == "pm2_5"
    assert r["averages"]["pm2_5"]["period_hours"] == 24
    assert r["category"]["key"] == "poor"  # PM2.5 100 µg/m³ falls in the 91-120 band (201-300)


def test_naqi_requires_pm_and_three_pollutants():
    r = pa.compute_naqi({"no2": [50.0] * 24, "so2": [10.0] * 24})
    assert r["valid"] is False


def test_trend_and_best_windows():
    assert pa.trend([10, 10, 10, 20, 20, 20])["direction"] == "rising"
    assert pa.trend([20, 20, 20, 10, 10, 10])["direction"] == "falling"
    times = [f"2026-11-20T{h:02d}:00" for h in range(24)]
    vals = [200.0] * 24
    vals[14] = vals[15] = 50.0
    w = pa.best_windows(times, vals, 2)
    assert w[0]["start"] == "2026-11-20T14:00"
    assert w[0]["mean"] == 50.0


def test_dispersion_levels():
    assert pa.dispersion(1.0, 50)["level"] == "poor"
    assert pa.dispersion(20, 1200)["level"] == "good"
    assert pa.dispersion(None, None)["level"] == "unknown"


def test_trip_emissions_band():
    r = ic.trip_emissions(ic.TripRequest(baseline_mode="petrol_car", alternative_mode="metro", distance_km=10,
                                         trips_per_week=10))
    assert r["km_per_week"] == 100
    assert r["avoided_kg"]["week"]["estimate"] == round(0.164 * 100 - 0.035 * 100, 2)
    assert r["avoided_kg"]["week"]["low"] < r["avoided_kg"]["week"]["estimate"] < r["avoided_kg"]["week"]["high"]


def test_exposure_comparison_prefers_cleaner_window():
    times = [f"2026-11-20T{h:02d}:00" for h in range(24)]
    vals = [200.0] * 24
    vals[15] = 40.0
    r = ic.exposure_comparison(times, vals, 0, ic.ExposureRequest(activity_hours=1, intensity="moderate",
                                                                  planned_start="2026-11-20T08:00"))
    assert r["planned"]["inhaled_ug"] == round(200 * 1.56, 1)
    assert r["best"]["start"] == "2026-11-20T15:00"
    assert r["reduction_pct"] == 80.0


def test_numeric_guard_rejects_invented_numbers():
    allowed = ai_engine._numbers({"pm2_5": 146.7, "aqi": 191})
    assert ai_engine.unsupported_numbers("PM2.5 is 146.7 and AQI 191 at 3 PM", allowed) == []
    assert ai_engine.unsupported_numbers("This cuts risk by 73%", allowed) == ["73"]


def test_risk_detection_on_sample(sample_bundle):
    _, bundle = sample_bundle
    signals = rd.detect(bundle["snapshot"], bundle["series"], None)
    for s in signals:
        assert s["category"] in ("critical", "deterioration", "forecast", "positive")
        assert s["severity"] in rd.SEVERITY_ORDER
