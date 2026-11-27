"""Telegram integration flows: Bot API calls, start-up modes, polling, group privacy and commands (no network)."""

import asyncio
import contextlib
import hashlib
import json
from datetime import UTC, datetime, timedelta

import httpx
import pytest

from app.config import get_settings
from app.core.http import UpstreamError
from app.core.security import CurrentUser, default_profile
from app.db.store import get_store
from app.services import ambient_intelligence as ambient
from app.services import community_service as cs
from app.services import conversation_processor as cp
from app.services import telegram_integration as tg
from app.services.location_service import make_location

FIXED_NOW = datetime(2026, 11, 19, 10, 0)  # local time of the sample series "now"
CHAT = -1001


@pytest.fixture(autouse=True)
def tg_state(monkeypatch):
    monkeypatch.setattr(tg, "_status", {"mode": None, "connected": False, "error": None, "last_update_at": None})
    monkeypatch.setattr(tg, "_bot_info", None)
    monkeypatch.setattr(tg, "_poll_task", None)


class FakeBot:
    """Stands in for `tg.call`; records every Bot API method and payload."""

    def __init__(self, member_status="administrator"):
        self.calls = []
        self.member_status = member_status

    async def __call__(self, method, payload=None, request_timeout=15):
        self.calls.append((method, payload))
        if method == "getChatMember":
            return {"status": self.member_status}
        return True

    @property
    def sent(self):
        return [p["text"] for m, p in self.calls if m == "sendMessage"]


@pytest.fixture
def bot(monkeypatch):
    b = FakeBot()
    monkeypatch.setattr(tg, "call", b)
    return b


@pytest.fixture
def env_ctx(monkeypatch, sample_bundle):
    loc, bundle = sample_bundle
    requested = []

    async def fake_bundle(location, **kwargs):
        requested.append(location)
        return bundle

    monkeypatch.setattr(ambient, "get_bundle", fake_bundle)
    monkeypatch.setattr(cp, "local_now", lambda series: FIXED_NOW)
    return loc, bundle, requested


def _update(text, chat_id=CHAT, chat_type="supergroup", user_id=42, title="Parents"):
    return {
        "update_id": 1,
        "message": {
            "chat": {"id": chat_id, "type": chat_type, "title": title},
            "from": {"id": user_id, "username": "parent1"},
            "text": text,
        },
    }


async def _group(chat_id=CHAT, **fields):
    doc = {
        "chat_id": str(chat_id),
        "title": "Parents",
        "community_id": None,
        "reply_mode": "approval",
        "location": None,
        "is_demo": False,
        "authorized": True,
        **fields,
    }
    await get_store().set("tg_groups", str(chat_id), doc)
    return doc


def _community(loc, ctype="school"):
    owner = CurrentUser(uid="owner", role="member", auth_mode="firebase")
    return asyncio.run(cs.create(owner, cs.CommunityIn(name="Sunrise School", type=ctype, location=loc.model_dump())))


def _events():
    return asyncio.run(get_store().query("community_events"))


def _fingerprint(chat_id, kind, sub_type, date, time):
    raw = f"{chat_id}|{kind}|{sub_type}|{date}|{time}"
    return hashlib.sha1(raw.encode(), usedforsecurity=False).hexdigest()[:16]


# ----------------------------------------------------------------------------- Bot API call


def _mock_client(monkeypatch, handler):
    c = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    monkeypatch.setattr(tg, "client", lambda: c)


def test_call_requires_a_token(monkeypatch):
    monkeypatch.setattr(get_settings(), "telegram_bot_token", "")
    with pytest.raises(RuntimeError, match="not configured"):
        asyncio.run(tg.call("getMe"))


def test_call_posts_json_and_returns_result(monkeypatch):
    monkeypatch.setattr(get_settings(), "telegram_bot_token", "123:abc")
    seen = []

    def handler(request):
        seen.append((str(request.url), json.loads(request.content)))
        return httpx.Response(200, json={"ok": True, "result": {"username": "airenv_bot"}})

    _mock_client(monkeypatch, handler)
    assert asyncio.run(tg.call("getMe")) == {"username": "airenv_bot"}
    assert seen == [("https://api.telegram.org/bot123:abc/getMe", {})]


