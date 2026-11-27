"""Unit tests for environmental data helpers and the ambient-intelligence bundle builder (no network)."""

import asyncio
from datetime import UTC, datetime, timedelta

import pytest

from app.config import get_settings
from app.core.http import UpstreamError
from app.services import ambient_intelligence as ambient
from app.services import environmental_data as env
from app.services import weather_service as weather
from app.services.location_service import make_location

FIXED_NOW = datetime(2026, 11, 19, 5, 0, tzinfo=UTC)  # 10:30 IST

# --------------------------------------------------------------------------- haversine


def test_haversine_one_degree_of_latitude():
    assert env.haversine_km(0, 0, 1, 0) == pytest.approx(111.195, abs=0.01)


def test_haversine_same_point_and_symmetry():
    assert env.haversine_km(28.61, 77.21, 28.61, 77.21) == 0
    d1 = env.haversine_km(28.6139, 77.2090, 28.5355, 77.3910)
    d2 = env.haversine_km(28.5355, 77.3910, 28.6139, 77.2090)
    assert d1 == pytest.approx(d2)
    assert 15 <= d1 <= 22  # New Delhi (Connaught Place) to Noida


# --------------------------------------------------------------------------- hotspots


def _station(sid, pm25=None, provider="CPCB", distance=1.0, station_type="reference", pm10=None):
    readings = {}
    if pm25 is not None:
        readings["pm2_5"] = {"value": pm25}
    if pm10 is not None:
        readings["pm10"] = {"value": pm10}
    return {
        "id": sid,
        "name": f"Station {sid}",
        "provider": provider,
        "distance_km": distance,
        "station_type": station_type,
        "readings": readings,
    }


def test_hotspots_need_four_stations_with_pm25():
    stations = [
        _station("a", 50),
        _station("b", 60),
        _station("c", 300),
        _station("d", pm10=500),
        _station("e", pm10=500),
    ]
    assert env.detect_hotspots(stations) == []


def test_hotspot_detected_with_ratio_and_median():
    stations = [_station(s, v) for s, v in zip("abcde", [50, 60, 70, 80, 200])]
    hs = env.detect_hotspots(stations)
    assert hs == [
        {"station_id": "e", "name": "Station e", "pm2_5": 200, "local_median": 70, "ratio": 2.86, "provider": "CPCB"}
    ]


def test_hotspot_requires_absolute_difference_of_20():
    stations = [_station(s, v) for s, v in zip("abcde", [10, 10, 10, 10, 18])]  # ratio 1.8 but +8 only
    assert env.detect_hotspots(stations) == []


def test_hotspot_requires_ratio_of_1_4():
    stations = [_station(s, v) for s, v in zip("abcde", [100, 100, 100, 100, 135])]  # +35 but ratio 1.35
    assert env.detect_hotspots(stations) == []


def test_hotspot_thresholds_are_inclusive():
    stations = [_station(s, v) for s, v in zip("abcd", [50, 50, 50, 70])]
    hs = env.detect_hotspots(stations)
    assert [(h["station_id"], h["ratio"]) for h in hs] == [("d", 1.4)]


# --------------------------------------------------------------------------- CPCB helpers


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("19-11-2026 10:00:00", "2026-11-19T10:00:00+05:30"),
        ("2026-11-19 10:00:00", "2026-11-19T10:00:00+05:30"),
        ("19-11-2026 10:00", "2026-11-19T10:00:00+05:30"),
        ("yesterday-ish", "yesterday-ish"),
        (None, None),
        ("", None),
    ],
)
def test_parse_cpcb_time(raw, expected):
    assert env._parse_cpcb_time(raw) == expected


def test_station_aqi_picks_dominant_and_ignores_unknown_keys():
    r = env._station_aqi({"pm2_5": {"value": 90}, "pm10": {"value": 100}, "temperature": {"value": 30}})
    assert r["value"] == 200
    assert r["dominant_pollutant"] == "pm2_5"
    assert r["category"]["key"] == "moderate"
    assert r["sub_indices"] == {"pm2_5": 200, "pm10": 100}


def test_station_aqi_without_usable_readings():
    assert env._station_aqi({"pm2_5": {"value": -5}}) == {"value": None, "dominant_pollutant": None, "category": None}
    assert env._station_aqi({})["value"] is None


