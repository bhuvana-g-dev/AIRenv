"""AIRenv AI assistant: answers grounded in the current environmental context."""

from __future__ import annotations

import re
from collections.abc import Callable
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.services import ai_engine
from app.services import historical_analytics as ha
from app.services import pollution_analyzer as pa
from app.services import recommendation_engine as re_engine
from app.services.pollution_analyzer import Severity

FORECAST_HOURS = 36
FORECAST_STEP_HOURS = 3
MAX_CARDS = 3
MAX_FOLLOW_UPS = 3
MAX_EVENTS_IN_CONTEXT = 5
QUESTION_MAX_CHARS = 600
FOLLOW_UPS = [
    "What is the best time for outdoor activities?",
    "How can I improve indoor air quality?",
    "What can my apartment do to reduce emissions?",
]


class AssistantAnswer(BaseModel):
    answer: str = Field(description="Markdown answer, under 180 words")
    recommendation_ids: list[str] = Field(description="ids from draft_recommendations relevant to the question")
    uncertainty: str = Field(description="One sentence on data limits and uncertainty")
    follow_ups: list[str] = Field(description="Up to 3 short follow-up questions")


INTENTS: list[tuple[str, list[str]]] = [
    ("why_poor", [r"\bwhy\b", r"cause", r"reason", r"kyun", r"source"]),
    ("best_time", [r"best time", r"when (?:should|can|is)", r"which time", r"what time", r"timing"]),
    ("safe_outside", [r"safe", r"play outside", r"go out", r"outdoor", r"run\b", r"jog", r"walk", r"exercise"]),
    ("indoor", [r"indoor", r"inside", r"home", r"purifier", r"window", r"room"]),
    ("event", [r"event", r"function", r"organi[sz]e", r"wedding", r"party", r"low[- ]emission"]),
    ("reduce", [r"reduce", r"emission", r"apartment", r"society", r"community", r"contribut", r"waste"]),
    ("forecast", [r"tomorrow", r"forecast", r"tonight", r"later", r"next"]),
]


def classify(question: str) -> str:
    q = question.lower()
    for intent, pats in INTENTS:
        if any(re.search(p, q) for p in pats):
            return intent
    return "summary"


def _fmt(iso: str) -> str:
    try:
        return datetime.fromisoformat(iso).strftime("%a %H:%M")
    except ValueError:
        return iso


def build_context(
    snapshot: dict[str, Any], series: dict[str, Any], recs: list[dict[str, Any]], events: list[dict[str, Any]]
) -> dict[str, Any]:
    ni = series["now_index"]
    times, pm = series["times"], series["hourly"]["pm2_5"]
    forecast = [
        {"time": times[i], "pm2_5": pm[i], "naqi": series["hourly"]["aqi_in"][i]}
        for i in range(ni + 1, min(ni + FORECAST_HOURS + 1, len(times)), FORECAST_STEP_HOURS)
    ]
    windows = pa.best_windows(times[ni : ni + FORECAST_HOURS], pm[ni : ni + FORECAST_HOURS], 1)
    comp = ha.comparisons(series)
    return {
        "location": snapshot["location"]["name"],
        "observed_local": snapshot.get("observed_local"),
        "source": snapshot["sources"]["air"],
        "naqi": snapshot["aqi"].get("value"),
        "category": snapshot["aqi"].get("category"),
        "dominant": snapshot["aqi"].get("dominant_label"),
        "pollutants": {k: v["value"] for k, v in snapshot["pollutants"].items()},
        "weather": snapshot.get("weather"),
        "trend": snapshot["analysis"]["trend_pm2_5"],
        "dispersion": snapshot["analysis"]["dispersion"],
        "confidence": snapshot["analysis"]["confidence"],
        "forecast_every_3h": forecast,
        "cleanest_hours_next_36h": [{"start": w["start"], "pm2_5_mean": w["mean"]} for w in windows],
        "history": {k: comp[k] for k in ("vs_yesterday_same_hour", "seven_day_mean", "vs_seven_day_mean_pct")},
        "upcoming_community_events": [
            {
                "title": e.get("title"),
                "date": e.get("date"),
                "time": e.get("time"),
                "risk": (e.get("risk") or {}).get("summary"),
            }
            for e in events[:MAX_EVENTS_IN_CONTEXT]
        ],
        "draft_recommendations": [
            {k: r[k] for k in ("id", "title", "action", "alternative", "expected_benefit")} for r in recs
        ],
    }


# ----------------------------------------------------------------------------- rule-based answers
# Each handler gets the context and the opening sentence ("head") and returns (answer, recommendation ids).

Answer = tuple[str, list[str]]


def _headline(ctx: dict[str, Any]) -> str:
    cat = ctx["category"] or {}
    return (
        f"In **{ctx['location']}**, the estimated NAQI is **{ctx['naqi']} ({cat.get('label', 'n/a')})** with PM2.5 "
        f"at **{ctx['pollutants'].get('pm2_5')} µg/m³** (as of {(ctx.get('observed_local') or '')[11:16]} local)."
    )


def _why_poor(ctx: dict[str, Any], head: str) -> Answer:
    disp, w, trend = ctx["dispersion"], ctx.get("weather") or {}, ctx["trend"] or {}
    parts = [head, f"The main pollutant is **{ctx['dominant']}**."]
    if disp.get("level") in ("poor", "limited"):
        parts.append(
            f"{disp['explanation']} Wind is {w.get('wind_speed_kmh')} km/h and the mixing layer is "
            f"about {w.get('boundary_layer_m')} m deep, so emissions from traffic, heating, burning "
            "and industry accumulate near the ground."
        )
    else:
        parts.append(
            "Winds are helping to disperse emissions somewhat, so levels mainly reflect regional emission sources."
        )
    if trend.get("direction") in ("rising", "falling"):
        parts.append(
            f"PM2.5 has been {trend['direction']} ({trend['change_pct']}% over {trend['window_hours']} hours)."
        )
    parts.append("AIRenv cannot attribute pollution to a specific source without source-apportionment data.")
    return " ".join(parts), ["indoor_air", "transport"]


def _outdoor(ctx: dict[str, Any], head: str) -> Answer:
    severity = (ctx["category"] or {}).get("severity") or 0
    if severity >= Severity.POOR:
        advice = "Strenuous outdoor play is not advisable right now, especially for children."
    elif severity == Severity.MODERATE:
        advice = (
            "Light outdoor activity is generally fine; keep strenuous exercise short, especially for sensitive people."
        )
    else:
        advice = "Conditions are suitable for outdoor activity."
    win = "; ".join(f"{_fmt(x['start'])} (~{x['pm2_5_mean']} µg/m³)" for x in ctx["cleanest_hours_next_36h"][:3])
    answer = f"{head} {advice}" + (f"\n\nCleanest forecast hours in the next 36 hours: {win}." if win else "")
    answer += " No time can be guaranteed safe; check conditions before going out."
    return answer, ["outdoor_timing", "sensitive_groups", "school_activity", "protection", "good_conditions"]


def _indoor(_ctx: dict[str, Any], head: str) -> Answer:
    return (
        f"{head}\n\nAIRenv does not measure indoor air, but you can reduce how much outdoor pollution "
        "gets in: keep windows closed during high-pollution hours, ventilate briefly when outdoor levels "
        "are lowest, run a HEPA air purifier in the main room if you have one, and avoid indoor smoke "
        "(incense, coils, candles, frying without an exhaust).",
        ["indoor_air", "energy"],
    )


def _event(ctx: dict[str, Any], head: str) -> Answer:
    windows = ctx["cleanest_hours_next_36h"]
    return (
        f"{head}\n\nFor a low-emission event: choose a venue reachable by metro or bus, organise shared "
        "rides, avoid diesel generators and open fires, use reusable serveware and segregate waste for "
        "collection. Schedule outdoor parts for the cleanest forecast window"
        + (f" ({_fmt(windows[0]['start'])})." if windows else "."),
        ["transport", "waste", "outdoor_timing"],
    )


def _reduce(_ctx: dict[str, Any], head: str) -> Answer:
    return (
        f"{head}\n\nThe most effective community actions are: stop open burning of waste and leaves, "
        "segregate waste for collection, organise carpools and public-transport use, and avoid solid-fuel "
        "heating and diesel generators. These reduce emissions; no single action will measurably change "
        "local AQI, which also depends on regional sources and weather.",
        ["waste", "transport", "energy"],
    )


def _forecast(ctx: dict[str, Any], head: str) -> Answer:
    f = ctx["forecast_every_3h"]
    if not f:
        return f"{head} Forecast data is not available right now.", ["outdoor_timing"]
    peak = max(f, key=lambda x: x["pm2_5"] or 0)
    low = min(f, key=lambda x: x["pm2_5"] if x["pm2_5"] is not None else 1e9)
    return (
        f"{head}\n\nOver the next 36 hours the model forecast peaks near **{peak['pm2_5']} µg/m³** "
        f"around {_fmt(peak['time'])} and is lowest near **{low['pm2_5']} µg/m³** around "
        f"{_fmt(low['time'])}. Forecasts are estimates and can change.",
        ["outdoor_timing"],
    )


INTENT_HANDLERS: dict[str, Callable[[dict[str, Any], str], Answer]] = {
    "why_poor": _why_poor,
    "safe_outside": _outdoor,
    "best_time": _outdoor,
    "indoor": _indoor,
    "event": _event,
    "reduce": _reduce,
    "forecast": _forecast,
}


def fallback_answer(intent: str, ctx: dict[str, Any], recs: list[dict[str, Any]]) -> dict[str, Any]:
    head = _headline(ctx)
    handler = INTENT_HANDLERS.get(intent)
    if handler:
        answer, ids = handler(ctx, head)
    else:  # "summary"
        answer, ids = f"{head} {(ctx['category'] or {}).get('health', '')}", [r["id"] for r in recs[:2]]
    available = {r["id"] for r in recs}
    return {
        "answer": answer,
        "recommendation_ids": [i for i in ids if i in available][:MAX_CARDS],
        "uncertainty": "Values are CAMS model estimates for your area, not a street-level monitor; forecasts "
        "are uncertain."
        if ctx["source"].get("type") == "model"
        else "Sample data shown; not suitable for decisions.",
        "follow_ups": list(FOLLOW_UPS),
    }


# ----------------------------------------------------------------------------- entry point


async def _ai_answer(
    question: str, history: list[dict[str, str]], ctx: dict[str, Any], profile: dict[str, Any]
) -> dict[str, Any] | None:
    ctx_ai = {
        **ctx,
        "audience": {"community_type": profile.get("community_type"), "family_context": profile.get("family_context")},
    }
    ai = await ai_engine.generate_json(
        f"Answer the user's question using CONTEXT. Question: {question[:QUESTION_MAX_CHARS]}",
        ctx_ai,
        AssistantAnswer,
        language=profile.get("language", "en"),
        history=history,
    )
    return ai.model_dump() if ai else None


def _data_refs(ctx: dict[str, Any], snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    refs = [
        {"label": "NAQI (estimated)", "value": ctx["naqi"], "unit": None},
        {"label": "PM2.5", "value": ctx["pollutants"].get("pm2_5"), "unit": "µg/m³"},
        {"label": "PM10", "value": ctx["pollutants"].get("pm10"), "unit": "µg/m³"},
        {"label": "Wind", "value": (ctx.get("weather") or {}).get("wind_speed_kmh"), "unit": "km/h"},
    ]
    return [{**r, "source": ctx["source"]["name"], "observed_at": snapshot.get("observed_at")} for r in refs]


async def answer(
    question: str,
    history: list[dict[str, str]],
    snapshot: dict[str, Any],
    series: dict[str, Any],
    profile: dict[str, Any] | None,
    events: list[dict[str, Any]],
) -> dict[str, Any]:
    recs = re_engine.build_recommendations(snapshot, series, profile, events)
    ctx = build_context(snapshot, series, recs, events)
    intent = classify(question)
    result: dict[str, Any] | None = None
    if ai_engine.available() and not snapshot.get("is_demo"):
        result = await _ai_answer(question, history, ctx, profile or {})
    generated_by = "rules" if result is None else "gemini"
    if result is None:
        result = fallback_answer(intent, ctx, recs)
    by_id = {r["id"]: r for r in recs}
    return {
        "answer": result["answer"],
        "cards": [by_id[i] for i in result.get("recommendation_ids", []) if i in by_id][:MAX_CARDS],
        "uncertainty": result["uncertainty"],
        "follow_ups": result.get("follow_ups", [])[:MAX_FOLLOW_UPS],
        "intent": intent,
        "generated_by": generated_by,
        "data_refs": _data_refs(ctx, snapshot),
        "is_demo": snapshot.get("is_demo", False),
    }
