"""Security controls: headers, CORS, rate limiting, request size, access control and secret handling."""

import asyncio

import httpx
import pytest
from fastapi.testclient import TestClient
from starlette.requests import Request

from app.api import account as account_api
from app.api import air as air_api
from app.config import Settings, get_settings
from app.core import http as core_http
from app.core.rate_limit import RateLimiter, client_ip, limiter
from app.core.security import CurrentUser
from app.db.store import get_store
from app.main import app
from app.services import ambient_intelligence as ambient
from app.services import community_service as cs
from app.services import telegram_integration as tg
from app.services.location_service import Location


@pytest.fixture
def client(sample_bundle, monkeypatch):
    _, bundle = sample_bundle

    async def fake_bundle(location, **kwargs):
        return bundle

    monkeypatch.setattr(ambient, "get_bundle", fake_bundle)
    limiter.reset()
    with TestClient(app) as c:
        yield c
    limiter.reset()


# ----------------------------------------------------------------------------- headers / CORS


def test_security_headers_on_api_responses(client):
    r = client.get("/api/health")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"
    assert r.headers["referrer-policy"] == "no-referrer"
    assert "default-src 'none'" in r.headers["content-security-policy"]
    assert "frame-ancestors 'none'" in r.headers["content-security-policy"]
    assert "strict-transport-security" not in r.headers  # only in production


def test_docs_get_a_csp_that_allows_swagger_assets(client):
    r = client.get("/api/docs")
    assert r.status_code == 200
    assert "cdn.jsdelivr.net" in r.headers["content-security-policy"]


def test_cors_allows_configured_origin_without_credentials(client):
    r = client.options(
        "/api/health", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"}
    )
    assert r.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "access-control-allow-credentials" not in r.headers


def test_cors_rejects_unknown_origin(client):
    r = client.options(
        "/api/health", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"}
    )
    assert "access-control-allow-origin" not in r.headers


def test_large_json_responses_are_gzipped(client):
    r = client.get("/api/air/bundle", headers={"Accept-Encoding": "gzip"})
    assert r.status_code == 200
    assert r.headers.get("content-encoding") == "gzip"


# ----------------------------------------------------------------------------- request size


def test_oversized_body_is_rejected_with_413(client):
    big = "x" * (get_settings().max_request_bytes + 10)
    r = client.post("/api/assistant/chat", content=big, headers={"Content-Type": "application/json"})
    assert r.status_code == 413


# ----------------------------------------------------------------------------- rate limiting


def test_rate_limiter_window_and_retry_after():
    rl = RateLimiter()
    assert rl.allow("k", 2) == (True, 0)
    assert rl.allow("k", 2) == (True, 0)
    ok, wait = rl.allow("k", 2)
    assert ok is False and 1 <= wait <= 61


def test_rate_limiter_sweeps_idle_clients(monkeypatch):
    rl = RateLimiter()
    clock = [1000.0]
    monkeypatch.setattr("app.core.rate_limit.time.monotonic", lambda: clock[0])
    rl._last_sweep = clock[0]
    rl.allow("a", 5)
    clock[0] += 500
    rl.allow("b", 5)  # triggers the sweep; "a" has been idle longer than the window
    assert len(rl) == 1


def test_api_returns_429_with_retry_after(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "rate_limit_per_minute", 3)
    codes = [client.get("/api/feed").status_code for _ in range(4)]
    assert codes[:3] == [200, 200, 200]
    r = client.get("/api/feed")
    assert r.status_code == 429 and int(r.headers["retry-after"]) >= 1


def test_ai_endpoints_have_a_stricter_limit(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "ai_rate_limit_per_minute", 1)
    assert client.post("/api/assistant/chat", json={"question": "Is it safe?"}).status_code == 200
    assert client.post("/api/assistant/chat", json={"question": "Is it safe?"}).status_code == 429


def _request(xff: str | None, peer: str = "10.0.0.9") -> Request:
    headers = [(b"x-forwarded-for", xff.encode())] if xff else []
    return Request({"type": "http", "headers": headers, "client": (peer, 1234)})


def test_client_ip_ignores_forwarded_header_without_trusted_proxy():
    assert client_ip(_request("1.2.3.4"), trusted_hops=0) == "10.0.0.9"


