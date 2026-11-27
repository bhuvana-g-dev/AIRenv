"""AI Decision Intelligence: deterministic recommendations, optionally phrased by Gemini.

1. Rules decide *which* recommendations apply and compute every figure.
2. Gemini (when configured) rewrites them for the household/community context and
   the user's language. Its output is schema-validated and number-checked.
3. If Gemini is unavailable or its output fails validation, the rule text is used.
"""

from __future__ import annotations

import json
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.core.clock import utc_now_iso
from app.core.ids import stable_id
from app.services import ai_engine
from app.services import impact_calculator as ic
from app.services import pollution_analyzer as pa
from app.services.pollution_analyzer import Severity
from app.services.risk_detection import has_sensitive_members

# Forecast hours beyond which confidence drops, and beyond which the text flags forecast uncertainty.
RELIABLE_FORECAST_HOURS = 24
NOWCAST_HOURS = 6
BRIEFING_CACHE_TTL_SECONDS = 1800
RISKY_EVENT_LEVELS = ("elevated", "high", "severe")
COMMUNITY_TYPES_FOR_WASTE = ("apartment", "rwa", "community_org")
# Fields Gemini may rewrite; everything else on a recommendation stays rule-generated.
AI_TEXT_FIELDS = ("id", "title", "what_is_happening", "why_it_matters", "action", "alternative", "expected_benefit")
SENSITIVE_GROUP_LABELS = (
    ("children", "children"),
    ("older_adults", "older adults"),
    ("respiratory_or_heart_condition", "people with lung or heart conditions"),
    ("pregnancy", "pregnant family members"),
    ("outdoor_workers", "outdoor workers"),
)
HEADLINES = {
    Severity.GOOD: "Air quality is good.",
    Severity.SATISFACTORY: "Air quality is satisfactory.",
    Severity.MODERATE: "Air quality is moderate; sensitive people should take care.",
    Severity.POOR: "Air pollution is elevated in your area.",
    Severity.VERY_POOR: "Air pollution is very high in your area.",
    Severity.SEVERE: "Air pollution is at severe levels.",
}


def _ref(label: str, value: Any, unit: str | None, snapshot: dict[str, Any], kind: str = "air") -> dict[str, Any]:
    src = snapshot["sources"].get(kind) or {}
    return {
        "label": label,
        "value": value,
        "unit": unit,
        "source": src.get("name"),
        "source_type": src.get("type"),
        "observed_at": snapshot.get("observed_at"),
    }


def _fmt_time(iso: str | None) -> str:
    if not iso:
        return "n/a"
    try:
        dt = datetime.fromisoformat(iso)
        return dt.strftime("%a %H:%M")
    except ValueError:
        return iso[11:16]


def _hour_conf(base: dict[str, Any], hours_ahead: int) -> dict[str, Any]:
    level = base["level"]
    reason = "; ".join(base["reasons"][:2]) or "Based on current model data."
    if hours_ahead > RELIABLE_FORECAST_HOURS:
        level = "low" if level in ("high", "medium") else level
        reason += " Forecast more than 24 hours ahead is less reliable."
    elif hours_ahead > NOWCAST_HOURS:
        reason += " Includes forecast hours, which are uncertain."
    return {"level": level, "reason": reason}


# ----------------------------------------------------------------------------- rule context


@dataclass(frozen=True)
class RuleContext:
    """Everything the recommendation rules read, computed once per request."""

    snapshot: dict[str, Any]
    profile: dict[str, Any]
    events: list[dict[str, Any]]
    category: dict[str, Any]
    severity: int
    aqi: int | None
    happening: str
    base_refs: list[dict[str, Any]]
    exposure: dict[str, Any]
    times: list[str]
    now_index: int

    @property
    def confidence(self) -> dict[str, Any]:
        conf: dict[str, Any] = self.snapshot["analysis"]["confidence"]
        return conf

    @property
    def best(self) -> dict[str, Any] | None:
        """Cleanest one-hour window for moderate activity in the next 48 hours, if any."""
        return self.exposure.get("best")

    @property
    def community_type(self) -> str:
        return str(self.profile.get("community_type", "household"))