def test_call_raises_with_telegram_description(monkeypatch):
    monkeypatch.setattr(get_settings(), "telegram_bot_token", "123:abc")
    _mock_client(
        monkeypatch, lambda r: httpx.Response(200, json={"ok": False, "description": "Bad Request: chat not found"})
    )
    with pytest.raises(RuntimeError) as info:
        asyncio.run(tg.call("sendMessage", {"chat_id": 1}))
    assert str(info.value) == "Telegram sendMessage failed: Bad Request: chat not found"


def test_call_rejects_non_json_without_leaking_token(monkeypatch):
    monkeypatch.setattr(get_settings(), "telegram_bot_token", "123:SECRET")
    _mock_client(monkeypatch, lambda r: httpx.Response(502, content=b"<html>bad gateway</html>"))
    with pytest.raises(RuntimeError) as info:
        asyncio.run(tg.call("getMe"))
    assert str(info.value) == "Telegram getMe failed: invalid response from provider"
    assert "SECRET" not in str(info.value)


def test_send_message_truncates_and_uses_markdown(bot):
    asyncio.run(tg.send_message(77, "x" * 5000))
    method, payload = bot.calls[0]
    assert method == "sendMessage"
    assert payload["chat_id"] == 77 and len(payload["text"]) == 4000
    assert payload["parse_mode"] == "Markdown" and payload["disable_web_page_preview"] is True


# ----------------------------------------------------------------------------- status / start


def test_status_reports_configuration_and_bot_username(monkeypatch):
    monkeypatch.setattr(get_settings(), "telegram_bot_token", "")
    s = tg.status()
    assert s["configured"] is False and s["bot_username"] is None and s["mode"] is None
    assert "privacy mode" in s["privacy_note"]
    monkeypatch.setattr(get_settings(), "telegram_bot_token", "123:abc")
    monkeypatch.setattr(tg, "_bot_info", {"username": "airenv_bot"})
    s = tg.status()
    assert s["configured"] is True and s["bot_username"] == "airenv_bot"


def test_start_disabled_without_token(monkeypatch, bot):
    monkeypatch.setattr(get_settings(), "telegram_bot_token", "")
    asyncio.run(tg.start())
    assert tg._status["mode"] == "disabled" and tg._status["connected"] is False
    assert bot.calls == []


def test_start_disabled_by_mode(monkeypatch, bot):
    monkeypatch.setattr(get_settings(), "telegram_bot_token", "123:abc")
    monkeypatch.setattr(get_settings(), "telegram_mode", "disabled")
    asyncio.run(tg.start())
    assert tg._status["mode"] == "disabled" and bot.calls == []


def test_start_records_getme_failure(monkeypatch):
    monkeypatch.setattr(get_settings(), "telegram_bot_token", "123:abc")
    monkeypatch.setattr(get_settings(), "telegram_mode", "polling")

    async def failing(method, payload=None, request_timeout=15):
        raise RuntimeError("Telegram getMe failed: Unauthorized")

    monkeypatch.setattr(tg, "call", failing)
    asyncio.run(tg.start())
    assert tg._status["connected"] is False
    assert tg._status["error"] == "Telegram getMe failed: Unauthorized"
    assert tg._status["mode"] is None and tg._poll_task is None


