import asyncio
from datetime import datetime

from app.services import conversation_processor as cp
from app.services import event_detection as ed

NOW = datetime(2026, 11, 19, 18, 0)  # Thursday


def test_extracts_school_sports_event():
    r = ed.extract("Tomorrow we are conducting outdoor sports activities at 3 PM.", NOW)
    assert r["relevant"] and r["kind"] == "activity"
    assert r["activity_type"] == "sports"
    assert r["date"] == "2026-11-20"
    assert r["time"] == "15:00"
    assert r["outdoor"] is True
    assert r["intensity"] == "high"


def test_detects_waste_burning_concern():
    r = ed.extract("Let's just burn the accumulated garbage behind block B on Saturday", NOW)
    assert r["kind"] == "concern" and r["concern_type"] == "open_burning"


def test_ignores_irrelevant_messages():
    assert ed.extract("Happy birthday Riya! 🎉", NOW)["relevant"] is False
    assert ed.extract("Has anyone seen my keys?", NOW)["relevant"] is False


def test_weekday_and_indoor():
    r = ed.extract("Badminton practice on Monday 6:30 pm in the indoor hall", NOW)
    assert r["date"] == "2026-11-23"
    assert r["time"] == "18:30"
    assert r["outdoor"] is False


def test_redaction():
    out = ed.redact("Call me at +91 98765 43210 or mail a.b@example.com, cc @ravi")
    assert "98765" not in out and "example.com" not in out and "@ravi" not in out


def test_process_message_returns_structure_only(sample_bundle, monkeypatch):
    _, bundle = sample_bundle
    # The sample series is centred on 2026-11-19 10:00; pin "now" so "tomorrow" stays inside the forecast.
    monkeypatch.setattr(cp, "local_now", lambda series: datetime(2026, 11, 19, 10, 0))
    result = asyncio.run(cp.process_message("Tomorrow outdoor football match at 3 PM in the ground",
                                            bundle["series"], audience="school", use_ai=False))
    assert result["relevant"] is True
    assert "text" not in (result["event"] or {})
    assert result["risk"]["level"] != "unknown"
    if result["respond"]:
        assert "Forecasts are estimates" in result["advisory"]
