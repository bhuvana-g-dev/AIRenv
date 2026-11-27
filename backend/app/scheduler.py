"""Background processing: scheduled data refresh, risk detection, feed events, alerts and retention."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Any

from pydantic import ValidationError

from app.config import get_settings
from app.core.clock import utc_now
from app.core.events_bus import bus
from app.core.http import UpstreamError
from app.db.store import DocumentStore, get_store
from app.services import ambient_intelligence as ambient
from app.services import community_service as cs
from app.services import conversation_processor as cp
from app.services import historical_analytics as ha
from app.services import intelligence_feed as feed
from app.services import notification_service as ns
from app.services import risk_detection as rd
from app.services import telegram_integration as tg
from app.services.location_service import Location, make_location

log = logging.getLogger("airenv.scheduler")

PRUNE_EVERY = timedelta(hours=12)
NOTIFICATION_RETENTION = timedelta(days=60)
MIN_REFRESH_INTERVAL_MINUTES = 5
STARTUP_DELAY_SECONDS = 2

state: dict[str, Any] = {
    "last_run_at": None,
    "next_run_at": None,
    "last_duration_s": None,
    "locations": 0,
    "last_errors": [],
    "runs": 0,
}
_task: asyncio.Task[None] | None = None
_last_prune: datetime | None = None


async def tracked_locations() -> list[Location]:
    s = get_settings()
    locs: dict[str, Location] = {}
    d = make_location(
        s.default_location_name,
        s.default_lat,
        s.default_lon,
        timezone=s.default_timezone,
        country="India",
        admin1="Delhi",
    )
    locs[d.id] = d
    store = get_store()
    for coll in ("users", "communities", "tg_groups"):
        for doc in await store.query(coll):
            loc = doc.get("location")
            if loc and loc.get("id") and loc["id"] not in locs:
                try:
                    locs[loc["id"]] = Location(**loc)
                except (TypeError, ValidationError):
                    log.warning("Skipping invalid stored location in %s/%s", coll, doc.get("id"))
    return list(locs.values())


def _local_now(series: dict[str, Any]) -> datetime:
    return cp.local_now(series)


# ----------------------------------------------------------------------------- community events


async def _notify_admins(
    community: dict[str, Any], ev: dict[str, Any], risk: dict[str, Any], series: dict[str, Any]
) -> None:
    """Ask the community's admins to review a pending advisory."""
    store = get_store()
    signal = {
        "key": f"community:{ev['id']}:{risk.get('category')}",
        "category": "community",
        "severity": "high" if risk["level"] in ("high", "severe") else "medium",
        "title": f"{community['name']}: {ev.get('title')} may need changes",
        "message": f"{risk['summary']} {risk['action']} An advisory is waiting for your "
        "approval on the Community page.",
        "data": {"community_id": community["id"], "event_id": ev["id"]},
    }
    for uid in community.get("admin_uids", []):
        user = await store.get("users", uid)
        if user:
            await ns.dispatch(user, signal, _local_now(series), tg.send_message)


async def _reassess_event(
    store: DocumentStore, loc: Location, community: dict[str, Any], ev: dict[str, Any], series: dict[str, Any]
) -> None:
    """Refresh an activity's risk against the new forecast; open an advisory the first time it is warranted."""
    audience = "school" if community.get("type") == "school" else "general"
    risk = cp.assess_event(ev, series, audience)
    patch: dict[str, Any] = {"risk": risk}
    if risk.get("respond") and (ev.get("advisory") or {}).get("status") in (None, "none"):
        patch["advisory"] = {"status": "pending", "text": cp.advisory_text(ev, risk)}
        await feed.publish(
            loc.id,
            {
                "type": "event_risk",
                "severity": "medium",
                "title": f"Community event risk detected: {ev.get('title')}",
                "detail": risk["summary"],
                "dedup": f"evrisk:{ev['id']}:{risk.get('category')}",
                "data": {"community_id": community["id"], "event_id": ev["id"]},
            },
        )
        await _notify_admins(community, ev, risk, series)
    await store.update("community_events", ev["id"], patch)


async def _assess_community_events(loc: Location, bundle: dict[str, Any]) -> None:
    store = get_store()
    for c in await store.query("communities", [("location.id", "==", loc.id)]):
        for ev in await cs.events_for(c["id"]):
            decided = (ev.get("advisory") or {}).get("status") in ("sent", "dismissed")
            if ev.get("kind") == "activity" and not decided:
                await _reassess_event(store, loc, c, ev, bundle["series"])