def test_start_webhook_mode_registers_webhook(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "telegram_bot_token", "123:abc")
    monkeypatch.setattr(s, "telegram_mode", "webhook")
    monkeypatch.setattr(s, "public_base_url", "https://airenv.example/")
    monkeypatch.setattr(s, "telegram_webhook_secret", "s3cret")
    calls = []

    async def fake_call(method, payload=None, request_timeout=15):
        calls.append((method, payload))
        if method == "getMe":
            return {"username": "airenv_bot"}
        if method == "setMyCommands":
            raise RuntimeError("commands rejected")  # logged, start continues
        return True

    monkeypatch.setattr(tg, "call", fake_call)
    asyncio.run(tg.start())
    assert [m for m, _ in calls] == ["getMe", "setMyCommands", "setWebhook"]
    assert [c["command"] for c in calls[1][1]["commands"]] == [
        "air",
        "optin",
        "optout",
        "setlocation",
        "privacy",
        "help",
    ]
    assert calls[2][1] == {
        "url": "https://airenv.example/api/telegram/webhook",
        "secret_token": "s3cret",
        "allowed_updates": ["message", "my_chat_member"],
    }
    assert tg._status["mode"] == "webhook" and tg._status["connected"] is True and tg._status["error"] is None
    assert tg.status()["bot_username"] == "airenv_bot"
    assert tg._poll_task is None


def test_start_polling_mode_deletes_webhook_and_starts_loop(monkeypatch):
    monkeypatch.setattr(get_settings(), "telegram_bot_token", "123:abc")
    monkeypatch.setattr(get_settings(), "telegram_mode", "polling")
    calls = []
    started = []

    async def fake_call(method, payload=None, request_timeout=15):
        calls.append((method, payload))
        return {"username": "airenv_bot"} if method == "getMe" else True

    async def fake_loop():
        started.append(True)
        await asyncio.Event().wait()  # runs until cancelled

    monkeypatch.setattr(tg, "call", fake_call)
    monkeypatch.setattr(tg, "_poll_loop", fake_loop)

    async def run():
        await tg.start()
        await asyncio.sleep(0)
        task = tg._poll_task
        await tg.stop()
        with contextlib.suppress(asyncio.CancelledError):
            await task
        return task

    task = asyncio.run(run())
    assert [m for m, _ in calls] == ["getMe", "setMyCommands", "deleteWebhook"]
    assert calls[2][1] == {"drop_pending_updates": False}
    assert tg._status["mode"] == "polling"
    assert started == [True] and task.cancelled()


def test_stop_without_poll_task_is_a_no_op():
    asyncio.run(tg.stop())
    assert tg._poll_task is None


# ----------------------------------------------------------------------------- polling loop


def test_poll_loop_advances_offset_survives_errors_and_stops_on_cancel(monkeypatch):
    offsets, handled, sleeps, status_after_error = [], [], [], []
    responses = iter(
        [
            [{"update_id": 5}, {"update_id": 6}],
            RuntimeError("Telegram getUpdates failed: Conflict"),
            asyncio.CancelledError(),
        ]
    )

    async def fake_call(method, payload=None, request_timeout=15):
        assert method == "getUpdates" and request_timeout == 35
        offsets.append(payload["offset"])
        if len(offsets) == 3:
            status_after_error.append(dict(tg._status))
        r = next(responses)
        if isinstance(r, BaseException):
            raise r
        return r

    async def fake_handle(upd):
        handled.append(upd["update_id"])
        if upd["update_id"] == 5:
            raise ValueError("bad update")  # logged; the loop keeps going

    async def fake_sleep(seconds):
        sleeps.append(seconds)

    monkeypatch.setattr(tg, "call", fake_call)
    monkeypatch.setattr(tg, "handle_update", fake_handle)
    monkeypatch.setattr(tg.asyncio, "sleep", fake_sleep)

    async def run():
        with pytest.raises(asyncio.CancelledError):
            await tg._poll_loop()

    asyncio.run(run())
    assert offsets == [0, 7, 7]
    assert handled == [5, 6]
    assert sleeps == [10]
    assert status_after_error[0]["connected"] is False
    assert status_after_error[0]["error"] == "Telegram getUpdates failed: Conflict"


# ----------------------------------------------------------------------------- helpers


@pytest.mark.parametrize(
    "member_status, expected", [("administrator", True), ("creator", True), ("member", False), ("left", False)]
)
def test_is_group_admin_by_member_status(monkeypatch, member_status, expected):
    b = FakeBot(member_status)
    monkeypatch.setattr(tg, "call", b)
    assert asyncio.run(tg._is_group_admin(CHAT, 42)) is expected
    assert b.calls == [("getChatMember", {"chat_id": CHAT, "user_id": 42})]


def test_is_group_admin_false_when_api_fails(monkeypatch):
    async def failing(method, payload=None, request_timeout=15):
        raise RuntimeError("Bad Request: user not found")

    monkeypatch.setattr(tg, "call", failing)
    assert asyncio.run(tg._is_group_admin(CHAT, 42)) is False


def test_air_summary_format(env_ctx):
    loc, bundle, requested = env_ctx
    snap = bundle["snapshot"]
    text = asyncio.run(tg._air_summary(loc))
    cat = snap["aqi"]["category"]
    assert text == (
        f"*Test City* · 10:00 local\nEstimated NAQI *{snap['aqi']['value']}* ({cat['label']}), "
        f"PM2.5 {snap['pollutants']['pm2_5']['value']} µg/m³.\n{cat['health']}\n"
        "_Source: Test model (model estimate)._"
    )
    assert requested == [loc]


# ----------------------------------------------------------------------------- group privacy


def test_update_without_text_is_ignored_but_timestamped(bot, env_ctx):
    asyncio.run(tg.handle_update({"update_id": 3, "message": {"chat": {"id": CHAT, "type": "group"}}}))
    asyncio.run(tg.handle_update({"update_id": 4}))
    assert tg._status["last_update_at"] is not None
    assert bot.calls == [] and env_ctx[2] == []


def test_private_chat_plain_text_is_ignored(bot, env_ctx, monkeypatch):
    async def must_not_run(*a, **k):
        raise AssertionError("private text must not be processed")

    monkeypatch.setattr(cp, "process_message", must_not_run)
    asyncio.run(tg.handle_update(_update("Football match tomorrow at 9 pm", chat_id=5, chat_type="private")))
    assert bot.calls == [] and _events() == []


@pytest.mark.parametrize("authorized", [None, False])
def test_group_not_opted_in_is_discarded_without_processing(bot, env_ctx, monkeypatch, authorized):
    loc = env_ctx[0]
    if authorized is not None:
        asyncio.run(_group(authorized=False, community_id=_community(loc)["id"], location=loc.model_dump()))

    async def must_not_run(*a, **k):
        raise AssertionError("message from a non-opted-in group was processed")

    monkeypatch.setattr(cp, "process_message", must_not_run)
    asyncio.run(tg.handle_update(_update("Football match tomorrow at 9 pm in the ground")))
    assert bot.calls == [] and _events() == []
    assert env_ctx[2] == []  # no bundle was even fetched


def test_opted_in_group_creates_event_with_fingerprint_dedup(bot, env_ctx):
    loc = env_ctx[0]
    community = _community(loc)
    asyncio.run(_group(community_id=community["id"], location=loc.model_dump()))
    text = "Football match tomorrow at 9 pm in the ground"
    asyncio.run(tg.handle_update(_update(text)))
    asyncio.run(tg.handle_update(_update(text)))  # same event again: deduplicated
    events = _events()
    assert len(events) == 1
    ev = events[0]
    assert ev["id"] == _fingerprint(CHAT, "activity", "sports", "2026-11-20", "21:00")
    assert ev["community_id"] == community["id"]
    assert (ev["source"], ev["group_id"], ev["group_title"]) == ("telegram", str(CHAT), "Parents")
    assert (ev["kind"], ev["activity_type"], ev["intensity"], ev["outdoor"]) == ("activity", "sports", "high", True)
    assert (ev["date"], ev["time"], ev["time_precision"], ev["duration_hours"]) == ("2026-11-20", "21:00", "exact", 2)
    assert ev["risk"]["respond"] is True and ev["risk"]["event_time"] == "2026-11-20T21:00"
    assert ev["advisory"]["status"] == "pending"  # approval mode: nothing posted
    assert ev["advisory"]["text"].startswith("🌫️ AIRenv advisory:")
    assert ev["is_demo"] is False
    assert text not in json.dumps(ev, ensure_ascii=False)  # raw message text is never stored
    assert bot.sent == []
    assert env_ctx[2][0].name == "Test City"  # the group's own location was used


def test_irrelevant_and_transport_messages_store_nothing(bot, env_ctx):
    loc = env_ctx[0]
    asyncio.run(_group(community_id=_community(loc)["id"], location=loc.model_dump(), reply_mode="auto"))
    asyncio.run(tg.handle_update(_update("Thanks everyone, see you")))
    asyncio.run(tg.handle_update(_update("Carpool tomorrow at 8 am from gate 2")))
    assert _events() == [] and bot.sent == []


def test_burning_concern_is_captured(bot, env_ctx):
    loc = env_ctx[0]
    asyncio.run(_group(community_id=_community(loc, "apartment")["id"], location=loc.model_dump()))
    asyncio.run(tg.handle_update(_update("Someone is burning garbage near block C")))
    ev = _events()[0]
    assert (ev["kind"], ev["concern_type"], ev["date"]) == ("concern", "open_burning", "2026-11-19")
    assert ev["risk"] == {
        "level": "concern",
        "summary": "Open burning was discussed in the group.",
        "respond": True,
        "confidence": "high",
    }
    assert ev["advisory"]["status"] == "pending"
    assert "Solid Waste Management Rules, 2016" in ev["advisory"]["text"]


def test_auto_reply_mode_respects_30_minute_cooldown(bot, env_ctx):
    loc = env_ctx[0]
    asyncio.run(_group(community_id=_community(loc)["id"], location=loc.model_dump(), reply_mode="auto"))
    store = get_store()

    asyncio.run(tg.handle_update(_update("Football match tomorrow at 9 pm in the ground")))
    group = asyncio.run(store.get("tg_groups", str(CHAT)))
    assert group["last_reply_at"] is not None
    assert len(bot.sent) == 1 and bot.sent[0].startswith("🌫️ AIRenv advisory:")

    # Second event inside the cooldown: captured but left pending.
    asyncio.run(tg.handle_update(_update("Training session tomorrow at 8 pm on the field")))
    assert len(bot.sent) == 1

    # Cooldown expired: the bot may reply again.
    old = (datetime.now(UTC) - timedelta(minutes=31)).isoformat()
    asyncio.run(store.update("tg_groups", str(CHAT), {"last_reply_at": old}))
    asyncio.run(tg.handle_update(_update("Morning walk tomorrow at 7 am in the park")))
    assert len(bot.sent) == 2

    by_type = {e["activity_type"]: e["advisory"]["status"] for e in _events()}
    assert by_type == {"sports": "sent", "practice": "pending", "walk": "sent"}
    group = asyncio.run(store.get("tg_groups", str(CHAT)))
    assert group["last_reply_at"] > old


def test_opted_in_group_without_community_replies_but_stores_nothing(bot, env_ctx, monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "default_location_name", "Default Town")
    asyncio.run(_group(reply_mode="auto"))  # no community, no location
    asyncio.run(tg.handle_update(_update("Football match tomorrow at 9 pm in the ground")))
    assert len(bot.sent) == 1
    assert _events() == []
    assert env_ctx[2][0].name == "Default Town"


# ----------------------------------------------------------------------------- commands


def test_start_with_valid_link_code_links_account(bot):
    store = get_store()
    asyncio.run(store.set("users", "u1", default_profile("u1", "u1@example.com", "U1", "member")))
    expires = (datetime.now(UTC) + timedelta(minutes=10)).isoformat()
    asyncio.run(store.set("tg_link_codes", "CODE1", {"uid": "u1", "expires_at": expires}))
    asyncio.run(tg.handle_update(_update("/start CODE1", chat_id=555, chat_type="private")))
    user = asyncio.run(store.get("users", "u1"))
    assert user["telegram"]["chat_id"] == 555 and user["telegram"]["username"] == "parent1"
    assert user["telegram"]["linked_at"]
    assert asyncio.run(store.get("tg_link_codes", "CODE1")) is None
    assert bot.sent[0].startswith("✅ Your AIRenv account is linked.")


