"""Environmental data collection.

Providers
- Open-Meteo Air Quality API (CAMS global model; no key). Used for the location
  time series and forecast. Values are model estimates for a ~10-40 km grid cell,
  not station measurements, and are always labelled that way.
- CPCB real-time AQI via data.gov.in (DATA_GOV_IN_API_KEY). Station measurements.
- OpenAQ v3 (OPENAQ_API_KEY). Station measurements from reference and other monitors.
- Sensor.Community (no key). Citizen low-cost PM sensors, uncalibrated.
"""

from __future__ import annotations

import asyncio
import logging
import math
import time
from collections.abc import Iterable
from datetime import datetime, timedelta
from typing import Any

from app.config import get_settings
from app.core.clock import utc_now_iso
from app.core.http import UpstreamError, get_json
from app.services import pollution_analyzer as pa

log = logging.getLogger("airenv.envdata")

AQ_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
AQ_SOURCE = {
    "name": "Open-Meteo Air Quality API (Copernicus CAMS global model)",
    "type": "model",
    "url": "https://open-meteo.com/en/docs/air-quality-api",
    "licence": "CC BY 4.0; CAMS data © ECMWF",
    "note": "Modelled concentrations for the surrounding grid cell, not a ground monitor reading.",
}
AQ_VARS = ["pm2_5", "pm10", "nitrogen_dioxide", "sulphur_dioxide", "carbon_monoxide", "ozone", "us_aqi"]
VAR_MAP = {
    "pm2_5": "pm2_5",
    "pm10": "pm10",
    "nitrogen_dioxide": "no2",
    "sulphur_dioxide": "so2",
    "carbon_monoxide": "co",
    "ozone": "o3",
    "us_aqi": "us_aqi",
}
UNITS = {"pm2_5": "µg/m³", "pm10": "µg/m³", "no2": "µg/m³", "so2": "µg/m³", "co": "mg/m³", "o3": "µg/m³"}
EARTH_RADIUS_KM = 6371.0
UG_PER_MG = 1000


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def _ug_to_mg(value: float | None) -> float | None:
    """Open-Meteo reports CO in µg/m³; NAQI breakpoints use mg/m³."""
    return round(value / UG_PER_MG, 3) if value is not None else None


async def fetch_air_quality(lat: float, lon: float, past_days: int = 7, forecast_days: int = 4) -> dict[str, Any]:
    data = await get_json(
        "Open-Meteo Air Quality",
        AQ_URL,
        params={
            "latitude": lat,
            "longitude": lon,
            "current": ",".join(AQ_VARS),
            "hourly": ",".join(AQ_VARS),
            "past_days": past_days,
            "forecast_days": forecast_days,
            "timezone": "auto",
        },
    )
    hourly_raw = data.get("hourly") or {}
    hourly: dict[str, list[float | None]] = {}
    for src, dst in VAR_MAP.items():
        vals = hourly_raw.get(src) or []
        hourly[dst] = [_ug_to_mg(v) for v in vals] if dst == "co" else vals
    cur = data.get("current") or {}
    current = {VAR_MAP[k]: cur.get(k) for k in AQ_VARS}
    current["co"] = _ug_to_mg(current.get("co"))
    return {
        "timezone": data.get("timezone"),
        "utc_offset_seconds": data.get("utc_offset_seconds", 0),
        "grid": {"lat": data.get("latitude"), "lon": data.get("longitude")},
        "current_time": cur.get("time"),
        "current": current,
        "times": hourly_raw.get("time") or [],
        "hourly": hourly,
        "source": AQ_SOURCE,
    }


# --------------------------------------------------------------------------- stations

STATION_CACHE_TTL_SECONDS = 900
LOW_COST_CACHE_TTL_SECONDS = 300
_station_cache: dict[str, tuple[float, Any]] = {}


def _cached(key: str, ttl: float) -> Any | None:
    hit = _station_cache.get(key)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    return None