# ----------------------------------------------------------------------------- refresh


async def _report_outage(loc: Location, prev: dict[str, Any], snap: dict[str, Any]) -> None:
    """Note in the feed (once per outage) that live data is down and the last reading is shown."""
    if prev.get("errors"):
        return
    errors = snap.get("errors", [])
    await feed.publish(
        loc.id,
        {
            "type": "source_unavailable",
            "severity": "low",
            "title": "Live data temporarily unavailable",
            "detail": "Showing the last stored reading. " + "; ".join(e["message"] for e in errors),
            "dedup": f"down:{loc.id}:{utc_now():%Y%m%d%H}",
        },
    )
    await get_store().update("latest_snapshots", loc.id, {"errors": errors})


async def _publish_snapshot(loc: Location, prev: dict[str, Any] | None, snap: dict[str, Any]) -> None:
    await ha.record_snapshot(snap)
    for ev in rd.feed_events(prev, snap):
        await feed.publish(loc.id, ev)
    await get_store().set("latest_snapshots", loc.id, snap)
    bus.publish(
        f"location:{loc.id}",
        "snapshot.updated",
        {
            "location_id": loc.id,
            "observed_at": snap["observed_at"],
            "aqi": snap["aqi"].get("value"),
            "fetched_at": snap["fetched_at"],
        },
    )


async def _alert_users(loc: Location, snap: dict[str, Any], series: dict[str, Any]) -> None:
    users = await get_store().query("users", [("location.id", "==", loc.id)])
    local_now = _local_now(series)
    for user in users:
        for sig in rd.detect(snap, series, user):
            await ns.dispatch(user, sig, local_now, tg.send_message)


async def refresh_location(loc: Location) -> dict[str, Any]:
    prev = await get_store().get("latest_snapshots", loc.id)
    bundle = await ambient.get_bundle(loc, force=True)
    snap, series = bundle["snapshot"], bundle["series"]
    if snap["status"] == "stale" and prev:
        await _report_outage(loc, prev, snap)
        return snap
    await _publish_snapshot(loc, prev, snap)
    await _alert_users(loc, snap, series)
    await _assess_community_events(loc, bundle)
    return snap


async def run_once() -> dict[str, Any]:
    global _last_prune
    started = utc_now()
    errors: list[str] = []
    locs = await tracked_locations()
    for loc in locs:
        try:
            await refresh_location(loc)
        except UpstreamError as exc:
            errors.append(f"{loc.name}: {exc}")
        except Exception as exc:  # keep the scheduler alive
            log.exception("Refresh failed for %s", loc.name)
            errors.append(f"{loc.name}: {exc}")
    if _last_prune is None or started - _last_prune > PRUNE_EVERY:
        await prune()
        _last_prune = started
    state.update(
        {
            "last_run_at": started.isoformat(),
            "locations": len(locs),
            "last_errors": errors,
            "last_duration_s": round((utc_now() - started).total_seconds(), 2),
            "runs": state["runs"] + 1,
        }
    )
    return state


async def _delete_older_than(store: DocumentStore, collection: str, field: str, cutoff: str) -> None:
    for doc in await store.query(collection, [(field, "<", cutoff)]):
        await store.delete(collection, doc["id"])


async def prune() -> None:
    s = get_settings()
    store = get_store()
    now = utc_now().isoformat()
    try:
        await ha.prune(s.snapshot_retention_days)
        await _delete_older_than(store, "community_events", "expires_at", now)
        await _delete_older_than(store, "tg_link_codes", "expires_at", now)
        await _delete_older_than(store, "notifications", "created_at", (utc_now() - NOTIFICATION_RETENTION).isoformat())
    except Exception as exc:
        log.error("Retention cleanup failed: %s", exc)


async def _loop() -> None:
    interval = max(MIN_REFRESH_INTERVAL_MINUTES, get_settings().refresh_interval_minutes) * 60
    await asyncio.sleep(STARTUP_DELAY_SECONDS)
    while True:
        try:
            await run_once()
        except Exception:
            log.exception("Scheduler run failed")
        state["next_run_at"] = (utc_now() + timedelta(seconds=interval)).isoformat()
        await asyncio.sleep(interval)


def start() -> None:
    global _task
    if get_settings().scheduler_enabled and _task is None:
        _task = asyncio.create_task(_loop())


async def stop() -> None:
    global _task
    if _task:
        _task.cancel()
        _task = None