@pytest.mark.parametrize("stored", [True, False])
def test_start_with_expired_or_unknown_code_is_refused(bot, stored):
    store = get_store()
    asyncio.run(store.set("users", "u1", default_profile("u1", None, None, "member")))
    if stored:
        expired = (datetime.now(UTC) - timedelta(minutes=1)).isoformat()
        asyncio.run(store.set("tg_link_codes", "OLD", {"uid": "u1", "expires_at": expired}))
    asyncio.run(tg.handle_update(_update("/start OLD", chat_id=555, chat_type="private")))
    assert bot.sent == ["This link code is invalid or expired. Generate a new one in AIRenv Settings."]
    assert asyncio.run(store.get("users", "u1"))["telegram"] is None
    assert (asyncio.run(store.get("tg_link_codes", "OLD")) is not None) is stored


def test_start_without_code_and_bot_mention_greets(bot):
    asyncio.run(tg.handle_update(_update("/START@AIRenvBot", chat_id=555, chat_type="private")))
    assert bot.sent[0].startswith("👋 AIRenv monitors air quality")


def test_help_and_privacy_commands(bot):
    asyncio.run(tg.handle_update(_update("/help")))
    asyncio.run(tg.handle_update(_update("/privacy")))
    assert bot.sent[0].startswith("*AIRenv*\n/air – current air quality")
    assert "/setlocation <place>" in bot.sent[0]
    assert bot.sent[1].startswith("*Privacy*")
    assert "never stores message text" in bot.sent[1]


def test_unknown_command_is_ignored(bot):
    asyncio.run(tg.handle_update(_update("/dance")))
    assert bot.calls == []


def test_air_command_private_uses_default_location(bot, env_ctx):
    asyncio.run(tg.handle_update(_update("/air", chat_id=555, chat_type="private")))
    assert env_ctx[2][0].name == get_settings().default_location_name
    assert bot.sent[0].startswith(f"*{get_settings().default_location_name}* · 10:00 local")


def test_air_command_in_group_uses_group_location(bot, env_ctx):
    noida = make_location("Noida", 28.5355, 77.391)
    asyncio.run(_group(location=noida.model_dump()))
    asyncio.run(tg.handle_update(_update("/air")))
    assert env_ctx[2][0].name == "Noida"
    assert bot.sent[0].startswith("*Noida* · 10:00 local")


def test_air_command_reports_unavailable_data(bot, monkeypatch):
    async def down(location, **kwargs):
        raise UpstreamError("Open-Meteo Air Quality", "timeout")

    monkeypatch.setattr(ambient, "get_bundle", down)
    asyncio.run(tg.handle_update(_update("/air", chat_id=555, chat_type="private")))
    assert bot.sent == ["Live air-quality data is unavailable right now. Please try again later."]


@pytest.mark.parametrize("cmd", ["/optin", "/optout", "/setlocation Noida"])
def test_group_commands_refused_in_private_chats(bot, cmd):
    asyncio.run(tg.handle_update(_update(cmd, chat_id=555, chat_type="private")))
    assert bot.sent == ["This command works in groups."]
    assert asyncio.run(get_store().query("tg_groups")) == []


@pytest.mark.parametrize("cmd", ["/optin", "/optout", "/setlocation Noida"])
def test_group_commands_refused_for_non_admins(monkeypatch, cmd):
    b = FakeBot("member")
    monkeypatch.setattr(tg, "call", b)
    asyncio.run(tg.handle_update(_update(cmd)))
    assert b.calls[0] == ("getChatMember", {"chat_id": CHAT, "user_id": 42})
    assert b.sent == ["Only group administrators can change AIRenv settings."]
    assert asyncio.run(get_store().query("tg_groups")) == []