def test_fetch_cpcb_without_key_raises(monkeypatch):
    monkeypatch.setattr(get_settings(), "data_gov_in_api_key", None)
    with pytest.raises(UpstreamError, match="not configured"):
        asyncio.run(env.fetch_cpcb_stations(28.61, 77.21, 25))


def test_fetch_cpcb_groups_records_by_station(monkeypatch):
    monkeypatch.setattr(get_settings(), "data_gov_in_api_key", "test-key")
    monkeypatch.setattr(env, "_station_cache", {})
    calls = []

    async def fake_get_json(provider, url, *, params=None, headers=None, retries=1):
        calls.append(params)
        base = {
            "station": "Mandir Marg",
            "city": "Delhi",
            "state": "Delhi",
            "latitude": "28.636",
            "longitude": "77.201",
            "last_update": "19-11-2026 10:00:00",
        }
        return {
            "records": [
                {**base, "pollutant_id": "PM2.5", "avg_value": "90"},
                {**base, "pollutant_id": "PM10", "avg_value": "100"},
                {**base, "pollutant_id": "OZONE", "avg_value": "NA"},
                {
                    **base,
                    "station": "Far Away",
                    "latitude": "19.07",
                    "longitude": "72.87",
                    "pollutant_id": "PM2.5",
                    "avg_value": "50",
                },
                {**base, "station": "Broken", "latitude": "n/a", "pollutant_id": "PM2.5", "avg_value": "50"},
                {
                    **base,
                    "station": "Empty",
                    "latitude": "28.62",
                    "longitude": "77.22",
                    "pollutant_id": "NH3",
                    "avg_value": "10",
                },
            ]
        }

    monkeypatch.setattr(env, "get_json", fake_get_json)
    out = asyncio.run(env.fetch_cpcb_stations(28.61, 77.21, 25))
    assert calls[0]["api-key"] == "test-key"
    assert [s["id"] for s in out] == ["cpcb:Mandir Marg"]
    st = out[0]
    assert set(st["readings"]) == {"pm2_5", "pm10"}
    assert st["observed_at"] == "2026-11-19T10:00:00+05:30"
    assert st["aqi"]["value"] == 200
    assert st["station_type"] == "reference"
    # Second call is served from the cache.
    asyncio.run(env.fetch_cpcb_stations(28.61, 77.21, 25))
    assert len(calls) == 1


def test_sensor_community_disabled_raises(monkeypatch):
    monkeypatch.setattr(get_settings(), "sensor_community_enabled", False)
    with pytest.raises(UpstreamError, match="disabled"):
        asyncio.run(env.fetch_sensor_community(28.61, 77.21, 10))


# --------------------------------------------------------------------------- demo dataset


def test_demo_air_quality_shape():
    aq = env.demo_air_quality(datetime(2026, 11, 19, 10, 37))
    assert len(aq["times"]) == 264
    assert all(len(v) == 264 for v in aq["hourly"].values())
    assert set(aq["hourly"]) == {"pm2_5", "pm10", "no2", "so2", "co", "o3", "us_aqi"}
    assert aq["times"][0] == "2026-11-12T10:00"
    assert aq["current_time"] == aq["times"][168] == "2026-11-19T10:00"
    assert aq["current"]["pm2_5"] == aq["hourly"]["pm2_5"][168]
    assert all(v is None for v in aq["hourly"]["us_aqi"])
    assert aq["source"]["type"] == "demo"
    assert "NOT real data" in aq["source"]["name"]
    assert aq["utc_offset_seconds"] == 19800


def test_demo_air_quality_is_deterministic_and_sized_by_days():
    a = env.demo_air_quality(datetime(2026, 11, 19, 10, 0))
    b = env.demo_air_quality(datetime(2026, 11, 19, 10, 0))
    assert a == b
    small = env.demo_air_quality(datetime(2026, 11, 19, 10, 0), past_days=1, forecast_days=1)
    assert len(small["times"]) == 48
    assert small["current_time"] == small["times"][24] == "2026-11-19T10:00"


# --------------------------------------------------------------------------- fetch_stations