def _happening(snapshot: dict[str, Any], category: dict[str, Any]) -> str:
    pm25 = snapshot["pollutants"]["pm2_5"]
    pm_avg = (pm25.get("average") or {}).get("value")
    dominant = snapshot["aqi"].get("dominant_label") or "PM2.5"
    est = "estimated " if snapshot["sources"]["air"].get("type") == "model" else ""
    return (
        f"The {est}NAQI is {snapshot['aqi'].get('value')} ({category['label']}), mainly from {dominant}. "
        f"PM2.5 is {pm25['value']} µg/m³" + (f" (24-h mean {pm_avg} µg/m³)." if pm_avg is not None else ".")
    )


def _rule_context(
    snapshot: dict[str, Any],
    series: dict[str, Any],
    profile: dict[str, Any] | None,
    events: list[dict[str, Any]] | None,
) -> RuleContext:
    category = snapshot["aqi"].get("category") or pa.CATEGORIES[0]
    aqi = snapshot["aqi"].get("value")
    times, now_i = series["times"], series["now_index"]
    exposure_req = ic.ExposureRequest(activity_hours=1, intensity="moderate")
    return RuleContext(
        snapshot=snapshot,
        profile=profile or {},
        events=events or [],
        category=category,
        severity=category["severity"],
        aqi=aqi,
        happening=_happening(snapshot, category),
        base_refs=[
            _ref("NAQI (estimated)", aqi, None, snapshot),
            _ref("PM2.5", snapshot["pollutants"]["pm2_5"]["value"], "µg/m³", snapshot),
        ],
        exposure=ic.exposure_comparison(times, series["hourly"]["pm2_5"], now_i, exposure_req),
        times=times,
        now_index=now_i,
    )


# ----------------------------------------------------------------------------- rules
# Each rule returns one recommendation card, or None when it does not apply.

Rule = Callable[[RuleContext], dict[str, Any] | None]


def _outdoor_timing(ctx: RuleContext) -> dict[str, Any] | None:
    best, planned = ctx.best, ctx.exposure.get("planned")
    if not (best and planned and ctx.severity >= Severity.MODERATE):
        return None
    hours_ahead = next((i for i, t in enumerate(ctx.times[ctx.now_index :]) if t == best["start"]), 0)
    reduction = ctx.exposure.get("reduction_pct")
    return {
        "id": "outdoor_timing",
        "category": "activity_timing",
        "priority": 1,
        "title": "Move outdoor activity to a cleaner window",
        "what_is_happening": ctx.happening,
        "why_it_matters": ctx.category["health"] + " Exercise increases the amount of air you breathe.",
        "action": f"Plan strenuous outdoor activity around {_fmt_time(best['start'])}, when the forecast "
        f"PM2.5 averages {best['mean_pm2_5']} µg/m³.",
        "alternative": "Move the activity indoors or swap it for a lower-intensity one.",
        "expected_benefit": (
            f"For one hour of moderate activity, estimated inhaled PM2.5 falls from "
            f"{planned['inhaled_ug']} µg to {best['inhaled_ug']} µg"
            + (f" (about {reduction}% less)." if reduction and reduction > 0 else ".")
            + " This reduces your exposure, not local pollution."
        ),
        "benefit_type": "exposure",
        "confidence": _hour_conf(ctx.confidence, hours_ahead),
        "audience": "everyone",
        "data_refs": [
            *ctx.base_refs,
            _ref("Best window mean PM2.5 (forecast)", best["mean_pm2_5"], "µg/m³", ctx.snapshot),
        ],
    }


