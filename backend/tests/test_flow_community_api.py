"""Community API routes exercised end-to-end through the FastAPI test client (no network)."""

import asyncio
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.core.http import UpstreamError
from app.core.rate_limit import limiter
from app.core.security import LOCAL_UID, CurrentUser, get_current_user
from app.db.store import get_store
from app.main import app
from app.services import ambient_intelligence as ambient
from app.services import community_service as cs
from app.services import conversation_processor as cp
from app.services import telegram_integration as tg

FIXED_NOW = datetime(2026, 11, 19, 10, 0)
LOC = {"name": "Test City", "lat": 28.61, "lon": 77.21}


@pytest.fixture
def client(sample_bundle, monkeypatch):
    _, bundle = sample_bundle

    async def fake_bundle(location, **kwargs):
        return bundle

    monkeypatch.setattr(ambient, "get_bundle", fake_bundle)
    monkeypatch.setattr(cp, "local_now", lambda series: FIXED_NOW)
    limiter.reset()
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    limiter.reset()


@pytest.fixture
def sent(monkeypatch):
    out = []

    async def fake_send(chat_id, text):
        out.append((chat_id, text))

    monkeypatch.setattr(tg, "send_message", fake_send)
    return out


def _as_member(monkeypatch, uid):
    monkeypatch.setattr(get_settings(), "auth_mode", "firebase")
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(uid=uid, role="member", auth_mode="firebase")


def _community(client, name="Sunrise School", ctype="school"):
    r = client.post("/api/communities", json={"name": name, "type": ctype, "location": LOC})
    assert r.status_code == 200
    return r.json()


def _event_body(**extra):
    return {
        "title": "Sports day",
        "activity_type": "sports",
        "intensity": "high",
        "outdoor": True,
        "date": "2026-11-20",
        "time": "21:00",
        "duration_hours": 2,
        **extra,
    }


def _store(coll, doc_id, doc):
    asyncio.run(get_store().set(coll, doc_id, doc))


def _get(coll, doc_id):
    return asyncio.run(get_store().get(coll, doc_id))


# ----------------------------------------------------------------------------- create / list / detail


def test_create_community_derives_location_id(client):
    c = _community(client)
    assert c["name"] == "Sunrise School" and c["type"] == "school"
    assert c["location"]["id"] == "28.61_77.21" and c["location"]["name"] == "Test City"
    assert c["admin_uids"] == [LOCAL_UID] and c["member_uids"] == [LOCAL_UID] and c["is_demo"] is False
    assert c["id"] in _get("users", LOCAL_UID)["community_ids"]


@pytest.mark.parametrize("location", [{"name": "X", "lat": 999, "lon": 0}, {"lat": 1, "lon": 1}])
def test_create_community_rejects_invalid_location(client, location):
    r = client.post("/api/communities", json={"name": "Bad", "type": "rwa", "location": location})
    assert r.status_code == 422 and r.json()["detail"] == "Invalid location"
    assert asyncio.run(get_store().query("communities")) == []


def test_list_communities_counts_events_and_groups(client):
    c = _community(client)
    asyncio.run(cs.add_event(c["id"], {"kind": "activity", "advisory": {"status": "pending"}}))
    asyncio.run(cs.add_event(c["id"], {"kind": "activity", "advisory": {"status": "none"}}))
    _store("tg_groups", "g1", {"chat_id": "g1", "community_id": c["id"], "title": "G"})
    out = client.get("/api/communities").json()["communities"]
    assert len(out) == 1
    assert (out[0]["event_count"], out[0]["pending_advisories"], out[0]["group_count"]) == (2, 1, 1)
    assert out[0]["can_manage"] is True


def test_detail_forbidden_for_non_member_in_firebase_mode(client, monkeypatch):
    owner = CurrentUser(uid="owner", role="member", auth_mode="firebase")
    c = asyncio.run(cs.create(owner, cs.CommunityIn(name="Private", type="rwa", location=LOC)))
    _as_member(monkeypatch, "stranger")
    r = client.get(f"/api/communities/{c['id']}")
    assert r.status_code == 403 and r.json()["detail"] == "Not a member of this community"


def test_detail_for_member_lists_records_and_hides_connect_codes(client, monkeypatch):
    owner = CurrentUser(uid="owner", role="member", auth_mode="firebase")
    c = asyncio.run(cs.create(owner, cs.CommunityIn(name="Ours", type="rwa", location=LOC)))
    asyncio.run(get_store().update("communities", c["id"], {"member_uids": ["owner", "friend"]}))
    _store("initiatives", "i1", {"community_id": c["id"], "type": "carpool", "title": "Pool"})
    _store("initiatives", "i2", {"community_id": c["id"], "type": "custom_thing", "title": "Other"})
    for rid, date in (("r1", "2026-10-01"), ("r2", "2026-11-01")):
        _store(
            "initiative_records",
            rid,
            {
                "initiative_id": "i1",
                "community_id": c["id"],
                "date": date,
                "participants": 5,
                "quantity": 5,
                "verified": True,
            },
        )
    _store("tg_groups", "g1", {"chat_id": "g1", "community_id": c["id"], "title": "G", "connect_code": "SECRET"})
    _as_member(monkeypatch, "friend")
    body = client.get(f"/api/communities/{c['id']}").json()
    assert body["community"]["can_manage"] is False
    by_id = {i["id"]: i for i in body["initiatives"]}
    assert [r["id"] for r in by_id["i1"]["records"]] == ["r2", "r1"]  # newest first
    assert by_id["i1"]["label"] == "Carpooling" and by_id["i2"]["label"] == "custom_thing"
    assert body["groups"] == [{"chat_id": "g1", "community_id": c["id"], "title": "G", "id": "g1"}]
    assert body["stats"]["totals"]["verified_records"] == 2
    assert "carpool" in body["initiative_types"]


# ----------------------------------------------------------------------------- events


def test_add_event_with_risk_assessment(client, sample_bundle):
    c = _community(client)
    ev = client.post(f"/api/communities/{c['id']}/events", json=_event_body()).json()
    assert (ev["source"], ev["kind"], ev["community_id"], ev["is_demo"]) == ("manual", "activity", c["id"], False)
    expected = cp.assess_event(ev, sample_bundle[1]["series"], "school")
    assert ev["risk"] == expected and expected["respond"] is True
    assert ev["advisory"] == {"status": "pending", "text": cp.advisory_text(ev, expected)}
    assert _get("community_events", ev["id"])["title"] == "Sports day"


def test_add_event_outside_forecast_range_has_no_advisory(client):
    c = _community(client)
    ev = client.post(f"/api/communities/{c['id']}/events", json=_event_body(date="2030-01-01")).json()
    assert ev["risk"]["level"] == "unknown" and ev["risk"]["respond"] is False
    assert ev["advisory"] == {"status": "none"}


def test_add_event_when_data_unavailable_skips_assessment(client, monkeypatch):
    c = _community(client)

    async def down(location, **kwargs):
        raise UpstreamError("Open-Meteo Air Quality", "timeout")

    monkeypatch.setattr(ambient, "get_bundle", down)
    ev = client.post(f"/api/communities/{c['id']}/events", json=_event_body()).json()
    assert "risk" not in ev and ev["advisory"] == {"status": "none"}


def test_add_event_requires_manager(client, monkeypatch):
    c = _community(client)
    _as_member(monkeypatch, "stranger")
    r = client.post(f"/api/communities/{c['id']}/events", json=_event_body())
    assert r.status_code == 403 and r.json()["detail"] == "Only community administrators can do this"


def test_add_event_unknown_community_404(client):
    r = client.post("/api/communities/nope/events", json=_event_body())
    assert r.status_code == 404 and r.json()["detail"] == "Community not found"


def test_delete_event(client):
    c = _community(client)
    ev = asyncio.run(cs.add_event(c["id"], {"kind": "activity"}))
    assert client.delete(f"/api/communities/{c['id']}/events/{ev['id']}").json() == {"ok": True}
    assert _get("community_events", ev["id"]) is None
    r = client.delete(f"/api/communities/{c['id']}/events/{ev['id']}")
    assert r.status_code == 404 and r.json()["detail"] == "Event not found"


# ----------------------------------------------------------------------------- advisories


def _groups_for(cid):
    _store(
        "tg_groups",
        "demo-x",
        {"chat_id": "demo-x", "title": "Demo", "community_id": cid, "authorized": True, "is_demo": True},
    )
    _store(
        "tg_groups",
        "-100123",
        {"chat_id": "-100123", "title": "Parents", "community_id": cid, "authorized": True, "is_demo": False},
    )
    _store(
        "tg_groups",
        "-100999",
        {"chat_id": "-100999", "title": "Off", "community_id": cid, "authorized": False, "is_demo": False},
    )


def _pending(cid, **extra):
    return asyncio.run(
        cs.add_event(
            cid,
            {
                "kind": "activity",
                "title": "Run",
                "advisory": {"status": "pending", "text": "Move it indoors."},
                **extra,
            },
        )
    )


def test_approve_sends_to_real_groups_only(client, sent):
    c = _community(client)
    _groups_for(c["id"])
    ev = _pending(c["id"])
    out = client.post(f"/api/communities/{c['id']}/events/{ev['id']}/advisory", json={"action": "approve"}).json()
    adv = out["advisory"]
    assert adv["status"] == "sent" and adv["text"] == "Move it indoors."
    assert adv["delivered_to"] == ["Parents"]
    assert adv["delivery_errors"] == ["Demo: demo group, message not sent"]
    assert adv["decided_by"] == LOCAL_UID and adv["decided_at"]
    assert sent == [("-100123", "Move it indoors.")]


