from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.deps import bundle_or_503, location_param
from app.core.security import CurrentUser, get_current_user
from app.db.store import get_store
from app.services import community_service as cs
from app.services import conversation_processor as cp
from app.services import telegram_integration as tg
from app.services.location_service import Location

router = APIRouter(prefix="/api", tags=["community"])


async def _assess(event: dict[str, Any], community: dict[str, Any]) -> dict[str, Any] | None:
    if event.get("kind") != "activity":
        return None
    loc = Location(**community["location"])
    try:
        b = await bundle_or_503(loc)
    except HTTPException:
        return None
    return cp.assess_event(event, b["series"], "school" if community.get("type") == "school" else "general")


@router.get("/communities")
async def list_communities(user: CurrentUser = Depends(get_current_user)):
    out = []
    for c in await cs.list_for_user(user):
        events = await cs.events_for(c["id"])
        out.append({**c, "can_manage": cs.can_manage(user, c), "event_count": len(events),
                    "pending_advisories": sum(1 for e in events if (e.get("advisory") or {}).get("status") == "pending"),
                    "group_count": len(await cs.groups_for(c["id"]))})
    return {"communities": out}


@router.post("/communities")
async def create_community(data: cs.CommunityIn, user: CurrentUser = Depends(get_current_user)):
    try:
        Location(**data.location)
    except Exception as exc:
        raise HTTPException(422, "Invalid location") from exc
    return await cs.create(user, data)


@router.post("/communities/demo/seed")
async def seed_demo(loc: Location = Depends(location_param), user: CurrentUser = Depends(get_current_user)):
    ids = await cs.seed_demo(user, loc.model_dump())
    # Assess demo events against the real forecast right away.
    for cid in ids:
        c = await cs.get_community(cid)
        for ev in await cs.events_for(cid):
            risk = await _assess(ev, c)
            if risk:
                patch: dict[str, Any] = {"risk": risk}
                if risk.get("respond"):
                    patch["advisory"] = {"status": "pending", "text": cp.advisory_text(ev, risk)}
                await get_store().update("community_events", ev["id"], patch)
    return {"created": ids}


@router.delete("/communities/demo")
async def remove_demo(user: CurrentUser = Depends(get_current_user)):
    return {"removed": await cs.remove_demo_data()}


@router.get("/communities/{cid}")
async def community_detail(cid: str, user: CurrentUser = Depends(get_current_user)):
    c = await cs.get_community(cid)
    if not (cs.can_manage(user, c) or user.uid in c.get("member_uids", [])):
        raise HTTPException(403, "Not a member of this community")
    store = get_store()
    initiatives = await store.query("initiatives", [("community_id", "==", cid)])
    records = await store.query("initiative_records", [("community_id", "==", cid)])
    for ini in initiatives:
        ini["records"] = sorted([r for r in records if r["initiative_id"] == ini["id"]], key=lambda r: r["date"],
                                reverse=True)
        ini["label"] = cs.INITIATIVE_TYPES.get(ini["type"], {}).get("label", ini["type"])
    groups = await cs.groups_for(cid)
    for g in groups:
        g.pop("connect_code", None)
    return {"community": {**c, "can_manage": cs.can_manage(user, c)}, "events": await cs.events_for(cid),
            "groups": groups, "initiatives": initiatives, "stats": await cs.stats(cid),
            "initiative_types": cs.INITIATIVE_TYPES}


@router.post("/communities/{cid}/events")
async def add_event(cid: str, data: cs.EventIn, user: CurrentUser = Depends(get_current_user)):
    c = await cs.require_manage(user, cid)
    ev = {**data.model_dump(), "source": "manual", "kind": "activity", "is_demo": False,
          "advisory": {"status": "none"}}
    risk = await _assess(ev, c)
    if risk:
        ev["risk"] = risk
        if risk.get("respond"):
            ev["advisory"] = {"status": "pending", "text": cp.advisory_text(ev, risk)}
    return await cs.add_event(cid, ev)


@router.delete("/communities/{cid}/events/{eid}")
async def delete_event(cid: str, eid: str, user: CurrentUser = Depends(get_current_user)):
    await cs.require_manage(user, cid)
    await get_store().delete("community_events", eid)
    return {"ok": True}


class AdvisoryDecision(BaseModel):
    action: str = Field(pattern="^(approve|dismiss)$")
    text: str | None = Field(None, max_length=1000)


@router.post("/communities/{cid}/events/{eid}/advisory")
async def decide_advisory(cid: str, eid: str, body: AdvisoryDecision, user: CurrentUser = Depends(get_current_user)):
    await cs.require_manage(user, cid)
    store = get_store()
    ev = await store.get("community_events", eid)
    if not ev or ev.get("community_id") != cid:
        raise HTTPException(404, "Event not found")
    adv = ev.get("advisory") or {}
    text = body.text or adv.get("text")
    delivered_to: list[str] = []
    errors: list[str] = []
    if body.action == "approve":
        groups = [g for g in await cs.groups_for(cid) if g.get("authorized")]
        if ev.get("group_id"):
            groups = [g for g in groups if g["chat_id"] == ev["group_id"]] or groups
        for g in groups:
            if g.get("is_demo") or str(g["chat_id"]).startswith("demo-"):
                errors.append(f"{g['title']}: demo group, message not sent")
                continue
            try:
                await tg.send_message(g["chat_id"], text or "")
                delivered_to.append(g["title"])
            except Exception as exc:
                errors.append(f"{g.get('title')}: {exc}")
    status = "sent" if delivered_to else ("approved" if body.action == "approve" else "dismissed")
    patch = {"advisory": {**adv, "text": text, "status": status, "decided_by": user.uid,
                          "decided_at": datetime.now(timezone.utc).isoformat(), "delivered_to": delivered_to,
                          "delivery_errors": errors}}
    return await store.update("community_events", eid, patch)


