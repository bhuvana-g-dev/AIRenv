"""Provider adapters (air quality, OpenAQ, Sensor.Community, weather, geocoding), feed and store selection."""
import asyncio
import sys
import types

import pytest

from app.config import get_settings
from app.core.events_bus import bus
from app.core.http import UpstreamError
from app.db import store as store_mod
from app.db.store import SQLiteStore, get_store, set_store
from app.services import environmental_data as env
from app.services import intelligence_feed as feed
from app.services import location_service as ls
from app.services import weather_service as weather


class FakeJSON:
    """Replacement for `get_json`: routes by URL and records every request."""

    def __init__(self, routes):
        self.routes = routes
        self.calls = []

    async def __call__(self, provider, url, *, params=None, headers=None, retries=1):
        self.calls.append({"provider": provider, "url": url, "params": params, "headers": headers,
                           "retries": retries})
        for prefix, value in self.routes:
            if url == prefix or url.endswith(prefix):
                if isinstance(value, Exception):
                    raise value
                return value
        raise AssertionError(f"unexpected URL {url}")


@pytest.fixture(autouse=True)
def clean_caches(monkeypatch):
    monkeypatch.setattr(env, "_station_cache", {})
    monkeypatch.setattr(ls, "_reverse_cache", {})
    monkeypatch.setattr(ls, "_last_reverse_call", 0.0)


# ----------------------------------------------------------------------------- Open-Meteo air quality

def test_fetch_air_quality_maps_variables_and_converts_co(monkeypatch):
    fake = FakeJSON([(env.AQ_URL, {
        "timezone": "Asia/Kolkata", "utc_offset_seconds": 19800, "latitude": 28.625, "longitude": 77.25,
        "current": {"time": "2026-11-19T10:00", "pm2_5": 150.2, "pm10": 240.0, "nitrogen_dioxide": 61.0,
                    "sulphur_dioxide": 11.0, "carbon_monoxide": 1500.0, "ozone": 20.0, "us_aqi": 201},
        "hourly": {"time": ["2026-11-19T09:00", "2026-11-19T10:00"], "pm2_5": [140.0, 150.2],
                   "carbon_monoxide": [1234.0, None], "ozone": [18.0, 20.0]},
    })])
    monkeypatch.setattr(env, "get_json", fake)
    aq = asyncio.run(env.fetch_air_quality(28.61, 77.21, past_days=3, forecast_days=2))
    assert aq["current"] == {"pm2_5": 150.2, "pm10": 240.0, "no2": 61.0, "so2": 11.0, "co": 1.5, "o3": 20.0,
                             "us_aqi": 201}
    assert aq["hourly"]["co"] == [1.234, None]
    assert aq["hourly"]["pm2_5"] == [140.0, 150.2] and aq["hourly"]["no2"] == [] and aq["hourly"]["o3"] == [18, 20]
    assert aq["times"] == ["2026-11-19T09:00", "2026-11-19T10:00"]
    assert (aq["timezone"], aq["utc_offset_seconds"], aq["current_time"]) == ("Asia/Kolkata", 19800,
                                                                              "2026-11-19T10:00")
    assert aq["grid"] == {"lat": 28.625, "lon": 77.25} and aq["source"]["type"] == "model"
    params = fake.calls[0]["params"]
    assert (params["latitude"], params["longitude"], params["past_days"], params["forecast_days"]) == (
        28.61, 77.21, 3, 2)
    assert params["hourly"] == ",".join(env.AQ_VARS) and params["timezone"] == "auto"


def test_fetch_air_quality_handles_missing_sections(monkeypatch):
    monkeypatch.setattr(env, "get_json", FakeJSON([(env.AQ_URL, {})]))
    aq = asyncio.run(env.fetch_air_quality(1.0, 2.0))
    assert aq["current"]["co"] is None and aq["current_time"] is None
    assert aq["times"] == [] and aq["hourly"]["pm2_5"] == [] and aq["utc_offset_seconds"] == 0


# ----------------------------------------------------------------------------- OpenAQ

def _openaq_location(loc_id, sensors, monitor=True, lat=28.62, lon=77.22):
    return {"id": loc_id, "name": f"Station {loc_id}", "locality": "Delhi", "isMonitor": monitor,
            "coordinates": {"latitude": lat, "longitude": lon}, "owner": {"name": "CPCB"},
            "sensors": [{"id": sid, "parameter": {"name": name, "units": units}} for sid, name, units in sensors]}


