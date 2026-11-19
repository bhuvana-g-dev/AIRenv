"""AI Decision Intelligence: deterministic recommendations, optionally phrased by Gemini.

1. Rules decide *which* recommendations apply and compute every figure.
2. Gemini (when configured) rewrites them for the household/community context and
   the user's language. Its output is schema-validated and number-checked.
3. If Gemini is unavailable or its output fails validation, the rule text is used.
"""
from __future__ import annotations

import hashlib
import json
import time
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field

from app.services import ai_engine
from app.services import impact_calculator as ic
from app.services import pollution_analyzer as pa
from app.services.risk_detection import has_sensitive_members


def _ref(label: str, value: Any, unit: str | None, snapshot: dict[str, Any], kind: str = "air") -> dict[str, Any]:
    src = snapshot["sources"].get(kind) or {}
    return {"label": label, "value": value, "unit": unit, "source": src.get("name"),
            "source_type": src.get("type"), "observed_at": snapshot.get("observed_at")}


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
    if hours_ahead > 24 and level == "high":
        level = "medium"
    if hours_ahead > 24:
        level = "low" if level == "medium" else level
        reason += " Forecast more than 24 hours ahead is less reliable."
    elif hours_ahead > 6:
        reason += " Includes forecast hours, which are uncertain."
    return {"level": level, "reason": reason}


