"""Historical storage and comparisons.

Two sources of history are combined and always labelled separately:
- `model_history`: past days of the CAMS model series returned by Open-Meteo.
- `recorded_history`: hourly snapshots AIRenv itself recorded during scheduled refreshes.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime, timedelta
from statistics import mean
from typing import Any

from app.db.store import get_store


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
    await store.set("history", doc_id, {
        "location_id": loc_id,
        "hour": snapshot["observed_local"][:13] + ":00",
        "recorded_at": datetime.now(UTC).isoformat(),
        "aqi_in": snapshot["aqi"].get("value"),
        "us_aqi": snapshot.get("us_aqi"),
        "pm2_5": p["pm2_5"]["value"],
        "pm10": p["pm10"]["value"],
        "no2": p["no2"]["value"],
        "temperature_c": (snapshot.get("weather") or {}).get("temperature_c"),
        "wind_speed_kmh": (snapshot.get("weather") or {}).get("wind_speed_kmh"),
        "source_type": snapshot["sources"]["air"]["type"],
    })
    return not existed


async def recorded_history(location_id: str, limit: int = 24 * 30) -> list[dict[str, Any]]:
    rows = await get_store().query("history", [("location_id", "==", location_id)])
    rows.sort(key=lambda r: r["hour"])
    return rows[-limit:]


def comparisons(series: dict[str, Any]) -> dict[str, Any]:
    times: list[str] = series["times"]
    now_i: int = series["now_index"]
    pm = series["hourly"]["pm2_5"]
    aqi = series["hourly"]["aqi_in"]

    def at(arr: list[Any], i: int) -> Any:
        return arr[i] if 0 <= i < len(arr) else None

    yesterday = at(pm, now_i - 24)
    week_ago = at(pm, now_i - 24 * 7)
    past = [v for v in pm[max(0, now_i - 24 * 7): now_i + 1] if v is not None]

    daily: dict[str, list[float]] = defaultdict(list)
    daily_aqi: dict[str, list[int]] = defaultdict(list)
    by_hour: dict[int, list[float]] = defaultdict(list)
    for i in range(now_i + 1):
        if pm[i] is None:
            continue
        day = times[i][:10]
        daily[day].append(pm[i])
        if aqi[i] is not None:
            daily_aqi[day].append(aqi[i])
        by_hour[int(times[i][11:13])].append(pm[i])

    daily_rows = [{"date": d, "pm2_5_mean": round(mean(v), 1), "pm2_5_max": round(max(v), 1),
                   "aqi_mean": round(mean(daily_aqi[d])) if daily_aqi[d] else None, "hours": len(v)}
                  for d, v in sorted(daily.items())]
    profile = [{"hour": h, "pm2_5_mean": round(mean(v), 1)} for h, v in sorted(by_hour.items())]
    daytime = [r for r in profile if 6 <= r["hour"] <= 20]
    cleanest = sorted(daytime, key=lambda r: r["pm2_5_mean"])[:3]
    current = at(pm, now_i)

    def pct(a: float | None, b: float | None) -> float | None:
        return round((a - b) / b * 100, 1) if a is not None and b else None

    return {
        "basis": "CAMS model history from Open-Meteo (past 7 days)",
        "current_pm2_5": current,
        "vs_yesterday_same_hour": {"value": yesterday, "change_pct": pct(current, yesterday)},
        "vs_week_ago_same_hour": {"value": week_ago, "change_pct": pct(current, week_ago)},
        "seven_day_mean": round(mean(past), 1) if past else None,
        "vs_seven_day_mean_pct": pct(current, mean(past)) if past else None,
        "daily": daily_rows,
        "hour_of_day_profile": profile,
        "typically_cleanest_daytime_hours": cleanest,
    }


async def prune(retention_days: int) -> int:
    cutoff = (datetime.now(UTC) - timedelta(days=retention_days)).isoformat()
    store = get_store()
    old = await store.query("history", [("recorded_at", "<", cutoff)])
    for row in old:
        await store.delete("history", row["id"])
    return len(old)
