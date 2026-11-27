"""Exposure, emissions and community-participation impact endpoints."""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import Field

from app.api.deps import bundle_or_503, location_param
from app.core.security import CurrentUser, get_current_user
from app.db.store import get_store
from app.services import community_service as cs
from app.services import impact_calculator as ic

router = APIRouter(prefix="/api/impact", tags=["impact"])


class ExposureBody(ic.ExposureRequest):
    lat: float | None = Field(None, ge=-90, le=90)
    lon: float | None = Field(None, ge=-180, le=180)
    demo: bool = False


@router.post("/exposure")
async def exposure(body: ExposureBody) -> dict[str, Any]:
    loc = location_param(body.lat, body.lon, None)
    b = await bundle_or_503(loc, allow_demo=body.demo)
    s = b["series"]
    ni = s["now_index"]
    result = ic.exposure_comparison(s["times"], s["hourly"]["pm2_5"], ni, body)
    window = slice(ni, ni + ic.EXPOSURE_WINDOW_HOURS)
    result["forecast"] = [
        {"time": t, "pm2_5": v} for t, v in zip(s["times"][window], s["hourly"]["pm2_5"][window], strict=False)
    ]
    result["is_demo"] = b["snapshot"]["is_demo"]
    return result


@router.post("/trip")
async def trip(body: ic.TripRequest) -> dict[str, Any]:
    try:
        return ic.trip_emissions(body)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.post("/energy")
async def energy(body: ic.EnergyRequest) -> dict[str, Any]:
    return ic.energy_emissions(body)


@router.get("/factors")
async def factors(response: Response) -> dict[str, Any]:
    response.headers["Cache-Control"] = "public, max-age=86400"  # static reference data
    return {
        "transport": ic.TRANSPORT_FACTORS,
        "transport_source": ic.TRANSPORT_SOURCE,
        "grid_factor": ic.GRID_FACTOR_IN,
        "inhalation_rates": ic.INHALATION_RATES,
        "inhalation_source": ic.INHALATION_SOURCE,
    }


@router.get("/community")
async def community_impact(user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    comms = await cs.list_for_user(user)
    store = get_store()
    stats, events = await asyncio.gather(
        asyncio.gather(*(cs.stats(c["id"]) for c in comms)),
        asyncio.gather(*(store.query("community_events", [("community_id", "==", c["id"])]) for c in comms)),
    )
    per = [
        {"id": c["id"], "name": c["name"], "type": c["type"], "is_demo": c.get("is_demo", False), "stats": st}
        for c, st in zip(comms, stats, strict=True)
    ]
    burning = sum(1 for evs in events for e in evs if e.get("concern_type") == "open_burning")
    return {
        "communities": per,
        "open_burning_concerns_detected": burning,
        "disclaimer": "Participation and avoided-incident counts describe actions taken. They are not evidence "
        "of improved local air quality.",
    }