def test_openaq_not_configured(monkeypatch):
    monkeypatch.setattr(get_settings(), "openaq_api_key", None)
    with pytest.raises(UpstreamError) as info:
        asyncio.run(env.fetch_openaq_stations(28.61, 77.21, 25))
    assert info.value.message == "not configured: set OPENAQ_API_KEY"


def test_openaq_latest_readings_with_unit_handling_and_cache(monkeypatch):
    monkeypatch.setattr(get_settings(), "openaq_api_key", "oaq-key")
    good = _openaq_location(101, [(1, "pm25", "µg/m³"), (2, "co", "ppm"), (3, "no2", "ppm"), (4, "o3", "µg/m³"),
                                  (5, "temperature", "c"), (6, "pm10", "µg/m³")])
    failing = _openaq_location(102, [(7, "pm25", "µg/m³")])
    empty = _openaq_location(103, [(8, "no2", "ppm")], monitor=False)
    fake = FakeJSON([
        ("/locations", {"results": [good, failing, empty]}),
        ("/locations/101/latest", {"results": [
            {"sensorsId": 1, "value": 151.234, "datetime": {"utc": "2026-11-19T04:00:00Z"}},
            {"sensorsId": 2, "value": 0.8, "datetime": {"utc": "2026-11-19T04:30:00Z"}},
            {"sensorsId": 3, "value": 0.05, "datetime": {"utc": "2026-11-19T05:00:00Z"}},
            {"sensorsId": 4, "value": -1, "datetime": {"utc": "2026-11-19T05:00:00Z"}},
            {"sensorsId": 5, "value": 21},
            {"sensorsId": 6, "value": None},
            {"sensorsId": 999, "value": 50},
        ]}),
        ("/locations/102/latest", UpstreamError("OpenAQ", "HTTP 500")),
        ("/locations/103/latest", {"results": [{"sensorsId": 8, "value": 0.04}]}),
    ])
    monkeypatch.setattr(env, "get_json", fake)
    out = asyncio.run(env.fetch_openaq_stations(28.61, 77.21, 30))
    assert len(out) == 1
    st = out[0]
    assert (st["id"], st["provider"], st["station_type"], st["name"], st["city"], st["owner"]) == (
        "openaq:101", "OpenAQ", "reference", "Station 101", "Delhi", "CPCB")
    assert st["readings"] == {
        "pm2_5": {"value": 151.23, "unit": "µg/m³", "averaging": "latest hourly value"},
        # 0.8 ppm × 1.145 = 0.916 mg/m³, then rounded to 2 decimals like every reading.
        "co": {"value": 0.92, "unit": "mg/m³", "averaging": "latest hourly value"},
    }
    assert st["observed_at"] == "2026-11-19T04:30:00Z"  # skipped ppm NO2 does not count
    assert st["distance_km"] == round(env.haversine_km(28.61, 77.21, 28.62, 77.22), 2)
    assert st["url"] == "https://explore.openaq.org/locations/101"
    assert st["aqi"]["dominant_pollutant"] == "pm2_5" and st["aqi"]["value"] is not None

    first = fake.calls[0]
    assert first["headers"] == {"X-API-Key": "oaq-key"}
    assert first["params"] == {"coordinates": "28.61,77.21", "radius": 25000, "limit": 40}
    assert all(c["retries"] == 0 for c in fake.calls[1:])

    n = len(fake.calls)
    assert asyncio.run(env.fetch_openaq_stations(28.61, 77.21, 30)) == out  # served from cache
    assert len(fake.calls) == n


# ----------------------------------------------------------------------------- Sensor.Community

def _sc_entry(loc_id, values, indoor=0, lat="28.60", lon="77.20", ts=None):
    return {"location": {"id": loc_id, "latitude": lat, "longitude": lon, "indoor": indoor}, "timestamp": ts,
            "sensordatavalues": [{"value_type": k, "value": v} for k, v in values]}


def test_sensor_community_disabled(monkeypatch):
    monkeypatch.setattr(get_settings(), "sensor_community_enabled", False)
    with pytest.raises(UpstreamError) as info:
        asyncio.run(env.fetch_sensor_community(28.61, 77.21, 10))
    assert info.value.message == "disabled by configuration"


