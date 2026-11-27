import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import ambient_intelligence as ambient


@pytest.fixture
def client(sample_bundle, monkeypatch):
    _, bundle = sample_bundle

    async def fake_bundle(location, **kwargs):
        return bundle

    monkeypatch.setattr(ambient, "get_bundle", fake_bundle)
    with TestClient(app) as c:
        yield c


def test_health_and_status(client):
    assert client.get("/api/health").json()["status"] == "ok"
    st = client.get("/api/system/status").json()
    assert st["auth_mode"] == "local"
    assert "gemini" in st["integrations"]


def test_bundle_briefing_and_assistant(client):
    b = client.get("/api/air/bundle").json()
    assert b["snapshot"]["aqi"]["value"] is not None
    assert len(b["series"]["times"]) == len(b["series"]["hourly"]["aqi_in"])
    br = client.get("/api/insights/briefing").json()
    assert br["generated_by"] == "rules"
    for rec in br["recommendations"]:
        for field in ("what_is_happening", "why_it_matters", "action", "alternative", "expected_benefit", "confidence"):
            assert rec[field]
    ans = client.post("/api/assistant/chat", json={"question": "Is it safe to play outside?"}).json()
    assert ans["intent"] == "safe_outside"
    assert ans["data_refs"] and ans["uncertainty"]


def test_profile_update_validation(client):
    me = client.get("/api/me").json()
    assert me["role"] == "admin"
    r = client.patch("/api/me", json={"language": "hi", "community_type": "school"})
    assert r.status_code == 200 and r.json()["language"] == "hi"
    assert client.patch("/api/me", json={"language": "xx"}).status_code == 422


def test_community_flow(client):
    seed = client.post("/api/communities/demo/seed").json()
    assert len(seed["created"]) == 2
    comms = client.get("/api/communities").json()["communities"]
    assert all(c["is_demo"] for c in comms)
    detail = client.get(f"/api/communities/{comms[0]['id']}").json()
    assert "disclaimer" in detail["stats"]
    analyzed = client.post(
        "/api/conversation/analyze", json={"text": "Tomorrow outdoor sports at 3 PM", "audience": "school"}
    ).json()
    assert analyzed["stored"] is False and analyzed["relevant"] is True
    removed = client.delete("/api/communities/demo").json()
    assert removed["removed"] > 0
    assert client.get("/api/communities").json()["communities"] == []


def test_impact_endpoints(client):
    t = client.post(
        "/api/impact/trip",
        json={"baseline_mode": "petrol_car", "alternative_mode": "bus", "distance_km": 8, "trips_per_week": 10},
    ).json()
    assert t["avoided_kg"]["year"]["estimate"] > 0
    e = client.post("/api/impact/exposure", json={"activity_hours": 1, "intensity": "high"}).json()
    assert e["forecast"] and e["assumptions"]
    assert (
        client.post(
            "/api/impact/trip",
            json={"baseline_mode": "rocket", "alternative_mode": "bus", "distance_km": 8, "trips_per_week": 10},
        ).status_code
        == 422
    )