def test_client_ip_cannot_be_spoofed_behind_one_proxy():
    # The client sent "6.6.6.6" itself; the proxy appended the real address.
    assert client_ip(_request("6.6.6.6, 203.0.113.7"), trusted_hops=1) == "203.0.113.7"


def test_client_ip_falls_back_to_peer_without_header():
    assert client_ip(_request(None), trusted_hops=1) == "10.0.0.9"


# ----------------------------------------------------------------------------- production guard


def _settings(**env):
    return Settings(**{"AIRENV_ENV": "production", "AUTH_MODE": "firebase", "TELEGRAM_BOT_TOKEN": "", **env})


def test_production_rejects_local_auth():
    with pytest.raises(RuntimeError, match="AUTH_MODE"):
        _settings(AUTH_MODE="local").validate_for_runtime()


def test_production_rejects_wildcard_cors():
    with pytest.raises(RuntimeError, match="CORS"):
        _settings(CORS_ORIGINS="*").validate_for_runtime()


def test_production_requires_webhook_secret():
    with pytest.raises(RuntimeError, match="WEBHOOK_SECRET"):
        _settings(TELEGRAM_BOT_TOKEN="t", TELEGRAM_MODE="webhook", TELEGRAM_WEBHOOK_SECRET="").validate_for_runtime()


def test_safe_production_config_passes():
    _settings(
        CORS_ORIGINS="https://airenv.example",
        TELEGRAM_BOT_TOKEN="t",
        TELEGRAM_MODE="webhook",
        TELEGRAM_WEBHOOK_SECRET="s3cret",
    ).validate_for_runtime()


def test_development_allows_local_auth():
    Settings(AIRENV_ENV="development", AUTH_MODE="local").validate_for_runtime()


# ----------------------------------------------------------------------------- telegram webhook


def test_webhook_rejects_missing_and_wrong_secret(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "telegram_webhook_secret", "right-secret")
    assert client.post("/api/telegram/webhook", json={}).status_code == 401
    assert (
        client.post("/api/telegram/webhook", json={}, headers={"X-Telegram-Bot-Api-Secret-Token": "wrong"}).status_code
        == 401
    )


def test_webhook_disabled_when_no_secret_configured(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "telegram_webhook_secret", None)
    assert (
        client.post("/api/telegram/webhook", json={}, headers={"X-Telegram-Bot-Api-Secret-Token": ""}).status_code
        == 401
    )


def test_webhook_accepts_valid_secret_and_rejects_non_object(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "telegram_webhook_secret", "right-secret")
    handled = []

    async def fake_handle(update):
        handled.append(update)

    monkeypatch.setattr(tg, "handle_update", fake_handle)
    hdr = {"X-Telegram-Bot-Api-Secret-Token": "right-secret"}
    assert client.post("/api/telegram/webhook", json={"update_id": 1}, headers=hdr).status_code == 200
    assert client.post("/api/telegram/webhook", json=[1, 2], headers=hdr).status_code == 400


# ----------------------------------------------------------------------------- stream


def test_stream_rejects_malformed_location_id(client):
    assert client.get("/api/stream", params={"location_id": "user:someone-else"}).status_code == 422
    assert client.get("/api/stream", params={"location_id": "../../x"}).status_code == 422


def test_stream_ticket_is_single_use_and_bounded(client, monkeypatch):
    account_api._tickets.clear()
    t = client.post("/api/stream/ticket").json()
    assert t["expires_in"] == 60 and t["ticket"] in account_api._tickets
    monkeypatch.setattr(account_api, "MAX_OPEN_TICKETS", 1)
    assert client.post("/api/stream/ticket").status_code == 503
    account_api._tickets.clear()


# ----------------------------------------------------------------------------- input validation


def test_location_id_is_derived_from_coordinates():
    loc = Location(id="user:victim", name="X", lat=28.6139, lon=77.209)
    assert loc.id == "28.61_77.21"


def test_profile_rejects_unknown_notification_categories(client):
    prefs = client.get("/api/me").json()["notification_prefs"]
    prefs["categories"]["$where"] = True
    assert client.patch("/api/me", json={"notification_prefs": prefs}).status_code == 422