def test_sensor_community_parsing_filters_and_cache(monkeypatch):
    monkeypatch.setattr(get_settings(), "sensor_community_enabled", True)
    data = [
        _sc_entry(1, [("P1", "45.6"), ("P2", "30.4")], indoor=1),  # indoor: skipped
        _sc_entry(2, [("P1", "45.6"), ("P2", "abc"), ("temperature", "12")], ts="2026-11-19 04:55:01"),
        _sc_entry(2, [("P2", "30.4"), ("P1", "2500")]),  # second reading for the same sensor; P1 out of range
        _sc_entry(3, [("P1", "-5"), ("P2", "2000")]),  # only out-of-range values: dropped
        _sc_entry(4, [("P1", "10")], lat=None),  # invalid coordinates
        {"sensordatavalues": []},  # no location at all
    ]
    fake = FakeJSON([("area=28.61,77.21,10", data)])
    monkeypatch.setattr(env, "get_json", fake)
    out = asyncio.run(env.fetch_sensor_community(28.61, 77.21, 10.7))
    assert len(out) == 1
    st = out[0]
    assert (st["id"], st["provider"], st["station_type"], st["name"]) == ("sc:2", "Sensor.Community", "low_cost",
                                                                          "Citizen sensor #2")
    assert st["observed_at"] == "2026-11-19T04:55:01Z"
    assert {k: v["value"] for k, v in st["readings"].items()} == {"pm10": 45.6, "pm2_5": 30.4}
    assert st["readings"]["pm2_5"]["averaging"] == "~5-minute value, uncalibrated low-cost sensor"
    assert st["aqi"]["value"] is not None
    assert fake.calls[0]["url"] == "https://data.sensor.community/airrohr/v1/filter/area=28.61,77.21,10"
    assert fake.calls[0]["retries"] == 0

    assert asyncio.run(env.fetch_sensor_community(28.61, 77.21, 10.7)) == out
    assert len(fake.calls) == 1


def test_fetch_stations_reports_provider_status(monkeypatch):
    monkeypatch.setattr(get_settings(), "openaq_api_key", None)
    monkeypatch.setattr(get_settings(), "sensor_community_enabled", True)
    data = [_sc_entry(9, [("P2", "80")], lat="28.70", lon="77.30"), _sc_entry(8, [("P2", "60")])]
    monkeypatch.setattr(env, "get_json", FakeJSON([("area=28.61,77.21,25", data)]))
    out = asyncio.run(env.fetch_stations(28.61, 77.21, enabled={"cpcb": False}))
    assert [(p["key"], p["status"], p["count"]) for p in out["providers"]] == [
        ("openaq", "unavailable", 0), ("sensor_community", "ok", 2)]
    assert out["providers"][0]["message"] == "not configured: set OPENAQ_API_KEY"
    assert [s["id"] for s in out["stations"]] == ["sc:8", "sc:9"]  # nearest first


# ----------------------------------------------------------------------------- weather

def test_fetch_weather_maps_current_conditions(monkeypatch):
    fake = FakeJSON([(weather.FORECAST_URL, {
        "timezone": "Asia/Kolkata", "utc_offset_seconds": 19800,
        "current": {"time": "2026-11-19T10:00", "temperature_2m": 18.5, "relative_humidity_2m": 70,
                    "wind_speed_10m": 4.2, "wind_direction_10m": 300, "weather_code": 45},
        "hourly": {"time": ["2026-11-19T10:00"], "temperature_2m": [18.5]},
    })])
    monkeypatch.setattr(weather, "get_json", fake)
    wx = asyncio.run(weather.fetch_weather(28.61, 77.21, past_days=1, forecast_days=2))
    assert wx["current"] == {"time": "2026-11-19T10:00", "temperature_c": 18.5, "humidity_pct": 70,
                             "wind_speed_kmh": 4.2, "wind_direction_deg": 300, "weather_code": 45,
                             "weather_text": "Fog"}
    assert wx["hourly"]["temperature_2m"] == [18.5] and wx["timezone"] == "Asia/Kolkata"
    assert wx["utc_offset_seconds"] == 19800 and wx["source"] == weather.SOURCE
    params = fake.calls[0]["params"]
    assert params["hourly"] == ",".join(weather.HOURLY_VARS)
    assert (params["past_days"], params["forecast_days"], params["wind_speed_unit"]) == (1, 2, "kmh")


