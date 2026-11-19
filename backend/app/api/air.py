from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import bundle_or_503, location_param, profile_of
from app.core.http import UpstreamError
from app.core.security import CurrentUser, get_optional_user
from app.services import environmental_data as env
from app.services import historical_analytics as ha
from app.services import intelligence_feed as feed
from app.services import location_service
from app.services.location_service import Location

router = APIRouter(prefix="/api", tags=["air"])


@router.get("/locations/search")
async def search_locations(q: str = Query(min_length=2, max_length=80)):
    try:
        return {"results": [loc.model_dump() for loc in await location_service.search(q)]}
    except UpstreamError as exc:
        raise HTTPException(503, exc.message) from exc


@router.get("/locations/reverse")
async def reverse_location(lat: float = Query(ge=-90, le=90), lon: float = Query(ge=-180, le=180)):
    return (await location_service.reverse(lat, lon)).model_dump()


@router.get("/air/current")
async def current(loc: Location = Depends(location_param), demo: bool = False):
    return (await bundle_or_503(loc, allow_demo=demo))["snapshot"]


@router.get("/air/bundle")
async def bundle(loc: Location = Depends(location_param), demo: bool = False):
    b = await bundle_or_503(loc, allow_demo=demo)
    return {"snapshot": b["snapshot"], "series": b["series"]}


@router.get("/air/history")
async def history(loc: Location = Depends(location_param), demo: bool = False):
    b = await bundle_or_503(loc, allow_demo=demo)
    recorded = await ha.recorded_history(loc.id)
    return {"comparisons": ha.comparisons(b["series"]), "recorded": recorded,
            "recorded_note": "Hourly snapshots recorded by AIRenv's scheduler for this location.",
            "is_demo": b["snapshot"]["is_demo"]}


@router.post("/air/refresh")
async def refresh(loc: Location = Depends(location_param)):
    from app.scheduler import refresh_location

    try:
        snap = await refresh_location(loc)
    except UpstreamError as exc:
        raise HTTPException(503, {"code": "data_unavailable", "message": exc.message, "provider": exc.provider,
                                  "demo_available": True}) from exc
    return {"status": snap["status"], "observed_at": snap["observed_at"], "fetched_at": snap["fetched_at"]}


@router.get("/air/stations")
async def stations(loc: Location = Depends(location_param), radius_km: float = Query(25, ge=1, le=100),
                   user: CurrentUser | None = Depends(get_optional_user)):
    prof = await profile_of(user.uid if user else None)
    enabled = (prof or {}).get("data_sources") or {}
    data = await env.fetch_stations(loc.lat, loc.lon, radius_km, enabled)
    data["hotspots"] = env.detect_hotspots(data["stations"])
    data["hotspot_method"] = ("A station is flagged when its measured PM2.5 is ≥1.4× and ≥20 µg/m³ above the median "
                              "of at least 4 measured stations in range. No values are interpolated.")
    return data


@router.get("/feed")
async def get_feed(loc: Location = Depends(location_param), limit: int = Query(30, ge=1, le=100)):
    return {"items": await feed.list_feed(loc.id, limit), "location_id": loc.id}