def test_fetch_stations_aggregates_providers(monkeypatch):
    async def ok(lat, lon, radius):
        return [
            _station("far", 40, distance=12.0),
            _station("near", 60, distance=3.0),
            _station("mid", 50, distance=7.0),
        ]

    async def failing(lat, lon, radius):
        raise UpstreamError("OpenAQ", "boom")

    async def must_not_run(lat, lon, radius):  # pragma: no cover - disabled provider
        raise AssertionError("disabled provider was called")

    monkeypatch.setitem(env.STATION_PROVIDERS, "cpcb", ("CPCB (data.gov.in)", ok))
    monkeypatch.setitem(env.STATION_PROVIDERS, "openaq", ("OpenAQ", failing))
    monkeypatch.setitem(env.STATION_PROVIDERS, "sensor_community", ("Sensor.Community", must_not_run))
    r = asyncio.run(env.fetch_stations(28.61, 77.21, enabled={"sensor_community": False}))
    assert [s["id"] for s in r["stations"]] == ["near", "mid", "far"]
    assert r["providers"] == [
        {"key": "cpcb", "name": "CPCB (data.gov.in)", "status": "ok", "message": None, "count": 3},
        {"key": "openaq", "name": "OpenAQ", "status": "unavailable", "message": "boom", "count": 0},
    ]
    assert r["fetched_at"]


def test_fetch_stations_generic_exception_message(monkeypatch):
    async def broken(lat, lon, radius):
        raise RuntimeError("parse failure")

    monkeypatch.setitem(env.STATION_PROVIDERS, "cpcb", ("CPCB (data.gov.in)", broken))
    r = asyncio.run(env.fetch_stations(28.61, 77.21, enabled={"openaq": False, "sensor_community": False}))
    assert r["stations"] == []
    assert r["providers"] == [
        {"key": "cpcb", "name": "CPCB (data.gov.in)", "status": "unavailable", "message": "parse failure", "count": 0}
    ]


# --------------------------------------------------------------------------- freshness / confidence


@pytest.mark.parametrize(
    "minutes, status", [(0, "fresh"), (90, "fresh"), (91, "aging"), (180, "aging"), (181, "stale")]
)
def test_freshness_thresholds(minutes, status):
    r = ambient.freshness(FIXED_NOW - timedelta(minutes=minutes), FIXED_NOW)
    assert r == {"age_minutes": minutes, "status": status}


def test_freshness_future_and_unknown():
    assert ambient.freshness(FIXED_NOW + timedelta(minutes=30), FIXED_NOW) == {"age_minutes": 0, "status": "fresh"}
    assert ambient.freshness(None, FIXED_NOW) == {"age_minutes": None, "status": "unknown"}


FRESH = {"status": "fresh"}
AGREES = {"status": "agrees", "station": "Mandir Marg", "difference_pct": 12}
DISAGREES = {"status": "disagrees", "station": "Mandir Marg", "difference_pct": 60}


@pytest.mark.parametrize(
    "source, fresh, check, valid, score, level",
    [
        ("model", FRESH, None, True, 0.6, "medium"),
        ("model", {"status": "aging"}, None, True, 0.5, "medium"),
        ("model", {"status": "stale"}, None, True, 0.35, "low"),
        ("model", {"status": "unknown"}, None, True, 0.35, "low"),
        ("model", FRESH, None, False, 0.5, "medium"),
        ("model", FRESH, AGREES, True, 0.8, "high"),
        ("model", FRESH, DISAGREES, True, 0.45, "low"),
        ("station", FRESH, AGREES, True, 0.95, "high"),  # 1.0 clamped
        ("demo", {"status": "demo"}, None, True, 0.2, "low"),
        ("demo", {"status": "stale"}, DISAGREES, False, 0.05, "low"),  # negative clamped
    ],
)
def test_confidence_scores(source, fresh, check, valid, score, level):
    r = ambient.confidence(source, fresh, check, valid)
    assert r["score"] == score
    assert r["level"] == level


def test_confidence_reasons_mention_station():
    r = ambient.confidence("model", FRESH, AGREES, True)
    assert any("Mandir Marg" in x and "12%" in x for x in r["reasons"])
    assert any("CAMS" in x for x in r["reasons"])


# --------------------------------------------------------------------------- station check


def test_station_check_agrees_with_nearest_reference():
    stations = [
        _station("lc", 10, station_type="low_cost", distance=0.5),
        _station("near", 80, distance=2.0),
        _station("next", 500, distance=4.0),
    ]
    r = ambient._station_check(100, stations)
    assert r["status"] == "agrees"
    assert r["station"] == "Station near"
    assert r["difference_pct"] == 25
    assert r["measured_pm2_5"] == 80


def test_station_check_disagrees_and_boundary():
    assert ambient._station_check(100, [_station("a", 50)])["status"] == "disagrees"
    assert ambient._station_check(135, [_station("a", 100)])["status"] == "agrees"  # exactly 35 %
    assert ambient._station_check(136, [_station("a", 100)])["status"] == "disagrees"


@pytest.mark.parametrize(
    "model, stations",
    [
        (100, []),
        (None, [_station("a", 100)]),
        (100, [_station("a", 100, distance=10.5)]),  # too far
        (100, [_station("a", 100, station_type="low_cost")]),  # not a reference monitor
        (100, [_station("a", pm10=100)]),  # no PM2.5
        (100, [_station("a", 0)]),  # cannot compare against zero
    ],
)
def test_station_check_none(model, stations):
    assert ambient._station_check(model, stations) is None


@pytest.mark.parametrize(
    "seconds, text", [(19800, "+05:30"), (0, "+00:00"), (20700, "+05:45"), (-12600, "-03:30"), (-36000, "-10:00")]
)
def test_offset_str(seconds, text):
    assert ambient._offset_str(seconds) == text


# --------------------------------------------------------------------------- build_bundle

LOC = make_location("Test City", 28.61, 77.21)


def _aq():
    aq = env.demo_air_quality(datetime(2026, 11, 19, 10, 0))
    aq["source"] = {**aq["source"], "type": "model", "name": "Test model"}
    return aq


def _wx(aq):
    times = aq["times"][10:]  # weather starts 10 hours later than air quality
    return {
        "utc_offset_seconds": 19800,
        "current": {"temperature_c": 18.0, "wind_speed_kmh": 3.0, "humidity_pct": 70},
        "hourly": {
            "time": list(reversed(times)),
            "wind_speed_10m": [float(i) for i in range(len(times))][::-1],
            "boundary_layer_height": [150.0] * len(times),
            "temperature_2m": [20.0] * len(times),
            "relative_humidity_2m": [60] * len(times),
        },
        "source": {"name": "Test weather", "type": "model"},
    }


@pytest.fixture
def fixed_freshness(monkeypatch):
    original = ambient.freshness
    monkeypatch.setattr(ambient, "freshness", lambda observed, now=None: original(observed, FIXED_NOW))


def test_build_bundle_aligns_weather_to_air_quality_times(fixed_freshness):
    aq = _aq()
    b = ambient.build_bundle(LOC, aq, _wx(aq))
    series, snap = b["series"], b["snapshot"]
    assert series["now_index"] == 168
    assert series["weather"]["wind_speed_kmh"][:10] == [None] * 10
    assert series["weather"]["wind_speed_kmh"][10] == 0.0
    assert series["weather"]["wind_speed_kmh"][20] == 10.0
    assert series["weather"]["boundary_layer_m"][168] == 150.0
    assert len(series["hourly"]["aqi_in"]) == len(aq["times"])
    assert snap["weather"]["boundary_layer_m"] == 150.0
    assert snap["analysis"]["dispersion"]["level"] == "poor"  # 3 km/h and 150 m
    assert snap["utc_offset"] == "+05:30"
    assert snap["observed_at"] == "2026-11-19T10:00:00+05:30"
    assert snap["freshness"] == {"age_minutes": 30, "status": "fresh"}
    assert snap["status"] == "live"
    assert snap["sources"]["weather"]["name"] == "Test weather"
    assert snap["pollutants"]["co"]["unit"] == "mg/m³"
    assert snap["analysis"]["confidence"]["level"] == "medium"


def test_build_bundle_without_weather(fixed_freshness):
    b = ambient.build_bundle(LOC, _aq(), None)
    assert b["snapshot"]["weather"] is None
    assert b["snapshot"]["analysis"]["dispersion"]["level"] == "unknown"
    assert all(v is None for v in b["series"]["weather"]["temperature_c"])


def test_build_bundle_demo_flags():
    b = ambient.build_bundle(LOC, env.demo_air_quality(datetime(2026, 11, 19, 10, 0)), None, is_demo=True)
    snap = b["snapshot"]
    assert snap["is_demo"] is True and b["series"]["is_demo"] is True
    assert snap["status"] == "demo"
    assert snap["freshness"] == {"age_minutes": None, "status": "demo"}
    assert snap["analysis"]["confidence"]["level"] == "low"


def test_build_bundle_falls_back_to_middle_when_current_time_missing():
    aq = _aq()
    aq["current_time"] = None
    b = ambient.build_bundle(LOC, aq, None)
    assert b["series"]["now_index"] == len(aq["times"]) // 2
    assert b["snapshot"]["freshness"]["status"] == "unknown"


# --------------------------------------------------------------------------- get_bundle


class _Providers:
    def __init__(self, aq_error=None, wx_error=None):
        self.aq_calls = 0
        self.wx_calls = 0
        self.aq_error = aq_error
        self.wx_error = wx_error

    async def fetch_air_quality(self, lat, lon):
        self.aq_calls += 1
        if self.aq_error:
            raise self.aq_error
        return _aq()

    async def fetch_weather(self, lat, lon):
        self.wx_calls += 1
        if self.wx_error:
            raise self.wx_error
        return _wx(_aq())


def _install(monkeypatch, providers):
    monkeypatch.setattr(env, "fetch_air_quality", providers.fetch_air_quality)
    monkeypatch.setattr(weather, "fetch_weather", providers.fetch_weather)


def test_get_bundle_caches_and_force_refreshes(monkeypatch):
    p = _Providers()
    _install(monkeypatch, p)
    loc = make_location("Cache City", 12.97, 77.59)

    async def run():
        first = await ambient.get_bundle(loc)
        second = await ambient.get_bundle(loc)
        third = await ambient.get_bundle(loc, force=True)
        return first, second, third

    first, second, third = asyncio.run(run())
    assert second is first
    assert third is not first
    assert p.aq_calls == 2
    assert ambient.cached_bundle(loc.id) is third
    assert first["snapshot"]["errors"] == []


def test_get_bundle_weather_failure_is_reported(monkeypatch):
    p = _Providers(wx_error=UpstreamError("Open-Meteo Weather", "down"))
    _install(monkeypatch, p)
    b = asyncio.run(ambient.get_bundle(make_location("Wx City", 13.08, 80.27)))
    assert b["snapshot"]["weather"] is None
    assert b["snapshot"]["errors"] == [{"provider": "Open-Meteo Weather", "message": "Open-Meteo Weather: down"}]


def test_get_bundle_stale_fallback_from_store(monkeypatch):
    loc = make_location("Stale City", 22.57, 88.36)
    _install(monkeypatch, _Providers())
    asyncio.run(ambient.get_bundle(loc))  # persists the bundle
    ambient.clear_cache()
    _install(monkeypatch, _Providers(aq_error=UpstreamError("Open-Meteo Air Quality", "timeout")))
    b = asyncio.run(ambient.get_bundle(loc))
    assert b["snapshot"]["status"] == "stale"
    assert b["snapshot"]["errors"][0]["provider"] == "Open-Meteo Air Quality"
    assert "id" not in b
    assert b["snapshot"]["location"]["id"] == loc.id
    assert b["snapshot"]["freshness"]["age_minutes"] is not None


def test_get_bundle_demo_fallback(monkeypatch):
    _install(monkeypatch, _Providers(aq_error=UpstreamError("Open-Meteo Air Quality", "down")))
    b = asyncio.run(ambient.get_bundle(make_location("Demo City", 26.91, 75.79), allow_demo=True))
    assert b["snapshot"]["is_demo"] is True
    assert b["snapshot"]["sources"]["air"]["type"] == "demo"
    assert b["snapshot"]["errors"][0]["provider"] == "Open-Meteo Air Quality"
    assert ambient.cached_bundle("26.91_75.79") is None  # demo data is never cached


def test_get_bundle_raises_when_nothing_available(monkeypatch):
    _install(monkeypatch, _Providers(aq_error=UpstreamError("Open-Meteo Air Quality", "down")))
    with pytest.raises(UpstreamError, match="currently unavailable"):
        asyncio.run(ambient.get_bundle(make_location("Empty City", 23.02, 72.57)))
