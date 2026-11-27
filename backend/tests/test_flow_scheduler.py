"""Scheduler flows: tracked locations, refresh, community event assessment, run loop and retention."""

import asyncio
import contextlib
import copy
from datetime import UTC, datetime, timedelta

import pytest

from app import scheduler
from app.config import get_settings
from app.core.events_bus import bus
from app.core.http import UpstreamError
from app.core.security import default_profile
from app.db.store import get_store
from app.services import ambient_intelligence as ambient
from app.services import community_service as cs
from app.services import conversation_processor as cp
from app.services import telegram_integration as tg
from app.services.location_service import make_location

FIXED_NOW = datetime(2026, 11, 19, 10, 0)


@pytest.fixture(autouse=True)
def sched_state(monkeypatch):
    monkeypatch.setattr(
        scheduler,
        "state",
        {
            "last_run_at": None,
            "next_run_at": None,
            "last_duration_s": None,
            "locations": 0,
            "last_errors": [],
            "runs": 0,
        },
    )
    monkeypatch.setattr(scheduler, "_task", None)
    monkeypatch.setattr(scheduler, "_last_prune", None)
    monkeypatch.setattr(cp, "local_now", lambda series: FIXED_NOW)


@pytest.fixture
def sent(monkeypatch):
    out = []

    async def fake_send(chat_id, text):
        out.append((chat_id, text))

    monkeypatch.setattr(tg, "send_message", fake_send)
    return out


def _bundle(sample_bundle, status="live", errors=None):
    b = copy.deepcopy(sample_bundle[1])
    b["snapshot"]["status"] = status
    b["snapshot"]["errors"] = errors or []
    return b


def _serve(monkeypatch, bundle):
    calls = []

    async def fake_bundle(location, **kwargs):
        calls.append((location.id, kwargs))
        return bundle

    monkeypatch.setattr(ambient, "get_bundle", fake_bundle)
    return calls


def _user(uid, loc, **extra):
    p = default_profile(uid, f"{uid}@example.com", uid, "member")
    p["location"] = loc.model_dump()
    p.update(extra)
    asyncio.run(get_store().set("users", uid, p))
    return p


def _q(coll, filters=None):
    return asyncio.run(get_store().query(coll, filters))


# ----------------------------------------------------------------------------- tracked locations


def test_tracked_locations_default_only():
    locs = asyncio.run(scheduler.tracked_locations())
    s = get_settings()
    assert [(loc.id, loc.name, loc.country, loc.admin1) for loc in locs] == [
        (f"{s.default_lat:.2f}_{s.default_lon:.2f}", s.default_location_name, "India", "Delhi")
    ]


def test_tracked_locations_merges_users_communities_and_groups():
    store = get_store()
    noida = make_location("Noida", 28.5355, 77.391)
    mumbai = make_location("Mumbai", 19.076, 72.8777)
    pune = make_location("Pune", 18.5204, 73.8567)
    asyncio.run(store.set("users", "a", {"location": noida.model_dump()}))
    asyncio.run(store.set("users", "b", {"location": noida.model_dump()}))  # duplicate id
    asyncio.run(store.set("users", "c", {"location": None}))
    asyncio.run(store.set("communities", "c1", {"location": mumbai.model_dump()}))
    asyncio.run(store.set("tg_groups", "g1", {"location": pune.model_dump()}))
    asyncio.run(store.set("tg_groups", "bad1", {"location": {"id": "99.00_0.00", "name": "X", "lat": 999, "lon": 0}}))
    asyncio.run(store.set("tg_groups", "bad2", {"location": {"id": "1.00_1.00", "lat": 1, "lon": 1}}))
    asyncio.run(store.set("tg_groups", "noid", {"location": {"name": "No id", "lat": 1, "lon": 1}}))
    names = [loc.name for loc in asyncio.run(scheduler.tracked_locations())]
    assert names == [get_settings().default_location_name, "Noida", "Mumbai", "Pune"]


# ----------------------------------------------------------------------------- refresh_location