def _good_conditions(ctx: RuleContext) -> dict[str, Any] | None:
    if ctx.severity > Severity.SATISFACTORY or ctx.aqi is None:
        return None
    return {
        "id": "good_conditions",
        "category": "activity_timing",
        "priority": 1,
        "title": "Conditions suit outdoor activity",
        "what_is_happening": ctx.happening,
        "why_it_matters": ctx.category["health"],
        "action": "This is a reasonable time for outdoor activities and for airing out your home.",
        "alternative": "Sensitive people can still prefer lighter activity if they notice symptoms.",
        "expected_benefit": "Lower exposure than during typical smog peaks.",
        "benefit_type": "exposure",
        "confidence": _hour_conf(ctx.confidence, 0),
        "audience": "everyone",
        "data_refs": ctx.base_refs,
    }


def _indoor_air(ctx: RuleContext) -> dict[str, Any] | None:
    if ctx.severity < Severity.POOR:
        return None
    disp = ctx.snapshot["analysis"]["dispersion"]
    trapped = " " + disp["explanation"] if disp.get("level") in ("poor", "limited") else ""
    cleanest = _fmt_time(ctx.best["start"]) if ctx.best else None
    return {
        "id": "indoor_air",
        "category": "indoor_air",
        "priority": 2,
        "title": "Reduce outdoor air entering your home",
        "what_is_happening": ctx.happening + trapped,
        "why_it_matters": "Fine particles infiltrate homes through open windows and gaps. AIRenv does not "
        "measure indoor air, so this is general guidance.",
        "action": "Keep windows closed during high-pollution hours"
        + (f" and ventilate briefly around {cleanest}." if cleanest else "."),
        "alternative": "If you have an air purifier with a HEPA filter, run it in the room where you spend "
        "most time. Avoid indoor smoke from incense, mosquito coils, candles or frying.",
        "expected_benefit": "Lower indoor particle levels than leaving windows open; the size of the effect "
        "depends on your building and cannot be estimated without an indoor sensor.",
        "benefit_type": "qualitative",
        "confidence": {"level": "medium", "reason": "General public-health guidance; indoor air not measured."},
        "audience": "households",
        "data_refs": ctx.base_refs,
    }


def _protection(ctx: RuleContext) -> dict[str, Any] | None:
    if ctx.severity < Severity.POOR:
        return None
    return {
        "id": "protection",
        "category": "health_protection",
        "priority": 3,
        "title": "Protect yourself when outdoor exposure is unavoidable",
        "what_is_happening": ctx.happening,
        "why_it_matters": ctx.category["health"],
        "action": "Wear a well-fitted N95/FFP2 respirator outdoors and keep outdoor time short.",
        "alternative": "Choose routes away from heavy traffic and avoid outdoor exercise.",
        "expected_benefit": "A well-fitted respirator filters most fine particles; cloth or surgical masks "
        "filter far less. This is not a guarantee of safety.",
        "benefit_type": "exposure",
        "confidence": {"level": "medium", "reason": "Depends on mask fit and duration of use."},
        "audience": "everyone",
        "data_refs": ctx.base_refs,
    }


def _sensitive_groups(ctx: RuleContext) -> dict[str, Any] | None:
    if not (has_sensitive_members(ctx.profile) and ctx.severity >= Severity.MODERATE):
        return None
    fc = ctx.profile.get("family_context") or {}
    who = [label for key, label in SENSITIVE_GROUP_LABELS if fc.get(key)]
    return {
        "id": "sensitive_groups",
        "category": "health_protection",
        "priority": 2,
        "title": "Extra care for sensitive family members",
        "what_is_happening": ctx.happening,
        "why_it_matters": f"Your household includes {', '.join(who)}, who are more affected at this level.",
        "action": "Limit their outdoor time and exertion. Anyone with asthma or heart disease should follow "
        "the action plan agreed with their doctor and keep prescribed medication at hand.",
        "alternative": "Seek medical advice if symptoms such as breathlessness, chest tightness or persistent "
        "cough appear.",
        "expected_benefit": "Lower exposure for the people most affected.",
        "benefit_type": "exposure",
        "confidence": {"level": ctx.confidence["level"], "reason": "Health framing follows CPCB NAQI statements."},
        "audience": "sensitive_groups",
        "data_refs": ctx.base_refs,
    }


