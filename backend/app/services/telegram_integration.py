"""Telegram Bot API integration (webhook in production, long polling for local development).

Privacy design
- Groups must opt in with /optin, sent by a Telegram group administrator.
- Messages from groups that have not opted in are discarded without parsing.
- Raw message text is never stored; only structured event fields are persisted.
- Advisories default to "approval" mode: a community admin confirms in the dashboard before the bot posts.
- The bot replies at most once per event and observes a per-group cooldown.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

import httpx

from app.config import get_settings
from app.core.clock import utc_now, utc_now_iso
from app.core.http import client, describe_error
from app.core.ids import stable_id
from app.core.security import new_token
from app.db.store import get_store
from app.services import ambient_intelligence as ambient
from app.services import community_service as cs
from app.services import conversation_processor as cp
from app.services.location_service import Location, make_location, search

log = logging.getLogger("airenv.telegram")
API = "https://api.telegram.org/bot{token}/{method}"
GROUP_REPLY_COOLDOWN = timedelta(minutes=30)
LINK_CODE_TTL = timedelta(minutes=15)
MAX_MESSAGE_CHARS = 4000  # Telegram's limit is 4096
POLL_TIMEOUT_SECONDS = 25
POLL_RETRY_SECONDS = 10
ALLOWED_UPDATES = ["message", "my_chat_member"]
FINGERPRINT_LENGTH = 16
# Structured event fields copied from the extraction result into the stored community event.
STORED_EVENT_FIELDS = (
    "title",
    "activity_type",
    "concern_type",
    "intensity",
    "outdoor",
    "date",
    "time",
    "time_precision",
    "duration_hours",
)
BOT_COMMANDS = [
    {"command": "air", "description": "Current air quality for this chat's location"},
    {"command": "optin", "description": "Group admins: enable AIRenv conversation intelligence"},
    {"command": "optout", "description": "Disable conversation intelligence for this group"},
    {"command": "setlocation", "description": "Set the location, e.g. /setlocation Noida"},
    {"command": "privacy", "description": "What AIRenv processes and stores"},
    {"command": "help", "description": "How AIRenv works"},
]

_bot_info: dict[str, Any] | None = None
_poll_task: asyncio.Task[None] | None = None
_status: dict[str, Any] = {"mode": None, "connected": False, "error": None, "last_update_at": None}


async def call(method: str, payload: dict[str, Any] | None = None, request_timeout: float = 15) -> Any:
    token = get_settings().telegram_bot_token
    if not token:
        raise RuntimeError("Telegram is not configured (TELEGRAM_BOT_TOKEN)")
    try:
        resp = await client().post(API.format(token=token, method=method), json=payload or {}, timeout=request_timeout)
        data = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        # The bot token is part of the URL; never surface the raw httpx message.
        raise RuntimeError(f"Telegram {method} failed: {describe_error(exc)}") from None
    if not data.get("ok"):
        raise RuntimeError(f"Telegram {method} failed: {data.get('description')}")
    return data["result"]


async def send_message(chat_id: int | str, text: str) -> None:
    await call(
        "sendMessage",
        {
            "chat_id": chat_id,
            "text": text[:MAX_MESSAGE_CHARS],
            "parse_mode": "Markdown",
            "disable_web_page_preview": True,
        },
    )


def status() -> dict[str, Any]:
    s = get_settings()
    return {
        **_status,
        "configured": bool(s.telegram_bot_token),
        "bot_username": (_bot_info or {}).get("username"),
        "privacy_note": "Group privacy mode limits the bot to commands and replies unless disabled in BotFather. "
        "Disable it only for groups that have opted in to Conversation Intelligence.",
    }


# ----------------------------------------------------------------------------- lifecycle


async def _connect_updates() -> None:
    """Register the webhook, or switch to long polling for local development."""
    global _poll_task
    s = get_settings()
    if s.telegram_mode == "webhook":
        url = f"{s.public_base_url.rstrip('/')}/api/telegram/webhook"
        await call(
            "setWebhook",
            {"url": url, "secret_token": s.telegram_webhook_secret or "", "allowed_updates": ALLOWED_UPDATES},
        )
        _status["mode"] = "webhook"
    else:
        await call("deleteWebhook", {"drop_pending_updates": False})
        _status["mode"] = "polling"
        _poll_task = asyncio.create_task(_poll_loop())


async def start() -> None:
    global _bot_info
    if not get_settings().telegram_enabled:
        _status.update({"mode": "disabled", "connected": False})
        return
    try:
        _bot_info = await call("getMe")
        _status.update({"connected": True, "error": None})
    except Exception as exc:
        _status.update({"connected": False, "error": str(exc)})
        log.error("Telegram getMe failed: %s", exc)
        return
    try:
        await call("setMyCommands", {"commands": BOT_COMMANDS})
    except Exception as exc:
        log.warning("setMyCommands failed: %s", exc)
    await _connect_updates()


async def stop() -> None:
    if _poll_task:
        _poll_task.cancel()


async def _poll_loop() -> None:
    offset = 0
    while True:
        try:
            updates = await call(
                "getUpdates",
                {"offset": offset, "timeout": POLL_TIMEOUT_SECONDS, "allowed_updates": ALLOWED_UPDATES},
                request_timeout=POLL_TIMEOUT_SECONDS + 10,
            )
            for upd in updates:
                offset = upd["update_id"] + 1
                try:
                    await handle_update(upd)
                except Exception:
                    log.exception("Failed to handle Telegram update")
            _status.update({"connected": True, "error": None})
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            _status.update({"connected": False, "error": str(exc)})
            await asyncio.sleep(POLL_RETRY_SECONDS)


async def _is_group_admin(chat_id: int, user_id: int) -> bool:
    try:
        member = await call("getChatMember", {"chat_id": chat_id, "user_id": user_id})
        return member.get("status") in ("administrator", "creator")
    except Exception:
        return False


def _default_location() -> Location:
    s = get_settings()
    return make_location(s.default_location_name, s.default_lat, s.default_lon, timezone=s.default_timezone)


async def _air_summary(loc: Location) -> str:
    bundle = await ambient.get_bundle(loc)
    snap = bundle["snapshot"]
    cat = snap["aqi"].get("category") or {}
    pm = snap["pollutants"]["pm2_5"]["value"]
    return (
        f"*{loc.name}* · {snap.get('observed_local', '')[11:16]} local\n"
        f"Estimated NAQI *{snap['aqi'].get('value')}* ({cat.get('label', 'n/a')}), PM2.5 {pm} µg/m³.\n"
        f"{cat.get('health', '')}\n_Source: {snap['sources']['air']['name']} (model estimate)._"
    )


# ----------------------------------------------------------------------------- group messages


async def handle_update(update: dict[str, Any]) -> None:
    _status["last_update_at"] = utc_now_iso()
    msg = update.get("message")
    if not msg or "text" not in msg:
        return
    chat = msg["chat"]
    text: str = msg["text"]
    is_group = chat.get("type") in ("group", "supergroup")
    if text.startswith("/"):
        cmd, _, arg = text.partition(" ")
        await _handle_command(cmd.split("@")[0].lower(), arg.strip(), msg, chat["id"], is_group)
    elif is_group:  # private chats only use commands
        await _handle_group_message(chat["id"], text)


async def _deliver_advisory(group: dict[str, Any], chat_id: int, result: dict[str, Any]) -> str:
    """Post the advisory now when the group allows automatic replies and is out of cooldown.

    Returns the advisory status stored with the event: none, pending (awaiting admin approval) or sent.
    """
    if not result["respond"]:
        return "none"
    if group.get("reply_mode") != "auto":
        return "pending"
    last = group.get("last_reply_at")
    if last and datetime.fromisoformat(last) >= utc_now() - GROUP_REPLY_COOLDOWN:
        return "pending"
    await send_message(chat_id, result["advisory"])
    await get_store().update("tg_groups", str(chat_id), {"last_reply_at": utc_now_iso()})
    return "sent"


def _event_doc(
    fingerprint: str, chat_id: int, group: dict[str, Any], result: dict[str, Any], advisory_status: str
) -> dict[str, Any]:
    """Only structured fields extracted from the message are stored, never its text."""
    ev = result["event"]
    return {
        "id": fingerprint,
        "source": "telegram",
        "group_id": str(chat_id),
        "group_title": group.get("title"),
        "kind": ev["kind"],
        **{field: ev.get(field) for field in STORED_EVENT_FIELDS},
        "risk": result["risk"],
        "advisory": {"status": advisory_status, "text": result["advisory"]},
        "retention_days": get_settings().event_retention_days,
        "is_demo": False,
    }


async def _handle_group_message(chat_id: int, text: str) -> None:
    store = get_store()
    group = await store.get("tg_groups", str(chat_id))
    if not group or not group.get("authorized"):
        return  # not opted in: discard without processing
    loc = Location(**group["location"]) if group.get("location") else _default_location()
    bundle = await ambient.get_bundle(loc)
    community = await store.get("communities", group["community_id"]) if group.get("community_id") else None
    audience = "school" if (community or {}).get("type") == "school" else "general"
    result = await cp.process_message(text, bundle["series"], audience=audience)
    if not result["relevant"] or result["event"]["kind"] not in ("activity", "concern"):
        return
    ev = result["event"]
    kind_detail = ev.get("activity_type") or ev.get("concern_type")
    fingerprint = stable_id(
        chat_id, ev.get("kind"), kind_detail, ev.get("date"), ev.get("time"), length=FINGERPRINT_LENGTH
    )
    if await store.get("community_events", fingerprint):
        return  # already captured this event
    advisory_status = await _deliver_advisory(group, chat_id, result)
    if group.get("community_id"):
        await cs.add_event(group["community_id"], _event_doc(fingerprint, chat_id, group, result, advisory_status))


# ----------------------------------------------------------------------------- commands


@dataclass(frozen=True)
class CommandRequest:
    arg: str
    msg: dict[str, Any]
    chat_id: int
    is_group: bool

    @property
    def from_user(self) -> dict[str, Any]:
        user: dict[str, Any] = self.msg.get("from") or {}
        return user


CommandHandler = Callable[[CommandRequest], Awaitable[None]]
GroupCommandHandler = Callable[[CommandRequest, dict[str, Any]], Awaitable[None]]

HELP_TEXT = (
    "*AIRenv*\n/air – current air quality\n/optin – (group admins) enable event "
    "advisories\n/optout – disable\n/setlocation <place> – set location\n"
    "/privacy – what we process"
)
PRIVACY_TEXT = (
    "*Privacy*\nAIRenv ignores all messages in groups that have not opted in. In "
    "opted-in groups it scans messages for planned activities or open-burning "
    "discussions, keeps only the extracted fields (activity type, date, time), and "
    "never stores message text, names or phone numbers. Extracted events are deleted "
    "after 30 days. A group admin can /optout at any time."
)


async def _cmd_start(req: CommandRequest) -> None:
    if not req.arg:
        await send_message(
            req.chat_id,
            "👋 AIRenv monitors air quality and sends timely, practical advice.\n"
            "Send /air for current conditions or /help to learn more.",
        )
        return
    store = get_store()
    link = await store.get("tg_link_codes", req.arg)
    if not link or link["expires_at"] <= utc_now_iso():
        await send_message(req.chat_id, "This link code is invalid or expired. Generate a new one in AIRenv Settings.")
        return
    telegram = {"chat_id": req.chat_id, "linked_at": utc_now_iso(), "username": req.from_user.get("username")}
    await store.update("users", link["uid"], {"telegram": telegram})
    await store.delete("tg_link_codes", req.arg)
    await send_message(
        req.chat_id,
        "✅ Your AIRenv account is linked. You will receive alerts here based on "
        "your notification preferences. Send /air for current conditions.",
    )


async def _cmd_help(req: CommandRequest) -> None:
    await send_message(req.chat_id, HELP_TEXT)


async def _cmd_privacy(req: CommandRequest) -> None:
    await send_message(req.chat_id, PRIVACY_TEXT)


async def _cmd_air(req: CommandRequest) -> None:
    group = await get_store().get("tg_groups", str(req.chat_id)) if req.is_group else None
    loc = Location(**group["location"]) if group and group.get("location") else _default_location()
    try:
        await send_message(req.chat_id, await _air_summary(loc))
    except Exception:
        await send_message(req.chat_id, "Live air-quality data is unavailable right now. Please try again later.")


def _group_admin_only(handler: GroupCommandHandler) -> CommandHandler:
    """Run a group-settings command only in groups and only for Telegram group administrators."""

    async def run(req: CommandRequest) -> None:
        if not req.is_group:
            await send_message(req.chat_id, "This command works in groups.")
            return
        if not await _is_group_admin(req.chat_id, req.from_user.get("id", 0)):
            await send_message(req.chat_id, "Only group administrators can change AIRenv settings.")
            return
        group = await get_store().get("tg_groups", str(req.chat_id)) or {
            "chat_id": str(req.chat_id),
            "title": req.msg["chat"].get("title"),
            "community_id": None,
            "reply_mode": "approval",
            "location": None,
            "is_demo": False,
        }
        await handler(req, group)

    return run


async def _cmd_optin(req: CommandRequest, group: dict[str, Any]) -> None:
    code = new_token(4)
    group.update({"authorized": True, "opted_in_at": utc_now_iso(), "connect_code": code})
    await get_store().set("tg_groups", str(req.chat_id), group)
    await send_message(
        req.chat_id,
        "✅ Conversation intelligence enabled for this group. AIRenv will only "
        "extract planned activities and burning concerns, and will reply only when "
        "air quality warrants it. Advisories are reviewed by a community admin "
        f"before posting.\nTo connect this group to a community in AIRenv, use code "
        f"`{code}` on the Community page. /optout to disable.",
    )


async def _cmd_optout(req: CommandRequest, group: dict[str, Any]) -> None:
    store = get_store()
    group.update({"authorized": False, "connect_code": None})
    await store.set("tg_groups", str(req.chat_id), group)
    for ev in await store.query("community_events", [("group_id", "==", str(req.chat_id))]):
        await store.delete("community_events", ev["id"])
    await send_message(
        req.chat_id, "Conversation intelligence disabled. Events extracted from this group have been deleted."
    )


async def _cmd_setlocation(req: CommandRequest, group: dict[str, Any]) -> None:
    if not req.arg:
        await send_message(req.chat_id, "Usage: /setlocation <city or area>")
        return
    results = await search(req.arg, count=1)
    if not results:
        await send_message(req.chat_id, f"Could not find '{req.arg[:40]}'.")
        return
    group["location"] = results[0].model_dump()
    await get_store().set("tg_groups", str(req.chat_id), group)
    await send_message(req.chat_id, f"📍 Location set to {results[0].name}, {results[0].admin1 or ''}.")


COMMANDS: dict[str, CommandHandler] = {
    "/start": _cmd_start,
    "/help": _cmd_help,
    "/privacy": _cmd_privacy,
    "/air": _cmd_air,
    "/optin": _group_admin_only(_cmd_optin),
    "/optout": _group_admin_only(_cmd_optout),
    "/setlocation": _group_admin_only(_cmd_setlocation),
}


async def _handle_command(cmd: str, arg: str, msg: dict[str, Any], chat_id: int, is_group: bool) -> None:
    handler = COMMANDS.get(cmd)
    if handler:  # unknown commands are ignored
        await handler(CommandRequest(arg=arg, msg=msg, chat_id=chat_id, is_group=is_group))


async def create_link_code(uid: str) -> dict[str, Any]:
    code = new_token(6)
    expires = utc_now() + LINK_CODE_TTL
    await get_store().set("tg_link_codes", code, {"uid": uid, "expires_at": expires.isoformat()})
    username = (_bot_info or {}).get("username")
    return {
        "code": code,
        "expires_at": expires.isoformat(),
        "deep_link": f"https://t.me/{username}?start={code}" if username else None,
        "bot_username": username,
    }
