"""Live intelligence feed: persisted, deduplicated application events pushed over SSE."""
from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Any

from app.core.events_bus import bus
from app.db.store import get_store


async def publish(location_id: str, event: dict[str, Any]) -> dict[str, Any] | None:
    """Store an event unless an identical one (same dedup key) already exists."""
    dedup = event.get("dedup") or f"{event['type']}:{event['title']}"
    doc_id = hashlib.sha1(f"{location_id}|{dedup}".encode()).hexdigest()[:20]
    store = get_store()
    if await store.get("feed", doc_id):
        return None
    doc = {
        "location_id": location_id,
        "type": event["type"],
        "severity": event.get("severity", "info"),
        "title": event["title"],
        "detail": event.get("detail"),
        "data": event.get("data"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await store.set("feed", doc_id, doc)
    doc["id"] = doc_id
    bus.publish(f"location:{location_id}", "feed.created", doc)
    return doc


async def list_feed(location_id: str, limit: int = 30) -> list[dict[str, Any]]:
    rows = await get_store().query("feed", [("location_id", "==", location_id)])
    rows.sort(key=lambda r: r["created_at"], reverse=True)
    return rows[:limit]
