"""Rule-based risk detection over validated environmental bundles (no AI involved)."""
from __future__ import annotations

from typing import Any

from app.services import pollution_analyzer as pa

SEVERITY_ORDER = {"info": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}


def bump(severity: str) -> str:
    order = list(SEVERITY_ORDER)
    return order[min(SEVERITY_ORDER[severity] + 1, len(order) - 2)]  # never auto-escalate to critical


def has_sensitive_members(profile: dict[str, Any] | None) -> bool:
    fc = (profile or {}).get("family_context") or {}
    return any(fc.get(k) for k in ("children", "older_adults", "respiratory_or_heart_condition", "pregnancy",
                                   "outdoor_workers"))


def detect(snapshot: dict[str, Any], series: dict[str, Any], profile: dict[str, Any] | None = None
           ) -> list[dict[str, Any]]:
    if snapshot.get("is_demo"):
        return []
    signals: list[dict[str, Any]] = []
    loc = snapshot["location"]
    aqi = snapshot["aqi"].get("value")
    cat = snapshot["aqi"].get("category") or {}
    sev_rank = cat.get("severity", 0)
    analysis = snapshot["analysis"]
    day = (snapshot.get("observed_local") or "")[:10]
    sensitive = has_sensitive_members(profile)
    pm = snapshot["pollutants"]["pm2_5"]["value"]
    dom = snapshot["aqi"].get("dominant_label")

    if aqi is not None and sev_rank >= 4:
        signals.append({
            "key": f"critical:{loc['id']}:{cat['key']}:{day}",
            "category": "critical",
            "severity": "critical" if sev_rank == 5 else "high",
            "title": f"{cat['label']} air quality in {loc['name']}",
            "message": (f"Estimated NAQI {aqi} ({cat['label']}), driven by {dom}. {cat['health']} "
                        "Limit time outdoors and avoid strenuous outdoor activity."),
            "data": {"aqi": aqi, "pm2_5": pm, "category": cat["key"]},
        })

    tr = analysis.get("trend_pm2_5") or {}
    if tr.get("direction") == "rising" and (tr.get("change_pct") or 0) >= 25 and sev_rank >= 2:
        sev = "high" if sev_rank >= 3 else "medium"
        signals.append({
            "key": f"deterioration:{loc['id']}:{day}:{(snapshot.get('observed_local') or '')[11:13]}",
            "category": "deterioration",
            "severity": bump(sev) if sensitive else sev,
            "title": "PM2.5 is rising",
            "message": (f"PM2.5 averaged {tr['recent_mean']} µg/m³ over the last {tr['window_hours']} hours, "
                        f"up {tr['change_pct']}% from the {tr['window_hours']} hours before."),
            "data": tr,
        })

    out = analysis.get("outlook_12h") or {}
    if out.get("peak") is not None:
        peak_idx = pa.sub_index("pm2_5", out["peak"])
        peak_cat = pa.category_for(peak_idx) or {}
        if peak_cat.get("severity", 0) >= 3 and peak_cat.get("severity", 0) > sev_rank \
                and out.get("direction") == "worsening":
            ni = series["now_index"]
            peak_time = series["times"][ni + 1 + out["peak_index"]] if out.get("peak_index") is not None else None
            sev = "high" if peak_cat["severity"] >= 4 else "medium"
            signals.append({
                "key": f"forecast:{loc['id']}:{peak_cat['key']}:{(peak_time or '')[:13]}",
                "category": "forecast",
                "severity": bump(sev) if sensitive else sev,
                "title": f"Forecast: conditions may reach {peak_cat['label']}",
                "message": (f"The model forecast shows PM2.5 peaking near {out['peak']} µg/m³ around "
                            f"{(peak_time or '')[11:16]} (PM2.5 sub-index {peak_idx}). Forecasts are estimates "
                            "and can change."),
                "data": {"peak_pm2_5": out["peak"], "peak_time": peak_time, "peak_sub_index": peak_idx},
            })

    if tr.get("direction") == "falling" and (tr.get("change_pct") or 0) <= -30 and sev_rank <= 2 and aqi:
        signals.append({
            "key": f"positive:{loc['id']}:{day}:{cat.get('key')}",
            "category": "positive",
            "severity": "info",
            "title": "Air quality is improving",
            "message": (f"PM2.5 fell {abs(tr['change_pct'])}% over the last few hours. Estimated NAQI is now "
                        f"{aqi} ({cat.get('label')})."),
            "data": tr,
        })
    return signals


