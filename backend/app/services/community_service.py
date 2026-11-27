"""Communities, linked groups, detected events, verified initiatives and participation statistics."""

from __future__ import annotations

import asyncio
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel, Field

from app.core.clock import utc_now, utc_now_iso
from app.core.ids import new_id
from app.core.security import CurrentUser
from app.db.store import DocumentStore, get_store
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
DEFAULT_EVENT_RETENTION_DAYS = 30
DEMO_CHILD_COLLECTIONS = ("community_events", "initiatives", "initiative_records", "tg_groups")


def _now() -> str:
    return utc_now_iso()


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
    store = get_store()
    if user.role == "admin":
        return await store.query("communities")
    members, admins = await asyncio.gather(
        store.query("communities", [("member_uids", "array_contains", user.uid)]),
        store.query("communities", [("admin_uids", "array_contains", user.uid)]),
    )
    merged = {c["id"]: c for c in [*members, *admins]}
    return sorted(merged.values(), key=lambda c: c.get("created_at") or "")


async def create(user: CurrentUser, data: CommunityIn, is_demo: bool = False) -> dict[str, Any]:
    cid = new_id()
    doc = {
        "name": data.name,
        "type": data.type,
        "location": data.location,
        "admin_uids": [user.uid],
        "member_uids": [user.uid],
        "created_at": _now(),
        "is_demo": is_demo,
    }
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
    eid = data.get("id") or new_id()
    retention = int(data.pop("retention_days", DEFAULT_EVENT_RETENTION_DAYS))
    doc = {
        **data,
        "community_id": cid,
        "created_at": _now(),
        "expires_at": (utc_now() + timedelta(days=retention)).isoformat(),
    }
    await get_store().set("community_events", eid, doc)
    return {**doc, "id": eid}


async def events_for(cid: str) -> list[dict[str, Any]]:
    rows = await get_store().query("community_events", [("community_id", "==", cid)])
    rows.sort(key=lambda e: (e.get("date") or "", e.get("time") or ""))
    return rows


async def upcoming_events_for_location(location_id: str) -> list[dict[str, Any]]:
    today = utc_now().strftime("%Y-%m-%d")
    comms = await get_store().query("communities", [("location.id", "==", location_id)])
    per_community = await asyncio.gather(*(events_for(c["id"]) for c in comms))
    return [
        e
        for events in per_community
        for e in events
        if e.get("kind", "activity") == "activity" and (e.get("date") or "") >= today
    ]


async def groups_for(cid: str) -> list[dict[str, Any]]:
    return await get_store().query("tg_groups", [("community_id", "==", cid)])


# ----------------------------------------------------------------------------- statistics


def _type_row(itype: str) -> dict[str, Any]:
    meta = INITIATIVE_TYPES.get(itype, {})
    return {
        "type": itype,
        "label": meta.get("label", itype),
        "verified_participants": 0,
        "unverified_participants": 0,
        "verified_quantity": 0.0,
        "unit": meta.get("unit"),
        "verified_records": 0,
        "pending_records": 0,
    }


def _tally(
    initiatives: list[dict[str, Any]], records: list[dict[str, Any]]
) -> tuple[dict[str, dict[str, Any]], list[dict[str, Any]]]:
    """Per-type participation totals and the monthly verified-participation trend."""
    by_type: dict[str, dict[str, Any]] = {}
    for ini in initiatives:
        by_type.setdefault(ini["type"], _type_row(ini["type"]))
    ini_type = {i["id"]: i["type"] for i in initiatives}
    monthly: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
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
    return by_type, [{"month": m, **dict(v)} for m, v in sorted(monthly.items())]


async def stats(cid: str) -> dict[str, Any]:
    store = get_store()
    initiatives = await store.query("initiatives", [("community_id", "==", cid)])
    records = await store.query("initiative_records", [("community_id", "==", cid)])
    by_type, trend = _tally(initiatives, records)
    rows = list(by_type.values())
    return {
        "by_type": rows,
        "monthly_verified_participation": trend,
        "estimated_emissions_avoided": ic.community_emissions(records),
        "totals": {
            "verified_records": sum(r["verified_records"] for r in rows),
            "pending_records": sum(r["pending_records"] for r in rows),
            "verified_participants": sum(r["verified_participants"] for r in rows),
        },
        "disclaimer": "Participation shows community action. It is not evidence that local air quality improved; "
        "AQI depends on regional emissions and weather.",
    }


# ----------------------------------------------------------------------------- demo data


async def _unlink_members(store: DocumentStore, community: dict[str, Any]) -> None:
    for uid in set(community.get("member_uids", [])) | set(community.get("admin_uids", [])):
        profile = await store.get("users", uid)
        if profile and community["id"] in profile.get("community_ids", []):
            remaining = [i for i in profile["community_ids"] if i != community["id"]]
            await store.update("users", uid, {"community_ids": remaining})


async def remove_demo_data(user: CurrentUser) -> int:
    """Delete demo communities the user manages (platform admins: all demo data) and their children."""
    store = get_store()
    demo = await store.query("communities", [("is_demo", "==", True)])
    targets = [c for c in demo if can_manage(user, c)]
    target_ids = {c["id"] for c in targets}
    n = 0
    for coll in DEMO_CHILD_COLLECTIONS:
        for doc in await store.query(coll, [("is_demo", "==", True)]):
            if doc.get("community_id") in target_ids:
                await store.delete(coll, doc["id"])
                n += 1
    for c in targets:
        await store.delete("communities", c["id"])
        n += 1
        await _unlink_members(store, c)
    return n