def _transport(ctx: RuleContext) -> dict[str, Any] | None:
    if ctx.severity < Severity.MODERATE:
        return None
    trip = ic.trip_emissions(
        ic.TripRequest(baseline_mode="petrol_car", alternative_mode="metro", distance_km=10, trips_per_week=10)
    )
    week = trip["avoided_kg"]["week"]
    return {
        "id": "transport",
        "category": "transport",
        "priority": 4,
        "title": "Choose lower-emission travel",
        "what_is_happening": ctx.happening,
        "why_it_matters": "Vehicle exhaust is a major urban source of PM2.5 and NO₂ in winter. Collective "
        "changes reduce emissions; one person's choice will not measurably change local AQI.",
        "action": "Use metro or bus for regular trips, or share rides.",
        "alternative": "Carpool with neighbours or combine errands into fewer trips.",
        "expected_benefit": (
            f"Switching a 10 km commute (10 trips a week) from a petrol car to metro avoids "
            f"an estimated {week['estimate']} kg CO₂e per week (range {week['low']}–"
            f"{week['high']} kg)."
        ),
        "benefit_type": "emissions",
        "confidence": {"level": "medium", "reason": "Emission factors are averages with ±25% uncertainty."},
        "audience": "everyone",
        "data_refs": ctx.base_refs,
    }


def _waste(ctx: RuleContext) -> dict[str, Any] | None:
    if ctx.community_type not in COMMUNITY_TYPES_FOR_WASTE and ctx.severity < Severity.VERY_POOR:
        return None
    return {
        "id": "waste",
        "category": "waste",
        "priority": 5,
        "title": "Avoid open burning of waste and leaves",
        "what_is_happening": ctx.happening,
        "why_it_matters": "Open burning releases smoke close to where people breathe and is prohibited "
        "under India's Solid Waste Management Rules, 2016.",
        "action": "Segregate waste and use municipal collection; compost leaves and garden waste.",
        "alternative": "Ask your local body for an extra collection or a composting pit for leaf litter.",
        "expected_benefit": "Removes a local smoke source. AIRenv records avoided burning incidents only "
        "when verified and does not convert them into AQI changes.",
        "benefit_type": "qualitative",
        "confidence": {"level": "high", "reason": "Well-established emission source and legal requirement."},
        "audience": "communities",
        "data_refs": ctx.base_refs,
    }


def _school_activity(ctx: RuleContext) -> dict[str, Any] | None:
    if ctx.community_type != "school" or ctx.severity < Severity.MODERATE:
        return None
    action = (
        "Hold PE and sports indoors today."
        if ctx.severity >= Severity.POOR
        else "Prefer lighter outdoor activity and keep strenuous sports short."
    )
    if ctx.best:
        action += f" If outdoor time is needed, the cleanest forecast window is around {_fmt_time(ctx.best['start'])}."
    return {
        "id": "school_activity",
        "category": "school",
        "priority": 1,
        "title": "Adjust outdoor school activities",
        "what_is_happening": ctx.happening,
        "why_it_matters": "Children breathe more air relative to body weight and are more affected.",
        "action": action,
        "alternative": "Indoor games, yoga or classroom activities in place of running and field sports.",
        "expected_benefit": "Lower exposure for students during exertion.",
        "benefit_type": "exposure",
        "confidence": _hour_conf(ctx.confidence, 0),
        "audience": "schools",
        "data_refs": ctx.base_refs,
    }


def _energy(ctx: RuleContext) -> dict[str, Any] | None:
    if ctx.severity < Severity.POOR:
        return None
    return {
        "id": "energy",
        "category": "energy",
        "priority": 6,
        "title": "Avoid burning solid fuels for heat",
        "what_is_happening": ctx.happening,
        "why_it_matters": "Wood, coal and biomass fires add smoke to already polluted air, indoors and outdoors.",
        "action": "Use electric heating or extra layers instead of open fires and angithis.",
        "alternative": "Communities can avoid diesel generator use by coordinating power backup.",
        "expected_benefit": "Removes a local smoke source near your home.",
        "benefit_type": "qualitative",
        "confidence": {"level": "high", "reason": "Established local source of fine particles."},
        "audience": "households",
        "data_refs": ctx.base_refs,
    }


