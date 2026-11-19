"""Notification centre: priority, deduplication, cooldowns, preferences and delivery."""
from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from app.core.events_bus import bus
from app.db.store import get_store
from app.services.risk_detection import SEVERITY_ORDER

log = logging.getLogger("airenv.notify")

COOLDOWN_MINUTES = {"critical": 120, "deterioration": 180, "forecast": 360, "community": 60,
                    "recommendation": 720, "positive": 360}
DEDUP_HOURS = 12


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


async def evaluate(user: dict[str, Any], signal: dict[str, Any], local_now: datetime,
                   now: datetime | None = None) -> tuple[bool, str]:
    """Decide whether a signal should become a notification for this user. Returns (send, reason)."""
    now = now or datetime.now(timezone.utc)
    prefs = user.get("notification_prefs") or {}
    category, severity = signal["category"], signal["severity"]
    if not (prefs.get("categories") or {}).get(category, True):
        return False, "category disabled"
    if SEVERITY_ORDER[severity] < SEVERITY_ORDER.get(prefs.get("min_severity", "medium"), 2) \
            and category != "positive":
        return False, "below minimum severity"
    if category == "positive" and not (prefs.get("categories") or {}).get("positive", True):
        return False, "positive disabled"
    store = get_store()
    uid = user["uid"]
    dedup_id = hashlib.sha1(f"{uid}|{signal['key']}".encode()).hexdigest()[:20]
    existing = await store.get("notifications", dedup_id)
    if existing and existing["created_at"] > (now - timedelta(hours=DEDUP_HOURS)).isoformat():
        return False, "duplicate"
    recent = await store.query("notifications", [("uid", "==", uid), ("category", "==", category)])
    recent.sort(key=lambda n: n["created_at"], reverse=True)
    if recent:
        last = recent[0]
        cooldown = timedelta(minutes=COOLDOWN_MINUTES.get(category, 180))
        escalation = SEVERITY_ORDER[severity] > SEVERITY_ORDER.get(last["severity"], 0)
        if last["created_at"] > (now - cooldown).isoformat() and not escalation:
            return False, "cooldown"
    if severity != "critical" and in_quiet_hours(prefs, local_now):
        return False, "quiet hours"
    today = (now - timedelta(hours=24)).isoformat()
    if severity != "critical":
        all_recent = await store.query("notifications", [("uid", "==", uid), ("created_at", ">=", today)])
        if len([n for n in all_recent if n["severity"] != "critical"]) >= int(prefs.get("daily_limit", 6)):
            return False, "daily limit"
    return True, "ok"


async def dispatch(user: dict[str, Any], signal: dict[str, Any], local_now: datetime,
                   telegram_sender: Any = None) -> dict[str, Any] | None:
    ok, reason = await evaluate(user, signal, local_now)
    if not ok:
        log.debug("Suppressed %s for %s: %s", signal["key"], user["uid"], reason)
        return None
    uid = user["uid"]
    doc_id = hashlib.sha1(f"{uid}|{signal['key']}".encode()).hexdigest()[:20]
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
        "created_at": datetime.now(timezone.utc).isoformat(),
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