def test_optin_creates_group_with_connect_code(bot):
    asyncio.run(tg.handle_update(_update("/optin", title="Sunrise Parents")))
    g = asyncio.run(get_store().get("tg_groups", str(CHAT)))
    assert g["authorized"] is True and g["opted_in_at"]
    assert (g["title"], g["reply_mode"], g["community_id"], g["is_demo"]) == (
        "Sunrise Parents",
        "approval",
        None,
        False,
    )
    assert len(g["connect_code"]) >= 4
    assert f"`{g['connect_code']}`" in bot.sent[0]
    assert bot.sent[0].startswith("✅ Conversation intelligence enabled for this group.")


def test_optout_disables_group_and_deletes_its_events(bot):
    store = get_store()
    asyncio.run(_group(connect_code="ABCD", community_id="c1"))
    asyncio.run(cs.add_event("c1", {"id": "mine", "group_id": str(CHAT), "kind": "activity"}))
    asyncio.run(cs.add_event("c1", {"id": "other", "group_id": "-2002", "kind": "activity"}))
    asyncio.run(tg.handle_update(_update("/optout")))
    g = asyncio.run(store.get("tg_groups", str(CHAT)))
    assert g["authorized"] is False and g["connect_code"] is None and g["community_id"] == "c1"
    assert [e["id"] for e in _events()] == ["other"]
    assert bot.sent == ["Conversation intelligence disabled. Events extracted from this group have been deleted."]


def test_setlocation_without_argument_shows_usage(bot):
    asyncio.run(tg.handle_update(_update("/setlocation")))
    assert bot.sent == ["Usage: /setlocation <city or area>"]


def test_setlocation_place_not_found(bot, monkeypatch):
    queries = []

    async def fake_search(q, count=8):
        queries.append((q, count))
        return []

    monkeypatch.setattr(tg, "search", fake_search)
    asyncio.run(tg.handle_update(_update("/setlocation Atlantis")))
    assert queries == [("Atlantis", 1)]
    assert bot.sent == ["Could not find 'Atlantis'."]
    assert asyncio.run(get_store().get("tg_groups", str(CHAT))) is None


def test_setlocation_found_saves_group_location(bot, monkeypatch):
    noida = make_location("Noida", 28.5355, 77.391, country="India", admin1="Uttar Pradesh")

    async def fake_search(q, count=8):
        return [noida]

    monkeypatch.setattr(tg, "search", fake_search)
    asyncio.run(_group(authorized=True, reply_mode="auto"))
    asyncio.run(tg.handle_update(_update("/setlocation Noida")))
    g = asyncio.run(get_store().get("tg_groups", str(CHAT)))
    assert g["location"]["name"] == "Noida" and g["location"]["id"] == "28.54_77.39"
    assert g["reply_mode"] == "auto"  # existing settings kept
    assert bot.sent == ["📍 Location set to Noida, Uttar Pradesh."]


# ----------------------------------------------------------------------------- link codes


def test_create_link_code_with_bot_username(monkeypatch):
    monkeypatch.setattr(tg, "_bot_info", {"username": "airenv_bot"})
    before = datetime.now(UTC)
    out = asyncio.run(tg.create_link_code("u1"))
    assert out["bot_username"] == "airenv_bot"
    assert out["deep_link"] == f"https://t.me/airenv_bot?start={out['code']}"
    expires = datetime.fromisoformat(out["expires_at"])
    assert timedelta(minutes=14) < expires - before <= timedelta(minutes=16)
    stored = asyncio.run(get_store().get("tg_link_codes", out["code"]))
    assert stored["uid"] == "u1" and stored["expires_at"] == out["expires_at"]


def test_create_link_code_without_bot_info_has_no_deep_link():
    out = asyncio.run(tg.create_link_code("u2"))
    assert out["deep_link"] is None and out["bot_username"] is None
    assert len(out["code"]) >= 6
