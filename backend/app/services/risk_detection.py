"""Rule-based risk detection over validated environmental bundles (no AI involved)."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from app.services import pollution_analyzer as pa
from app.services.pollution_analyzer import Severity

SEVERITY_ORDER = {"info": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}
SENSITIVE_MEMBER_KEYS = ("children", "older_adults", "respiratory_or_heart_condition", "pregnancy", "outdoor_workers")

# PM2.5 change (%) over the trend window that triggers an alert, a positive note, or a feed event.
DETERIORATION_RISE_PCT = 25
IMPROVEMENT_FALL_PCT = -30
FEED_RISE_PCT = 20

Signal = dict[str, Any]


def bump(severity: str) -> str:
    order = list(SEVERITY_ORDER)
    return order[min(SEVERITY_ORDER[severity] + 1, len(order) - 2)]  # never auto-escalate to critical


def has_sensitive_members(profile: dict[str, Any] | None) -> bool:
    fc = (profile or {}).get("family_context") or {}
    return any(fc.get(k) for k in SENSITIVE_MEMBER_KEYS)


def _local(snapshot: dict[str, Any], end: int) -> str:
    """Prefix of the local observation time: 10 = date, 13 = date and hour."""
    return (snapshot.get("observed_local") or "")[:end]


# ----------------------------------------------------------------------------- user alerts


def _critical_signal(snapshot: dict[str, Any], _series: dict[str, Any], sensitive: bool) -> Signal | None:
    aqi = snapshot["aqi"].get("value")
    cat = snapshot["aqi"].get("category") or {}
    rank = cat.get("severity", 0)
    if aqi is None or rank < Severity.VERY_POOR:
        return None
    loc = snapshot["location"]
    return {
        "key": f"critical:{loc['id']}:{cat['key']}:{_local(snapshot, 10)}",
        "category": "critical",
        "severity": "critical" if rank == Severity.SEVERE else "high",
        "title": f"{cat['label']} air quality in {loc['name']}",
        "message": (
            f"Estimated NAQI {aqi} ({cat['label']}), driven by {snapshot['aqi'].get('dominant_label')}. "
            f"{cat['health']} Limit time outdoors and avoid strenuous outdoor activity."
        ),
        "data": {"aqi": aqi, "pm2_5": snapshot["pollutants"]["pm2_5"]["value"], "category": cat["key"]},
    }


def _deterioration_signal(snapshot: dict[str, Any], _series: dict[str, Any], sensitive: bool) -> Signal | None:
    rank = (snapshot["aqi"].get("category") or {}).get("severity", 0)
    tr = snapshot["analysis"].get("trend_pm2_5") or {}
    rising = tr.get("direction") == "rising" and (tr.get("change_pct") or 0) >= DETERIORATION_RISE_PCT
    if not rising or rank < Severity.MODERATE:
        return None
    sev = "high" if rank >= Severity.POOR else "medium"
    return {
        "key": f"deterioration:{snapshot['location']['id']}:{_local(snapshot, 10)}:"
        f"{(snapshot.get('observed_local') or '')[11:13]}",
        "category": "deterioration",
        "severity": bump(sev) if sensitive else sev,
        "title": "PM2.5 is rising",
        "message": (
            f"PM2.5 averaged {tr['recent_mean']} µg/m³ over the last {tr['window_hours']} hours, "
            f"up {tr['change_pct']}% from the {tr['window_hours']} hours before."
        ),
        "data": tr,
    }


def _forecast_signal(snapshot: dict[str, Any], series: dict[str, Any], sensitive: bool) -> Signal | None:
    out = snapshot["analysis"].get("outlook_12h") or {}
    if out.get("peak") is None:
        return None
    rank = (snapshot["aqi"].get("category") or {}).get("severity", 0)
    peak_idx = pa.sub_index("pm2_5", out["peak"])
    peak_cat = pa.category_for(peak_idx) or {}
    peak_rank = peak_cat.get("severity", 0)
    if peak_rank < Severity.POOR or peak_rank <= rank or out.get("direction") != "worsening":
        return None
    ni = series["now_index"]
    peak_time = series["times"][ni + 1 + out["peak_index"]] if out.get("peak_index") is not None else None
    sev = "high" if peak_rank >= Severity.VERY_POOR else "medium"
    return {
        "key": f"forecast:{snapshot['location']['id']}:{peak_cat['key']}:{(peak_time or '')[:13]}",
        "category": "forecast",
        "severity": bump(sev) if sensitive else sev,
        "title": f"Forecast: conditions may reach {peak_cat['label']}",
        "message": (
            f"The model forecast shows PM2.5 peaking near {out['peak']} µg/m³ around "
            f"{(peak_time or '')[11:16]} (PM2.5 sub-index {peak_idx}). Forecasts are estimates "
            "and can change."
        ),
        "data": {"peak_pm2_5": out["peak"], "peak_time": peak_time, "peak_sub_index": peak_idx},
    }


def _positive_signal(snapshot: dict[str, Any], _series: dict[str, Any], sensitive: bool) -> Signal | None:
    aqi = snapshot["aqi"].get("value")
    cat = snapshot["aqi"].get("category") or {}
    tr = snapshot["analysis"].get("trend_pm2_5") or {}
    falling = tr.get("direction") == "falling" and (tr.get("change_pct") or 0) <= IMPROVEMENT_FALL_PCT
    if not falling or cat.get("severity", 0) > Severity.MODERATE or not aqi:
        return None
    return {
        "key": f"positive:{snapshot['location']['id']}:{_local(snapshot, 10)}:{cat.get('key')}",
        "category": "positive",
        "severity": "info",
        "title": "Air quality is improving",
        "message": (
            f"PM2.5 fell {abs(tr['change_pct'])}% over the last few hours. Estimated NAQI is now "
            f"{aqi} ({cat.get('label')})."
        ),
        "data": tr,
    }


SIGNAL_RULES: tuple[Callable[[dict[str, Any], dict[str, Any], bool], Signal | None], ...] = (
    _critical_signal,
    _deterioration_signal,
    _forecast_signal,
    _positive_signal,
)


def detect(
    snapshot: dict[str, Any], series: dict[str, Any], profile: dict[str, Any] | None = None
) -> list[dict[str, Any]]:
    if snapshot.get("is_demo"):
        return []
    sensitive = has_sensitive_members(profile)
    return [sig for rule in SIGNAL_RULES if (sig := rule(snapshot, series, sensitive)) is not None]


# ----------------------------------------------------------------------------- live feed


def _monitoring_started(new: dict[str, Any]) -> dict[str, Any]:
    loc = new["location"]
    cat = new["aqi"].get("category") or {}
    return {
        "type": "monitoring_started",
        "severity": "info",
        "title": f"Monitoring started for {loc['name']}",
        "detail": f"Estimated NAQI {new['aqi'].get('value')} ({cat.get('label', 'n/a')}). "
        f"Source: {new['sources']['air']['name']}.",
        "dedup": f"start:{loc['id']}",
    }


def _category_change(prev: dict[str, Any], new: dict[str, Any]) -> dict[str, Any] | None:
    prev_cat = (prev.get("aqi") or {}).get("category") or {}
    new_cat = new["aqi"].get("category") or {}
    if not (prev_cat and new_cat and prev_cat.get("key") != new_cat.get("key")):
        return None
    worse = new_cat["severity"] > prev_cat["severity"]
    return {
        "type": "category_change",
        "severity": "medium" if worse else "info",
        "title": f"Air quality {'worsened' if worse else 'improved'} to {new_cat['label']}",
        "detail": f"Estimated NAQI moved from {prev['aqi'].get('value')} ({prev_cat['label']}) to "
        f"{new['aqi'].get('value')} ({new_cat['label']}).",
        "dedup": f"cat:{new['location']['id']}:{new_cat['key']}:{_local(new, 13)}",
    }


def _pollution_increase(_prev: dict[str, Any], new: dict[str, Any]) -> dict[str, Any] | None:
    tr = new["analysis"].get("trend_pm2_5") or {}
    if tr.get("direction") != "rising" or (tr.get("change_pct") or 0) < FEED_RISE_PCT:
        return None
    return {
        "type": "pollution_increase",
        "severity": "medium",
        "title": "Pollution levels increased",
        "detail": f"PM2.5 up {tr['change_pct']}% over the last {tr['window_hours']} hours "
        f"({tr['prior_mean']} → {tr['recent_mean']} µg/m³).",
        "dedup": f"rise:{new['location']['id']}:{_local(new, 13)}",
    }


def _forecast_deterioration(prev: dict[str, Any], new: dict[str, Any]) -> dict[str, Any] | None:
    out = new["analysis"].get("outlook_12h") or {}
    prev_out = (prev.get("analysis") or {}).get("outlook_12h") or {}
    if out.get("direction") != "worsening" or prev_out.get("direction") == "worsening":
        return None
    return {
        "type": "forecast_deterioration",
        "severity": "medium",
        "title": "Forecast indicates deteriorating conditions",
        "detail": f"Model forecast PM2.5 averages {out['mean']} µg/m³ over the next {out['hours']} hours, "
        f"peaking near {out['peak']} µg/m³.",
        "dedup": f"fc:{new['location']['id']}:{_local(new, 13)}",
    }


def _poor_dispersion(prev: dict[str, Any], new: dict[str, Any]) -> dict[str, Any] | None:
    disp = new["analysis"].get("dispersion") or {}
    prev_disp = (prev.get("analysis") or {}).get("dispersion") or {}
    if disp.get("level") != "poor" or prev_disp.get("level") == "poor":
        return None
    return {
        "type": "poor_dispersion",
        "severity": "low",
        "title": "Weather is trapping pollution",
        "detail": disp["explanation"],
        "dedup": f"disp:{new['location']['id']}:{_local(new, 10)}",
    }


def _source_recovered(prev: dict[str, Any], new: dict[str, Any]) -> dict[str, Any] | None:
    if not prev.get("errors") or new.get("errors"):
        return None
    return {
        "type": "source_recovered",
        "severity": "info",
        "title": "Live data restored",
        "detail": "Environmental data providers are responding again.",
        "dedup": f"rec:{new['location']['id']}:{_local(new, 13)}",
    }


FEED_RULES: tuple[Callable[[dict[str, Any], dict[str, Any]], dict[str, Any] | None], ...] = (
    _category_change,
    _pollution_increase,
    _forecast_deterioration,
    _poor_dispersion,
    _source_recovered,
)


def feed_events(prev: dict[str, Any] | None, new: dict[str, Any]) -> list[dict[str, Any]]:
    """Events for the live intelligence feed, derived from consecutive snapshots."""
    if new.get("is_demo"):
        return []
    if prev is None:
        return [_monitoring_started(new)]
    return [ev for rule in FEED_RULES if (ev := rule(prev, new)) is not None]
