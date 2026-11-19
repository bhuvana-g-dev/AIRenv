"""Conversation Intelligence: turns authorised group messages into event risk assessments.

Privacy rules enforced here:
- Messages from groups that have not opted in are never parsed.
- Raw text is redacted, used in memory only, and never persisted.
- Only extracted structured fields are returned for storage.
- The processor decides whether a reply is warranted; most messages get none.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from statistics import mean
from typing import Any

from pydantic import BaseModel

from app.services import ai_engine
from app.services import event_detection as ed
from app.services import pollution_analyzer as pa

RISK_THRESHOLD_SUBINDEX = {"high": 201, "moderate": 201, "light": 301, "sedentary": 401}
# Schools and sensitive audiences warn earlier (Moderate+ for strenuous activity).
SENSITIVE_THRESHOLD = {"high": 101, "moderate": 201, "light": 301, "sedentary": 401}


class AIExtraction(BaseModel):
    relevant: bool
    activity_type: str | None = None
    outdoor: bool | None = None
    date: str | None = None
    time: str | None = None
    title: str | None = None


def _local_now(series: dict[str, Any]) -> datetime:
    off = series.get("utc_offset", "+00:00")
    sign = 1 if off[0] == "+" else -1
    h, m = int(off[1:3]), int(off[4:6])
    return (datetime.now(timezone.utc) + sign * timedelta(hours=h, minutes=m)).replace(tzinfo=None)


async def extract_event(text: str, series: dict[str, Any], use_ai: bool = True) -> dict[str, Any]:
    now = _local_now(series)
    clean = ed.redact(text)[:1000]
    result = ed.extract(clean, now)
    # Optional AI refinement only for messages the rules already found relevant and only when time is unclear.
    if use_ai and ai_engine.available() and result.get("kind") == "activity" and result.get("time") is None:
        ai = await ai_engine.generate_json(
            "Extract the planned activity from MESSAGE. Return date as YYYY-MM-DD and time as HH:MM (24h) only "
            "if stated. Do not guess.",
            {"message": clean, "today": now.strftime("%Y-%m-%d"), "weekday": now.strftime("%A")},
            AIExtraction, temperature=0)
        if ai and ai.relevant and ai.time:
            result["time"], result["time_precision"] = ai.time, "ai_extracted"
    return result


def assess_event(event: dict[str, Any], series: dict[str, Any], audience: str = "general") -> dict[str, Any]:
    """Assess forecast conditions for an extracted activity. Deterministic."""
    times, pm, now_i = series["times"], series["hourly"]["pm2_5"], series["now_index"]
    date = event.get("date")
    hhmm = event.get("time") or "10:00"
    target = f"{date}T{hhmm[:2]}"
    idx = next((i for i, t in enumerate(times) if t[:13] == target), None)
    if idx is None:
        return {"level": "unknown", "summary": "The event time is outside the available forecast range.",
                "respond": False, "confidence": "low"}
    duration = int(event.get("duration_hours") or 1)
    vals = [v for v in pm[idx: idx + duration] if v is not None]
    if not vals:
        return {"level": "unknown", "summary": "No forecast values for the event time.", "respond": False,
                "confidence": "low"}
    conc = round(mean(vals), 1)
    sub = pa.sub_index("pm2_5", conc) or 0
    cat = pa.category_for(sub) or {}
    hours_ahead = idx - now_i
    is_forecast = hours_ahead > 0
    conf = "medium" if hours_ahead <= 24 else "low"
    intensity = event.get("intensity", "moderate")
    thresholds = SENSITIVE_THRESHOLD if audience in ("school", "sensitive") else RISK_THRESHOLD_SUBINDEX
    outdoor = event.get("outdoor") is not False
    warrants = outdoor and sub >= thresholds.get(intensity, 201)

    # Best alternative window on the same day (daytime only).
    day_idx = [i for i, t in enumerate(times) if t.startswith(date or "") and i >= now_i]
    alt = None
    if day_idx:
        start, end = day_idx[0], day_idx[-1] + 1
        windows = pa.best_windows(times[start:end], pm[start:end], duration)  # type: ignore[arg-type]
        if windows and windows[0]["mean"] < conc * 0.8:
            alt = {"start": times[start + windows[0]["start_index"]], "mean_pm2_5": windows[0]["mean"]}
    when = "Forecast" if is_forecast else "Current estimate"
    summary = (f"{when} for {event.get('title', 'the activity').lower()} on {date} around {hhmm}: PM2.5 about "
               f"{conc} µg/m³ (sub-index {sub}, {cat.get('label', 'n/a')}).")
    level = pa.severity_level(sub)
    action = ("Consider moving strenuous outdoor activity indoors or rescheduling it."
              if intensity == "high" else "Consider shortening outdoor time or moving the activity indoors.")
    alternative = (f"A cleaner window that day is around {alt['start'][11:16]} (forecast PM2.5 about "
                   f"{alt['mean_pm2_5']} µg/m³)." if alt else "Check the latest conditions before the event.")
    benefit = (f"Moving to the cleaner window lowers expected PM2.5 exposure by about "
               f"{round((conc - alt['mean_pm2_5']) / conc * 100)}% for participants." if alt else
               "Indoor activity avoids most of the outdoor exposure.")
    return {"level": level, "sub_index": sub, "forecast_pm2_5": conc, "category": cat.get("key"),
            "category_label": cat.get("label"), "event_time": f"{date}T{hhmm}", "hours_ahead": hours_ahead,
            "summary": summary, "action": action, "alternative": alternative, "benefit": benefit,
            "best_alternative": alt, "confidence": conf, "respond": warrants}


def advisory_text(event: dict[str, Any], risk: dict[str, Any]) -> str:
    if event.get("kind") == "concern" and event.get("concern_type") == "open_burning":
        return ("🌫️ AIRenv: Burning waste or leaves adds smoke close to homes and is prohibited under the Solid Waste "
                "Management Rules, 2016. Safer options: segregate waste for municipal collection, compost leaves "
                "and garden waste, or request an extra pickup from the local body.")
    alternative = risk["alternative"] if risk.get("best_alternative") else ""
    return (f"🌫️ AIRenv advisory: {risk['summary']} {risk['action']} {alternative} "
            "Forecasts are estimates; check the latest conditions before the event.").replace("  ", " ")


async def process_message(text: str, series: dict[str, Any], audience: str = "general",
                          use_ai: bool = True) -> dict[str, Any]:
    """Full pipeline: redact → extract → assess → decide. Returns only structured data."""
    event = await extract_event(text, series, use_ai=use_ai)
    if not event.get("relevant"):
        return {"relevant": False, "event": None, "risk": None, "respond": False, "advisory": None}
    if event["kind"] == "concern":
        risk = {"level": "concern", "summary": "Open burning was discussed in the group.", "respond": True,
                "confidence": "high"}
        return {"relevant": True, "event": event, "risk": risk, "respond": True,
                "advisory": advisory_text(event, risk)}
    if event["kind"] != "activity":
        return {"relevant": True, "event": event, "risk": None, "respond": False, "advisory": None}
    risk = assess_event(event, series, audience)
    return {"relevant": True, "event": event, "risk": risk, "respond": risk.get("respond", False),
            "advisory": advisory_text(event, risk) if risk.get("respond") else None}