def test_first_refresh_publishes_monitoring_started_and_notifies_users(monkeypatch, sample_bundle, sent):
    loc = sample_bundle[0]
    bundle = _bundle(sample_bundle)
    calls = _serve(monkeypatch, bundle)
    snap = bundle["snapshot"]
    assert snap["aqi"]["category"]["severity"] >= 4  # precondition: "Very Poor" sample day
    prefs = {**default_profile("x", None, None, "member")["notification_prefs"], "telegram": True}
    _user("alice", loc, notification_prefs=prefs, telegram={"chat_id": 99})
    _user("bob", make_location("Elsewhere", 10.0, 10.0))
    queue = bus.subscribe([f"location:{loc.id}"])
    try:
        out = asyncio.run(scheduler.refresh_location(loc))
    finally:
        bus.unsubscribe(queue)

    assert out is snap
    assert calls == [(loc.id, {"force": True})]
    latest = asyncio.run(get_store().get("latest_snapshots", loc.id))
    assert latest["observed_local"] == "2026-11-19T10:00" and latest["aqi"]["value"] == snap["aqi"]["value"]
    assert (
        asyncio.run(get_store().get("history", f"{loc.id}_2026111910"))["pm2_5"] == snap["pollutants"]["pm2_5"]["value"]
    )

    feed = _q("feed")
    assert [f["type"] for f in feed] == ["monitoring_started"]
    assert feed[0]["title"] == "Monitoring started for Test City"
    assert feed[0]["detail"] == (
        f"Estimated NAQI {snap['aqi']['value']} ({snap['aqi']['category']['label']}). Source: Test model."
    )

    messages = []
    while not queue.empty():
        messages.append(queue.get_nowait())
    assert any(m.startswith("event: feed.created") for m in messages)
    assert any(m.startswith("event: snapshot.updated") for m in messages)

    alice = _q("notifications", [("uid", "==", "alice")])
    critical = [n for n in alice if n["category"] == "critical"]
    assert len(critical) == 1
    assert critical[0]["title"] == f"{snap['aqi']['category']['label']} air quality in Test City"
    assert critical[0]["delivery"]["telegram"] == "sent"
    assert (99, f"*{critical[0]['title']}*\n{critical[0]['message']}") in sent
    assert _q("notifications", [("uid", "==", "bob")]) == []


def test_stale_refresh_publishes_source_unavailable_once(monkeypatch, sample_bundle):
    loc = sample_bundle[0]
    store = get_store()
    prev = copy.deepcopy(sample_bundle[1]["snapshot"])
    prev["errors"] = []
    asyncio.run(store.set("latest_snapshots", loc.id, prev))
    errors = [
        {"provider": "Open-Meteo Air Quality", "message": "timed out"},
        {"provider": "Open-Meteo Weather", "message": "HTTP 500"},
    ]
    bundle = _bundle(sample_bundle, status="stale", errors=errors)
    _serve(monkeypatch, bundle)

    first = asyncio.run(scheduler.refresh_location(loc))
    second = asyncio.run(scheduler.refresh_location(loc))
    assert first["status"] == "stale" and second["status"] == "stale"
    feed = _q("feed")
    assert len(feed) == 1
    assert feed[0]["type"] == "source_unavailable" and feed[0]["severity"] == "low"
    assert feed[0]["title"] == "Live data temporarily unavailable"
    assert feed[0]["detail"] == "Showing the last stored reading. timed out; HTTP 500"
    assert asyncio.run(store.get("latest_snapshots", loc.id))["errors"] == errors
    assert _q("history") == []  # stale data is not recorded as history


def test_stale_snapshot_without_previous_is_stored_normally(monkeypatch, sample_bundle):
    loc = sample_bundle[0]
    _serve(monkeypatch, _bundle(sample_bundle, status="stale"))
    asyncio.run(scheduler.refresh_location(loc))
    assert asyncio.run(get_store().get("latest_snapshots", loc.id))["status"] == "stale"
    assert [f["type"] for f in _q("feed")] == ["monitoring_started"]


# ----------------------------------------------------------------------------- community events


def _activity(title, date="2026-11-20", time="21:00", **extra):
    return {
        "source": "manual",
        "kind": "activity",
        "title": title,
        "activity_type": "sports",
        "intensity": "moderate",
        "outdoor": True,
        "date": date,
        "time": time,
        "duration_hours": 1,
        "advisory": {"status": "none"},
        **extra,
    }