def test_fetch_weather_with_empty_payload(monkeypatch):
    monkeypatch.setattr(weather, "get_json", FakeJSON([(weather.FORECAST_URL, {})]))
    wx = asyncio.run(weather.fetch_weather(0, 0))
    assert wx["current"]["weather_text"] == "Unavailable" and wx["current"]["temperature_c"] is None
    assert wx["hourly"] == {} and wx["utc_offset_seconds"] == 0


@pytest.mark.parametrize("code, text", [(0, "Clear sky"), (95, "Thunderstorm"), (999, "Unknown"),
                                        (None, "Unavailable")])
def test_describe_weather_codes(code, text):
    assert weather.describe(code) == text


# ----------------------------------------------------------------------------- geocoding

def test_search_returns_locations_with_derived_ids(monkeypatch):
    fake = FakeJSON([(ls.GEOCODE_URL, {"results": [
        {"name": "Noida", "latitude": 28.5355, "longitude": 77.391, "country": "India", "admin1": "Uttar Pradesh",
         "timezone": "Asia/Kolkata"},
        {"name": "Noida Extension", "latitude": 28.57, "longitude": 77.45},
    ]})])
    monkeypatch.setattr(ls, "get_json", fake)
    out = asyncio.run(ls.search("Noida", count=2))
    assert [(r.id, r.name, r.admin1, r.timezone) for r in out] == [
        ("28.54_77.39", "Noida", "Uttar Pradesh", "Asia/Kolkata"), ("28.57_77.45", "Noida Extension", None, None)]
    assert fake.calls[0]["params"] == {"name": "Noida", "count": 2, "language": "en", "format": "json"}


def test_search_without_results(monkeypatch):
    monkeypatch.setattr(ls, "get_json", FakeJSON([(ls.GEOCODE_URL, {"results": None})]))
    assert asyncio.run(ls.search("Atlantis")) == []


def test_reverse_geocode_success_and_cache(monkeypatch):
    fake = FakeJSON([(ls.REVERSE_URL, {"address": {"suburb": "Hauz Khas", "city": "New Delhi",
                                                   "country": "India", "state": "Delhi"}})])
    monkeypatch.setattr(ls, "get_json", fake)
    loc = asyncio.run(ls.reverse(28.5494, 77.2001))
    assert (loc.name, loc.country, loc.admin1, loc.id) == ("Hauz Khas", "India", "Delhi", "28.55_77.20")
    assert fake.calls[0]["params"] == {"lat": 28.5494, "lon": 77.2001, "format": "jsonv2", "zoom": 12}
    assert fake.calls[0]["retries"] == 0
    monkeypatch.setattr(ls, "_last_reverse_call", 0.0)
    assert asyncio.run(ls.reverse(28.5494, 77.2001)) is loc  # cached for a day
    assert len(fake.calls) == 1


@pytest.mark.parametrize("payload, name", [
    ({"address": {"town": "Sonipat"}}, "Sonipat"),
    ({"address": {}, "name": "Some Field"}, "Some Field"),
    ({}, "29.000, 77.000"),
])
def test_reverse_geocode_name_fallbacks(monkeypatch, payload, name):
    monkeypatch.setattr(ls, "get_json", FakeJSON([(ls.REVERSE_URL, payload)]))
    assert asyncio.run(ls.reverse(29.0, 77.0)).name == name


def test_reverse_geocode_is_throttled_to_one_call_per_second(monkeypatch):
    fake = FakeJSON([(ls.REVERSE_URL, {"address": {"city": "Agra"}})])
    monkeypatch.setattr(ls, "get_json", fake)
    monkeypatch.setattr(ls.time, "time", lambda: 1000.0)
    monkeypatch.setattr(ls, "_last_reverse_call", 999.5)
    loc = asyncio.run(ls.reverse(27.1767, 78.0081))
    assert loc.name == "27.177, 78.008" and fake.calls == []
    assert ls._reverse_cache == {}  # placeholder names are not cached


