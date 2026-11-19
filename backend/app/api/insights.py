from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api.deps import bundle_or_503, location_param, profile_of
from app.core.security import CurrentUser, get_optional_user
from app.services import assistant_service
from app.services import community_service as cs
from app.services import recommendation_engine
from app.services.location_service import Location, make_location

router = APIRouter(prefix="/api", tags=["intelligence"])


@router.get("/insights/briefing")
async def briefing(loc: Location = Depends(location_param), demo: bool = False,
                   user: CurrentUser | None = Depends(get_optional_user)):
    b = await bundle_or_503(loc, allow_demo=demo)
    profile = await profile_of(user.uid if user else None)
    events = await cs.upcoming_events_for_location(loc.id)
    return await recommendation_engine.briefing(b["snapshot"], b["series"], profile, events)


class ChatTurn(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(max_length=4000)


class ChatRequest(BaseModel):
    question: str = Field(min_length=2, max_length=600)
    history: list[ChatTurn] = Field(default_factory=list, max_length=20)
    lat: float | None = Field(None, ge=-90, le=90)
    lon: float | None = Field(None, ge=-180, le=180)
    name: str | None = Field(None, max_length=80)
    demo: bool = False


@router.post("/assistant/chat")
async def chat(req: ChatRequest, user: CurrentUser | None = Depends(get_optional_user)):
    loc = (make_location(req.name or "Selected location", req.lat, req.lon) if req.lat is not None
           and req.lon is not None else location_param(None, None, None))
    b = await bundle_or_503(loc, allow_demo=req.demo)
    profile = await profile_of(user.uid if user else None)
    events = await cs.upcoming_events_for_location(loc.id)
    return await assistant_service.answer(req.question, [t.model_dump() for t in req.history], b["snapshot"],
                                          b["series"], profile, events)