def test_profile_location_id_cannot_be_injected(client):
    r = client.patch("/api/me", json={"location": {"id": "evil", "name": "Noida", "lat": 28.5355, "lon": 77.391}})
    assert r.status_code == 200 and r.json()["location"]["id"] == "28.54_77.39"


# ----------------------------------------------------------------------------- access control


def _member(uid: str) -> CurrentUser:
    return CurrentUser(uid=uid, role="member", auth_mode="firebase")


def test_event_delete_requires_event_to_belong_to_community(client):
    store = get_store()
    owner, other = _member("owner"), _member("other")
    loc = {"name": "X", "lat": 28.6, "lon": 77.2}
    a = asyncio.run(cs.create(owner, cs.CommunityIn(name="School A", type="school", location=loc)))
    b = asyncio.run(cs.create(other, cs.CommunityIn(name="School B", type="school", location=loc)))
    ev = asyncio.run(cs.add_event(b["id"], {"title": "B event", "kind": "activity"}))
    # Local auth mode makes the test client a platform admin, so call through the route's own checks:
    # an event id from community B addressed under community A must be "not found".
    r = client.delete(f"/api/communities/{a['id']}/events/{ev['id']}")
    assert r.status_code == 404
    assert asyncio.run(store.get("community_events", ev["id"])) is not None


def test_demo_removal_only_touches_communities_the_user_manages():
    alice, bob = _member("alice"), _member("bob")
    loc = {"name": "X", "lat": 28.6, "lon": 77.2}
    asyncio.run(cs.seed_demo(alice, loc))
    bob_ids = asyncio.run(cs.seed_demo(bob, loc))
    removed = asyncio.run(cs.remove_demo_data(alice))
    assert removed > 0
    remaining = asyncio.run(get_store().query("communities"))
    assert {c["id"] for c in remaining} == set(bob_ids)


def test_list_for_user_returns_only_memberships():
    alice, bob = _member("alice"), _member("bob")
    loc = {"name": "X", "lat": 28.6, "lon": 77.2}
    mine = asyncio.run(cs.create(alice, cs.CommunityIn(name="Mine", type="rwa", location=loc)))
    asyncio.run(cs.create(bob, cs.CommunityIn(name="Not mine", type="rwa", location=loc)))
    assert [c["id"] for c in asyncio.run(cs.list_for_user(alice))] == [mine["id"]]


def test_manual_refresh_is_throttled_per_location(client, monkeypatch):
    calls = []

    async def fake_refresh(loc):
        calls.append(loc.id)
        return {"status": "live", "observed_at": None, "fetched_at": "now"}

    monkeypatch.setattr("app.scheduler.refresh_location", fake_refresh)
    air_api._last_manual_refresh.clear()
    monkeypatch.setattr(
        ambient,
        "cached_bundle",
        lambda _id: {"snapshot": {"status": "live", "observed_at": None, "fetched_at": "cached"}},
    )
    first = client.post("/api/air/refresh").json()
    second = client.post("/api/air/refresh").json()
    assert first["throttled"] is False and second["throttled"] is True
    assert len(calls) == 1
    air_api._last_manual_refresh.clear()


# ----------------------------------------------------------------------------- secret handling


def test_upstream_errors_never_include_the_request_url(monkeypatch):
    secret_url = "https://api.data.gov.in/resource/x?api-key=SUPERSECRET"

    def handler(request):
        return httpx.Response(500, request=request)

    monkeypatch.setattr(core_http, "client", lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler)))

    async def run():
        with pytest.raises(core_http.UpstreamError) as info:
            await core_http.get_json("CPCB", secret_url, retries=0)
        return info.value

    err = asyncio.run(run())
    assert "SUPERSECRET" not in str(err) and err.message == "HTTP 500"


def test_telegram_errors_do_not_leak_the_bot_token(monkeypatch):
    monkeypatch.setattr(get_settings(), "telegram_bot_token", "123:SECRET-TOKEN")

    def handler(request):
        raise httpx.ConnectError("boom", request=request)

    monkeypatch.setattr(tg, "client", lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    with pytest.raises(RuntimeError) as info:
        asyncio.run(tg.call("getMe"))
    assert "SECRET-TOKEN" not in str(info.value)
    assert "network error" in str(info.value)