def test_reverse_geocode_provider_failure_falls_back_to_coordinates(monkeypatch):
    fake = FakeJSON([(ls.REVERSE_URL, UpstreamError("OpenStreetMap Nominatim", "HTTP 503"))])
    monkeypatch.setattr(ls, "get_json", fake)
    loc = asyncio.run(ls.reverse(12.9716, 77.5946))
    assert loc.name == "12.972, 77.595" and loc.country is None
    assert "12.97_77.59" in ls._reverse_cache


# ----------------------------------------------------------------------------- intelligence feed

def test_feed_publish_dedup_and_listing():
    queue = bus.subscribe(["location:L1"])
    try:
        a = asyncio.run(feed.publish("L1", {"type": "category_change", "severity": "medium", "title": "Worse",
                                            "detail": "d", "data": {"x": 1}, "dedup": "cat:1"}))
        assert asyncio.run(feed.publish("L1", {"type": "category_change", "title": "Worse again",
                                               "dedup": "cat:1"})) is None
        b = asyncio.run(feed.publish("L1", {"type": "monitoring_started", "title": "Started"}))
        assert asyncio.run(feed.publish("L1", {"type": "monitoring_started", "title": "Started"})) is None
        asyncio.run(feed.publish("L2", {"type": "monitoring_started", "title": "Started"}))
        assert a["severity"] == "medium" and a["data"] == {"x": 1} and a["location_id"] == "L1"
        assert b["severity"] == "info" and b["detail"] is None
        msgs = [queue.get_nowait() for _ in range(queue.qsize())]
    finally:
        bus.unsubscribe(queue)
    assert len(msgs) == 2 and all(m.startswith("event: feed.created") for m in msgs)
    asyncio.run(get_store().update("feed", a["id"], {"created_at": "2000-01-01T00:00:00+00:00"}))
    listed = asyncio.run(feed.list_feed("L1"))
    assert [r["id"] for r in listed] == [b["id"], a["id"]]
    assert [r["id"] for r in asyncio.run(feed.list_feed("L1", limit=1))] == [b["id"]]


# ----------------------------------------------------------------------------- store selection

@pytest.fixture
def restore_store():
    original = store_mod._store
    yield
    set_store(original)


def test_get_store_falls_back_to_sqlite_when_firestore_unavailable(monkeypatch, restore_store):
    monkeypatch.setattr(get_settings(), "storage_backend", "firestore")
    monkeypatch.setattr(get_settings(), "sqlite_path", ":memory:")

    class Unavailable:
        def __init__(self, *args):
            raise RuntimeError("no credentials")

    monkeypatch.setattr(store_mod, "FirestoreStore", Unavailable)
    set_store(None)
    s = get_store()
    assert isinstance(s, SQLiteStore) and s.name == "sqlite"
    assert get_store() is s  # memoised


def test_get_store_auto_uses_sqlite_without_firebase(monkeypatch, restore_store):
    monkeypatch.setattr(get_settings(), "storage_backend", "auto")
    monkeypatch.setattr(get_settings(), "firebase_credentials", "")
    monkeypatch.setattr(get_settings(), "sqlite_path", ":memory:")

    def must_not_be_used(*args):
        raise AssertionError("Firestore must not be used without credentials")

    monkeypatch.setattr(store_mod, "FirestoreStore", must_not_be_used)
    set_store(None)
    assert get_store().name == "sqlite"


def test_get_store_uses_firestore_when_configured(monkeypatch, restore_store):
    monkeypatch.setattr(get_settings(), "storage_backend", "auto")
    monkeypatch.setattr(get_settings(), "firebase_credentials", '{"type": "service_account"}')
    monkeypatch.setattr(get_settings(), "firebase_project_id", "airenv-test")
    created = []

    class FakeFirestore:
        name = "firestore"

        def __init__(self, credentials, project_id):
            created.append((credentials, project_id))

    monkeypatch.setattr(store_mod, "FirestoreStore", FakeFirestore)
    set_store(None)
    assert get_store().name == "firestore"
    assert created == [('{"type": "service_account"}', "airenv-test")]


# ----------------------------------------------------------------------------- Firestore adapter

class _Snap:
    def __init__(self, data):
        self._data = data
        self.exists = data is not None

    def to_dict(self):
        return dict(self._data)


class _Doc:
    def __init__(self, coll, doc_id):
        self.coll, self.doc_id = coll, doc_id

    def get(self):
        return _Snap(self.coll.docs.get(self.doc_id))

    def set(self, data):
        self.coll.docs[self.doc_id] = dict(data)

    def delete(self):
        self.coll.docs.pop(self.doc_id, None)


