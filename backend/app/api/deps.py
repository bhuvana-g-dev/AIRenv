"""Shared request helpers."""
from __future__ import annotations

from typing import Any

from fastapi import HTTPException, Query

from app.config import get_settings
from app.core.http import UpstreamError
from app.db.store import get_store
from app.services import ambient_intelligence as ambient
from app.services.location_service import Location, make_location


def location_param(
    lat: float | None = Query(None, ge=-90, le=90),
    lon: float | None = Query(None, ge=-180, le=180),
    name: str | None = Query(None, max_length=80),
) -> Location:
    s = get_settings()
    if lat is None or lon is None:
        return make_location(s.default_location_name, s.default_lat, s.default_lon, timezone=s.default_timezone,
                             country="India", admin1="Delhi")
    return make_location(name or f"{lat:.3f}, {lon:.3f}", lat, lon)


async def bundle_or_503(loc: Location, allow_demo: bool = False) -> dict[str, Any]:
    try:
        return await ambient.get_bundle(loc, allow_demo=allow_demo)
    except UpstreamError as exc:
        raise HTTPException(503, {"code": "data_unavailable", "message": exc.message, "provider": exc.provider,
                                  "demo_available": True}) from exc


async def profile_of(uid: str | None) -> dict[str, Any] | None:
    if not uid:
        return None
    return await get_store().get("users", uid)