class ConnectGroup(BaseModel):
    code: str = Field(min_length=4, max_length=32)


@router.post("/communities/{cid}/groups/connect")
async def connect_group(cid: str, body: ConnectGroup, user: CurrentUser = Depends(get_current_user)):
    c = await cs.require_manage(user, cid)
    store = get_store()
    matches = await store.query("tg_groups", [("connect_code", "==", body.code.strip())])
    if not matches:
        raise HTTPException(404, "No opted-in Telegram group uses this code. Send /optin in the group first.")
    g = matches[0]
    await store.update("tg_groups", g["id"], {"community_id": cid, "connect_code": None,
                                              "location": g.get("location") or c["location"]})
    return {"ok": True, "group": g.get("title")}


class GroupPatch(BaseModel):
    reply_mode: str | None = Field(None, pattern="^(approval|auto)$")
    authorized: bool | None = None


@router.patch("/communities/{cid}/groups/{gid}")
async def patch_group(cid: str, gid: str, body: GroupPatch, user: CurrentUser = Depends(get_current_user)):
    await cs.require_manage(user, cid)
    store = get_store()
    g = await store.get("tg_groups", gid)
    if not g or g.get("community_id") != cid:
        raise HTTPException(404, "Group not found")
    patch: dict[str, Any] = {}
    if body.reply_mode:
        patch["reply_mode"] = body.reply_mode
    if body.authorized is False:
        patch["authorized"] = False  # dashboard may revoke; opting in requires a Telegram group admin
        for ev in await store.query("community_events", [("group_id", "==", gid)]):
            await store.delete("community_events", ev["id"])
    elif body.authorized is True and not g.get("authorized"):
        if not g.get("is_demo"):
            raise HTTPException(400, "A Telegram group administrator must send /optin in the group to opt in.")
        patch["authorized"] = True
    return await store.update("tg_groups", gid, patch)


@router.post("/communities/{cid}/initiatives")
async def add_initiative(cid: str, data: cs.InitiativeIn, user: CurrentUser = Depends(get_current_user)):
    await cs.require_manage(user, cid)
    if data.type not in cs.INITIATIVE_TYPES:
        raise HTTPException(422, "Unknown initiative type")
    iid = uuid.uuid4().hex[:12]
    doc = {**data.model_dump(), "community_id": cid, "created_at": datetime.now(timezone.utc).isoformat(),
           "is_demo": False}
    await get_store().set("initiatives", iid, doc)
    return {**doc, "id": iid}


@router.post("/communities/{cid}/initiatives/{iid}/records")
async def add_record(cid: str, iid: str, data: cs.RecordIn, user: CurrentUser = Depends(get_current_user)):
    await cs.require_manage(user, cid)
    store = get_store()
    ini = await store.get("initiatives", iid)
    if not ini or ini["community_id"] != cid:
        raise HTTPException(404, "Initiative not found")
    rid = uuid.uuid4().hex[:12]
    doc = {**data.model_dump(), "initiative_id": iid, "community_id": cid, "is_demo": False,
           "verified_by": user.uid if data.verified else None,
           "verified_at": datetime.now(timezone.utc).isoformat() if data.verified else None,
           "created_by": user.uid}
    await store.set("initiative_records", rid, doc)
    return {**doc, "id": rid}


@router.post("/communities/{cid}/records/{rid}/verify")
async def verify_record(cid: str, rid: str, user: CurrentUser = Depends(get_current_user)):
    await cs.require_manage(user, cid)
    store = get_store()
    rec = await store.get("initiative_records", rid)
    if not rec or rec["community_id"] != cid:
        raise HTTPException(404, "Record not found")
    return await store.update("initiative_records", rid, {"verified": True, "verified_by": user.uid,
                                                          "verified_at": datetime.now(timezone.utc).isoformat()})


class AnalyzeRequest(BaseModel):
    text: str = Field(min_length=3, max_length=1000)
    lat: float | None = Field(None, ge=-90, le=90)
    lon: float | None = Field(None, ge=-180, le=180)
    audience: str = Field("general", pattern="^(general|school|sensitive)$")


@router.post("/conversation/analyze")
async def analyze_message(req: AnalyzeRequest, user: CurrentUser = Depends(get_current_user)):
    """Run a message through Conversation Intelligence without storing anything."""
    loc = location_param(req.lat, req.lon, None)
    b = await bundle_or_503(loc)
    result = await cp.process_message(req.text, b["series"], audience=req.audience)
    return {**result, "stored": False,
            "privacy": "This message was processed in memory only. Nothing was stored."}