def test_assess_community_events_creates_pending_advisory_feed_and_admin_alert(sample_bundle, sent):
    loc, bundle = sample_bundle
    store = get_store()
    _user("adm", loc)
    asyncio.run(
        store.set(
            "communities",
            "c1",
            {
                "name": "Green Park",
                "type": "apartment",
                "location": loc.model_dump(),
                "admin_uids": ["adm", "ghost"],
                "member_uids": ["adm"],
            },
        )
    )
    far = make_location("Far", 10.0, 10.0)
    asyncio.run(
        store.set(
            "communities",
            "c2",
            {"name": "Far club", "type": "rwa", "location": far.model_dump(), "admin_uids": ["adm"]},
        )
    )
    e1 = asyncio.run(cs.add_event("c1", _activity("Evening football")))
    e2 = asyncio.run(cs.add_event("c1", _activity("Sent one", advisory={"status": "sent"})))
    e3 = asyncio.run(cs.add_event("c1", _activity("Dismissed one", advisory={"status": "dismissed"})))
    e4 = asyncio.run(cs.add_event("c1", {"kind": "concern", "title": "Burning", "advisory": {"status": "none"}}))
    e5 = asyncio.run(cs.add_event("c1", _activity("Indoor yoga", outdoor=False)))
    e6 = asyncio.run(
        cs.add_event(
            "c1", _activity("Already pending", time="22:00", advisory={"status": "pending", "text": "keep me"})
        )
    )
    e7 = asyncio.run(cs.add_event("c2", _activity("Other place")))

    asyncio.run(scheduler._assess_community_events(loc, bundle))
    get = lambda e: asyncio.run(store.get("community_events", e["id"]))  # noqa: E731

    ev1 = get(e1)
    assert ev1["risk"]["respond"] is True
    assert ev1["risk"] == cp.assess_event(ev1, bundle["series"], "general")
    assert ev1["advisory"] == {"status": "pending", "text": cp.advisory_text(ev1, ev1["risk"])}
    for skipped in (e2, e3, e4, e7):
        assert "risk" not in get(skipped)
    ev5 = get(e5)
    assert ev5["risk"]["respond"] is False and ev5["advisory"] == {"status": "none"}
    ev6 = get(e6)
    assert ev6["risk"]["respond"] is True and ev6["advisory"] == {"status": "pending", "text": "keep me"}

    feed = _q("feed")
    assert len(feed) == 1
    assert feed[0]["type"] == "event_risk" and feed[0]["title"] == "Community event risk detected: Evening football"
    assert feed[0]["data"] == {"community_id": "c1", "event_id": e1["id"]}

    notes = _q("notifications", [("uid", "==", "adm")])
    assert len(notes) == 1
    n = notes[0]
    assert n["category"] == "community" and n["title"] == "Green Park: Evening football may need changes"
    assert n["severity"] == ("high" if ev1["risk"]["level"] in ("high", "severe") else "medium")
    assert n["message"].endswith("An advisory is waiting for your approval on the Community page.")
    assert sent == []  # admin has not enabled Telegram


def test_school_community_uses_school_audience(sample_bundle):
    loc, bundle = sample_bundle
    store = get_store()
    asyncio.run(
        store.set(
            "communities", "s1", {"name": "School", "type": "school", "location": loc.model_dump(), "admin_uids": []}
        )
    )
    ev = asyncio.run(cs.add_event("s1", _activity("PE class", time="17:00", intensity="high")))
    asyncio.run(scheduler._assess_community_events(loc, bundle))
    stored = asyncio.run(store.get("community_events", ev["id"]))
    assert stored["risk"] == cp.assess_event(stored, bundle["series"], "school")
    assert stored["advisory"]["status"] == "pending"


# ----------------------------------------------------------------------------- run_once / prune


def test_run_once_records_errors_and_keeps_running(monkeypatch):
    locs = [make_location(n, lat, 77.0) for n, lat in (("Ok", 28.0), ("Down", 27.0), ("Broken", 26.0))]
    refreshed, pruned = [], []

    async def fake_tracked():
        return locs

    async def fake_refresh(loc):
        refreshed.append(loc.name)
        if loc.name == "Down":
            raise UpstreamError("Open-Meteo Air Quality", "timeout")
        if loc.name == "Broken":
            raise ValueError("unexpected payload")
        return {}

    async def fake_prune():
        pruned.append(True)

    monkeypatch.setattr(scheduler, "tracked_locations", fake_tracked)
    monkeypatch.setattr(scheduler, "refresh_location", fake_refresh)
    monkeypatch.setattr(scheduler, "prune", fake_prune)

    state = asyncio.run(scheduler.run_once())
    assert refreshed == ["Ok", "Down", "Broken"]
    assert state["last_errors"] == ["Down: Open-Meteo Air Quality: timeout", "Broken: unexpected payload"]
    assert state["locations"] == 3 and state["runs"] == 1
    assert state["last_run_at"] is not None and state["last_duration_s"] >= 0
    assert pruned == [True] and scheduler._last_prune is not None

    asyncio.run(scheduler.run_once())  # prune runs at most every 12 hours
    assert pruned == [True] and scheduler.state["runs"] == 2

    monkeypatch.setattr(scheduler, "_last_prune", datetime.now(UTC) - timedelta(hours=13))
    asyncio.run(scheduler.run_once())
    assert pruned == [True, True]


