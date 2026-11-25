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
import hashlib
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from app.config import get_settings
from app.core.http import client, describe_error
from app.core.security import new_token
from app.db.store import get_store
from app.services import ambient_intelligence as ambient
from app.services import community_service as cs
from app.services import conversation_processor as cp
from app.services.location_service import Location, make_location, search

log = logging.getLogger("airenv.telegram")
API = "https://api.telegram.org/bot{token}/{method}"
GROUP_REPLY_COOLDOWN = timedelta(minutes=30)

_bot_info: dict[str, Any] | None = None
_poll_task: asyncio.Task | None = None
_status: dict[str, Any] = {"mode": None, "connected": False, "error": None, "last_update_at": None}


async def call(method: str, payload: dict[str, Any] | None = None, request_timeout: float = 15) -> Any:
    token = get_settings().telegram_bot_token
    if not token:
        raise RuntimeError("Telegram is not configured (TELEGRAM_BOT_TOKEN)")
    try:
        resp = await client().post(API.format(token=token, method=method), json=payload or {},
                                   timeout=request_timeout)
        data = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        # The bot token is part of the URL; never surface the raw httpx message.
        raise RuntimeError(f"Telegram {method} failed: {describe_error(exc)}") from None
    if not data.get("ok"):
        raise RuntimeError(f"Telegram {method} failed: {data.get('description')}")
    return data["result"]


async def send_message(chat_id: int | str, text: str) -> None:
    await call("sendMessage", {"chat_id": chat_id, "text": text[:4000], "parse_mode": "Markdown",
                               "disable_web_page_preview": True})


def status() -> dict[str, Any]:
    s = get_settings()
    return {**_status, "configured": bool(s.telegram_bot_token), "bot_username": (_bot_info or {}).get("username"),
            "privacy_note": "Group privacy mode limits the bot to commands and replies unless disabled in BotFather. "
                            "Disable it only for groups that have opted in to Conversation Intelligence."}


async def start() -> None:
    global _bot_info, _poll_task
    s = get_settings()
    if not s.telegram_enabled:
        _status.update({"mode": "disabled", "connected": False})
        return
    try:
        _bot_info = await call("getMe")
        _status.update({"connected": True, "error": None})
    except Exception as exc:
        _status.update({"connected": False, "error": str(exc)})
        log.error("Telegram getMe failed: %s", exc)
        return
    commands = [
        {"command": "air", "description": "Current air quality for this chat's location"},
        {"command": "optin", "description": "Group admins: enable AIRenv conversation intelligence"},
        {"command": "optout", "description": "Disable conversation intelligence for this group"},
        {"command": "setlocation", "description": "Set the location, e.g. /setlocation Noida"},
        {"command": "privacy", "description": "What AIRenv processes and stores"},
        {"command": "help", "description": "How AIRenv works"},
    ]
    try:
        await call("setMyCommands", {"commands": commands})
    except Exception as exc:
        log.warning("setMyCommands failed: %s", exc)
    if s.telegram_mode == "webhook":
        url = f"{s.public_base_url.rstrip('/')}/api/telegram/webhook"
        await call("setWebhook", {"url": url, "secret_token": s.telegram_webhook_secret or "",
                                  "allowed_updates": ["message", "my_chat_member"]})
        _status["mode"] = "webhook"
    else:
        await call("deleteWebhook", {"drop_pending_updates": False})
        _status["mode"] = "polling"
        _poll_task = asyncio.create_task(_poll_loop())


async def stop() -> None:
    if _poll_task:
        _poll_task.cancel()


async def _poll_loop() -> None:
    offset = 0
    while True:
        try:
            updates = await call("getUpdates", {"offset": offset, "timeout": 25,
                                                "allowed_updates": ["message", "my_chat_member"]}, request_timeout=35)
            for upd in updates:
                offset = upd["update_id"] + 1
                try:
                    await handle_update(upd)
                except Exception as exc:
                    log.exception("Failed to handle Telegram update: %s", exc)
            _status.update({"connected": True, "error": None})
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            _status.update({"connected": False, "error": str(exc)})
            await asyncio.sleep(10)


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
    return (f"*{loc.name}* · {snap.get('observed_local', '')[11:16]} local\n"
            f"Estimated NAQI *{snap['aqi'].get('value')}* ({cat.get('label', 'n/a')}), PM2.5 {pm} µg/m³.\n"
            f"{cat.get('health', '')}\n_Source: {snap['sources']['air']['name']} (model estimate)._")


async def handle_update(update: dict[str, Any]) -> None:
    _status["last_update_at"] = datetime.now(UTC).isoformat()
    msg = update.get("message")
    if not msg or "text" not in msg:
        return
    chat = msg["chat"]
    chat_id = chat["id"]
    text: str = msg["text"]
    is_group = chat.get("type") in ("group", "supergroup")
    store = get_store()

    if text.startswith("/"):
        cmd, _, arg = text.partition(" ")
        cmd = cmd.split("@")[0].lower()
        await _handle_command(cmd, arg.strip(), msg, chat_id, is_group)
        return

    if not is_group:
        return  # private chats only use commands
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
    fingerprint = hashlib.sha1(f"{chat_id}|{ev.get('kind')}|{ev.get('activity_type') or ev.get('concern_type')}|"
                               f"{ev.get('date')}|{ev.get('time')}".encode(), usedforsecurity=False).hexdigest()[:16]
    if await store.get("community_events", fingerprint):
        return  # already captured this event
    advisory_status = "none"
    if result["respond"]:
        advisory_status = "pending"
        if group.get("reply_mode") == "auto":
            last = group.get("last_reply_at")
            if not last or datetime.fromisoformat(last) < datetime.now(UTC) - GROUP_REPLY_COOLDOWN:
                await send_message(chat_id, result["advisory"])
                await store.update("tg_groups", str(chat_id), {"last_reply_at": datetime.now(UTC).isoformat()})
                advisory_status = "sent"
    if group.get("community_id"):
        retention = get_settings().event_retention_days
        await cs.add_event(group["community_id"], {
            "id": fingerprint, "source": "telegram", "group_id": str(chat_id), "group_title": group.get("title"),
            "kind": ev["kind"], "title": ev.get("title"), "activity_type": ev.get("activity_type"),
            "concern_type": ev.get("concern_type"), "intensity": ev.get("intensity"), "outdoor": ev.get("outdoor"),
            "date": ev.get("date"), "time": ev.get("time"), "time_precision": ev.get("time_precision"),
            "duration_hours": ev.get("duration_hours"), "risk": result["risk"],
            "advisory": {"status": advisory_status, "text": result["advisory"]},
            "retention_days": retention, "is_demo": False,
        })


