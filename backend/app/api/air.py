"""Air-quality data, locations, stations and the intelligence feed."""

from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response

from app import scheduler
from app.api.deps import bundle_or_503, location_param, profile_of
from app.config import get_settings
from app.core.http import UpstreamError
from app.core.security import CurrentUser, get_current_user, get_optional_user
from app.services import ambient_intelligence as ambient
from app.services import environmental_data as env
from app.services import historical_analytics as ha
from app.services import intelligence_feed as feed
from app.services import location_service
from app.services.location_service import Location

router = APIRouter(prefix="/api", tags=["air"])
PLACE_NAMES_CACHE_CONTROL = "public, max-age=86400"  # place names do not change


@router.get("/locations/search")
async def search_locations(response: Response, q: str = Query(min_length=2, max_length=80)) -> dict[str, Any]:
    try:
        results = [loc.model_dump() for loc in await location_service.search(q)]
    except UpstreamError as exc:
        raise HTTPException(503, exc.message) from exc
    response.headers["Cache-Control"] = PLACE_NAMES_CACHE_CONTROL
    return {"results": results}


@router.get("/locations/reverse")
async def reverse_location(lat: float = Query(ge=-90, le=90), lon: float = Query(ge=-180, le=180)) -> dict[str, Any]:
    return (await location_service.reverse(lat, lon)).model_dump()


@router.get("/air/current")
async def current(loc: Location = Depends(location_param), demo: bool = False) -> dict[str, Any]:
    snapshot: dict[str, Any] = (await bundle_or_503(loc, allow_demo=demo))["snapshot"]
    return snapshot


@router.get("/air/bundle")
async def bundle(loc: Location = Depends(location_param), demo: bool = False) -> dict[str, Any]:
    b = await bundle_or_503(loc, allow_demo=demo)
    return {"snapshot": b["snapshot"], "series": b["series"]}


@router.get("/air/history")
async def history(loc: Location = Depends(location_param), demo: bool = False) -> dict[str, Any]:
    b = await bundle_or_503(loc, allow_demo=demo)
    recorded = await ha.recorded_history(loc.id)
    return {
        "comparisons": ha.comparisons(b["series"]),
        "recorded": recorded,
        "recorded_note": "Hourly snapshots recorded by AIRenv's scheduler for this location.",
        "is_demo": b["snapshot"]["is_demo"],
    }


_last_manual_refresh: dict[str, float] = {}


def _refresh_summary(snap: dict[str, Any], *, throttled: bool) -> dict[str, Any]:
    return {
        "status": snap["status"],
        "observed_at": snap["observed_at"],
        "fetched_at": snap["fetched_at"],
        "throttled": throttled,
    }


@router.post("/air/refresh")
async def refresh(
    loc: Location = Depends(location_param), _: CurrentUser = Depends(get_current_user)
) -> dict[str, Any]:
    """Force a provider refresh. Signed-in only, and at most once per location per cooldown window,
    so the endpoint cannot be used to hammer upstream providers."""
    cooldown = get_settings().manual_refresh_cooldown_seconds
    now = time.monotonic()
    last = _last_manual_refresh.get(loc.id)
    if last is not None and now - last < cooldown:
        cached = ambient.cached_bundle(loc.id)
        if cached:
            retry_after = int(cooldown - (now - last)) + 1
            return {**_refresh_summary(cached["snapshot"], throttled=True), "retry_after_seconds": retry_after}
    _last_manual_refresh[loc.id] = now
    try:
        snap = await scheduler.refresh_location(loc)
    except UpstreamError as exc:
        raise HTTPException(
            503,
            {"code": "data_unavailable", "message": exc.message, "provider": exc.provider, "demo_available": True},
        ) from exc
    return _refresh_summary(snap, throttled=False)


@router.get("/air/stations")
async def stations(
    loc: Location = Depends(location_param),
    radius_km: float = Query(25, ge=1, le=100),
    user: CurrentUser | None = Depends(get_optional_user),
) -> dict[str, Any]:
    prof = await profile_of(user.uid if user else None)
    enabled = (prof or {}).get("data_sources") or {}
    data = await env.fetch_stations(loc.lat, loc.lon, radius_km, enabled)
    data["hotspots"] = env.detect_hotspots(data["stations"])
    data["hotspot_method"] = (
        "A station is flagged when its measured PM2.5 is ≥1.4× and ≥20 µg/m³ above the median "
        "of at least 4 measured stations in range. No values are interpolated."
    )
    return data


@router.get("/feed")
async def get_feed(loc: Location = Depends(location_param), limit: int = Query(30, ge=1, le=100)) -> dict[str, Any]:
    return {"items": await feed.list_feed(loc.id, limit), "location_id": loc.id}