def test_approve_with_edited_text_targets_source_group(client, sent):
    c = _community(client)
    _groups_for(c["id"])
    _store(
        "tg_groups", "-100555", {"chat_id": "-100555", "title": "Teachers", "community_id": c["id"], "authorized": True}
    )
    ev = _pending(c["id"], group_id="-100555")
    out = client.post(
        f"/api/communities/{c['id']}/events/{ev['id']}/advisory", json={"action": "approve", "text": "Edited advisory"}
    ).json()
    assert out["advisory"]["delivered_to"] == ["Teachers"] and out["advisory"]["text"] == "Edited advisory"
    assert sent == [("-100555", "Edited advisory")]


def test_approve_records_delivery_errors(client, monkeypatch):
    c = _community(client)
    _groups_for(c["id"])
    ev = _pending(c["id"])

    async def failing(chat_id, text):
        raise RuntimeError("Telegram sendMessage failed: Forbidden: bot was kicked")

    monkeypatch.setattr(tg, "send_message", failing)
    adv = client.post(f"/api/communities/{c['id']}/events/{ev['id']}/advisory", json={"action": "approve"}).json()[
        "advisory"
    ]
    assert adv["status"] == "approved" and adv["delivered_to"] == []
    assert adv["delivery_errors"] == [
        "Demo: demo group, message not sent",
        "Parents: Telegram sendMessage failed: Forbidden: bot was kicked",
    ]


def test_dismiss_does_not_send(client, sent):
    c = _community(client)
    _groups_for(c["id"])
    ev = _pending(c["id"])
    adv = client.post(f"/api/communities/{c['id']}/events/{ev['id']}/advisory", json={"action": "dismiss"}).json()[
        "advisory"
    ]
    assert adv["status"] == "dismissed" and adv["delivered_to"] == [] and adv["delivery_errors"] == []
    assert sent == []
    assert _get("community_events", ev["id"])["advisory"]["status"] == "dismissed"


def test_advisory_for_event_in_another_community_404(client):
    a, b = _community(client, "Alpha"), _community(client, "Beta")
    ev = _pending(b["id"])
    r = client.post(f"/api/communities/{a['id']}/events/{ev['id']}/advisory", json={"action": "dismiss"})
    assert r.status_code == 404


def test_advisory_rejects_unknown_action(client):
    c = _community(client)
    ev = _pending(c["id"])
    r = client.post(f"/api/communities/{c['id']}/events/{ev['id']}/advisory", json={"action": "publish"})
    assert r.status_code == 422


# ----------------------------------------------------------------------------- groups


def test_connect_group_with_bad_code_404(client):
    c = _community(client)
    r = client.post(f"/api/communities/{c['id']}/groups/connect", json={"code": "WRONGCODE"})
    assert r.status_code == 404 and "Send /optin" in r.json()["detail"]


def test_connect_group_with_good_code(client):
    c = _community(client)
    _store(
        "tg_groups",
        "-100123",
        {
            "chat_id": "-100123",
            "title": "Parents",
            "authorized": True,
            "connect_code": "ABCD1234",
            "location": None,
            "community_id": None,
        },
    )
    r = client.post(f"/api/communities/{c['id']}/groups/connect", json={"code": " ABCD1234 "})
    assert r.json() == {"ok": True, "group": "Parents"}
    g = _get("tg_groups", "-100123")
    assert g["community_id"] == c["id"] and g["connect_code"] is None
    assert g["location"] == c["location"]


def _linked_group(cid, gid="-100123", **extra):
    _store(
        "tg_groups",
        gid,
        {
            "chat_id": gid,
            "title": "Parents",
            "community_id": cid,
            "authorized": True,
            "reply_mode": "approval",
            "is_demo": False,
            **extra,
        },
    )


def test_patch_group_reply_mode(client):
    c = _community(client)
    _linked_group(c["id"])
    out = client.patch(f"/api/communities/{c['id']}/groups/-100123", json={"reply_mode": "auto"}).json()
    assert out["reply_mode"] == "auto" and out["authorized"] is True


def test_patch_group_revoke_deletes_group_events(client):
    c = _community(client)
    _linked_group(c["id"])
    asyncio.run(cs.add_event(c["id"], {"id": "from-group", "group_id": "-100123", "kind": "activity"}))
    asyncio.run(cs.add_event(c["id"], {"id": "manual", "kind": "activity"}))
    out = client.patch(f"/api/communities/{c['id']}/groups/-100123", json={"authorized": False}).json()
    assert out["authorized"] is False
    assert [e["id"] for e in asyncio.run(get_store().query("community_events"))] == ["manual"]