async def _handle_command(cmd: str, arg: str, msg: dict[str, Any], chat_id: int, is_group: bool) -> None:
    store = get_store()
    from_user = msg.get("from") or {}
    if cmd == "/start":
        if arg:
            link = await store.get("tg_link_codes", arg)
            if link and link["expires_at"] > datetime.now(UTC).isoformat():
                await store.update("users", link["uid"], {"telegram": {
                    "chat_id": chat_id, "linked_at": datetime.now(UTC).isoformat(),
                    "username": from_user.get("username")}})
                await store.delete("tg_link_codes", arg)
                await send_message(chat_id, "✅ Your AIRenv account is linked. You will receive alerts here based on "
                                            "your notification preferences. Send /air for current conditions.")
                return
            await send_message(chat_id, "This link code is invalid or expired. Generate a new one in AIRenv Settings.")
            return
        await send_message(chat_id, "👋 AIRenv monitors air quality and sends timely, practical advice.\n"
                                    "Send /air for current conditions or /help to learn more.")
    elif cmd == "/help":
        await send_message(chat_id, "*AIRenv*\n/air – current air quality\n/optin – (group admins) enable event "
                                    "advisories\n/optout – disable\n/setlocation <place> – set location\n"
                                    "/privacy – what we process")
    elif cmd == "/privacy":
        await send_message(chat_id, "*Privacy*\nAIRenv ignores all messages in groups that have not opted in. In "
                                    "opted-in groups it scans messages for planned activities or open-burning "
                                    "discussions, keeps only the extracted fields (activity type, date, time), and "
                                    "never stores message text, names or phone numbers. Extracted events are deleted "
                                    "after 30 days. A group admin can /optout at any time.")
    elif cmd == "/air":
        group = await store.get("tg_groups", str(chat_id)) if is_group else None
        loc = Location(**group["location"]) if group and group.get("location") else _default_location()
        try:
            await send_message(chat_id, await _air_summary(loc))
        except Exception:
            await send_message(chat_id, "Live air-quality data is unavailable right now. Please try again later.")
    elif cmd in ("/optin", "/optout", "/setlocation"):
        if not is_group:
            await send_message(chat_id, "This command works in groups.")
            return
        if not await _is_group_admin(chat_id, from_user.get("id", 0)):
            await send_message(chat_id, "Only group administrators can change AIRenv settings.")
            return
        existing = await store.get("tg_groups", str(chat_id)) or {
            "chat_id": str(chat_id), "title": msg["chat"].get("title"), "community_id": None,
            "reply_mode": "approval", "location": None, "is_demo": False}
        if cmd == "/optin":
            code = new_token(4)
            existing.update({"authorized": True, "opted_in_at": datetime.now(UTC).isoformat(),
                             "connect_code": code})
            await store.set("tg_groups", str(chat_id), existing)
            await send_message(chat_id, "✅ Conversation intelligence enabled for this group. AIRenv will only "
                                        "extract planned activities and burning concerns, and will reply only when "
                                        "air quality warrants it. Advisories are reviewed by a community admin "
                                        f"before posting.\nTo connect this group to a community in AIRenv, use code "
                                        f"`{code}` on the Community page. /optout to disable.")
        elif cmd == "/optout":
            existing.update({"authorized": False, "connect_code": None})
            await store.set("tg_groups", str(chat_id), existing)
            for ev in await store.query("community_events", [("group_id", "==", str(chat_id))]):
                await store.delete("community_events", ev["id"])
            await send_message(chat_id, "Conversation intelligence disabled. Events extracted from this group have "
                                        "been deleted.")
        else:
            if not arg:
                await send_message(chat_id, "Usage: /setlocation <city or area>")
                return
            results = await search(arg, count=1)
            if not results:
                await send_message(chat_id, f"Could not find '{arg[:40]}'.")
                return
            existing["location"] = results[0].model_dump()
            await store.set("tg_groups", str(chat_id), existing)
            await send_message(chat_id, f"📍 Location set to {results[0].name}, {results[0].admin1 or ''}.")


async def create_link_code(uid: str) -> dict[str, Any]:
    code = new_token(6)
    expires = datetime.now(UTC) + timedelta(minutes=15)
    await get_store().set("tg_link_codes", code, {"uid": uid, "expires_at": expires.isoformat()})
    username = (_bot_info or {}).get("username")
    return {"code": code, "expires_at": expires.isoformat(),
            "deep_link": f"https://t.me/{username}?start={code}" if username else None,
            "bot_username": username}