def _community_event(ctx: RuleContext, ev: dict[str, Any]) -> dict[str, Any] | None:
    """A card for an upcoming community activity whose forecast risk is elevated or worse."""
    risk = ev.get("risk") or {}
    if risk.get("level") not in RISKY_EVENT_LEVELS:
        return None
    return {
        "id": f"event_{ev['id']}",
        "category": "community_event",
        "priority": 1,
        "title": f"Upcoming: {ev.get('title', 'community activity')}",
        "what_is_happening": risk.get("summary", ""),
        "why_it_matters": "Outdoor exertion during high PM2.5 increases exposure for participants.",
        "action": risk.get("action", "Consider moving the activity indoors or rescheduling."),
        "alternative": risk.get("alternative", "Check the latest conditions before the event."),
        "expected_benefit": risk.get("benefit", "Lower exposure for participants."),
        "benefit_type": "exposure",
        "confidence": {
            "level": risk.get("confidence", "medium"),
            "reason": "Based on the model forecast for the event time.",
        },
        "audience": "communities",
        "data_refs": ctx.base_refs,
    }


# Evaluated in this order; the final list is sorted by priority (stable, so ties keep this order).
RULES: tuple[Rule, ...] = (
    _outdoor_timing,
    _good_conditions,
    _indoor_air,
    _protection,
    _sensitive_groups,
    _transport,
    _waste,
    _school_activity,
    _energy,
)