def test_prune_removes_expired_events_codes_and_old_notifications(monkeypatch):
    store = get_store()
    now = datetime.now(UTC)
    past, future = (now - timedelta(days=1)).isoformat(), (now + timedelta(days=1)).isoformat()
    monkeypatch.setattr(get_settings(), "snapshot_retention_days", 90)
    for doc_id, exp in (("ev-old", past), ("ev-new", future)):
        asyncio.run(store.set("community_events", doc_id, {"expires_at": exp}))
    for doc_id, exp in (("code-old", past), ("code-new", future)):
        asyncio.run(store.set("tg_link_codes", doc_id, {"uid": "u", "expires_at": exp}))
    for doc_id, days in (("n-old", 61), ("n-new", 59)):
        asyncio.run(store.set("notifications", doc_id, {"created_at": (now - timedelta(days=days)).isoformat()}))
    for doc_id, days in (("h-old", 91), ("h-new", 1)):
        asyncio.run(store.set("history", doc_id, {"recorded_at": (now - timedelta(days=days)).isoformat()}))

    asyncio.run(scheduler.prune())
    assert [d["id"] for d in _q("community_events")] == ["ev-new"]
    assert [d["id"] for d in _q("tg_link_codes")] == ["code-new"]
    assert [d["id"] for d in _q("notifications")] == ["n-new"]
    assert [d["id"] for d in _q("history")] == ["h-new"]


def test_prune_swallows_storage_errors(monkeypatch):
    async def boom(days):
        raise RuntimeError("disk full")

    monkeypatch.setattr(scheduler.ha, "prune", boom)
    asyncio.run(scheduler.prune())  # must not raise


# ----------------------------------------------------------------------------- start / stop / loop


def test_start_does_nothing_when_disabled(monkeypatch):
    monkeypatch.setattr(get_settings(), "scheduler_enabled", False)
    scheduler.start()
    assert scheduler._task is None


def test_start_and_stop_manage_the_background_task(monkeypatch):
    monkeypatch.setattr(get_settings(), "scheduler_enabled", True)
    started = []

    async def fake_loop():
        started.append(True)
        await asyncio.Event().wait()

    monkeypatch.setattr(scheduler, "_loop", fake_loop)

    async def run():
        scheduler.start()
        task = scheduler._task
        scheduler.start()  # already running: no second task
        assert scheduler._task is task
        await asyncio.sleep(0)
        await scheduler.stop()
        with contextlib.suppress(asyncio.CancelledError):
            await task
        return task

    task = asyncio.run(run())
    assert started == [True] and task.cancelled() and scheduler._task is None
    asyncio.run(scheduler.stop())  # stopping twice is harmless


def test_loop_runs_survives_failures_and_schedules_next_run(monkeypatch):
    monkeypatch.setattr(get_settings(), "refresh_interval_minutes", 15)
    sleeps, runs = [], []

    async def fake_sleep(seconds):
        sleeps.append(seconds)
        if len(sleeps) == 3:
            raise asyncio.CancelledError

    async def fake_run_once():
        runs.append(True)
        if len(runs) == 1:
            raise RuntimeError("first run failed")
        return {}

    monkeypatch.setattr(scheduler.asyncio, "sleep", fake_sleep)
    monkeypatch.setattr(scheduler, "run_once", fake_run_once)

    async def run():
        with pytest.raises(asyncio.CancelledError):
            await scheduler._loop()

    asyncio.run(run())
    assert sleeps == [2, 900, 900]
    assert runs == [True, True]
    assert scheduler.state["next_run_at"] is not None