def feed_events(prev: dict[str, Any] | None, new: dict[str, Any]) -> list[dict[str, Any]]:
    """Events for the live intelligence feed, derived from consecutive snapshots."""
    events: list[dict[str, Any]] = []
    loc = new["location"]
    new_cat = new["aqi"].get("category") or {}
    if new.get("is_demo"):
        return events
    if prev is None:
        events.append({
            "type": "monitoring_started", "severity": "info",
            "title": f"Monitoring started for {loc['name']}",
            "detail": f"Estimated NAQI {new['aqi'].get('value')} ({new_cat.get('label', 'n/a')}). "
                      f"Source: {new['sources']['air']['name']}.",
            "dedup": f"start:{loc['id']}",
        })
        return events
    prev_cat = (prev.get("aqi") or {}).get("category") or {}
    if prev_cat and new_cat and prev_cat.get("key") != new_cat.get("key"):
        worse = new_cat["severity"] > prev_cat["severity"]
        events.append({
            "type": "category_change", "severity": "medium" if worse else "info",
            "title": f"Air quality {'worsened' if worse else 'improved'} to {new_cat['label']}",
            "detail": f"Estimated NAQI moved from {prev['aqi'].get('value')} ({prev_cat['label']}) to "
                      f"{new['aqi'].get('value')} ({new_cat['label']}).",
            "dedup": f"cat:{loc['id']}:{new_cat['key']}:{(new.get('observed_local') or '')[:13]}",
        })
    tr = new["analysis"].get("trend_pm2_5") or {}
    if tr.get("direction") == "rising" and (tr.get("change_pct") or 0) >= 20:
        events.append({
            "type": "pollution_increase", "severity": "medium",
            "title": "Pollution levels increased",
            "detail": f"PM2.5 up {tr['change_pct']}% over the last {tr['window_hours']} hours "
                      f"({tr['prior_mean']} → {tr['recent_mean']} µg/m³).",
            "dedup": f"rise:{loc['id']}:{(new.get('observed_local') or '')[:13]}",
        })
    out = new["analysis"].get("outlook_12h") or {}
    prev_out = (prev.get("analysis") or {}).get("outlook_12h") or {}
    if out.get("direction") == "worsening" and prev_out.get("direction") != "worsening":
        events.append({
            "type": "forecast_deterioration", "severity": "medium",
            "title": "Forecast indicates deteriorating conditions",
            "detail": f"Model forecast PM2.5 averages {out['mean']} µg/m³ over the next {out['hours']} hours, "
                      f"peaking near {out['peak']} µg/m³.",
            "dedup": f"fc:{loc['id']}:{(new.get('observed_local') or '')[:13]}",
        })
    disp = new["analysis"].get("dispersion") or {}
    prev_disp = (prev.get("analysis") or {}).get("dispersion") or {}
    if disp.get("level") == "poor" and prev_disp.get("level") != "poor":
        events.append({
            "type": "poor_dispersion", "severity": "low",
            "title": "Weather is trapping pollution",
            "detail": disp["explanation"],
            "dedup": f"disp:{loc['id']}:{(new.get('observed_local') or '')[:10]}",
        })
    if prev.get("errors") and not new.get("errors"):
        events.append({"type": "source_recovered", "severity": "info", "title": "Live data restored",
                       "detail": "Environmental data providers are responding again.",
                       "dedup": f"rec:{loc['id']}:{(new.get('observed_local') or '')[:13]}"})
    return events
