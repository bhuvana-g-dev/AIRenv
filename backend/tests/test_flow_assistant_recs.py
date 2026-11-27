"""Assistant intents, recommendation rules and the briefing (rule fallback, mocked AI path and cache)."""
import asyncio
import copy

import pytest
from fastapi.testclient import TestClient

from app.core.rate_limit import limiter
from app.db.store import get_store
from app.main import app
from app.services import ai_engine, assistant_service
from app.services import ambient_intelligence as ambient
from app.services import pollution_analyzer as pa
from app.services import recommendation_engine as re_engine
from app.services.assistant_service import AssistantAnswer
from app.services.recommendation_engine import AIBriefing, AIRecText


@pytest.fixture(autouse=True)
def fresh_cache(monkeypatch):
    monkeypatch.setattr(re_engine, "_briefing_cache", {})


@pytest.fixture
def data(sample_bundle):
    b = copy.deepcopy(sample_bundle[1])
    return b["snapshot"], b["series"]


def _set_category(snapshot, severity):
    snapshot["aqi"]["category"] = pa.CATEGORIES[severity]


def _ask(question, snapshot, series, profile=None, events=None, history=None):
    return asyncio.run(assistant_service.answer(question, history or [], snapshot, series, profile, events or []))


def _ai(monkeypatch, result):
    calls = []

    async def fake_generate(task, context, schema_model, **kwargs):
        calls.append({"task": task, "context": context, "schema": schema_model, **kwargs})
        return result

    monkeypatch.setattr(ai_engine, "available", lambda: True)
    monkeypatch.setattr(ai_engine, "generate_json", fake_generate)
    return calls


# ----------------------------------------------------------------------------- assistant: intents

@pytest.mark.parametrize("question, intent", [
    ("Why is the air so bad today?", "why_poor"),
    ("What is the source of this smog?", "why_poor"),
    ("What's the best time for a jog?", "best_time"),
    ("Is it safe for kids to play outside?", "safe_outside"),
    ("Should I close the window at home?", "indoor"),
    ("Tips for a wedding party", "event"),
    ("How can our society cut waste?", "reduce"),
    ("Will it be worse tomorrow?", "forecast"),
    ("Hello there", "summary"),
])
def test_classify(question, intent):
    assert assistant_service.classify(question) == intent


def test_fmt_handles_valid_and_invalid_times():
    assert assistant_service._fmt("2026-11-19T10:00") == "Thu 10:00"
    assert assistant_service._fmt("not a time") == "not a time"


def test_head_line_and_data_refs(data):
    snapshot, series = data
    out = _ask("Hello there", snapshot, series)
    pm = snapshot["pollutants"]["pm2_5"]["value"]
    cat = snapshot["aqi"]["category"]
    assert out["answer"] == (f"In **Test City**, the estimated NAQI is **{snapshot['aqi']['value']} "
                             f"({cat['label']})** with PM2.5 at **{pm} µg/m³** (as of 10:00 local). {cat['health']}")
    recs = re_engine.build_recommendations(snapshot, series, None, [])
    assert [c["id"] for c in out["cards"]] == [r["id"] for r in recs[:2]]
    assert out["intent"] == "summary" and out["generated_by"] == "rules" and out["is_demo"] is False
    assert [r["label"] for r in out["data_refs"]] == ["NAQI (estimated)", "PM2.5", "PM10", "Wind"]
    assert all(r["source"] == "Test model" for r in out["data_refs"])
    assert out["data_refs"][1]["value"] == pm and out["data_refs"][3]["value"] is None
    assert out["uncertainty"].startswith("Values are CAMS model estimates")
    assert len(out["follow_ups"]) == 3


def test_why_poor_with_trapping_weather_and_rising_trend(data):
    snapshot, series = data
    snapshot["weather"] = {"wind_speed_kmh": 3, "boundary_layer_m": 200}
    snapshot["analysis"]["dispersion"] = pa.dispersion(3, 200)
    snapshot["analysis"]["trend_pm2_5"] = {"direction": "rising", "change_pct": 30, "window_hours": 3,
                                           "recent_mean": 150, "prior_mean": 115}
    out = _ask("Why is it so polluted?", snapshot, series)
    a = out["answer"]
    assert f"The main pollutant is **{snapshot['aqi']['dominant_label']}**." in a
    assert "Wind is 3 km/h and the mixing layer is about 200 m deep" in a
    assert "PM2.5 has been rising (30% over 3 hours)." in a
    assert a.endswith("AIRenv cannot attribute pollution to a specific source without source-apportionment data.")
    assert [c["id"] for c in out["cards"]] == ["indoor_air", "transport"]


