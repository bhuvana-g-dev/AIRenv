"""Air API routes: location search/reverse, current, history, refresh failures and stations (no network)."""

import asyncio

import pytest
from fastapi.testclient import TestClient

from app.api import air as air_api
from app.core.http import UpstreamError
from app.core.rate_limit import limiter
from app.core.security import LOCAL_UID
from app.db.store import get_store
from app.main import app
from app.services import ambient_intelligence as ambient
from app.services import environmental_data as env
from app.services import location_service
from app.services.location_service import make_location


@pytest.fixture
def client(sample_bundle, monkeypatch):
    _, bundle = sample_bundle
    requested = []

    async def fake_bundle(location, **kwargs):
        requested.append((location, kwargs))
        return bundle

    monkeypatch.setattr(ambient, "get_bundle", fake_bundle)
    monkeypatch.setattr(air_api, "_last_manual_refresh", {})
    limiter.reset()
    with TestClient(app) as c:
        c.requested = requested
        yield c
    limiter.reset()


def test_location_search_results_are_cacheable(client, monkeypatch):
    async def fake_search(q, count=8):
        return [make_location("Noida", 28.5355, 77.391, country="India")]

    monkeypatch.setattr(location_service, "search", fake_search)
    r = client.get("/api/locations/search", params={"q": "Noida"})
    assert r.headers["cache-control"] == "public, max-age=86400"
    assert r.json()["results"][0]["id"] == "28.54_77.39" and r.json()["results"][0]["country"] == "India"


def test_location_search_provider_failure_is_503(client, monkeypatch):
    async def down(q, count=8):
        raise UpstreamError("Open-Meteo Geocoding", "HTTP 502")

    monkeypatch.setattr(location_service, "search", down)
    r = client.get("/api/locations/search", params={"q": "Noida"})
    assert r.status_code == 503 and r.json()["detail"] == "HTTP 502"


def test_reverse_location_route(client, monkeypatch):
    async def fake_reverse(lat, lon):
        return make_location("Hauz Khas", lat, lon)

    monkeypatch.setattr(location_service, "reverse", fake_reverse)
    body = client.get("/api/locations/reverse", params={"lat": 28.5494, "lon": 77.2001}).json()
    assert body["name"] == "Hauz Khas" and body["id"] == "28.55_77.20"


def test_current_and_history_routes(client, sample_bundle):
    snap = client.get("/api/air/current", params={"lat": 28.61, "lon": 77.21, "name": "Here"}).json()
    assert snap["observed_local"] == "2026-11-19T10:00" and snap["location"]["name"] == "Test City"
    assert client.requested[-1][0].name == "Here" and client.requested[-1][1] == {"allow_demo": False}

    asyncio.run(
        get_store().set(
            "history",
            "28.61_77.21_2026111909",
            {"location_id": "28.61_77.21", "hour": "2026-11-19T09:00", "pm2_5": 120},
        )
    )
    hist = client.get("/api/air/history", params={"demo": True}).json()
    assert [r["hour"] for r in hist["recorded"]] == ["2026-11-19T09:00"]
    assert hist["is_demo"] is False and "seven_day_mean" in hist["comparisons"]
    assert client.requested[-1][1] == {"allow_demo": True}


def test_manual_refresh_upstream_failure_is_503(client, monkeypatch):
    async def failing_refresh(loc):
        raise UpstreamError("Open-Meteo Air Quality", "timeout")

    monkeypatch.setattr("app.scheduler.refresh_location", failing_refresh)
    r = client.post("/api/air/refresh")
    assert r.status_code == 503
    assert r.json()["detail"] == {
        "code": "data_unavailable",
        "message": "timeout",
        "provider": "Open-Meteo Air Quality",
        "demo_available": True,
    }


def test_manual_refresh_inside_cooldown_without_cache_refreshes_again(client, monkeypatch):
    calls = []

    async def fake_refresh(loc):
        calls.append(loc.id)
        return {"status": "live", "observed_at": "o", "fetched_at": "f"}

    monkeypatch.setattr("app.scheduler.refresh_location", fake_refresh)
    monkeypatch.setattr(ambient, "cached_bundle", lambda _id: None)
    assert client.post("/api/air/refresh").json()["throttled"] is False
    assert client.post("/api/air/refresh").json()["throttled"] is False
    assert len(calls) == 2


def test_stations_route_respects_profile_sources_and_flags_hotspots(client, monkeypatch):
    seen = []

    async def fake_fetch(lat, lon, radius_km, enabled):
        seen.append((lat, lon, radius_km, enabled))
        stations = [
            {"id": s, "name": s, "provider": "CPCB", "distance_km": i, "readings": {"pm2_5": {"value": v}}}
            for i, (s, v) in enumerate([("a", 50), ("b", 60), ("c", 70), ("d", 80), ("e", 200)])
        ]
        return {"stations": stations, "providers": [], "fetched_at": "now"}

    monkeypatch.setattr(env, "fetch_stations", fake_fetch)
    client.get("/api/me")  # create the local owner's profile
    asyncio.run(get_store().update("users", LOCAL_UID, {"data_sources": {"cpcb": True, "openaq": False}}))
    body = client.get("/api/air/stations", params={"radius_km": 10}).json()
    assert seen[0][2] == 10 and seen[0][3] == {"cpcb": True, "openaq": False}
    assert [h["station_id"] for h in body["hotspots"]] == ["e"]
    assert body["hotspot_method"].startswith("A station is flagged when its measured PM2.5")


def test_feed_route(client):
    asyncio.run(
        get_store().set(
            "feed",
            "f1",
            {"location_id": "28.61_77.21", "type": "x", "title": "T", "created_at": "2026-11-19T00:00:00+00:00"},
        )
    )
    body = client.get("/api/feed", params={"limit": 5}).json()
    assert body["location_id"] == "28.61_77.21" and [i["id"] for i in body["items"]] == ["f1"]