def build_recommendations(
    snapshot: dict[str, Any],
    series: dict[str, Any],
    profile: dict[str, Any] | None = None,
    events: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    ctx = _rule_context(snapshot, series, profile, events)
    recs = [rec for rule in RULES if (rec := rule(ctx)) is not None]
    recs += [rec for ev in ctx.events if (rec := _community_event(ctx, ev)) is not None]
    recs.sort(key=lambda r: r["priority"])
    return recs


# ----------------------------------------------------------------------------- briefing


class AIRecText(BaseModel):
    id: str
    title: str
    what_is_happening: str
    why_it_matters: str
    action: str
    alternative: str
    expected_benefit: str


class AIBriefing(BaseModel):
    headline: str = Field(description="One short sentence")
    summary: str = Field(description="2-3 sentences")
    key_points: list[str]
    recommendations: list[AIRecText]


def _summary(severity: int, outlook: dict[str, Any]) -> str:
    if severity >= Severity.POOR:
        parts = [
            "Reduce outdoor exposure during high-pollution periods. Prefer indoor activities and use a "
            "well-fitted respirator when outdoor exposure cannot be avoided."
        ]
    elif severity == Severity.MODERATE:
        parts = ["Most people can go about normal activity; sensitive groups should limit prolonged exertion."]
    else:
        parts = ["Conditions are suitable for normal outdoor activity."]
    if outlook.get("direction") == "worsening":
        parts.append("The model forecast shows conditions worsening over the next 12 hours.")
    elif outlook.get("direction") == "improving":
        parts.append("The model forecast shows some improvement over the next 12 hours.")
    return " ".join(parts)


def _key_points(snapshot: dict[str, Any], cat: dict[str, Any]) -> list[str]:
    analysis = snapshot["analysis"]
    key_points = [f"{cat.get('label', 'Unknown')}: {cat.get('health', '')}".strip()]
    if analysis["dispersion"].get("level") in ("poor", "limited"):
        key_points.append(analysis["dispersion"]["explanation"])
    tr = analysis.get("trend_pm2_5") or {}
    if tr.get("direction") in ("rising", "falling"):
        key_points.append(
            f"PM2.5 has been {tr['direction']} over the last {tr['window_hours']} hours ({tr['change_pct']}%)."
        )
    key_points.append(
        "Values are model estimates; check a nearby monitor for street-level conditions."
        if snapshot["sources"]["air"].get("type") == "model"
        else "Based on monitor data."
    )
    return key_points


def fallback_briefing(snapshot: dict[str, Any], recs: list[dict[str, Any]]) -> dict[str, Any]:
    cat = snapshot["aqi"].get("category") or {}
    sev = cat.get("severity", 0)
    return {
        "headline": HEADLINES.get(sev, "Air-quality data is limited."),
        "summary": _summary(sev, snapshot["analysis"].get("outlook_12h") or {}),
        "key_points": _key_points(snapshot, cat),
        "recommendations": recs,
        "generated_by": "rules",
    }


_briefing_cache: dict[str, tuple[float, dict[str, Any]]] = {}

BRIEFING_TASK = (
    "Write an environmental intelligence briefing for this audience. Rewrite each draft recommendation "
    "so it is specific to the audience, keeping the same id, meaning and figures. Keep each field to one "
    "or two sentences. key_points: 2-4 short bullet facts drawn from CONTEXT."
)


def _ai_context(snapshot: dict[str, Any], profile: dict[str, Any], recs: list[dict[str, Any]]) -> dict[str, Any]:
    """The only data Gemini sees; every number it may use must appear here."""
    analysis_keys = ("trend_pm2_5", "outlook_12h", "dispersion", "confidence", "health_statement")
    return {
        "location": snapshot["location"]["name"],
        "observed_at": snapshot.get("observed_local"),
        "source": snapshot["sources"]["air"],
        "naqi": {k: snapshot["aqi"].get(k) for k in ("value", "dominant_label", "sub_indices")},
        "category": snapshot["aqi"].get("category"),
        "pollutants": {k: {"value": v["value"], "unit": v["unit"]} for k, v in snapshot["pollutants"].items()},
        "weather": snapshot.get("weather"),
        "analysis": {k: snapshot["analysis"][k] for k in analysis_keys},
        "audience": {"community_type": profile.get("community_type"), "family_context": profile.get("family_context")},
        "draft_recommendations": [{k: r[k] for k in AI_TEXT_FIELDS} for r in recs],
    }


def _merge_ai(base: dict[str, Any], recs: list[dict[str, Any]], ai: AIBriefing, language: str) -> dict[str, Any]:
    by_id = {r.id: r for r in ai.recommendations}
    merged = [{**r, **t.model_dump()} if (t := by_id.get(r["id"])) else r for r in recs]
    return {
        **base,
        "headline": ai.headline,
        "summary": ai.summary,
        "key_points": ai.key_points,
        "recommendations": merged,
        "generated_by": "gemini",
        "language": language,
    }


async def briefing(
    snapshot: dict[str, Any],
    series: dict[str, Any],
    profile: dict[str, Any] | None,
    events: list[dict[str, Any]] | None = None,
    use_ai: bool = True,
) -> dict[str, Any]:
    recs = build_recommendations(snapshot, series, profile, events)
    language = (profile or {}).get("language", "en")
    base = fallback_briefing(snapshot, recs)
    base.update(
        {
            "generated_at": utc_now_iso(),
            "language": "en",
            "observed_at": snapshot.get("observed_at"),
            "is_demo": snapshot.get("is_demo", False),
            "ai_available": ai_engine.available(),
        }
    )
    if not use_ai or not ai_engine.available() or snapshot.get("is_demo"):
        return base
    context = _ai_context(snapshot, profile or {}, recs)
    key = stable_id(json.dumps([context, language], sort_keys=True, default=str), length=40)
    hit = _briefing_cache.get(key)
    if hit and time.time() - hit[0] < BRIEFING_CACHE_TTL_SECONDS:
        return hit[1]
    ai = await ai_engine.generate_json(BRIEFING_TASK, context, AIBriefing, language=language)
    if ai is None:
        base["ai_note"] = "AI phrasing unavailable or rejected by validation; showing rule-based text."
        return base
    result = _merge_ai(base, recs, ai, language)
    _briefing_cache[key] = (time.time(), result)
    return result