# Demo events per community ("apt" / "school"), dated tomorrow in IST.
DEMO_EVENTS: list[tuple[str, dict[str, Any]]] = [
    (
        "school",
        {
            "source": "manual",
            "kind": "activity",
            "title": "Inter-house football (demo)",
            "activity_type": "sports",
            "intensity": "high",
            "outdoor": True,
            "time": "15:00",
            "duration_hours": 2,
        },
    ),
    (
        "apt",
        {
            "source": "manual",
            "kind": "activity",
            "title": "Morning yoga in the park (demo)",
            "activity_type": "walk",
            "intensity": "moderate",
            "outdoor": True,
            "time": "07:00",
            "duration_hours": 1,
        },
    ),
    (
        "apt",
        {
            "source": "manual",
            "kind": "concern",
            "concern_type": "open_burning",
            "title": "Leaf burning near block C reported (demo)",
            "status": "open",
        },
    ),
]
# (community, initiative type, title, records as (days ago, participants, verified, km shifted)).
DEMO_INITIATIVES: list[tuple[str, str, str, list[tuple[int, int, bool, int]]]] = [
    ("apt", "carpool", "Office carpool pool", [(60, 14, True, 280), (30, 19, True, 380), (5, 23, False, 460)]),
    ("apt", "waste_segregation", "Door-to-door segregation", [(45, 120, True, 0), (15, 152, True, 0)]),
    ("apt", "avoided_burning", "No-burn leaf collection", [(20, 0, True, 0), (3, 0, False, 0)]),
    ("school", "public_transport", "Metro to school week", [(25, 85, True, 0), (2, 110, False, 0)]),
]
DEMO_AVOIDED_BURNING_QUANTITY = 3
DEMO_CARPOOL_OCCUPANTS = 3
IST_OFFSET = timedelta(hours=5.5)


async def _seed_demo_groups(store: DocumentStore, apt: str, school: str, location: dict[str, Any]) -> None:
    """One opted-in school parents group and one not-yet-authorised RWA group."""
    for cid, title, authorized in (
        (school, "Sunrise Parents (demo group)", True),
        (apt, "Green Park RWA (demo group)", False),
    ):
        await store.set(
            "tg_groups",
            f"demo-{cid}",
            {
                "chat_id": f"demo-{cid}",
                "title": title,
                "community_id": cid,
                "authorized": authorized,
                "reply_mode": "approval",
                "opted_in_at": _now() if authorized else None,
                "location": location,
                "is_demo": True,
            },
        )


def _demo_record(
    user: CurrentUser, iid: str, cid: str, itype: str, base: datetime, rec: tuple[int, int, bool, int]
) -> dict[str, Any]:
    days_ago, participants, verified, km = rec
    carpool = itype == "carpool"
    return {
        "initiative_id": iid,
        "community_id": cid,
        "date": (base - timedelta(days=days_ago)).strftime("%Y-%m-%d"),
        "participants": participants,
        "quantity": DEMO_AVOIDED_BURNING_QUANTITY if itype == "avoided_burning" and verified else participants,
        "km_shifted": km or None,
        "baseline_mode": "petrol_car" if carpool else None,
        "alternative_mode": "petrol_car" if carpool else None,
        "occupants": DEMO_CARPOOL_OCCUPANTS if carpool else None,
        "verified": verified,
        "verified_by": user.uid if verified else None,
        "verified_at": _now() if verified else None,
        "evidence_note": "Demo record",
        "is_demo": True,
    }


async def _seed_demo_initiatives(store: DocumentStore, user: CurrentUser, ids: dict[str, str]) -> None:
    base = utc_now()
    for key, itype, title, recs in DEMO_INITIATIVES:
        cid, iid = ids[key], new_id()
        initiative = {
            "community_id": cid,
            "type": itype,
            "title": f"{title} (demo)",
            "description": "Demonstration initiative",
            "created_at": _now(),
            "is_demo": True,
        }
        await store.set("initiatives", iid, initiative)
        for rec in recs:
            await store.set("initiative_records", new_id(), _demo_record(user, iid, cid, itype, base, rec))


async def seed_demo(user: CurrentUser, location: dict[str, Any]) -> list[str]:
    """Create clearly-labelled demonstration communities. Every document carries is_demo=True."""
    store = get_store()
    apt = await create(
        user, CommunityIn(name="Green Park Residents (demo)", type="apartment", location=location), is_demo=True
    )
    school = await create(
        user, CommunityIn(name="Sunrise Public School (demo)", type="school", location=location), is_demo=True
    )
    ids = {"apt": apt["id"], "school": school["id"]}
    tomorrow = (utc_now() + IST_OFFSET + timedelta(days=1)).strftime("%Y-%m-%d")
    await _seed_demo_groups(store, apt["id"], school["id"], location)
    for key, event in DEMO_EVENTS:
        await add_event(ids[key], {**event, "date": tomorrow, "is_demo": True, "advisory": {"status": "none"}})
    await _seed_demo_initiatives(store, user, ids)
    return [apt["id"], school["id"]]