class _Query:
    def __init__(self, coll, ops=()):
        self.coll, self.ops = coll, list(ops)

    def where(self, filter):  # same keyword as the Firestore API
        return _Query(self.coll, [*self.ops, ("where", filter)])

    def order_by(self, field, direction):
        return _Query(self.coll, [*self.ops, ("order_by", field, direction)])

    def limit(self, n):
        return _Query(self.coll, [*self.ops, ("limit", n)])

    def stream(self):
        self.coll.db.streams.append(self.ops)
        rows = list(self.coll.docs.values())
        for op in self.ops:
            if op[0] == "where":
                f = op[1]
                assert f.op == "=="
                rows = [r for r in rows if r.get(f.field) == f.value]
            elif op[0] == "order_by":
                rows.sort(key=lambda r: r[op[1]], reverse=op[2] == "DESCENDING")
            else:
                rows = rows[:op[1]]
        return [_Snap(r) for r in rows]


class _Collection(_Query):
    def __init__(self, db):
        self.db, self.docs = db, {}
        super().__init__(self)

    def document(self, doc_id):
        return _Doc(self, doc_id)


class _DB:
    def __init__(self):
        self.collections, self.streams = {}, []

    def collection(self, name):
        return self.collections.setdefault(name, _Collection(self))


def test_firestore_store_adapter(monkeypatch):
    db = _DB()
    init = []
    root = types.ModuleType("firebase_admin")
    root._apps = {}
    credentials = types.ModuleType("firebase_admin.credentials")
    credentials.Certificate = lambda value: ("cert", value)
    firestore = types.ModuleType("firebase_admin.firestore")
    firestore.client = lambda: db

    def initialize_app(cred, options):
        init.append((cred, options))
        root._apps["[DEFAULT]"] = object()

    root.initialize_app = initialize_app
    root.credentials, root.firestore = credentials, firestore

    class FieldFilter:
        def __init__(self, field, op, value):
            self.field, self.op, self.value = field, op, value

    base_query = types.ModuleType("google.cloud.firestore_v1.base_query")
    base_query.FieldFilter = FieldFilter
    google = types.ModuleType("google")
    cloud = types.ModuleType("google.cloud")
    fs_v1 = types.ModuleType("google.cloud.firestore_v1")
    google.cloud, cloud.firestore_v1, fs_v1.base_query = cloud, fs_v1, base_query
    for name, mod in (("firebase_admin", root), ("firebase_admin.credentials", credentials),
                      ("firebase_admin.firestore", firestore), ("google", google), ("google.cloud", cloud),
                      ("google.cloud.firestore_v1", fs_v1), ("google.cloud.firestore_v1.base_query", base_query)):
        monkeypatch.setitem(sys.modules, name, mod)

    fs = store_mod.FirestoreStore('{"type": "service_account"}', "airenv-test")
    assert init == [(("cert", {"type": "service_account"}), {"projectId": "airenv-test"})]
    store_mod.FirestoreStore("/path/sa.json", "airenv-test")  # already initialised: no second init
    assert len(init) == 1

    async def run():
        await fs.set("users", "a", {"name": "A", "rank": 2})
        await fs.set("users", "b", {"name": "B", "rank": 1})
        await fs.set("users", "c", {"name": "A", "rank": 3})
        got = await fs.get("users", "a")
        missing = await fs.get("users", "zzz")
        rows = await fs.query("users", [("name", "==", "A")], order_by="rank", descending=True, limit=1)
        everything = await fs.query("users")
        await fs.delete("users", "a")
        updated = await fs.update("users", "b", {"rank": 9})
        return got, missing, rows, everything, updated

    got, missing, rows, everything, updated = asyncio.run(run())
    assert got == {"name": "A", "rank": 2, "id": "a"} and missing is None
    assert rows == [{"name": "A", "rank": 3, "id": "c"}]
    assert len(everything) == 3
    assert db.streams[0][1:] == [("order_by", "rank", "DESCENDING"), ("limit", 1)]
    assert "a" not in db.collections["users"].docs
    assert updated == {"name": "B", "rank": 9, "id": "b"}
    assert fs.name == "firestore"