def test_why_poor_with_good_dispersion(data):
    snapshot, series = data
    snapshot["analysis"]["dispersion"] = pa.dispersion(20, 1500)
    snapshot["analysis"]["trend_pm2_5"] = {"direction": "stable"}
    a = _ask("Why?", snapshot, series)["answer"]
    assert "Winds are helping to disperse emissions somewhat" in a
    assert "has been" not in a


@pytest.mark.parametrize("severity, advice", [
    (4, "Strenuous outdoor play is not advisable right now, especially for children."),
    (2, "Light outdoor activity is generally fine; keep strenuous exercise short, especially for sensitive people."),
    (0, "Conditions are suitable for outdoor activity."),
])
def test_safe_outside_advice_by_severity(data, severity, advice):
    snapshot, series = data
    _set_category(snapshot, severity)
    out = _ask("Is it safe to go out?", snapshot, series)
    assert advice in out["answer"]
    assert "Cleanest forecast hours in the next 36 hours:" in out["answer"]
    assert out["answer"].endswith("No time can be guaranteed safe; check conditions before going out.")
    ids = [c["id"] for c in out["cards"]]
    if severity == 0:
        assert ids == ["good_conditions"]
    if severity == 4:
        assert "protection" in ids


def test_safe_outside_for_school_with_sensitive_children(data):
    snapshot, series = data
    profile = {"community_type": "school", "family_context": {"children": True}}
    ids = [c["id"] for c in _ask("When should the kids play?", snapshot, series, profile)["cards"]]
    assert len(ids) == 3 and "sensitive_groups" in ids and "school_activity" in ids


def test_indoor_event_and_reduce_intents(data):
    snapshot, series = data
    indoor = _ask("How do I improve air inside my room?", snapshot, series)
    assert "AIRenv does not measure indoor air" in indoor["answer"]
    assert [c["id"] for c in indoor["cards"]] == ["indoor_air", "energy"]

    event = _ask("We are planning a wedding", snapshot, series)
    assert "For a low-emission event: choose a venue reachable by metro or bus" in event["answer"]
    assert "Schedule outdoor parts for the cleanest forecast window (" in event["answer"]
    assert [c["id"] for c in event["cards"]][:2] == ["transport", "waste"]

    reduce = _ask("What can our apartment do about emissions?", snapshot, series)
    assert "The most effective community actions are: stop open burning" in reduce["answer"]
    assert [c["id"] for c in reduce["cards"]] == ["waste", "transport", "energy"]


def test_forecast_intent_reports_peak_and_low(data):
    snapshot, series = data
    out = _ask("What is the forecast for tonight?", snapshot, series)
    recs = re_engine.build_recommendations(snapshot, series, None, [])
    f = assistant_service.build_context(snapshot, series, recs, [])["forecast_every_3h"]
    peak = max(f, key=lambda x: x["pm2_5"])
    low = min(f, key=lambda x: x["pm2_5"])
    assert f"peaks near **{peak['pm2_5']} µg/m³** around {assistant_service._fmt(peak['time'])}" in out["answer"]
    assert f"lowest near **{low['pm2_5']} µg/m³** around {assistant_service._fmt(low['time'])}" in out["answer"]


def test_forecast_intent_without_forecast_hours(data):
    snapshot, series = data
    series["now_index"] = len(series["times"]) - 1
    out = _ask("Forecast please", snapshot, series)
    assert out["answer"].endswith("Forecast data is not available right now.")


def test_uncertainty_for_sample_data(data):
    snapshot, series = data
    snapshot["sources"]["air"] = {**snapshot["sources"]["air"], "type": "demo"}
    assert _ask("Hello", snapshot, series)["uncertainty"] == "Sample data shown; not suitable for decisions."


def test_upcoming_events_feed_the_context(data):
    snapshot, series = data
    events = [{"title": f"Event {i}", "date": "2026-11-20", "time": "09:00", "risk": {"summary": "Risky"}}
              for i in range(7)]
    recs = re_engine.build_recommendations(snapshot, series, None, events)
    ctx = assistant_service.build_context(snapshot, series, recs, events)
    assert len(ctx["upcoming_community_events"]) == 5
    assert ctx["upcoming_community_events"][0] == {"title": "Event 0", "date": "2026-11-20", "time": "09:00",
                                                   "risk": "Risky"}
    assert len(ctx["forecast_every_3h"]) == 12 and len(ctx["cleanest_hours_next_36h"]) == 3


