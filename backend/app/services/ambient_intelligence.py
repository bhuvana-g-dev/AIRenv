"""Ambient Environmental Intelligence: builds a validated environmental bundle per location.

A bundle combines the air-quality model series, weather, deterministic analysis,
freshness and confidence. Bundles are cached in memory and persisted so a stale
copy can be shown (clearly flagged) when providers are down.
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from app.core.clock import utc_now, utc_now_iso
from app.core.http import UpstreamError
from app.db.store import get_store
from app.services import environmental_data as env
from app.services import pollution_analyzer as pa
from app.services import weather_service as weather
from app.services.location_service import Location

log = logging.getLogger("airenv.ambient")

CACHE_TTL_SECONDS = 600
# Reading age (minutes) up to which data counts as fresh, then aging; older is stale.
FRESH_MINUTES = 90
AGING_MINUTES = 180
# Confidence score bands.
HIGH_CONFIDENCE = 0.75
MEDIUM_CONFIDENCE = 0.5
# A reference monitor within this distance "agrees" with the model when PM2.5 differs by at most this much.
STATION_CHECK_RADIUS_KM = 10
STATION_AGREEMENT_PCT = 35
# Demo data is shown in Indian Standard Time.
IST = timezone(timedelta(hours=5, minutes=30))

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
    now = now or utc_now()
    if observed is None:
        return {"age_minutes": None, "status": "unknown"}
    age = max(0, int((now - observed).total_seconds() // 60))
    status = "fresh" if age <= FRESH_MINUTES else "aging" if age <= AGING_MINUTES else "stale"
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


def _station_adjustment(station_check: dict[str, Any] | None) -> tuple[float, str | None]:
    """Score change and reason from comparing the model with a nearby reference monitor."""
    status = (station_check or {}).get("status")
    if station_check and status == "agrees":
        return 0.2, (
            f"Nearby reference monitor ({station_check['station']}) agrees within {station_check['difference_pct']}%."
        )
    if station_check and status == "disagrees":
        return -0.15, (
            f"Nearby reference monitor ({station_check['station']}) differs by "
            f"{station_check['difference_pct']}%; local conditions may vary."
        )
    return 0.0, None


def confidence(
    source_type: str, fresh: dict[str, Any], station_check: dict[str, Any] | None, naqi_valid: bool
) -> dict[str, Any]:
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
    delta, reason = _station_adjustment(station_check)
    score += delta
    if reason:
        reasons.append(reason)
    score = max(0.05, min(0.95, score))
    level = "high" if score >= HIGH_CONFIDENCE else "medium" if score >= MEDIUM_CONFIDENCE else "low"
    return {"level": level, "score": round(score, 2), "reasons": reasons}


def _station_check(pm25_model: float | None, stations: list[dict[str, Any]]) -> dict[str, Any] | None:
    refs = [
        s
        for s in stations
        if s.get("station_type") == "reference"
        and "pm2_5" in s["readings"]
        and s["distance_km"] <= STATION_CHECK_RADIUS_KM
    ]
    if not refs or pm25_model is None:
        return None
    nearest = refs[0]
    measured = nearest["readings"]["pm2_5"]["value"]
    if measured <= 0:
        return None
    diff = abs(pm25_model - measured) / measured * 100
    return {
        "status": "agrees" if diff <= STATION_AGREEMENT_PCT else "disagrees",
        "station": nearest["name"],
        "provider": nearest["provider"],
        "measured_pm2_5": measured,
        "difference_pct": round(diff),
        "observed_at": nearest.get("observed_at"),
        "distance_km": nearest["distance_km"],
    }


# ----------------------------------------------------------------------------- bundle building


def _pollutants(current: dict[str, Any], naqi: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        p: {
            "label": pa.POLLUTANT_LABELS[p],
            "value": current.get(p),
            "unit": env.UNITS[p],
            "average": naqi["averages"].get(p),
            "sub_index": naqi["sub_indices"].get(p),
            "who_24h_guideline": pa.WHO_24H_GUIDELINE.get(p),
        }
        for p in pa.BREAKPOINTS
    }


def _weather_series(wx: dict[str, Any] | None, times: list[str]) -> dict[str, list[Any]]:
    """Weather hourly values re-indexed onto the air-quality hours (None where weather has no value)."""
    wx_hourly = (wx or {}).get("hourly") or {}
    return {
        "wind_speed_kmh": _align(wx_hourly, times, "wind_speed_10m"),
        "boundary_layer_m": _align(wx_hourly, times, "boundary_layer_height"),
        "temperature_c": _align(wx_hourly, times, "temperature_2m"),
        "humidity_pct": _align(wx_hourly, times, "relative_humidity_2m"),
    }


def _analysis(
    aq: dict[str, Any],
    naqi: dict[str, Any],
    now_i: int,
    wx_current: dict[str, Any],
    check: dict[str, Any] | None,
    conf: dict[str, Any],
) -> dict[str, Any]:
    """Deterministic analysis block: trend, outlook, dispersion, monitor cross-check and confidence."""
    pm_series = aq["hourly"].get("pm2_5", [])
    current_pm = aq["current"].get("pm2_5")
    return {
        "severity": pa.severity_level(naqi["value"]),
        "trend_pm2_5": pa.trend(pm_series[: now_i + 1], window=3),
        "outlook_12h": pa.forecast_outlook(current_pm, pm_series[now_i + 1 :], hours=12),
        "outlook_24h": pa.forecast_outlook(current_pm, pm_series[now_i + 1 :], hours=24),
        "dispersion": pa.dispersion(wx_current.get("wind_speed_kmh"), wx_current.get("boundary_layer_m")),
        "station_check": check,
        "confidence": conf,
        "health_statement": (naqi["category"] or {}).get("health"),
        "health_source": pa.HEALTH_SOURCE,
    }


def _snapshot_status(is_demo: bool, fresh: dict[str, Any]) -> str:
    if is_demo:
        return "demo"
    return "stale" if fresh["status"] == "stale" else "live"


def build_bundle(
    location: Location,
    aq: dict[str, Any],
    wx: dict[str, Any] | None,
    stations: list[dict[str, Any]] | None = None,
    is_demo: bool = False,
) -> dict[str, Any]:
    offset = aq.get("utc_offset_seconds") or (wx or {}).get("utc_offset_seconds") or 0
    now_i = _now_index(aq["times"], aq.get("current_time"))
    naqi = pa.compute_naqi({p: aq["hourly"].get(p, [])[: now_i + 1] for p in pa.BREAKPOINTS})
    weather_series = _weather_series(wx, aq["times"])
    wx_current = _current_weather(wx, weather_series, now_i)
    observed = _to_aware(aq.get("current_time"), offset)
    fresh = freshness(observed) if not is_demo else {"age_minutes": None, "status": "demo"}
    check = _station_check(aq["current"].get("pm2_5"), stations or [])
    conf = confidence("demo" if is_demo else aq["source"]["type"], fresh, check, naqi["valid"])
    sources = {"air": aq["source"], "weather": (wx or {}).get("source")}
    snapshot = {
        "location": location.model_dump(),
        "is_demo": is_demo,
        "status": _snapshot_status(is_demo, fresh),
        "observed_at": observed.isoformat() if observed else None,
        "observed_local": aq.get("current_time"),
        "fetched_at": utc_now_iso(),
        "timezone": aq.get("timezone"),
        "utc_offset": _offset_str(offset),
        "aqi": naqi,
        "us_aqi": aq["current"].get("us_aqi"),
        "pollutants": _pollutants(aq["current"], naqi),
        "weather": wx_current if wx else None,
        "sources": sources,
        "grid": aq.get("grid"),
        "freshness": fresh,
        "analysis": _analysis(aq, naqi, now_i, wx_current, check, conf),
        "errors": [],
    }
    series = _series(location, aq, now_i, _offset_str(offset), weather_series, is_demo)
    return {"snapshot": snapshot, "series": {**series, "sources": sources}}


def _current_weather(wx: dict[str, Any] | None, weather_series: dict[str, list[Any]], now_i: int) -> dict[str, Any]:
    """Current weather plus the boundary-layer height for the current hour (not in Open-Meteo's `current`)."""
    current = dict((wx or {}).get("current") or {})
    blh = weather_series["boundary_layer_m"]
    current["boundary_layer_m"] = blh[now_i] if now_i < len(blh) else None
    return current


def _series(
    location: Location,
    aq: dict[str, Any],
    now_i: int,
    utc_offset: str,
    weather_series: dict[str, list[Any]],
    is_demo: bool,
) -> dict[str, Any]:
    """Hourly series for charts: pollutants, rolling NAQI and weather aligned to the air-quality hours."""
    times, hourly = aq["times"], aq["hourly"]
    return {
        "location_id": location.id,
        "is_demo": is_demo,
        "times": times,
        "now_index": now_i,
        "utc_offset": utc_offset,
        "hourly": {
            **{p: hourly.get(p, []) for p in [*pa.BREAKPOINTS, "us_aqi"]},
            "aqi_in": pa.hourly_aqi_series({p: hourly.get(p, []) for p in pa.BREAKPOINTS}, times),
        },
        "weather": weather_series,
    }


# ----------------------------------------------------------------------------- fetching and caching


def _fresh_cache_hit(key: str, force: bool) -> dict[str, Any] | None:
    hit = _cache.get(key)
    if hit and not force and time.time() - hit[0] < CACHE_TTL_SECONDS:
        return hit[1]
    return None


async def _stored_or_demo(location: Location, errors: list[dict[str, str]], allow_demo: bool) -> dict[str, Any]:
    """When live air quality is down: the last stored bundle (flagged stale), else sample data if allowed."""
    stored = await get_store().get("bundles", location.id)
    if stored:
        snap = stored["snapshot"]
        snap["status"] = "stale"
        snap["errors"] = errors
        snap["freshness"] = freshness(datetime.fromisoformat(snap["observed_at"]) if snap.get("observed_at") else None)
        stored.pop("id", None)
        return stored
    if allow_demo:
        now_local = datetime.now(IST).replace(tzinfo=None)
        bundle = build_bundle(location, env.demo_air_quality(now_local), None, is_demo=True)
        bundle["snapshot"]["errors"] = errors
        return bundle
    raise UpstreamError("Open-Meteo Air Quality", "live air-quality data is currently unavailable")


async def _fetch_providers(
    location: Location,
) -> tuple[dict[str, Any] | None, dict[str, Any] | None, list[dict[str, str]]]:
    """Fetch air quality and weather concurrently. Failed providers come back as None plus an error entry."""
    aq_res: dict[str, Any] | BaseException
    wx_res: dict[str, Any] | BaseException
    aq_res, wx_res = await asyncio.gather(
        env.fetch_air_quality(location.lat, location.lon),
        weather.fetch_weather(location.lat, location.lon),
        return_exceptions=True,
    )
    errors: list[dict[str, str]] = []
    if isinstance(wx_res, BaseException):
        errors.append({"provider": "Open-Meteo Weather", "message": str(wx_res)})
    if isinstance(aq_res, BaseException):
        errors.append({"provider": "Open-Meteo Air Quality", "message": str(aq_res)})
    aq = None if isinstance(aq_res, BaseException) else aq_res
    wx = None if isinstance(wx_res, BaseException) else wx_res
    return aq, wx, errors


async def _persist(key: str, bundle: dict[str, Any]) -> None:
    _cache[key] = (time.time(), bundle)
    try:
        await get_store().set("bundles", key, bundle)
    except Exception as exc:  # storage problems must not break live data
        log.error("Failed to persist bundle: %s", exc)


async def get_bundle(
    location: Location,
    *,
    force: bool = False,
    allow_demo: bool = False,
    stations: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Return the environmental bundle, refreshing from providers when the cache has expired."""
    key = location.id
    if (hit := _fresh_cache_hit(key, force)) is not None:
        return hit
    async with _locks.setdefault(key, asyncio.Lock()):
        if (hit := _fresh_cache_hit(key, force)) is not None:
            return hit  # another request refreshed it while we waited
        aq, wx, errors = await _fetch_providers(location)
        if aq is None:
            return await _stored_or_demo(location, errors, allow_demo)
        bundle = build_bundle(location, aq, wx, stations=stations)
        bundle["snapshot"]["errors"] = errors
        await _persist(key, bundle)
        return bundle


def cached_bundle(location_id: str) -> dict[str, Any] | None:
    hit = _cache.get(location_id)
    return hit[1] if hit else None


def clear_cache() -> None:
    _cache.clear()