def test_patch_group_reauthorise_real_group_needs_telegram_admin(client):
    c = _community(client)
    _linked_group(c["id"], authorized=False)
    r = client.patch(f"/api/communities/{c['id']}/groups/-100123", json={"authorized": True})
    assert r.status_code == 400 and "/optin" in r.json()["detail"]
    assert _get("tg_groups", "-100123")["authorized"] is False


def test_patch_group_reauthorise_demo_group(client):
    c = _community(client)
    _linked_group(c["id"], gid="demo-1", authorized=False, is_demo=True)
    out = client.patch(f"/api/communities/{c['id']}/groups/demo-1", json={"authorized": True}).json()
    assert out["authorized"] is True


def test_patch_group_of_other_community_404(client):
    c = _community(client)
    _linked_group("someone-else")
    r = client.patch(f"/api/communities/{c['id']}/groups/-100123", json={"reply_mode": "auto"})
    assert r.status_code == 404 and r.json()["detail"] == "Group not found"


# ----------------------------------------------------------------------------- initiatives


def test_add_initiative_rejects_unknown_type(client):
    c = _community(client)
    r = client.post(f"/api/communities/{c['id']}/initiatives", json={"type": "rocket", "title": "Space"})
    assert r.status_code == 422 and r.json()["detail"] == "Unknown initiative type"


def test_initiative_record_add_and_verify(client):
    c = _community(client)
    ini = client.post(
        f"/api/communities/{c['id']}/initiatives",
        json={"type": "carpool", "title": "Office pool", "description": "Weekday pool"},
    ).json()
    assert (ini["type"], ini["community_id"], ini["is_demo"]) == ("carpool", c["id"], False)

    rec = client.post(
        f"/api/communities/{c['id']}/initiatives/{ini['id']}/records",
        json={"date": "2026-11-01", "participants": 12, "quantity": 12},
    ).json()
    assert rec["verified"] is False and rec["verified_by"] is None and rec["verified_at"] is None
    assert rec["created_by"] == LOCAL_UID and rec["initiative_id"] == ini["id"]

    verified_now = client.post(
        f"/api/communities/{c['id']}/initiatives/{ini['id']}/records",
        json={"date": "2026-11-02", "participants": 3, "verified": True},
    ).json()
    assert verified_now["verified_by"] == LOCAL_UID and verified_now["verified_at"]

    out = client.post(f"/api/communities/{c['id']}/records/{rec['id']}/verify").json()
    assert out["verified"] is True and out["verified_by"] == LOCAL_UID and out["verified_at"]
    stats = client.get(f"/api/communities/{c['id']}").json()["stats"]
    assert stats["totals"] == {"verified_records": 2, "pending_records": 0, "verified_participants": 15}


def test_record_for_unknown_initiative_or_record_404(client):
    c = _community(client)
    r = client.post(
        f"/api/communities/{c['id']}/initiatives/missing/records", json={"date": "2026-11-01", "participants": 1}
    )
    assert r.status_code == 404 and r.json()["detail"] == "Initiative not found"
    r = client.post(f"/api/communities/{c['id']}/records/missing/verify")
    assert r.status_code == 404 and r.json()["detail"] == "Record not found"


# ----------------------------------------------------------------------------- conversation analysis


def test_conversation_analyze_stores_nothing(client):
    r = client.post(
        "/api/conversation/analyze", json={"text": "Cricket match tomorrow at 9 pm in the ground", "audience": "school"}
    )
    body = r.json()
    assert body["relevant"] is True and body["stored"] is False
    assert body["event"]["activity_type"] == "sports" and body["event"]["date"] == "2026-11-20"
    assert body["event"]["time"] == "21:00" and body["respond"] is True
    assert body["advisory"].startswith("🌫️ AIRenv advisory:")
    assert body["privacy"] == "This message was processed in memory only. Nothing was stored."
    assert asyncio.run(get_store().query("community_events")) == []


def test_conversation_analyze_irrelevant_message(client):
    body = client.post(
        "/api/conversation/analyze", json={"text": "Thanks for the photos", "lat": 28.61, "lon": 77.21}
    ).json()
    assert body["relevant"] is False and body["event"] is None and body["advisory"] is None


def test_conversation_analyze_503_when_data_unavailable(client, monkeypatch):
    async def down(location, **kwargs):
        raise UpstreamError("Open-Meteo Air Quality", "timeout")

    monkeypatch.setattr(ambient, "get_bundle", down)
    r = client.post("/api/conversation/analyze", json={"text": "Cricket match tomorrow at 9 pm"})
    assert r.status_code == 503
    assert r.json()["detail"]["code"] == "data_unavailable" and r.json()["detail"]["message"] == "timeout"
