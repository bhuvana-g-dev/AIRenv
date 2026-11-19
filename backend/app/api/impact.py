from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
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
async def exposure(body: ExposureBody):
    loc = location_param(body.lat, body.lon, None)
    b = await bundle_or_503(loc, allow_demo=body.demo)
    s = b["series"]
    result = ic.exposure_comparison(s["times"], s["hourly"]["pm2_5"], s["now_index"], body)
    ni = s["now_index"]
    result["forecast"] = [{"time": t, "pm2_5": v} for t, v in
                          zip(s["times"][ni: ni + 48], s["hourly"]["pm2_5"][ni: ni + 48])]
    result["is_demo"] = b["snapshot"]["is_demo"]
    return result


@router.post("/trip")
async def trip(body: ic.TripRequest):
    try:
        return ic.trip_emissions(body)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.post("/energy")
async def energy(body: ic.EnergyRequest):
    return ic.energy_emissions(body)


@router.get("/factors")
async def factors():
    return {"transport": ic.TRANSPORT_FACTORS, "transport_source": ic.TRANSPORT_SOURCE,
            "grid_factor": ic.GRID_FACTOR_IN, "inhalation_rates": ic.INHALATION_RATES,
            "inhalation_source": ic.INHALATION_SOURCE}


@router.get("/community")
async def community_impact(user: CurrentUser = Depends(get_current_user)):
    comms = await cs.list_for_user(user)
    per = []
    for c in comms:
        per.append({"id": c["id"], "name": c["name"], "type": c["type"], "is_demo": c.get("is_demo", False),
                    "stats": await cs.stats(c["id"])})
    store = get_store()
    burning = []
    for c in comms:
        burning += [e for e in await store.query("community_events", [("community_id", "==", c["id"])])
                    if e.get("concern_type") == "open_burning"]
    return {"communities": per, "open_burning_concerns_detected": len(burning),
            "disclaimer": "Participation and avoided-incident counts describe actions taken. They are not evidence "
                          "of improved local air quality."}
