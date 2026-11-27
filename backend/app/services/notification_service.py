"""Notification centre: priority, deduplication, cooldowns, preferences and delivery."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any

from app.core.clock import utc_now, utc_now_iso
from app.core.events_bus import bus
from app.core.ids import stable_id
from app.db.store import get_store
from app.services.risk_detection import SEVERITY_ORDER

log = logging.getLogger("airenv.notify")

COOLDOWN_MINUTES = {
    "critical": 120,
    "deterioration": 180,
    "forecast": 360,
    "community": 60,
    "recommendation": 720,
    "positive": 360,
}
DEFAULT_COOLDOWN_MINUTES = 180
DEDUP_HOURS = 12
DAILY_LIMIT_WINDOW = timedelta(hours=24)
DEFAULT_DAILY_LIMIT = 6


def _parse_hhmm(v: str) -> int:
    h, m = v.split(":")
    return int(h) * 60 + int(m)


def in_quiet_hours(prefs: dict[str, Any], local_now: datetime) -> bool:
    q = prefs.get("quiet_hours") or {}
    if not q.get("enabled"):
        return False
    start, end = _parse_hhmm(q.get("start", "22:00")), _parse_hhmm(q.get("end", "07:00"))
    cur = local_now.hour * 60 + local_now.minute
    return (start <= cur or cur < end) if start > end else (start <= cur < end)


def _preference_block(prefs: dict[str, Any], signal: dict[str, Any]) -> str | None:
    """Reason the user's category and severity preferences suppress this signal, if any."""
    categories = prefs.get("categories") or {}
    category, severity = signal["category"], signal["severity"]
    if not categories.get(category, True):
        return "category disabled"
    min_rank = SEVERITY_ORDER.get(prefs.get("min_severity", "medium"), SEVERITY_ORDER["medium"])
    if SEVERITY_ORDER[severity] < min_rank and category != "positive":
        return "below minimum severity"
    if category == "positive" and not categories.get("positive", True):
        return "positive disabled"
    return None


async def _history_block(uid: str, signal: dict[str, Any], now: datetime) -> str | None:
    """Duplicate of a recent notification, or the same category is still cooling down (unless escalating)."""
    store = get_store()
    existing = await store.get("notifications", stable_id(uid, signal["key"]))
    if existing and existing["created_at"] > (now - timedelta(hours=DEDUP_HOURS)).isoformat():
        return "duplicate"
    recent = await store.query("notifications", [("uid", "==", uid), ("category", "==", signal["category"])])
    if not recent:
        return None
    last = max(recent, key=lambda n: n["created_at"])
    cooldown = timedelta(minutes=COOLDOWN_MINUTES.get(signal["category"], DEFAULT_COOLDOWN_MINUTES))
    escalation = SEVERITY_ORDER[signal["severity"]] > SEVERITY_ORDER.get(last["severity"], 0)
    if last["created_at"] > (now - cooldown).isoformat() and not escalation:
        return "cooldown"
    return None


async def _daily_limit_block(uid: str, prefs: dict[str, Any], now: datetime) -> str | None:
    since = (now - DAILY_LIMIT_WINDOW).isoformat()
    all_recent = await get_store().query("notifications", [("uid", "==", uid), ("created_at", ">=", since)])
    non_critical = [n for n in all_recent if n["severity"] != "critical"]
    return "daily limit" if len(non_critical) >= int(prefs.get("daily_limit", DEFAULT_DAILY_LIMIT)) else None


async def evaluate(
    user: dict[str, Any], signal: dict[str, Any], local_now: datetime, now: datetime | None = None
) -> tuple[bool, str]:
    """Decide whether a signal should become a notification for this user. Returns (send, reason).

    Critical signals bypass quiet hours and the daily limit, never deduplication or preferences.
    """
    now = now or utc_now()
    prefs = user.get("notification_prefs") or {}
    critical = signal["severity"] == "critical"
    reason = _preference_block(prefs, signal) or await _history_block(user["uid"], signal, now)
    if not reason and not critical and in_quiet_hours(prefs, local_now):
        reason = "quiet hours"
    if not reason and not critical:
        reason = await _daily_limit_block(user["uid"], prefs, now)
    return (False, reason) if reason else (True, "ok")


async def dispatch(
    user: dict[str, Any], signal: dict[str, Any], local_now: datetime, telegram_sender: Any = None
) -> dict[str, Any] | None:
    ok, reason = await evaluate(user, signal, local_now)
    if not ok:
        log.debug("Suppressed %s for %s: %s", signal["key"], user["uid"], reason)
        return None
    uid = user["uid"]
    doc_id = stable_id(uid, signal["key"])
    prefs = user.get("notification_prefs") or {}
    doc = {
        "uid": uid,
        "key": signal["key"],
        "category": signal["category"],
        "severity": signal["severity"],
        "priority": SEVERITY_ORDER[signal["severity"]],
        "title": signal["title"],
        "message": signal["message"],
        "data": signal.get("data"),
        "location_id": (user.get("location") or {}).get("id"),
        "created_at": utc_now_iso(),
        "read": False,
        "delivery": {"in_app": bool(prefs.get("in_app", True)), "telegram": "not_requested"},
    }
    tg = user.get("telegram") or {}
    if prefs.get("telegram") and tg.get("chat_id") and telegram_sender:
        try:
            await telegram_sender(tg["chat_id"], f"*{signal['title']}*\n{signal['message']}")
            doc["delivery"]["telegram"] = "sent"
        except Exception as exc:
            log.warning("Telegram delivery failed: %s", exc)
            doc["delivery"]["telegram"] = "failed"
    elif prefs.get("telegram") and not tg.get("chat_id"):
        doc["delivery"]["telegram"] = "not_linked"
    await get_store().set("notifications", doc_id, doc)
    doc["id"] = doc_id
    bus.publish(f"user:{uid}", "notification.created", doc)
    return doc


async def list_for(uid: str, limit: int = 100) -> list[dict[str, Any]]:
    rows = await get_store().query("notifications", [("uid", "==", uid)])
    # Unread first, then by priority, newest first within each group (stable sorts).
    rows.sort(key=lambda n: n["created_at"], reverse=True)
    rows.sort(key=lambda n: (n.get("read", False), -n.get("priority", 0)))
    return rows[:limit]