def build_recommendations(snapshot: dict[str, Any], series: dict[str, Any],
                          profile: dict[str, Any] | None = None,
                          events: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    recs: list[dict[str, Any]] = []
    aqi = snapshot["aqi"].get("value")
    cat = snapshot["aqi"].get("category") or pa.CATEGORIES[0]
    sev = cat["severity"]
    pm = snapshot["pollutants"]["pm2_5"]["value"]
    pm_avg = (snapshot["pollutants"]["pm2_5"].get("average") or {}).get("value")
    dom = snapshot["aqi"].get("dominant_label") or "PM2.5"
    conf = snapshot["analysis"]["confidence"]
    disp = snapshot["analysis"]["dispersion"]
    ctype = (profile or {}).get("community_type", "household")
    sensitive = has_sensitive_members(profile)
    is_model = snapshot["sources"]["air"].get("type") == "model"
    est = "estimated " if is_model else ""
    happening = (f"The {est}NAQI is {aqi} ({cat['label']}), mainly from {dom}. PM2.5 is {pm} µg/m³"
                 + (f" (24-h mean {pm_avg} µg/m³)." if pm_avg is not None else "."))
    base_refs = [_ref("NAQI (estimated)", aqi, None, snapshot), _ref("PM2.5", pm, "µg/m³", snapshot)]

    times, pm_series, now_i = series["times"], series["hourly"]["pm2_5"], series["now_index"]

    # 1. Outdoor activity timing ------------------------------------------------
    exp = ic.exposure_comparison(times, pm_series, now_i, ic.ExposureRequest(activity_hours=1, intensity="moderate"))
    best = exp.get("best")
    if best and exp.get("planned") and sev >= 2:
        hours_ahead = next((i for i, t in enumerate(times[now_i:]) if t == best["start"]), 0)
        reduction = exp.get("reduction_pct")
        recs.append({
            "id": "outdoor_timing", "category": "activity_timing", "priority": 1,
            "title": "Move outdoor activity to a cleaner window",
            "what_is_happening": happening,
            "why_it_matters": cat["health"] + " Exercise increases the amount of air you breathe.",
            "action": f"Plan strenuous outdoor activity around {_fmt_time(best['start'])}, when the forecast "
                      f"PM2.5 averages {best['mean_pm2_5']} µg/m³.",
            "alternative": "Move the activity indoors or swap it for a lower-intensity one.",
            "expected_benefit": (f"For one hour of moderate activity, estimated inhaled PM2.5 falls from "
                                 f"{exp['planned']['inhaled_ug']} µg to {best['inhaled_ug']} µg"
                                 + (f" (about {reduction}% less)." if reduction and reduction > 0 else ".")
                                 + " This reduces your exposure, not local pollution."),
            "benefit_type": "exposure",
            "confidence": _hour_conf(conf, hours_ahead),
            "audience": "everyone",
            "data_refs": base_refs + [_ref("Best window mean PM2.5 (forecast)", best["mean_pm2_5"], "µg/m³",
                                           snapshot)],
        })
    elif sev <= 1 and aqi is not None:
        recs.append({
            "id": "good_conditions", "category": "activity_timing", "priority": 1,
            "title": "Conditions suit outdoor activity",
            "what_is_happening": happening,
            "why_it_matters": cat["health"],
            "action": "This is a reasonable time for outdoor activities and for airing out your home.",
            "alternative": "Sensitive people can still prefer lighter activity if they notice symptoms.",
            "expected_benefit": "Lower exposure than during typical smog peaks.",
            "benefit_type": "exposure", "confidence": _hour_conf(conf, 0), "audience": "everyone",
            "data_refs": base_refs,
        })

    # 2. Indoor air practices -------------------------------------------------------
    if sev >= 3:
        cleanest = None
        if best:
            cleanest = _fmt_time(best["start"])
        recs.append({
            "id": "indoor_air", "category": "indoor_air", "priority": 2,
            "title": "Reduce outdoor air entering your home",
            "what_is_happening": happening + (" " + disp["explanation"] if disp.get("level") in ("poor", "limited")
                                              else ""),
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
            "audience": "households", "data_refs": base_refs,
        })

    # 3. Respiratory protection ---------------------------------------------------
    if sev >= 3:
        recs.append({
            "id": "protection", "category": "health_protection", "priority": 3,
            "title": "Protect yourself when outdoor exposure is unavoidable",
            "what_is_happening": happening,
            "why_it_matters": cat["health"],
            "action": "Wear a well-fitted N95/FFP2 respirator outdoors and keep outdoor time short.",
            "alternative": "Choose routes away from heavy traffic and avoid outdoor exercise.",
            "expected_benefit": "A well-fitted respirator filters most fine particles; cloth or surgical masks "
                                "filter far less. This is not a guarantee of safety.",
            "benefit_type": "exposure",
            "confidence": {"level": "medium", "reason": "Depends on mask fit and duration of use."},
            "audience": "everyone", "data_refs": base_refs,
        })

    # 4. Sensitive groups --------------------------------------------------------------
    if sensitive and sev >= 2:
        fc = (profile or {}).get("family_context") or {}
        who = [label for key, label in (("children", "children"), ("older_adults", "older adults"),
                                        ("respiratory_or_heart_condition", "people with lung or heart conditions"),
                                        ("pregnancy", "pregnant family members"),
                                        ("outdoor_workers", "outdoor workers")) if fc.get(key)]
        recs.append({
            "id": "sensitive_groups", "category": "health_protection", "priority": 2,
            "title": "Extra care for sensitive family members",
            "what_is_happening": happening,
            "why_it_matters": f"Your household includes {', '.join(who)}, who are more affected at this level.",
            "action": "Limit their outdoor time and exertion. Anyone with asthma or heart disease should follow "
                      "the action plan agreed with their doctor and keep prescribed medication at hand.",
            "alternative": "Seek medical advice if symptoms such as breathlessness, chest tightness or persistent "
                           "cough appear.",
            "expected_benefit": "Lower exposure for the people most affected.",
            "benefit_type": "exposure",
            "confidence": {"level": conf["level"], "reason": "Health framing follows CPCB NAQI statements."},
            "audience": "sensitive_groups", "data_refs": base_refs,
        })

    # 5. Low-emission transport -----------------------------------------------------
    if sev >= 2:
        trip = ic.trip_emissions(ic.TripRequest(baseline_mode="petrol_car", alternative_mode="metro",
                                                distance_km=10, trips_per_week=10))
        week = trip["avoided_kg"]["week"]
        recs.append({
            "id": "transport", "category": "transport", "priority": 4,
            "title": "Choose lower-emission travel",
            "what_is_happening": happening,
            "why_it_matters": "Vehicle exhaust is a major urban source of PM2.5 and NO₂ in winter. Collective "
                              "changes reduce emissions; one person's choice will not measurably change local AQI.",
            "action": "Use metro or bus for regular trips, or share rides.",
            "alternative": "Carpool with neighbours or combine errands into fewer trips.",
            "expected_benefit": (f"Switching a 10 km commute (10 trips a week) from a petrol car to metro avoids "
                                 f"an estimated {week['estimate']} kg CO₂e per week (range {week['low']}–"
                                 f"{week['high']} kg)."),
            "benefit_type": "emissions",
            "confidence": {"level": "medium", "reason": "Emission factors are averages with ±25% uncertainty."},
            "audience": "everyone", "data_refs": base_refs,
        })

    # 6. Waste management --------------------------------------------------------------
    if ctype in ("apartment", "rwa", "community_org") or sev >= 4:
        recs.append({
            "id": "waste", "category": "waste", "priority": 5,
            "title": "Avoid open burning of waste and leaves",
            "what_is_happening": happening,
            "why_it_matters": "Open burning releases smoke close to where people breathe and is prohibited "
                              "under India's Solid Waste Management Rules, 2016.",
            "action": "Segregate waste and use municipal collection; compost leaves and garden waste.",
            "alternative": "Ask your local body for an extra collection or a composting pit for leaf litter.",
            "expected_benefit": "Removes a local smoke source. AIRenv records avoided burning incidents only "
                                "when verified and does not convert them into AQI changes.",
            "benefit_type": "qualitative",
            "confidence": {"level": "high", "reason": "Well-established emission source and legal requirement."},
            "audience": "communities", "data_refs": base_refs,
        })

    # 7. Schools ---------------------------------------------------------------------------
    if ctype == "school" and sev >= 2:
        recs.append({
            "id": "school_activity", "category": "school", "priority": 1,
            "title": "Adjust outdoor school activities",
            "what_is_happening": happening,
            "why_it_matters": "Children breathe more air relative to body weight and are more affected.",
            "action": ("Hold PE and sports indoors today." if sev >= 3 else
                       "Prefer lighter outdoor activity and keep strenuous sports short.")
                      + (f" If outdoor time is needed, the cleanest forecast window is around "
                         f"{_fmt_time(best['start'])}." if best else ""),
            "alternative": "Indoor games, yoga or classroom activities in place of running and field sports.",
            "expected_benefit": "Lower exposure for students during exertion.",
            "benefit_type": "exposure", "confidence": _hour_conf(conf, 0), "audience": "schools",
            "data_refs": base_refs,
        })

    # 8. Heating and energy ------------------------------------------------------------------
    if sev >= 3:
        recs.append({
            "id": "energy", "category": "energy", "priority": 6,
            "title": "Avoid burning solid fuels for heat",
            "what_is_happening": happening,
            "why_it_matters": "Wood, coal and biomass fires add smoke to already polluted air, indoors and outdoors.",
            "action": "Use electric heating or extra layers instead of open fires and angithis.",
            "alternative": "Communities can avoid diesel generator use by coordinating power backup.",
            "expected_benefit": "Removes a local smoke source near your home.",
            "benefit_type": "qualitative",
            "confidence": {"level": "high", "reason": "Established local source of fine particles."},
            "audience": "households", "data_refs": base_refs,
        })

    # 9. Community events at risk ----------------------------------------------------------
    for ev in events or []:
        risk = ev.get("risk") or {}
        if risk.get("level") in ("elevated", "high", "severe"):
            recs.append({
                "id": f"event_{ev['id']}", "category": "community_event", "priority": 1,
                "title": f"Upcoming: {ev.get('title', 'community activity')}",
                "what_is_happening": risk.get("summary", ""),
                "why_it_matters": "Outdoor exertion during high PM2.5 increases exposure for participants.",
                "action": risk.get("action", "Consider moving the activity indoors or rescheduling."),
                "alternative": risk.get("alternative", "Check the latest conditions before the event."),
                "expected_benefit": risk.get("benefit", "Lower exposure for participants."),
                "benefit_type": "exposure",
                "confidence": {"level": risk.get("confidence", "medium"),
                               "reason": "Based on the model forecast for the event time."},
                "audience": "communities", "data_refs": base_refs,
            })

    recs.sort(key=lambda r: r["priority"])
    return recs


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


def fallback_briefing(snapshot: dict[str, Any], recs: list[dict[str, Any]]) -> dict[str, Any]:
    cat = snapshot["aqi"].get("category") or {}
    sev = cat.get("severity", 0)
    a = snapshot["analysis"]
    out = a.get("outlook_12h") or {}
    headline = {
        0: "Air quality is good.", 1: "Air quality is satisfactory.",
        2: "Air quality is moderate; sensitive people should take care.",
        3: "Air pollution is elevated in your area.", 4: "Air pollution is very high in your area.",
        5: "Air pollution is at severe levels.",
    }.get(sev, "Air-quality data is limited.")
    parts = []
    if sev >= 3:
        parts.append("Reduce outdoor exposure during high-pollution periods. Prefer indoor activities and use a "
                     "well-fitted respirator when outdoor exposure cannot be avoided.")
    elif sev == 2:
        parts.append("Most people can go about normal activity; sensitive groups should limit prolonged exertion.")
    else:
        parts.append("Conditions are suitable for normal outdoor activity.")
    if out.get("direction") == "worsening":
        parts.append("The model forecast shows conditions worsening over the next 12 hours.")
    elif out.get("direction") == "improving":
        parts.append("The model forecast shows some improvement over the next 12 hours.")
    key_points = [f"{cat.get('label', 'Unknown')}: {cat.get('health', '')}".strip()]
    if a["dispersion"].get("level") in ("poor", "limited"):
        key_points.append(a["dispersion"]["explanation"])
    tr = a.get("trend_pm2_5") or {}
    if tr.get("direction") in ("rising", "falling"):
        key_points.append(f"PM2.5 has been {tr['direction']} over the last {tr['window_hours']} hours "
                          f"({tr['change_pct']}%).")
    key_points.append("Values are model estimates; check a nearby monitor for street-level conditions."
                      if snapshot["sources"]["air"].get("type") == "model" else "Based on monitor data.")
    return {"headline": headline, "summary": " ".join(parts), "key_points": key_points,
            "recommendations": recs, "generated_by": "rules"}


_briefing_cache: dict[str, tuple[float, dict[str, Any]]] = {}


async def briefing(snapshot: dict[str, Any], series: dict[str, Any], profile: dict[str, Any] | None,
                   events: list[dict[str, Any]] | None = None, use_ai: bool = True) -> dict[str, Any]:
    recs = build_recommendations(snapshot, series, profile, events)
    language = (profile or {}).get("language", "en")
    base = fallback_briefing(snapshot, recs)
    base.update({"generated_at": datetime.now(timezone.utc).isoformat(), "language": "en",
                 "observed_at": snapshot.get("observed_at"), "is_demo": snapshot.get("is_demo", False),
                 "ai_available": ai_engine.available()})
    if not use_ai or not ai_engine.available() or snapshot.get("is_demo"):
        return base

    context = {
        "location": snapshot["location"]["name"],
        "observed_at": snapshot.get("observed_local"),
        "source": snapshot["sources"]["air"],
        "naqi": {k: snapshot["aqi"].get(k) for k in ("value", "dominant_label", "sub_indices")},
        "category": snapshot["aqi"].get("category"),
        "pollutants": {k: {"value": v["value"], "unit": v["unit"]} for k, v in snapshot["pollutants"].items()},
        "weather": snapshot.get("weather"),
        "analysis": {k: snapshot["analysis"][k] for k in ("trend_pm2_5", "outlook_12h", "dispersion",
                                                          "confidence", "health_statement")},
        "audience": {"community_type": (profile or {}).get("community_type"),
                     "family_context": (profile or {}).get("family_context")},
        "draft_recommendations": [{k: r[k] for k in ("id", "title", "what_is_happening", "why_it_matters",
                                                     "action", "alternative", "expected_benefit")} for r in recs],
    }
    key = hashlib.sha1(json.dumps([context, language], sort_keys=True, default=str).encode()).hexdigest()
    hit = _briefing_cache.get(key)
    if hit and time.time() - hit[0] < 1800:
        return hit[1]
    task = ("Write an environmental intelligence briefing for this audience. Rewrite each draft recommendation "
            "so it is specific to the audience, keeping the same id, meaning and figures. Keep each field to one "
            "or two sentences. key_points: 2-4 short bullet facts drawn from CONTEXT.")
    ai = await ai_engine.generate_json(task, context, AIBriefing, language=language)
    if ai is None:
        base["ai_note"] = "AI phrasing unavailable or rejected by validation; showing rule-based text."
        return base
    by_id = {r.id: r for r in ai.recommendations}
    merged = []
    for r in recs:
        t = by_id.get(r["id"])
        merged.append({**r, **t.model_dump()} if t else r)
    result = {**base, "headline": ai.headline, "summary": ai.summary, "key_points": ai.key_points,
              "recommendations": merged, "generated_by": "gemini", "language": language}
    _briefing_cache[key] = (time.time(), result)
    return result
