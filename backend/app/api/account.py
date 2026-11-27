"""Profile, notifications, Telegram account linking and the live event stream."""

from __future__ import annotations

import asyncio
import secrets
import time
from collections.abc import AsyncIterator
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator

from app.config import get_settings
from app.core.clock import utc_now, utc_now_iso
from app.core.events_bus import bus
from app.core.security import CurrentUser, get_current_user, new_token
from app.db.store import get_store
from app.services import notification_service as ns
from app.services import telegram_integration as tg
from app.services.location_service import LOCATION_ID_PATTERN, Location

router = APIRouter(prefix="/api", tags=["account"])
NOTIFICATION_CATEGORIES = ("critical", "deterioration", "forecast", "community", "recommendation", "positive")


# ----------------------------------------------------------------------------- profile


class FamilyContext(BaseModel):
    children: bool = False
    older_adults: bool = False
    respiratory_or_heart_condition: bool = False
    outdoor_workers: bool = False
    pregnancy: bool = False


class QuietHours(BaseModel):
    enabled: bool = True
    start: str = Field("22:00", pattern=r"^\d{2}:\d{2}$")
    end: str = Field("07:00", pattern=r"^\d{2}:\d{2}$")


class NotificationPrefs(BaseModel):
    in_app: bool = True
    telegram: bool = False
    min_severity: str = Field("medium", pattern="^(info|low|medium|high|critical)$")
    quiet_hours: QuietHours = QuietHours()
    categories: dict[str, bool]
    daily_limit: int = Field(6, ge=1, le=20)

    @field_validator("categories")
    @classmethod
    def known_categories(cls, v: dict[str, bool]) -> dict[str, bool]:
        unknown = sorted(set(v) - set(NOTIFICATION_CATEGORIES))
        if unknown:
            raise ValueError(f"Unknown notification categories: {', '.join(unknown)}")
        return v


class Privacy(BaseModel):
    conversation_intelligence: bool = False
    store_extracted_events: bool = True
    share_aggregate_participation: bool = True
    event_retention_days: int = Field(30, ge=1, le=90)


class DataSources(BaseModel):
    open_meteo: bool = True
    cpcb: bool = True
    openaq: bool = True
    sensor_community: bool = True


class ProfilePatch(BaseModel):
    display_name: str | None = Field(None, max_length=60)
    location: Location | None = None
    community_type: str | None = Field(None, pattern="^(household|school|apartment|rwa|community_org|workplace)$")
    family_context: FamilyContext | None = None
    notification_prefs: NotificationPrefs | None = None
    language: str | None = Field(None, pattern="^(en|hi|ta|bn|mr|te|kn|pa)$")
    privacy: Privacy | None = None
    data_sources: DataSources | None = None
    onboarded: bool | None = None


