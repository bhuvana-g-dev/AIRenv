"""Account API flows: export, deletion, notifications, Telegram linking and the SSE stream."""
import asyncio
import time
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from starlette.requests import Request

from app.api import account as account_api
from app.config import get_settings
from app.core.events_bus import bus
from app.core.rate_limit import limiter
from app.core.security import LOCAL_UID, CurrentUser, get_current_user
from app.db.store import get_store
from app.main import app
from app.services import ambient_intelligence as ambient
from app.services import telegram_integration as tg


@pytest.fixture
def client(sample_bundle, monkeypatch):
    _, bundle = sample_bundle

    async def fake_bundle(location, **kwargs):
        return bundle

    monkeypatch.setattr(ambient, "get_bundle", fake_bundle)
    monkeypatch.setattr(account_api, "_tickets", {})
    limiter.reset()
    with TestClient(app) as c:
        c.get("/api/me")  # creates the local owner's profile
        yield c
    app.dependency_overrides.clear()
    limiter.reset()


def _note(nid, uid=LOCAL_UID, read=False, priority=2, created=None, severity="medium"):
    doc = {"uid": uid, "key": nid, "category": "forecast", "severity": severity, "priority": priority,
           "title": f"Note {nid}", "message": "m", "read": read,
           "created_at": created or datetime.now(UTC).isoformat()}
    asyncio.run(get_store().set("notifications", nid, doc))
    return doc


def _get(coll, doc_id):
    return asyncio.run(get_store().get(coll, doc_id))


# ----------------------------------------------------------------------------- profile data

def test_export_contains_profile_and_own_notifications(client):
    _note("mine")
    _note("theirs", uid="someone")
    body = client.get("/api/me/export").json()
    assert body["profile"]["uid"] == LOCAL_UID and body["profile"]["display_name"] == "Local owner"
    assert [n["id"] for n in body["notifications"]] == ["mine"]
    assert datetime.fromisoformat(body["exported_at"]).tzinfo is not None


def test_delete_my_data_removes_profile_notifications_and_link_codes(client):
    _note("n1")
    _note("n2")
    _note("other", uid="someone")
    store = get_store()
    asyncio.run(store.set("tg_link_codes", "mycode", {"uid": LOCAL_UID, "expires_at": "2999-01-01"}))
    asyncio.run(store.set("tg_link_codes", "theircode", {"uid": "someone", "expires_at": "2999-01-01"}))
    assert client.delete("/api/me/data").json() == {"deleted_notifications": 2, "profile_deleted": True}
    assert _get("users", LOCAL_UID) is None
    assert _get("tg_link_codes", "mycode") is None and _get("tg_link_codes", "theircode") is not None
    assert [n["id"] for n in asyncio.run(store.query("notifications"))] == ["other"]


# ----------------------------------------------------------------------------- notifications

def test_notifications_list_unread_first_then_priority(client):
    now = datetime.now(UTC)
    _note("old-read", read=True, priority=4, created=(now - timedelta(hours=3)).isoformat())
    _note("low", priority=1, created=(now - timedelta(hours=2)).isoformat())
    _note("high", priority=3, created=(now - timedelta(hours=1)).isoformat())
    _note("foreign", uid="someone")
    body = client.get("/api/notifications").json()
    assert [n["id"] for n in body["items"]] == ["high", "low", "old-read"]
    assert body["unread"] == 2


def test_mark_read_and_read_all(client):
    _note("a")
    _note("b")
    _note("c", read=True)
    out = client.post("/api/notifications/a/read").json()
    assert out["read"] is True and out["id"] == "a"
    assert client.post("/api/notifications/read-all").json() == {"updated": 1}
    assert all(n["read"] for n in client.get("/api/notifications").json()["items"])
    assert client.post("/api/notifications/read-all").json() == {"updated": 0}


@pytest.mark.parametrize("method, path", [("post", "/api/notifications/{}/read"),
                                          ("delete", "/api/notifications/{}")])
def test_other_users_notification_is_not_found(client, method, path):
    _note("foreign", uid="someone")
    for nid in ("foreign", "missing"):
        r = getattr(client, method)(path.format(nid))
        assert r.status_code == 404 and r.json()["detail"] == "Notification not found"
    assert _get("notifications", "foreign")["read"] is False


def test_delete_own_notification(client):
    _note("mine")
    assert client.delete("/api/notifications/mine").json() == {"ok": True}
    assert _get("notifications", "mine") is None


def test_test_notification_then_429_within_the_minute(client):
    first = client.post("/api/notifications/test")
    assert first.status_code == 200
    doc = first.json()
    assert doc["title"] == "Test notification" and doc["severity"] == "critical"
    assert doc["category"] == "recommendation" and doc["key"].startswith("test:")
    assert doc["delivery"] == {"in_app": True, "telegram": "not_requested"}
    second = client.post("/api/notifications/test")
    assert second.status_code == 429 and second.json()["detail"] == "A test was sent less than a minute ago"


def test_test_notification_delivers_via_telegram_when_linked(client, monkeypatch):
    sent = []

    async def fake_send(chat_id, text):
        sent.append((chat_id, text))

    monkeypatch.setattr(tg, "send_message", fake_send)
    monkeypatch.setattr(get_settings(), "telegram_bot_token", "123:abc")
    monkeypatch.setattr(get_settings(), "telegram_mode", "polling")
    prefs = client.get("/api/me").json()["notification_prefs"]
    asyncio.run(get_store().update("users", LOCAL_UID, {"notification_prefs": {**prefs, "telegram": True},
                                                        "telegram": {"chat_id": 4242}}))
    doc = client.post("/api/notifications/test").json()
    assert doc["delivery"]["telegram"] == "sent"
    assert sent == [(4242, "*Test notification*\nDelivery check from AIRenv settings. No action needed.")]


def test_test_notification_without_profile_404(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "auth_mode", "firebase")
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(uid="ghost", role="member",
                                                                     auth_mode="firebase")
    r = client.post("/api/notifications/test")
    assert r.status_code == 404 and r.json()["detail"] == "Profile not found"


# ----------------------------------------------------------------------------- telegram

def test_link_code_503_without_bot_token(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "telegram_bot_token", "")
    r = client.post("/api/telegram/link-code")
    assert r.status_code == 503 and "TELEGRAM_BOT_TOKEN" in r.json()["detail"]


def test_link_code_when_configured(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "telegram_bot_token", "123:abc")
    calls = []

    async def fake_create(uid):
        calls.append(uid)
        return {"code": "C0DE", "expires_at": "2026-11-19T10:15:00+00:00",
                "deep_link": "https://t.me/airenv_bot?start=C0DE", "bot_username": "airenv_bot"}

    monkeypatch.setattr(tg, "create_link_code", fake_create)
    body = client.post("/api/telegram/link-code").json()
    assert calls == [LOCAL_UID]
    assert body["deep_link"] == "https://t.me/airenv_bot?start=C0DE"


def test_unlink_clears_telegram(client):
    asyncio.run(get_store().update("users", LOCAL_UID, {"telegram": {"chat_id": 1}}))
    assert client.delete("/api/telegram/link").json() == {"ok": True}
    assert _get("users", LOCAL_UID)["telegram"] is None


def test_telegram_status_route(client, monkeypatch):
    monkeypatch.setattr(tg, "_bot_info", {"username": "airenv_bot"})
    monkeypatch.setattr(get_settings(), "telegram_bot_token", "123:abc")
    body = client.get("/api/telegram/status").json()
    assert body["configured"] is True and body["bot_username"] == "airenv_bot"
    assert set(body) >= {"mode", "connected", "error", "last_update_at", "privacy_note"}


# ----------------------------------------------------------------------------- SSE stream

def _disconnect_after(monkeypatch, checks, on_first=None):
    """Make Request.is_disconnected report a disconnect after `checks` checks."""
    count = {"n": 0}

    async def fake_is_disconnected(self):
        count["n"] += 1
        if count["n"] == 1 and on_first:
            on_first()
        return count["n"] > checks

    monkeypatch.setattr(Request, "is_disconnected", fake_is_disconnected)


def test_stream_sends_ready_event_then_closes(client, monkeypatch):
    _disconnect_after(monkeypatch, 0)
    r = client.get("/api/stream", params={"location_id": "28.61_77.21"})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/event-stream")
    assert r.headers["cache-control"] == "no-cache" and r.headers["x-accel-buffering"] == "no"
    assert r.text == 'event: ready\ndata: {"topics": 1}\n\n'
    assert bus.subscriber_count() == 0  # unsubscribed when the client went away


def test_stream_with_ticket_adds_user_topic_and_consumes_ticket(client, monkeypatch):
    ticket = client.post("/api/stream/ticket").json()["ticket"]
    assert ticket in account_api._tickets

    def publish():
        bus.publish(f"user:{LOCAL_UID}", "notification.created", {"id": "n1"})

    _disconnect_after(monkeypatch, 1, on_first=publish)
    r = client.get("/api/stream", params={"location_id": "28.61_77.21", "ticket": ticket})
    assert r.text == ('event: ready\ndata: {"topics": 2}\n\n'
                      'event: notification.created\ndata: {"id": "n1"}\n\n')
    assert ticket not in account_api._tickets


def test_stream_ignores_expired_or_unknown_ticket(client, monkeypatch):
    account_api._tickets["expired"] = (time.time() - 5, LOCAL_UID)
    _disconnect_after(monkeypatch, 0)
    for t in ("expired", "unknown"):
        r = client.get("/api/stream", params={"location_id": "28.61_77.21", "ticket": t})
        assert r.text == 'event: ready\ndata: {"topics": 1}\n\n'
    assert "expired" not in account_api._tickets


def test_stream_ticket_purges_expired_entries(client):
    account_api._tickets["stale"] = (time.time() - 1, "x")
    t = client.post("/api/stream/ticket").json()
    assert "stale" not in account_api._tickets and t["ticket"] in account_api._tickets
    assert account_api._tickets[t["ticket"]][1] == LOCAL_UID