# ----------------------------------------------------------------------------- assistant: AI path

def test_ai_answer_is_used_when_valid(data, monkeypatch):
    snapshot, series = data
    ai = AssistantAnswer(answer="Keep windows closed today.", recommendation_ids=["protection", "made_up"],
                         uncertainty="Model estimate.", follow_ups=["a", "b", "c", "d"])
    calls = _ai(monkeypatch, ai)
    history = [{"role": "user", "content": "Hi"}]
    out = _ask("Is it safe?", snapshot, series, profile={"language": "hi", "community_type": "school"},
               history=history)
    assert out["generated_by"] == "gemini" and out["answer"] == "Keep windows closed today."
    assert [c["id"] for c in out["cards"]] == ["protection"]
    assert out["follow_ups"] == ["a", "b", "c"] and out["uncertainty"] == "Model estimate."
    assert calls[0]["language"] == "hi" and calls[0]["history"] == history
    assert calls[0]["schema"] is AssistantAnswer
    assert calls[0]["context"]["audience"]["community_type"] == "school"
    assert "Question: Is it safe?" in calls[0]["task"]


def test_ai_failure_falls_back_to_rules(data, monkeypatch):
    snapshot, series = data
    calls = _ai(monkeypatch, None)
    out = _ask("Is it safe?", snapshot, series)
    assert len(calls) == 1 and out["generated_by"] == "rules" and out["intent"] == "safe_outside"


def test_ai_not_called_for_demo_data(data, monkeypatch):
    snapshot, series = data
    snapshot["is_demo"] = True
    calls = _ai(monkeypatch, None)
    out = _ask("Is it safe?", snapshot, series)
    assert calls == [] and out["is_demo"] is True and out["generated_by"] == "rules"


# ----------------------------------------------------------------------------- recommendations

def _ids(recs):
    return [r["id"] for r in recs]


def test_sensitive_family_members_get_extra_care(data):
    snapshot, series = data
    profile = {"family_context": {"children": True, "older_adults": True, "pregnancy": False}}
    recs = re_engine.build_recommendations(snapshot, series, profile)
    rec = next(r for r in recs if r["id"] == "sensitive_groups")
    assert rec["why_it_matters"] == "Your household includes children, older adults, who are more affected at " \
                                    "this level."
    assert rec["audience"] == "sensitive_groups" and rec["priority"] == 2


def test_very_poor_day_household_recommendations(data):
    snapshot, series = data
    recs = re_engine.build_recommendations(snapshot, series, None)
    ids = _ids(recs)
    assert {"indoor_air", "protection", "transport", "waste", "energy"} <= set(ids)
    assert "good_conditions" not in ids and "school_activity" not in ids and "sensitive_groups" not in ids
    assert [r["priority"] for r in recs] == sorted(r["priority"] for r in recs)
    transport = next(r for r in recs if r["id"] == "transport")
    assert transport["expected_benefit"].startswith("Switching a 10 km commute (10 trips a week)")


def test_school_recommendation_wording_by_severity(data):
    snapshot, series = data
    school = {"community_type": "school"}
    recs = re_engine.build_recommendations(snapshot, series, school)
    assert next(r for r in recs if r["id"] == "school_activity")["action"].startswith(
        "Hold PE and sports indoors today.")
    _set_category(snapshot, 2)
    recs = re_engine.build_recommendations(snapshot, series, school)
    assert next(r for r in recs if r["id"] == "school_activity")["action"].startswith(
        "Prefer lighter outdoor activity and keep strenuous sports short.")
    assert "waste" not in _ids(recs) and "indoor_air" not in _ids(recs)


def test_apartment_gets_waste_advice_on_moderate_day(data):
    snapshot, series = data
    _set_category(snapshot, 2)
    assert "waste" in _ids(re_engine.build_recommendations(snapshot, series, {"community_type": "apartment"}))
    assert "waste" not in _ids(re_engine.build_recommendations(snapshot, series, {"community_type": "household"}))


def test_good_day_recommends_outdoor_activity(data):
    snapshot, series = data
    _set_category(snapshot, 1)
    recs = re_engine.build_recommendations(snapshot, series, None)
    assert _ids(recs) == ["good_conditions"]
    assert recs[0]["why_it_matters"] == pa.CATEGORIES[1]["health"]


def test_poor_dispersion_is_explained_in_indoor_advice(data):
    snapshot, series = data
    snapshot["analysis"]["dispersion"] = pa.dispersion(2, 150)
    rec = next(r for r in re_engine.build_recommendations(snapshot, series, None) if r["id"] == "indoor_air")
    assert rec["what_is_happening"].endswith(pa.dispersion(2, 150)["explanation"])


def test_community_events_at_risk_become_recommendations(data):
    snapshot, series = data
    events = [
        {"id": "e1", "title": "Sports day", "risk": {"level": "high", "summary": "Very poor at 21:00",
                                                    "action": "Move indoors", "alternative": "Try 15:00",
                                                    "benefit": "Less exposure", "confidence": "low"}},
        {"id": "e2", "title": "Quiz", "risk": {"level": "low"}},
        {"id": "e3", "title": "No risk yet"},
    ]
    recs = re_engine.build_recommendations(snapshot, series, None, events)
    ev = [r for r in recs if r["category"] == "community_event"]
    assert len(ev) == 1
    assert ev[0]["id"] == "event_e1" and ev[0]["title"] == "Upcoming: Sports day"
    assert (ev[0]["what_is_happening"], ev[0]["action"], ev[0]["alternative"], ev[0]["expected_benefit"]) == (
        "Very poor at 21:00", "Move indoors", "Try 15:00", "Less exposure")
    assert ev[0]["confidence"]["level"] == "low"


def test_format_and_confidence_helpers(data):
    snapshot, _ = data
    assert re_engine._fmt_time(None) == "n/a"
    assert re_engine._fmt_time("2026-11-19T21:00") == "Thu 21:00"
    assert re_engine._fmt_time("xxxxxxxxxxx21:30zz") == "21:30"
    base = {"level": "high", "reasons": ["a", "b", "c"]}
    assert re_engine._hour_conf(base, 30) == {"level": "low", "reason": "a; b Forecast more than 24 hours ahead "
                                                                        "is less reliable."}
    assert re_engine._hour_conf(base, 10) == {"level": "high", "reason": "a; b Includes forecast hours, which "
                                                                         "are uncertain."}
    assert re_engine._hour_conf({"level": "low", "reasons": []}, 0) == {"level": "low",
                                                                       "reason": "Based on current model data."}
    ref = re_engine._ref("Wind", 3, "km/h", snapshot, kind="weather")
    assert ref["source"] is None and ref["source_type"] is None


# ----------------------------------------------------------------------------- briefing

@pytest.mark.parametrize("severity, headline", [
    (0, "Air quality is good."), (1, "Air quality is satisfactory."),
    (2, "Air quality is moderate; sensitive people should take care."),
    (3, "Air pollution is elevated in your area."), (4, "Air pollution is very high in your area."),
    (5, "Air pollution is at severe levels."),
])
def test_fallback_briefing_headline(data, severity, headline):
    snapshot, _ = data
    _set_category(snapshot, severity)
    assert re_engine.fallback_briefing(snapshot, [])["headline"] == headline


def test_fallback_briefing_summary_and_key_points(data):
    snapshot, _ = data
    a = snapshot["analysis"]
    a["outlook_12h"] = {"direction": "worsening"}
    a["dispersion"] = pa.dispersion(2, 150)
    a["trend_pm2_5"] = {"direction": "falling", "window_hours": 3, "change_pct": -12}
    out = re_engine.fallback_briefing(snapshot, [{"id": "x"}])
    assert out["summary"].startswith("Reduce outdoor exposure during high-pollution periods.")
    assert out["summary"].endswith("The model forecast shows conditions worsening over the next 12 hours.")
    cat = snapshot["aqi"]["category"]
    assert out["key_points"] == [f"{cat['label']}: {cat['health']}", a["dispersion"]["explanation"],
                                 "PM2.5 has been falling over the last 3 hours (-12%).",
                                 "Values are model estimates; check a nearby monitor for street-level conditions."]
    assert out["recommendations"] == [{"id": "x"}] and out["generated_by"] == "rules"

    _set_category(snapshot, 2)
    a["outlook_12h"] = {"direction": "improving"}
    snapshot["sources"]["air"] = {**snapshot["sources"]["air"], "type": "station"}
    out = re_engine.fallback_briefing(snapshot, [])
    assert out["summary"] == ("Most people can go about normal activity; sensitive groups should limit prolonged "
                              "exertion. The model forecast shows some improvement over the next 12 hours.")
    assert out["key_points"][-1] == "Based on monitor data."
    _set_category(snapshot, 0)
    assert re_engine.fallback_briefing(snapshot, [])["summary"].startswith("Conditions are suitable")