@router.get("/me")
async def me(user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    profile = await get_store().get("users", user.uid) or {}
    return {**profile, "role": user.role, "auth_mode": user.auth_mode}


@router.patch("/me")
async def update_me(patch: ProfilePatch, user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    data = patch.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(400, "Nothing to update")
    updated = await get_store().update("users", user.uid, data)
    return {**(updated or {}), "role": user.role, "auth_mode": user.auth_mode}


@router.get("/me/export")
async def export_me(user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    store = get_store()
    return {
        "profile": await store.get("users", user.uid),
        "notifications": await store.query("notifications", [("uid", "==", user.uid)]),
        "exported_at": utc_now_iso(),
    }


@router.delete("/me/data")
async def delete_my_data(user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    store = get_store()
    n = 0
    for doc in await store.query("notifications", [("uid", "==", user.uid)]):
        await store.delete("notifications", doc["id"])
        n += 1
    for code in await store.query("tg_link_codes", [("uid", "==", user.uid)]):
        await store.delete("tg_link_codes", code["id"])
    await store.delete("users", user.uid)
    return {"deleted_notifications": n, "profile_deleted": True}


# ----------------------------------------------------------------------------- notifications


async def _own_notification(nid: str, uid: str) -> dict[str, Any]:
    n = await get_store().get("notifications", nid)
    if not n or n["uid"] != uid:
        raise HTTPException(404, "Notification not found")
    return n


@router.get("/notifications")
async def notifications(user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    rows = await ns.list_for(user.uid)
    return {"items": rows, "unread": sum(1 for r in rows if not r.get("read"))}


@router.post("/notifications/{nid}/read")
async def mark_read(nid: str, user: CurrentUser = Depends(get_current_user)) -> dict[str, Any] | None:
    await _own_notification(nid, user.uid)
    return await get_store().update("notifications", nid, {"read": True})


@router.post("/notifications/read-all")
async def mark_all_read(user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    store = get_store()
    rows = await store.query("notifications", [("uid", "==", user.uid), ("read", "==", False)])
    for r in rows:
        await store.update("notifications", r["id"], {"read": True})
    return {"updated": len(rows)}


@router.delete("/notifications/{nid}")
async def delete_notification(nid: str, user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    await _own_notification(nid, user.uid)
    await get_store().delete("notifications", nid)
    return {"ok": True}


@router.post("/notifications/test")
async def test_notification(user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    """Deliver a test message through the user's enabled channels (bypasses severity filters, not dedup)."""
    profile = await get_store().get("users", user.uid)
    if not profile:
        raise HTTPException(404, "Profile not found")
    minute = utc_now().strftime("%Y%m%d%H%M")
    signal = {
        "key": f"test:{minute}",
        "category": "recommendation",
        "severity": "critical",
        "title": "Test notification",
        "message": "Delivery check from AIRenv settings. No action needed.",
    }
    prefs = {**(profile.get("notification_prefs") or {}), "min_severity": "info", "quiet_hours": {"enabled": False}}
    prefs["categories"] = {**(prefs.get("categories") or {}), "recommendation": True}
    doc = await ns.dispatch(
        {**profile, "notification_prefs": prefs},
        signal,
        datetime.now(),  # local wall time; irrelevant because quiet hours are disabled above
        tg.send_message if get_settings().telegram_enabled else None,
    )
    if doc is None:
        raise HTTPException(429, "A test was sent less than a minute ago")
    return doc


# ----------------------------------------------------------------------------- telegram


@router.get("/telegram/status")
async def telegram_status() -> dict[str, Any]:
    return tg.status()


@router.post("/telegram/link-code")
async def telegram_link_code(user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    if not get_settings().telegram_bot_token:
        raise HTTPException(503, "Telegram is not configured on the server (TELEGRAM_BOT_TOKEN).")
    return await tg.create_link_code(user.uid)


@router.delete("/telegram/link")
async def telegram_unlink(user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    await get_store().update("users", user.uid, {"telegram": None})
    return {"ok": True}


@router.post("/telegram/webhook")
async def telegram_webhook(
    request: Request, x_telegram_bot_api_secret_token: str | None = Header(default=None)
) -> dict[str, Any]:
    s = get_settings()
    expected = s.telegram_webhook_secret or ""
    supplied = x_telegram_bot_api_secret_token or ""
    if not expected or not secrets.compare_digest(supplied.encode(), expected.encode()):
        raise HTTPException(401, "Invalid webhook secret")
    try:
        update = await request.json()
    except ValueError as exc:
        raise HTTPException(400, "Invalid JSON") from exc
    if not isinstance(update, dict):
        raise HTTPException(400, "Invalid update")
    task = asyncio.create_task(tg.handle_update(update))
    _background.add(task)  # keep a reference so the task is not garbage-collected mid-run
    task.add_done_callback(_background.discard)
    return {"ok": True}


# ----------------------------------------------------------------------------- live stream

TICKET_TTL_SECONDS = 60
MAX_OPEN_TICKETS = 5000
KEEP_ALIVE_SECONDS = 20
_tickets: dict[str, tuple[float, str]] = {}
_background: set[asyncio.Task[None]] = set()


@router.post("/stream/ticket")
async def stream_ticket(user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    """EventSource cannot send auth headers, so clients exchange their token for a short-lived ticket."""
    now = time.time()
    for k in [k for k, (exp, _) in _tickets.items() if exp < now]:
        _tickets.pop(k, None)
    if len(_tickets) >= MAX_OPEN_TICKETS:
        raise HTTPException(503, "Too many pending stream tickets. Try again shortly.")
    ticket = new_token(18)
    _tickets[ticket] = (now + TICKET_TTL_SECONDS, user.uid)
    return {"ticket": ticket, "expires_in": TICKET_TTL_SECONDS}


@router.get("/stream")
async def stream(
    request: Request,
    location_id: str = Query(pattern=LOCATION_ID_PATTERN, max_length=24),
    ticket: str | None = Query(None, max_length=64),
) -> StreamingResponse:
    topics = [f"location:{location_id}"]
    if ticket:
        entry = _tickets.pop(ticket, None)
        if entry and entry[0] >= time.time():
            topics.append(f"user:{entry[1]}")
    queue = bus.subscribe(topics)

    async def gen() -> AsyncIterator[str]:
        try:
            yield f'event: ready\ndata: {{"topics": {len(topics)}}}\n\n'
            while True:
                if await request.is_disconnected():
                    break
                try:
                    msg = await asyncio.wait_for(queue.get(), timeout=KEEP_ALIVE_SECONDS)
                    yield msg
                except TimeoutError:
                    yield ": keep-alive\n\n"
        finally:
            bus.unsubscribe(queue)

    return StreamingResponse(
        gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )
