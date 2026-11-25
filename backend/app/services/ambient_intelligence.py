"""Ambient Environmental Intelligence: builds a validated environmental bundle per location.

A bundle combines the air-quality model series, weather, deterministic analysis,
freshness and confidence. Bundles are cached in memory and persisted so a stale
copy can be shown (clearly flagged) when providers are down.
"""
from __future__ import annotations

import asyncio
import logging
import time
from datetime import UTC, datetime, timedelta, timezone
from typing import Any

from app.core.http import UpstreamError
from app.db.store import get_store
from app.services import environmental_data as env
from app.services import pollution_analyzer as pa
from app.services import weather_service as weather
from app.services.location_service import Location

log = logging.getLogger("airenv.ambient")

CACHE_TTL_SECONDS = 600
_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_locks: dict[str, asyncio.Lock] = {}


def _offset_str(seconds: int) -> str:
    sign = "+" if seconds >= 0 else "-"
    seconds = abs(seconds)
    return f"{sign}{seconds // 3600:02d}:{(seconds % 3600) // 60:02d}"


def _to_aware(local_iso: str | None, offset_seconds: int) -> datetime | None:
    if not local_iso:
        return None
    try:
        naive = datetime.fromisoformat(local_iso)
    except ValueError:
        return None
    return naive.replace(tzinfo=timezone(timedelta(seconds=offset_seconds)))


def freshness(observed: datetime | None, now: datetime | None = None) -> dict[str, Any]:
    now = now or datetime.now(UTC)
    if observed is None:
        return {"age_minutes": None, "status": "unknown"}
    age = max(0, int((now - observed).total_seconds() // 60))
    status = "fresh" if age <= 90 else "aging" if age <= 180 else "stale"
    return {"age_minutes": age, "status": status}


def _now_index(times: list[str], current_time: str | None) -> int:
    if not times:
        return 0
    if current_time:
        prefix = current_time[:13]
        for i, t in enumerate(times):
            if t[:13] == prefix:
                return i
    return len(times) // 2


def _align(weather_hourly: dict[str, list[Any]], aq_times: list[str], key: str) -> list[Any]:
    wtimes = weather_hourly.get("time") or []
    lookup = dict(zip(wtimes, weather_hourly.get(key) or [], strict=False))
    return [lookup.get(t) for t in aq_times]


def confidence(source_type: str, fresh: dict[str, Any], station_check: dict[str, Any] | None,
               naqi_valid: bool) -> dict[str, Any]:
    score = 0.6 if source_type == "model" else 0.8 if source_type == "station" else 0.2
    reasons: list[str] = []
    if source_type == "model":
        reasons.append("Based on a regional atmospheric model (CAMS), not a nearby ground monitor.")
    if source_type == "demo":
        reasons.append("Sample data: not suitable for decisions.")
    if fresh["status"] == "aging":
        score -= 0.1
        reasons.append("Latest reading is more than 90 minutes old.")
    elif fresh["status"] in ("stale", "unknown"):
        score -= 0.25
        reasons.append("Data is stale or its time is unknown.")
    if not naqi_valid:
        score -= 0.1
        reasons.append("Not enough pollutants or hours for a complete NAQI calculation.")
    if station_check and station_check.get("status") == "agrees":
        score += 0.2
        reasons.append(f"Nearby reference monitor ({station_check['station']}) agrees within "
                       f"{station_check['difference_pct']}%.")
    elif station_check and station_check.get("status") == "disagrees":
        score -= 0.15
        reasons.append(f"Nearby reference monitor ({station_check['station']}) differs by "
                       f"{station_check['difference_pct']}%; local conditions may vary.")
    score = max(0.05, min(0.95, score))
    level = "high" if score >= 0.75 else "medium" if score >= 0.5 else "low"
    return {"level": level, "score": round(score, 2), "reasons": reasons}


def _station_check(pm25_model: float | None, stations: list[dict[str, Any]]) -> dict[str, Any] | None:
    refs = [s for s in stations if s.get("station_type") == "reference" and "pm2_5" in s["readings"]
            and s["distance_km"] <= 10]
    if not refs or pm25_model is None:
        return None
    nearest = refs[0]
    measured = nearest["readings"]["pm2_5"]["value"]
    if measured <= 0:
        return None
    diff = abs(pm25_model - measured) / measured * 100
    return {"status": "agrees" if diff <= 35 else "disagrees", "station": nearest["name"],
            "provider": nearest["provider"], "measured_pm2_5": measured, "difference_pct": round(diff),
            "observed_at": nearest.get("observed_at"), "distance_km": nearest["distance_km"]}


def build_bundle(location: Location, aq: dict[str, Any], wx: dict[str, Any] | None,
                 stations: list[dict[str, Any]] | None = None, is_demo: bool = False) -> dict[str, Any]:
    times: list[str] = aq["times"]
    hourly = aq["hourly"]
    offset = aq.get("utc_offset_seconds") or (wx or {}).get("utc_offset_seconds") or 0
    now_i = _now_index(times, aq.get("current_time"))

    history = {p: hourly.get(p, [])[: now_i + 1] for p in pa.BREAKPOINTS}
    naqi = pa.compute_naqi(history)
    aqi_series = pa.hourly_aqi_series({p: hourly.get(p, []) for p in pa.BREAKPOINTS}, times)

    wx_hourly = (wx or {}).get("hourly") or {}
    wind_series = _align(wx_hourly, times, "wind_speed_10m")
    blh_series = _align(wx_hourly, times, "boundary_layer_height")
    temp_series = _align(wx_hourly, times, "temperature_2m")
    rh_series = _align(wx_hourly, times, "relative_humidity_2m")

    current = aq["current"]
    pollutants = {}
    for p in pa.BREAKPOINTS:
        avg = naqi["averages"].get(p)
        pollutants[p] = {
            "label": pa.POLLUTANT_LABELS[p],
            "value": current.get(p),
            "unit": env.UNITS[p],
            "average": avg,
            "sub_index": naqi["sub_indices"].get(p),
            "who_24h_guideline": pa.WHO_24H_GUIDELINE.get(p),
        }

    observed = _to_aware(aq.get("current_time"), offset)
    fresh = freshness(observed) if not is_demo else {"age_minutes": None, "status": "demo"}
    pm_series = hourly.get("pm2_5", [])
    tr = pa.trend(pm_series[: now_i + 1], window=3)
    outlook12 = pa.forecast_outlook(current.get("pm2_5"), pm_series[now_i + 1:], hours=12)
    outlook24 = pa.forecast_outlook(current.get("pm2_5"), pm_series[now_i + 1:], hours=24)
    wx_current = dict((wx or {}).get("current") or {})
    wx_current["boundary_layer_m"] = blh_series[now_i] if now_i < len(blh_series) else None
    disp = pa.dispersion(wx_current.get("wind_speed_kmh"), wx_current.get("boundary_layer_m"))
    stations = stations or []
    check = _station_check(current.get("pm2_5"), stations)
    conf = confidence("demo" if is_demo else aq["source"]["type"], fresh, check, naqi["valid"])

    snapshot = {
        "location": location.model_dump(),
        "is_demo": is_demo,
        "status": "demo" if is_demo else ("stale" if fresh["status"] == "stale" else "live"),
        "observed_at": observed.isoformat() if observed else None,
        "observed_local": aq.get("current_time"),
        "fetched_at": datetime.now(UTC).isoformat(),
        "timezone": aq.get("timezone"),
        "utc_offset": _offset_str(offset),
        "aqi": naqi,
        "us_aqi": current.get("us_aqi"),
        "pollutants": pollutants,
        "weather": wx_current if wx else None,
        "sources": {"air": aq["source"], "weather": (wx or {}).get("source")},
        "grid": aq.get("grid"),
        "freshness": fresh,
        "analysis": {
            "severity": pa.severity_level(naqi["value"]),
            "trend_pm2_5": tr,
            "outlook_12h": outlook12,
            "outlook_24h": outlook24,
            "dispersion": disp,
            "station_check": check,
            "confidence": conf,
            "health_statement": (naqi["category"] or {}).get("health"),
            "health_source": pa.HEALTH_SOURCE,
        },
        "errors": [],
    }
    series = {
        "location_id": location.id,
        "is_demo": is_demo,
        "times": times,
        "now_index": now_i,
        "utc_offset": _offset_str(offset),
        "hourly": {**{p: hourly.get(p, []) for p in [*pa.BREAKPOINTS, "us_aqi"]}, "aqi_in": aqi_series},
        "weather": {"wind_speed_kmh": wind_series, "boundary_layer_m": blh_series,
                    "temperature_c": temp_series, "humidity_pct": rh_series},
        "sources": snapshot["sources"],
    }
    return {"snapshot": snapshot, "series": series}


async def get_bundle(location: Location, *, force: bool = False, allow_demo: bool = False,
                     stations: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    """Return the environmental bundle, refreshing from providers when the cache has expired."""
    key = location.id
    hit = _cache.get(key)
    if hit and not force and time.time() - hit[0] < CACHE_TTL_SECONDS:
        return hit[1]
    lock = _locks.setdefault(key, asyncio.Lock())
    async with lock:
        hit = _cache.get(key)
        if hit and not force and time.time() - hit[0] < CACHE_TTL_SECONDS:
            return hit[1]
        errors: list[dict[str, str]] = []
        aq_res, wx_res = await asyncio.gather(
            env.fetch_air_quality(location.lat, location.lon),
            weather.fetch_weather(location.lat, location.lon),
            return_exceptions=True,
        )
        if isinstance(wx_res, Exception):
            errors.append({"provider": "Open-Meteo Weather", "message": str(wx_res)})
            wx_res = None
        if isinstance(aq_res, Exception):
            errors.append({"provider": "Open-Meteo Air Quality", "message": str(aq_res)})
            stored = await get_store().get("bundles", key)
            if stored:
                stored["snapshot"]["status"] = "stale"
                stored["snapshot"]["errors"] = errors
                stored["snapshot"]["freshness"] = freshness(
                    datetime.fromisoformat(stored["snapshot"]["observed_at"])
                    if stored["snapshot"].get("observed_at") else None)
                stored.pop("id", None)
                return stored
            if allow_demo:
                now_local = datetime.now(timezone(timedelta(hours=5, minutes=30))).replace(tzinfo=None)
                bundle = build_bundle(location, env.demo_air_quality(now_local), None, is_demo=True)
                bundle["snapshot"]["errors"] = errors
                return bundle
            raise UpstreamError("Open-Meteo Air Quality", "live air-quality data is currently unavailable")
        bundle = build_bundle(location, aq_res, wx_res, stations=stations)
        bundle["snapshot"]["errors"] = errors
        _cache[key] = (time.time(), bundle)
        try:
            await get_store().set("bundles", key, bundle)
        except Exception as exc:  # storage problems must not break live data
            log.error("Failed to persist bundle: %s", exc)
        return bundle


def cached_bundle(location_id: str) -> dict[str, Any] | None:
    hit = _cache.get(location_id)
    return hit[1] if hit else None


def clear_cache() -> None:
    _cache.clear()
