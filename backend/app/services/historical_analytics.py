"""Historical storage and comparisons.

Two sources of history are combined and always labelled separately:
- `model_history`: past days of the CAMS model series returned by Open-Meteo.
- `recorded_history`: hourly snapshots AIRenv itself recorded during scheduled refreshes.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import timedelta
from statistics import mean
from typing import Any

from app.core.clock import utc_now, utc_now_iso
from app.db.store import get_store

HOURS_PER_DAY = 24
HOURS_PER_WEEK = 24 * 7
# Hours of the day (inclusive) considered for "typically cleanest daytime hours".
DAYTIME_FIRST_HOUR = 6
DAYTIME_LAST_HOUR = 20
CLEANEST_HOURS_SHOWN = 3


async def record_snapshot(snapshot: dict[str, Any]) -> bool:
    """Store one record per location per hour. Returns True when a new hour was recorded."""
    if snapshot.get("is_demo") or not snapshot.get("observed_local"):
        return False
    loc_id = snapshot["location"]["id"]
    hour_key = snapshot["observed_local"][:13].replace("-", "").replace("T", "")
    doc_id = f"{loc_id}_{hour_key}"
    store = get_store()
    existed = await store.get("history", doc_id) is not None
    p = snapshot["pollutants"]
    await store.set(
        "history",
        doc_id,
        {
            "location_id": loc_id,
            "hour": snapshot["observed_local"][:13] + ":00",
            "recorded_at": utc_now_iso(),
            "aqi_in": snapshot["aqi"].get("value"),
            "us_aqi": snapshot.get("us_aqi"),
            "pm2_5": p["pm2_5"]["value"],
            "pm10": p["pm10"]["value"],
            "no2": p["no2"]["value"],
            "temperature_c": (snapshot.get("weather") or {}).get("temperature_c"),
            "wind_speed_kmh": (snapshot.get("weather") or {}).get("wind_speed_kmh"),
            "source_type": snapshot["sources"]["air"]["type"],
        },
    )
    return not existed


async def recorded_history(location_id: str, limit: int = 24 * 30) -> list[dict[str, Any]]:
    rows = await get_store().query("history", [("location_id", "==", location_id)])
    rows.sort(key=lambda r: r["hour"])
    return rows[-limit:]


def _at(arr: list[Any], i: int) -> Any:
    return arr[i] if 0 <= i < len(arr) else None


def _pct(a: float | None, b: float | None) -> float | None:
    return round((a - b) / b * 100, 1) if a is not None and b else None


def _daily_rows(times: list[str], pm: list[Any], aqi: list[Any], now_i: int) -> list[dict[str, Any]]:
    """Per-day PM2.5 mean/max and NAQI mean for the hours up to now."""
    daily: dict[str, list[float]] = defaultdict(list)
    daily_aqi: dict[str, list[int]] = defaultdict(list)
    for i in range(now_i + 1):
        if pm[i] is None:
            continue
        day = times[i][:10]
        daily[day].append(pm[i])
        if aqi[i] is not None:
            daily_aqi[day].append(aqi[i])
    return [
        {
            "date": d,
            "pm2_5_mean": round(mean(v), 1),
            "pm2_5_max": round(max(v), 1),
            "aqi_mean": round(mean(daily_aqi[d])) if daily_aqi[d] else None,
            "hours": len(v),
        }
        for d, v in sorted(daily.items())
    ]


def _hour_of_day_profile(times: list[str], pm: list[Any], now_i: int) -> list[dict[str, Any]]:
    by_hour: dict[int, list[float]] = defaultdict(list)
    for i in range(now_i + 1):
        if pm[i] is not None:
            by_hour[int(times[i][11:13])].append(pm[i])
    return [{"hour": h, "pm2_5_mean": round(mean(v), 1)} for h, v in sorted(by_hour.items())]


def comparisons(series: dict[str, Any]) -> dict[str, Any]:
    times: list[str] = series["times"]
    now_i: int = series["now_index"]
    pm = series["hourly"]["pm2_5"]
    yesterday = _at(pm, now_i - HOURS_PER_DAY)
    week_ago = _at(pm, now_i - HOURS_PER_WEEK)
    past = [v for v in pm[max(0, now_i - HOURS_PER_WEEK) : now_i + 1] if v is not None]
    profile = _hour_of_day_profile(times, pm, now_i)
    daytime = [r for r in profile if DAYTIME_FIRST_HOUR <= r["hour"] <= DAYTIME_LAST_HOUR]
    current = _at(pm, now_i)
    return {
        "basis": "CAMS model history from Open-Meteo (past 7 days)",
        "current_pm2_5": current,
        "vs_yesterday_same_hour": {"value": yesterday, "change_pct": _pct(current, yesterday)},
        "vs_week_ago_same_hour": {"value": week_ago, "change_pct": _pct(current, week_ago)},
        "seven_day_mean": round(mean(past), 1) if past else None,
        "vs_seven_day_mean_pct": _pct(current, mean(past)) if past else None,
        "daily": _daily_rows(times, pm, series["hourly"]["aqi_in"], now_i),
        "hour_of_day_profile": profile,
        "typically_cleanest_daytime_hours": sorted(daytime, key=lambda r: r["pm2_5_mean"])[:CLEANEST_HOURS_SHOWN],
    }


async def prune(retention_days: int) -> int:
    cutoff = (utc_now() - timedelta(days=retention_days)).isoformat()
    store = get_store()
    old = await store.query("history", [("recorded_at", "<", cutoff)])
    for row in old:
        await store.delete("history", row["id"])
    return len(old)
