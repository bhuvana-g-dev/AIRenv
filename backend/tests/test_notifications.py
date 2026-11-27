import asyncio
from datetime import datetime

from app.core.security import default_profile
from app.services import notification_service as ns


def _user():
    u = default_profile("u1", None, "Test", "member")
    u["notification_prefs"]["quiet_hours"]["enabled"] = False
    return u


SIGNAL = {
    "key": "deterioration:x:2026-11-19:10",
    "category": "deterioration",
    "severity": "medium",
    "title": "PM2.5 is rising",
    "message": "Test",
}
NOON = datetime(2026, 11, 19, 12, 0)


def test_dedup_and_cooldown():
    user = _user()
    first = asyncio.run(ns.dispatch(user, SIGNAL, NOON))
    assert first is not None
    assert asyncio.run(ns.dispatch(user, SIGNAL, NOON)) is None  # duplicate
    other_hour = {**SIGNAL, "key": "deterioration:x:2026-11-19:11"}
    assert asyncio.run(ns.dispatch(user, other_hour, NOON)) is None  # same category within cooldown
    escalated = {**other_hour, "severity": "high"}
    assert asyncio.run(ns.dispatch(user, escalated, NOON)) is not None  # escalation bypasses cooldown


def test_min_severity_and_quiet_hours():
    user = _user()
    low = {**SIGNAL, "key": "k-low", "severity": "low"}
    assert asyncio.run(ns.dispatch(user, low, NOON)) is None
    user["notification_prefs"]["quiet_hours"] = {"enabled": True, "start": "22:00", "end": "07:00"}
    night = datetime(2026, 11, 19, 23, 30)
    assert asyncio.run(ns.dispatch(user, {**SIGNAL, "key": "k-night"}, night)) is None
    critical = {**SIGNAL, "key": "k-crit", "category": "critical", "severity": "critical"}
    assert asyncio.run(ns.dispatch(user, critical, night)) is not None


def test_quiet_hours_window():
    prefs = {"quiet_hours": {"enabled": True, "start": "22:00", "end": "07:00"}}
    assert ns.in_quiet_hours(prefs, datetime(2026, 1, 1, 23, 0))
    assert ns.in_quiet_hours(prefs, datetime(2026, 1, 1, 6, 59))
    assert not ns.in_quiet_hours(prefs, datetime(2026, 1, 1, 12, 0))
