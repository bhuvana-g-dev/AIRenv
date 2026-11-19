"""Communities, linked groups, detected events, verified initiatives and participation statistics."""
from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel, Field

from app.core.security import CurrentUser
from app.db.store import get_store
from app.services import impact_calculator as ic

COMMUNITY_TYPES = ("household", "school", "apartment", "rwa", "community_org", "workplace")
INITIATIVE_TYPES = {
    "carpool": {"label": "Carpooling", "unit": "trips"},
    "public_transport": {"label": "Public transport", "unit": "trips"},
    "waste_segregation": {"label": "Waste segregation", "unit": "households"},
    "avoided_burning": {"label": "Avoided open burning", "unit": "incidents"},
    "composting": {"label": "Composting", "unit": "kg"},
    "energy_saving": {"label": "Energy saving", "unit": "kWh"},
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class CommunityIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    type: str = Field(pattern="^(school|apartment|rwa|community_org|workplace)$")
    location: dict[str, Any]


class EventIn(BaseModel):
    title: str = Field(min_length=2, max_length=100)
    activity_type: str = Field("function", max_length=30)
    intensity: str = Field("moderate", pattern="^(sedentary|light|moderate|high)$")
    outdoor: bool = True
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    time: str = Field(pattern=r"^\d{2}:\d{2}$")
    duration_hours: int = Field(1, ge=1, le=8)


class InitiativeIn(BaseModel):
    type: str
    title: str = Field(min_length=2, max_length=100)
    description: str = Field("", max_length=400)


class RecordIn(BaseModel):
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    participants: int = Field(ge=0, le=100000)
    quantity: float = Field(0, ge=0, le=1_000_000)
    km_shifted: float | None = Field(None, ge=0, le=1_000_000)
    baseline_mode: str | None = None
    alternative_mode: str | None = None
    occupants: int | None = Field(None, ge=1, le=8)
    evidence_note: str = Field("", max_length=300)
    verified: bool = False


async def get_community(cid: str) -> dict[str, Any]:
    c = await get_store().get("communities", cid)
    if not c:
        raise HTTPException(404, "Community not found")
    return c


def can_manage(user: CurrentUser, community: dict[str, Any]) -> bool:
    return user.role == "admin" or user.uid in community.get("admin_uids", [])


async def require_manage(user: CurrentUser, cid: str) -> dict[str, Any]:
    c = await get_community(cid)
    if not can_manage(user, c):
        raise HTTPException(403, "Only community administrators can do this")
    return c


async def list_for_user(user: CurrentUser) -> list[dict[str, Any]]:
    rows = await get_store().query("communities")
    if user.role == "admin":
        return rows
    return [c for c in rows if user.uid in c.get("admin_uids", []) or user.uid in c.get("member_uids", [])]


async def create(user: CurrentUser, data: CommunityIn, is_demo: bool = False) -> dict[str, Any]:
    cid = uuid.uuid4().hex[:12]
    doc = {"name": data.name, "type": data.type, "location": data.location, "admin_uids": [user.uid],
           "member_uids": [user.uid], "created_at": _now(), "is_demo": is_demo}
    store = get_store()
    await store.set("communities", cid, doc)
    profile = await store.get("users", user.uid)
    if profile is not None:
        ids = list({*profile.get("community_ids", []), cid})
        await store.update("users", user.uid, {"community_ids": ids})
    if user.role == "member":
        await store.update("users", user.uid, {"role": "community_admin"})
    return {**doc, "id": cid}


async def add_event(cid: str, data: dict[str, Any]) -> dict[str, Any]:
    eid = data.get("id") or uuid.uuid4().hex[:12]
    retention = int(data.pop("retention_days", 30))
    doc = {**data, "community_id": cid, "created_at": _now(),
           "expires_at": (datetime.now(timezone.utc) + timedelta(days=retention)).isoformat()}
    await get_store().set("community_events", eid, doc)
    return {**doc, "id": eid}


async def events_for(cid: str) -> list[dict[str, Any]]:
    rows = await get_store().query("community_events", [("community_id", "==", cid)])
    rows.sort(key=lambda e: (e.get("date") or "", e.get("time") or ""))
    return rows


async def upcoming_events_for_location(location_id: str) -> list[dict[str, Any]]:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    comms = await get_store().query("communities")
    out = []
    for c in comms:
        if (c.get("location") or {}).get("id") != location_id:
            continue
        for e in await events_for(c["id"]):
            if e.get("kind", "activity") == "activity" and (e.get("date") or "") >= today:
                out.append(e)
    return out


async def groups_for(cid: str) -> list[dict[str, Any]]:
    return await get_store().query("tg_groups", [("community_id", "==", cid)])


async def stats(cid: str) -> dict[str, Any]:
    store = get_store()
    initiatives = await store.query("initiatives", [("community_id", "==", cid)])
    records = await store.query("initiative_records", [("community_id", "==", cid)])
    by_type: dict[str, dict[str, Any]] = {}
    monthly: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for ini in initiatives:
        by_type.setdefault(ini["type"], {"type": ini["type"], "label": INITIATIVE_TYPES.get(ini["type"], {})
                                         .get("label", ini["type"]), "verified_participants": 0,
                                         "unverified_participants": 0, "verified_quantity": 0.0,
                                         "unit": INITIATIVE_TYPES.get(ini["type"], {}).get("unit"),
                                         "verified_records": 0, "pending_records": 0})
    ini_type = {i["id"]: i["type"] for i in initiatives}
    for r in records:
        t = ini_type.get(r["initiative_id"])
        if not t:
            continue
        row = by_type[t]
        if r.get("verified"):
            row["verified_participants"] += r.get("participants", 0)
            row["verified_quantity"] += r.get("quantity", 0) or 0
            row["verified_records"] += 1
            monthly[r["date"][:7]][t] += r.get("participants", 0)
        else:
            row["unverified_participants"] += r.get("participants", 0)
            row["pending_records"] += 1
    trend = [{"month": m, **dict(v)} for m, v in sorted(monthly.items())]
    emissions = ic.community_emissions(records)
    return {
        "by_type": list(by_type.values()),
        "monthly_verified_participation": trend,
        "estimated_emissions_avoided": emissions,
        "totals": {
            "verified_records": sum(r["verified_records"] for r in by_type.values()),
            "pending_records": sum(r["pending_records"] for r in by_type.values()),
            "verified_participants": sum(r["verified_participants"] for r in by_type.values()),
        },
        "disclaimer": "Participation shows community action. It is not evidence that local air quality improved; "
                      "AQI depends on regional emissions and weather.",
    }


async def remove_demo_data() -> int:
    store = get_store()
    n = 0
    for coll in ("communities", "community_events", "initiatives", "initiative_records", "tg_groups"):
        for doc in await store.query(coll, [("is_demo", "==", True)]):
            await store.delete(coll, doc["id"])
            n += 1
    for u in await store.query("users"):
        ids = u.get("community_ids", [])
        remaining = [i for i in ids if await store.get("communities", i)]
        if remaining != ids:
            await store.update("users", u["id"], {"community_ids": remaining})
    return n


async def seed_demo(user: CurrentUser, location: dict[str, Any]) -> list[str]:
    """Create clearly-labelled demonstration communities. Every document carries is_demo=True."""
    store = get_store()
    created = []
    apt = await create(user, CommunityIn(name="Green Park Residents (demo)", type="apartment", location=location),
                       is_demo=True)
    school = await create(user, CommunityIn(name="Sunrise Public School (demo)", type="school", location=location),
                          is_demo=True)
    created += [apt["id"], school["id"]]
    tomorrow = (datetime.now(timezone.utc) + timedelta(hours=5.5) + timedelta(days=1)).strftime("%Y-%m-%d")
    await store.set("tg_groups", f"demo-{school['id']}", {
        "chat_id": f"demo-{school['id']}", "title": "Sunrise Parents (demo group)", "community_id": school["id"],
        "authorized": True, "reply_mode": "approval", "opted_in_at": _now(), "location": location, "is_demo": True,
    })
    await store.set("tg_groups", f"demo-{apt['id']}", {
        "chat_id": f"demo-{apt['id']}", "title": "Green Park RWA (demo group)", "community_id": apt["id"],
        "authorized": False, "reply_mode": "approval", "opted_in_at": None, "location": location, "is_demo": True,
    })
    await add_event(school["id"], {"source": "manual", "kind": "activity", "title": "Inter-house football (demo)",
                                   "activity_type": "sports", "intensity": "high", "outdoor": True,
                                   "date": tomorrow, "time": "15:00", "duration_hours": 2, "is_demo": True,
                                   "advisory": {"status": "none"}})
    await add_event(apt["id"], {"source": "manual", "kind": "activity", "title": "Morning yoga in the park (demo)",
                                "activity_type": "walk", "intensity": "moderate", "outdoor": True,
                                "date": tomorrow, "time": "07:00", "duration_hours": 1, "is_demo": True,
                                "advisory": {"status": "none"}})
    await add_event(apt["id"], {"source": "manual", "kind": "concern", "concern_type": "open_burning",
                                "title": "Leaf burning near block C reported (demo)", "date": tomorrow,
                                "is_demo": True, "advisory": {"status": "none"}, "status": "open"})
    base = datetime.now(timezone.utc)
    specs = [
        (apt["id"], "carpool", "Office carpool pool", [(60, 14, True, 280), (30, 19, True, 380), (5, 23, False, 460)]),
        (apt["id"], "waste_segregation", "Door-to-door segregation", [(45, 120, True, 0), (15, 152, True, 0)]),
        (apt["id"], "avoided_burning", "No-burn leaf collection", [(20, 0, True, 0), (3, 0, False, 0)]),
        (school["id"], "public_transport", "Metro to school week", [(25, 85, True, 0), (2, 110, False, 0)]),
    ]
    for cid, itype, title, recs in specs:
        iid = uuid.uuid4().hex[:12]
        await store.set("initiatives", iid, {"community_id": cid, "type": itype, "title": f"{title} (demo)",
                                             "description": "Demonstration initiative", "created_at": _now(),
                                             "is_demo": True})
        for days_ago, participants, verified, km in recs:
            rid = uuid.uuid4().hex[:12]
            qty = 3 if itype == "avoided_burning" and verified else participants
            await store.set("initiative_records", rid, {
                "initiative_id": iid, "community_id": cid,
                "date": (base - timedelta(days=days_ago)).strftime("%Y-%m-%d"), "participants": participants,
                "quantity": qty, "km_shifted": km or None,
                "baseline_mode": "petrol_car" if itype == "carpool" else None,
                "alternative_mode": "petrol_car" if itype == "carpool" else None,
                "occupants": 3 if itype == "carpool" else None,
                "verified": verified, "verified_by": user.uid if verified else None,
                "verified_at": _now() if verified else None, "evidence_note": "Demo record", "is_demo": True,
            })
    return created