def test_briefing_without_ai_uses_rules(data):
    snapshot, series = data
    out = asyncio.run(re_engine.briefing(snapshot, series, {"language": "hi"}, None))
    assert out["generated_by"] == "rules" and out["language"] == "en" and out["ai_available"] is False
    assert out["observed_at"] == snapshot["observed_at"] and out["is_demo"] is False
    assert [r["id"] for r in out["recommendations"]] == _ids(re_engine.build_recommendations(snapshot, series,
                                                                                             {"language": "hi"}))


def test_briefing_ai_path_merges_and_caches(data, monkeypatch):
    snapshot, series = data
    ai = AIBriefing(headline="Smoggy day", summary="Stay in.", key_points=["One", "Two"], recommendations=[
        AIRecText(id="protection", title="Wear an N95", what_is_happening="Smog", why_it_matters="Lungs",
                  action="Mask up", alternative="Stay in", expected_benefit="Less exposure")])
    calls = _ai(monkeypatch, ai)
    profile = {"language": "hi", "community_type": "household", "family_context": {"children": True}}
    out = asyncio.run(re_engine.briefing(snapshot, series, profile))
    assert out["generated_by"] == "gemini" and out["language"] == "hi"
    assert (out["headline"], out["summary"], out["key_points"]) == ("Smoggy day", "Stay in.", ["One", "Two"])
    by_id = {r["id"]: r for r in out["recommendations"]}
    assert by_id["protection"]["title"] == "Wear an N95" and by_id["protection"]["priority"] == 3
    assert by_id["transport"]["title"] == "Choose lower-emission travel"  # untouched draft
    assert calls[0]["language"] == "hi" and calls[0]["schema"] is AIBriefing
    assert calls[0]["context"]["audience"]["family_context"] == {"children": True}

    again = asyncio.run(re_engine.briefing(snapshot, series, profile))
    assert again is out and len(calls) == 1  # served from the briefing cache
    assert len(re_engine._briefing_cache) == 1


def test_briefing_ai_rejected_adds_note(data, monkeypatch):
    snapshot, series = data
    calls = _ai(monkeypatch, None)
    out = asyncio.run(re_engine.briefing(snapshot, series, None))
    assert len(calls) == 1 and out["generated_by"] == "rules"
    assert out["ai_note"] == "AI phrasing unavailable or rejected by validation; showing rule-based text."
    assert out["ai_available"] is True and re_engine._briefing_cache == {}


def test_briefing_skips_ai_for_demo_and_when_disabled(data, monkeypatch):
    snapshot, series = data
    calls = _ai(monkeypatch, None)
    assert asyncio.run(re_engine.briefing(snapshot, series, None, use_ai=False))["generated_by"] == "rules"
    snapshot["is_demo"] = True
    assert asyncio.run(re_engine.briefing(snapshot, series, None))["is_demo"] is True
    assert calls == []


# ----------------------------------------------------------------------------- routes

def test_briefing_and_chat_routes_include_upcoming_community_events(sample_bundle, monkeypatch):
    _, bundle = sample_bundle

    async def fake_bundle(location, **kwargs):
        return bundle

    monkeypatch.setattr(ambient, "get_bundle", fake_bundle)
    store = get_store()
    asyncio.run(store.set("communities", "c1", {"name": "Green Park", "type": "apartment",
                                                "location": {"id": "28.61_77.21", "name": "New Delhi",
                                                             "lat": 28.6139, "lon": 77.209}}))
    asyncio.run(store.set("community_events", "e1", {
        "community_id": "c1", "kind": "activity", "title": "Annual run", "date": "2099-01-01", "time": "07:00",
        "risk": {"level": "severe", "summary": "Severe smog expected", "action": "Postpone"}}))
    asyncio.run(store.set("community_events", "e0", {
        "community_id": "c1", "kind": "activity", "title": "Past run", "date": "2000-01-01",
        "risk": {"level": "severe", "summary": "old"}}))
    limiter.reset()
    with TestClient(app) as c:
        body = c.get("/api/insights/briefing").json()
        ids = [r["id"] for r in body["recommendations"]]
        assert "event_e1" in ids and "event_e0" not in ids
        rec = next(r for r in body["recommendations"] if r["id"] == "event_e1")
        assert rec["title"] == "Upcoming: Annual run" and rec["action"] == "Postpone"

        chat = c.post("/api/assistant/chat", json={"question": "Can we organise a party?", "lat": 28.61,
                                                   "lon": 77.21, "name": "Here"}).json()
        assert chat["intent"] == "event" and chat["generated_by"] == "rules"
        assert chat["answer"].startswith("In **Test City**")
    limiter.reset()