def _station_aqi(readings: dict[str, dict[str, Any]]) -> dict[str, Any]:
    subs = {
        p: idx for p, r in readings.items() if p in pa.BREAKPOINTS and (idx := pa.sub_index(p, r["value"])) is not None
    }
    if not subs:
        return {"value": None, "dominant_pollutant": None, "category": None}
    dom = max(subs, key=lambda k: subs[k])
    return {
        "value": subs[dom],
        "dominant_pollutant": dom,
        "category": pa.category_for(subs[dom]),
        "sub_indices": subs,
    }


def _with_aqi(stations: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """Stations that have at least one reading, each annotated with its station AQI."""
    out = []
    for st in stations:
        if st["readings"]:
            st["aqi"] = _station_aqi(st["readings"])
            out.append(st)
    return out


def _float_or_none(raw: Any) -> float | None:
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def _coords(raw: dict[str, Any]) -> tuple[float, float] | None:
    try:
        return float(raw["latitude"]), float(raw["longitude"])
    except (KeyError, TypeError, ValueError):
        return None


# --------------------------------------------------------------------------- CPCB

CPCB_URL = "https://api.data.gov.in/resource/3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69"
CPCB_POLLUTANTS = {"PM2.5": "pm2_5", "PM10": "pm10", "NO2": "no2", "SO2": "so2", "CO": "co", "OZONE": "o3"}
CPCB_RECORD_LIMIT = 4000


def _parse_cpcb_time(raw: str | None) -> str | None:
    if not raw:
        return None
    for fmt in ("%d-%m-%Y %H:%M:%S", "%Y-%m-%d %H:%M:%S", "%d-%m-%Y %H:%M"):
        try:
            # CPCB publishes Indian Standard Time.
            return datetime.strptime(raw, fmt).strftime("%Y-%m-%dT%H:%M:%S+05:30")
        except ValueError:
            continue
    return raw


async def _cpcb_records(key: str) -> list[dict[str, Any]]:
    """All CPCB records (one per station and pollutant), cached nationally."""
    records = _cached("cpcb:all", STATION_CACHE_TTL_SECONDS)
    if records is None:
        data = await get_json(
            "CPCB (data.gov.in)", CPCB_URL, params={"api-key": key, "format": "json", "limit": CPCB_RECORD_LIMIT}
        )
        records = data.get("records") or []
        _station_cache["cpcb:all"] = (time.time(), records)
    return records


def _cpcb_station(r: dict[str, Any], slat: float, slon: float, dist: float) -> dict[str, Any]:
    sid = f"cpcb:{r.get('station')}"
    return {
        "id": sid,
        "provider": "CPCB",
        "station_type": "reference",
        "name": r.get("station"),
        "city": r.get("city"),
        "state": r.get("state"),
        "lat": slat,
        "lon": slon,
        "distance_km": round(dist, 2),
        "observed_at": _parse_cpcb_time(r.get("last_update")),
        "readings": {},
        "url": "https://airquality.cpcb.gov.in/AQI_India/",
    }


async def fetch_cpcb_stations(lat: float, lon: float, radius_km: float) -> list[dict[str, Any]]:
    key = get_settings().data_gov_in_api_key
    if not key:
        raise UpstreamError("CPCB (data.gov.in)", "not configured: set DATA_GOV_IN_API_KEY")
    stations: dict[str, dict[str, Any]] = {}
    for r in await _cpcb_records(key):
        coords = _coords(r)
        if coords is None:
            continue
        dist = haversine_km(lat, lon, *coords)
        if dist > radius_km:
            continue
        st = stations.setdefault(f"cpcb:{r.get('station')}", _cpcb_station(r, *coords, dist))
        pol = CPCB_POLLUTANTS.get(str(r.get("pollutant_id", "")).upper())
        val = _float_or_none(r.get("avg_value", r.get("pollutant_avg")))
        if pol and val is not None:
            st["readings"][pol] = {"value": val, "unit": UNITS[pol], "averaging": "as published by CPCB"}
    return _with_aqi(stations.values())


# --------------------------------------------------------------------------- OpenAQ

OPENAQ_URL = "https://api.openaq.org/v3"
OPENAQ_PARAMS = {"pm25": "pm2_5", "pm10": "pm10", "no2": "no2", "so2": "so2", "co": "co", "o3": "o3"}
OPENAQ_MAX_RADIUS_KM = 25  # API maximum
OPENAQ_LOCATION_LIMIT = 40
OPENAQ_MAX_LOCATIONS_QUERIED = 15
CO_PPM_TO_MG_M3 = 1.145  # at 25 °C


def _openaq_reading(item: dict[str, Any], sensors: dict[Any, dict[str, Any]]) -> tuple[str, dict[str, Any]] | None:
    """(pollutant, reading) for one latest-value item, or None if it cannot be compared with NAQI breakpoints."""
    sensor = sensors.get(item.get("sensorsId"))
    if not sensor:
        return None
    param = sensor.get("parameter", {})
    pol = OPENAQ_PARAMS.get(param.get("name", ""))
    value = item.get("value")
    if not pol or value is None or value < 0:
        return None
    unit = param.get("units", "")
    if pol == "co" and unit == "ppm":
        value, unit = round(value * CO_PPM_TO_MG_M3, 3), "mg/m³"
    elif pol != "co" and unit == "ppm":
        return None  # gas readings in ppm cannot be compared with NAQI µg/m³ breakpoints reliably
    unit = UNITS[pol] if unit != "ppm" else unit
    return pol, {"value": round(value, 2), "unit": unit, "averaging": "latest hourly value"}


def _openaq_readings(
    items: list[dict[str, Any]], sensors: dict[Any, dict[str, Any]]
) -> tuple[dict[str, dict[str, Any]], str | None]:
    """Usable readings and the latest observation time among them."""
    readings: dict[str, dict[str, Any]] = {}
    observed: str | None = None
    for item in items:
        parsed = _openaq_reading(item, sensors)
        if parsed is None:
            continue
        readings[parsed[0]] = parsed[1]
        t = (item.get("datetime") or {}).get("utc")
        if t and (observed is None or t > observed):
            observed = t
    return readings, observed


async def _openaq_station(
    loc: dict[str, Any], lat: float, lon: float, headers: dict[str, str]
) -> dict[str, Any] | None:
    sensors = {s["id"]: s for s in loc.get("sensors") or []}
    try:
        latest = await get_json("OpenAQ", f"{OPENAQ_URL}/locations/{loc['id']}/latest", headers=headers, retries=0)
    except UpstreamError:
        return None
    readings, observed = _openaq_readings(latest.get("results") or [], sensors)
    if not readings:
        return None
    coords = loc.get("coordinates") or {}
    distance = haversine_km(lat, lon, coords.get("latitude", lat), coords.get("longitude", lon))
    return {
        "id": f"openaq:{loc['id']}",
        "provider": "OpenAQ",
        "station_type": "reference" if loc.get("isMonitor") else "low_cost",
        "name": loc.get("name"),
        "city": loc.get("locality"),
        "state": None,
        "lat": coords.get("latitude"),
        "lon": coords.get("longitude"),
        "distance_km": round(distance, 2),
        "observed_at": observed,
        "readings": readings,
        "url": f"https://explore.openaq.org/locations/{loc['id']}",
        "owner": (loc.get("owner") or {}).get("name"),
        "aqi": _station_aqi(readings),
    }


async def fetch_openaq_stations(lat: float, lon: float, radius_km: float) -> list[dict[str, Any]]:
    key = get_settings().openaq_api_key
    if not key:
        raise UpstreamError("OpenAQ", "not configured: set OPENAQ_API_KEY")
    headers = {"X-API-Key": key}
    radius_m = int(min(radius_km, OPENAQ_MAX_RADIUS_KM) * 1000)
    cache_key = f"openaq:{lat:.2f}:{lon:.2f}:{radius_m}"
    cached = _cached(cache_key, STATION_CACHE_TTL_SECONDS)
    if cached is not None:
        return cached
    data = await get_json(
        "OpenAQ",
        f"{OPENAQ_URL}/locations",
        headers=headers,
        params={"coordinates": f"{lat},{lon}", "radius": radius_m, "limit": OPENAQ_LOCATION_LIMIT},
    )
    locations = (data.get("results") or [])[:OPENAQ_MAX_LOCATIONS_QUERIED]
    results = await asyncio.gather(*(_openaq_station(loc, lat, lon, headers) for loc in locations))
    out = [r for r in results if r]
    _station_cache[cache_key] = (time.time(), out)
    return out


# --------------------------------------------------------------------------- Sensor.Community

SENSOR_COMMUNITY_URL = "https://data.sensor.community/airrohr/v1/filter/area={lat},{lon},{dist}"
SENSOR_COMMUNITY_VALUE_TYPES = {"P2": "pm2_5", "P1": "pm10"}
LOW_COST_MAX_PLAUSIBLE_PM = 2000  # µg/m³; higher values are sensor faults
LOW_COST_MAX_STATIONS = 60


def _sc_station(loc: dict[str, Any], slat: float, slon: float, dist: float) -> dict[str, Any]:
    sid = f"sc:{loc.get('id')}"
    return {
        "id": sid,
        "provider": "Sensor.Community",
        "station_type": "low_cost",
        "name": f"Citizen sensor #{loc.get('id')}",
        "city": None,
        "state": None,
        "lat": slat,
        "lon": slon,
        "distance_km": round(dist, 2),
        "observed_at": None,
        "readings": {},
        "url": "https://maps.sensor.community/",
    }


def _sc_add_readings(st: dict[str, Any], entry: dict[str, Any]) -> None:
    ts = entry.get("timestamp")
    if ts:
        st["observed_at"] = ts.replace(" ", "T") + "Z"
    for v in entry.get("sensordatavalues") or []:
        pol = SENSOR_COMMUNITY_VALUE_TYPES.get(v.get("value_type"))
        val = _float_or_none(v.get("value"))
        if pol and val is not None and 0 <= val < LOW_COST_MAX_PLAUSIBLE_PM:
            st["readings"][pol] = {
                "value": round(val, 1),
                "unit": "µg/m³",
                "averaging": "~5-minute value, uncalibrated low-cost sensor",
            }


async def fetch_sensor_community(lat: float, lon: float, radius_km: float) -> list[dict[str, Any]]:
    if not get_settings().sensor_community_enabled:
        raise UpstreamError("Sensor.Community", "disabled by configuration")
    cache_key = f"sc:{lat:.2f}:{lon:.2f}:{radius_km}"
    cached = _cached(cache_key, LOW_COST_CACHE_TTL_SECONDS)
    if cached is not None:
        return cached
    url = SENSOR_COMMUNITY_URL.format(lat=lat, lon=lon, dist=int(radius_km))
    data = await get_json("Sensor.Community", url, retries=0)
    by_loc: dict[str, dict[str, Any]] = {}
    for entry in data or []:
        loc = entry.get("location") or {}
        coords = _coords(loc)
        if coords is None or loc.get("indoor"):
            continue
        st = by_loc.setdefault(f"sc:{loc.get('id')}", _sc_station(loc, *coords, haversine_km(lat, lon, *coords)))
        _sc_add_readings(st, entry)
    out = _with_aqi(by_loc.values())[:LOW_COST_MAX_STATIONS]
    _station_cache[cache_key] = (time.time(), out)
    return out


# --------------------------------------------------------------------------- all station providers

STATION_PROVIDERS = {
    "cpcb": ("CPCB (data.gov.in)", fetch_cpcb_stations),
    "openaq": ("OpenAQ", fetch_openaq_stations),
    "sensor_community": ("Sensor.Community", fetch_sensor_community),
}


async def fetch_stations(
    lat: float, lon: float, radius_km: float = 25, enabled: dict[str, bool] | None = None
) -> dict[str, Any]:
    enabled = enabled or {}
    names = [k for k in STATION_PROVIDERS if enabled.get(k, True)]
    results = await asyncio.gather(
        *(STATION_PROVIDERS[k][1](lat, lon, radius_km) for k in names), return_exceptions=True
    )
    stations: list[dict[str, Any]] = []
    providers: list[dict[str, Any]] = []
    for k, res in zip(names, results, strict=True):
        label = STATION_PROVIDERS[k][0]
        if isinstance(res, BaseException):
            msg = res.message if isinstance(res, UpstreamError) else str(res)
            providers.append({"key": k, "name": label, "status": "unavailable", "message": msg, "count": 0})
        else:
            providers.append({"key": k, "name": label, "status": "ok", "message": None, "count": len(res)})
            stations.extend(res)
    stations.sort(key=lambda s: s["distance_km"])
    return {"stations": stations, "providers": providers, "fetched_at": utc_now_iso()}


MIN_HOTSPOT_STATIONS = 4
HOTSPOT_RATIO = 1.4
HOTSPOT_MIN_EXCESS_UG = 20


def detect_hotspots(stations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Flag stations whose measured PM2.5 is well above the local median of other measured stations.

    Requires at least 4 stations with PM2.5 so the comparison is meaningful. Never interpolates.
    """
    with_pm = [s for s in stations if "pm2_5" in s.get("readings", {})]
    if len(with_pm) < MIN_HOTSPOT_STATIONS:
        return []
    values = sorted(s["readings"]["pm2_5"]["value"] for s in with_pm)
    median = values[len(values) // 2]
    if median <= 0:
        return []
    return [
        {
            "station_id": s["id"],
            "name": s["name"],
            "pm2_5": v,
            "local_median": median,
            "ratio": round(v / median, 2),
            "provider": s["provider"],
        }
        for s in with_pm
        if (v := s["readings"]["pm2_5"]["value"]) >= median * HOTSPOT_RATIO and v - median >= HOTSPOT_MIN_EXCESS_UG
    ]


# --------------------------------------------------------------------------- demo dataset

DEMO_BASE_PM25 = 140
DEMO_EVENING_AND_MORNING_PEAK_HOURS = (21, 22, 23, 0, 1, 2, 7, 8, 9)
DEMO_AFTERNOON_HOURS = range(12, 17)
DEMO_UTC_OFFSET_SECONDS = 19800  # IST


def _demo_pm25(hour: int, i: int) -> float:
    """Typical North-Indian winter shape: night and morning peaks, an afternoon dip and a slow multi-day wave."""
    diurnal = 1.35 if hour in DEMO_EVENING_AND_MORNING_PEAK_HOURS else 0.75 if hour in DEMO_AFTERNOON_HOURS else 1.0
    day_factor = 1 + 0.18 * math.sin(i / 24 * 1.3)
    return round(DEMO_BASE_PM25 * diurnal * day_factor, 1)


def demo_air_quality(now_local: datetime, past_days: int = 7, forecast_days: int = 4) -> dict[str, Any]:
    """Deterministic, clearly-labelled sample series with a typical North-Indian winter shape.

    Used only when the user explicitly opts to view sample data while live sources are down.
    """
    base = now_local.replace(minute=0, second=0, microsecond=0) - timedelta(days=past_days)
    hours = [base + timedelta(hours=i) for i in range((past_days + forecast_days) * 24)]
    times = [t.strftime("%Y-%m-%dT%H:00") for t in hours]
    pm25 = [_demo_pm25(t.hour, i) for i, t in enumerate(hours)]
    hourly: dict[str, list[float | None]] = {
        "pm2_5": list(pm25),
        "pm10": [round(v * 1.65, 1) for v in pm25],
        "no2": [round(30 + v * 0.25, 1) for v in pm25],
        "so2": [round(9 + v * 0.03, 1) for v in pm25],
        "co": [round(0.6 + v * 0.008, 3) for v in pm25],
        "o3": [round(max(5, 70 - v * 0.3), 1) for v in pm25],
        "us_aqi": [None for _ in pm25],
    }
    idx = past_days * 24
    return {
        "timezone": "Demo",
        "utc_offset_seconds": DEMO_UTC_OFFSET_SECONDS,
        "grid": None,
        "current_time": times[idx],
        "current": {k: v[idx] for k, v in hourly.items()},
        "times": times,
        "hourly": hourly,
        "source": {
            "name": "AIRenv sample dataset (NOT real data)",
            "type": "demo",
            "url": None,
            "note": "Illustrative values for interface demonstration only.",
        },
    }
