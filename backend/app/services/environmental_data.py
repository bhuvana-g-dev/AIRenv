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
from datetime import datetime, timedelta, timezone
from typing import Any

from app.config import get_settings
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
VAR_MAP = {"pm2_5": "pm2_5", "pm10": "pm10", "nitrogen_dioxide": "no2", "sulphur_dioxide": "so2",
           "carbon_monoxide": "co", "ozone": "o3", "us_aqi": "us_aqi"}
UNITS = {"pm2_5": "µg/m³", "pm10": "µg/m³", "no2": "µg/m³", "so2": "µg/m³", "co": "mg/m³", "o3": "µg/m³"}


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


async def fetch_air_quality(lat: float, lon: float, past_days: int = 7, forecast_days: int = 4) -> dict[str, Any]:
    data = await get_json("Open-Meteo Air Quality", AQ_URL, params={
        "latitude": lat,
        "longitude": lon,
        "current": ",".join(AQ_VARS),
        "hourly": ",".join(AQ_VARS),
        "past_days": past_days,
        "forecast_days": forecast_days,
        "timezone": "auto",
    })
    hourly_raw = data.get("hourly") or {}
    hourly: dict[str, list[float | None]] = {}
    for src, dst in VAR_MAP.items():
        vals = hourly_raw.get(src) or []
        if dst == "co":
            vals = [round(v / 1000, 3) if v is not None else None for v in vals]  # µg/m³ -> mg/m³
        hourly[dst] = vals
    cur = data.get("current") or {}
    current = {VAR_MAP[k]: cur.get(k) for k in AQ_VARS}
    if current.get("co") is not None:
        current["co"] = round(current["co"] / 1000, 3)
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

_station_cache: dict[str, tuple[float, Any]] = {}


def _cached(key: str, ttl: float) -> Any | None:
    hit = _station_cache.get(key)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    return None


def _station_aqi(readings: dict[str, dict[str, Any]]) -> dict[str, Any]:
    subs = {p: pa.sub_index(p, r["value"]) for p, r in readings.items() if p in pa.BREAKPOINTS}
    subs = {k: v for k, v in subs.items() if v is not None}
    if not subs:
        return {"value": None, "dominant_pollutant": None, "category": None}
    dom = max(subs, key=lambda k: subs[k])
    return {"value": subs[dom], "dominant_pollutant": dom, "category": pa.category_for(subs[dom]),
            "sub_indices": subs}


CPCB_URL = "https://api.data.gov.in/resource/3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69"
CPCB_POLLUTANTS = {"PM2.5": "pm2_5", "PM10": "pm10", "NO2": "no2", "SO2": "so2", "CO": "co", "OZONE": "o3"}


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


async def fetch_cpcb_stations(lat: float, lon: float, radius_km: float) -> list[dict[str, Any]]:
    key = get_settings().data_gov_in_api_key
    if not key:
        raise UpstreamError("CPCB (data.gov.in)", "not configured: set DATA_GOV_IN_API_KEY")
    records = _cached("cpcb:all", 900)
    if records is None:
        data = await get_json("CPCB (data.gov.in)", CPCB_URL,
                              params={"api-key": key, "format": "json", "limit": 4000})
        records = data.get("records") or []
        _station_cache["cpcb:all"] = (time.time(), records)
    stations: dict[str, dict[str, Any]] = {}
    for r in records:
        try:
            slat, slon = float(r["latitude"]), float(r["longitude"])
        except (KeyError, TypeError, ValueError):
            continue
        dist = haversine_km(lat, lon, slat, slon)
        if dist > radius_km:
            continue
        pol = CPCB_POLLUTANTS.get(str(r.get("pollutant_id", "")).upper())
        raw_avg = r.get("avg_value", r.get("pollutant_avg"))
        try:
            val = float(raw_avg)
        except (TypeError, ValueError):
            val = None
        sid = f"cpcb:{r.get('station')}"
        st = stations.setdefault(sid, {
            "id": sid, "provider": "CPCB", "station_type": "reference", "name": r.get("station"),
            "city": r.get("city"), "state": r.get("state"), "lat": slat, "lon": slon,
            "distance_km": round(dist, 2), "observed_at": _parse_cpcb_time(r.get("last_update")),
            "readings": {}, "url": "https://airquality.cpcb.gov.in/AQI_India/",
        })
        if pol and val is not None:
            st["readings"][pol] = {"value": val, "unit": UNITS[pol], "averaging": "as published by CPCB"}
    out = []
    for st in stations.values():
        if st["readings"]:
            st["aqi"] = _station_aqi(st["readings"])
            out.append(st)
    return out


OPENAQ_URL = "https://api.openaq.org/v3"
OPENAQ_PARAMS = {"pm25": "pm2_5", "pm10": "pm10", "no2": "no2", "so2": "so2", "co": "co", "o3": "o3"}


async def fetch_openaq_stations(lat: float, lon: float, radius_km: float) -> list[dict[str, Any]]:
    key = get_settings().openaq_api_key
    if not key:
        raise UpstreamError("OpenAQ", "not configured: set OPENAQ_API_KEY")
    headers = {"X-API-Key": key}
    radius_m = int(min(radius_km, 25) * 1000)  # OpenAQ maximum radius is 25 km
    cache_key = f"openaq:{lat:.2f}:{lon:.2f}:{radius_m}"
    cached = _cached(cache_key, 900)
    if cached is not None:
        return cached
    data = await get_json("OpenAQ", f"{OPENAQ_URL}/locations", headers=headers,
                          params={"coordinates": f"{lat},{lon}", "radius": radius_m, "limit": 40})
    locations = data.get("results") or []

    async def latest(loc: dict[str, Any]) -> dict[str, Any] | None:
        sensors = {s["id"]: s for s in loc.get("sensors") or []}
        try:
            lat_data = await get_json("OpenAQ", f"{OPENAQ_URL}/locations/{loc['id']}/latest", headers=headers,
                                      retries=0)
        except UpstreamError:
            return None
        readings: dict[str, dict[str, Any]] = {}
        observed: str | None = None
        for item in lat_data.get("results") or []:
            sensor = sensors.get(item.get("sensorsId"))
            if not sensor:
                continue
            param = sensor.get("parameter", {})
            pol = OPENAQ_PARAMS.get(param.get("name", ""))
            value = item.get("value")
            if not pol or value is None or value < 0:
                continue
            unit = param.get("units", "")
            if pol == "co" and unit == "ppm":
                value, unit = round(value * 1.145, 3), "mg/m³"  # 25 °C conversion
            elif pol != "co" and unit == "ppm":
                continue  # gas readings in ppm cannot be compared with NAQI µg/m³ breakpoints reliably
            readings[pol] = {"value": round(value, 2), "unit": UNITS[pol] if unit != "ppm" else unit,
                             "averaging": "latest hourly value"}
            t = (item.get("datetime") or {}).get("utc")
            if t and (observed is None or t > observed):
                observed = t
        if not readings:
            return None
        coords = loc.get("coordinates") or {}
        st = {
            "id": f"openaq:{loc['id']}", "provider": "OpenAQ",
            "station_type": "reference" if loc.get("isMonitor") else "low_cost",
            "name": loc.get("name"), "city": loc.get("locality"), "state": None,
            "lat": coords.get("latitude"), "lon": coords.get("longitude"),
            "distance_km": round(haversine_km(lat, lon, coords.get("latitude", lat), coords.get("longitude", lon)), 2),
            "observed_at": observed, "readings": readings,
            "url": f"https://explore.openaq.org/locations/{loc['id']}",
            "owner": (loc.get("owner") or {}).get("name"),
        }
        st["aqi"] = _station_aqi(readings)
        return st

    results = await asyncio.gather(*(latest(loc) for loc in locations[:15]))
    out = [r for r in results if r]
    _station_cache[cache_key] = (time.time(), out)
    return out


SENSOR_COMMUNITY_URL = "https://data.sensor.community/airrohr/v1/filter/area={lat},{lon},{dist}"


async def fetch_sensor_community(lat: float, lon: float, radius_km: float) -> list[dict[str, Any]]:
    if not get_settings().sensor_community_enabled:
        raise UpstreamError("Sensor.Community", "disabled by configuration")
    cache_key = f"sc:{lat:.2f}:{lon:.2f}:{radius_km}"
    cached = _cached(cache_key, 300)
    if cached is not None:
        return cached
    data = await get_json("Sensor.Community",
                          SENSOR_COMMUNITY_URL.format(lat=lat, lon=lon, dist=int(radius_km)), retries=0)
    by_loc: dict[str, dict[str, Any]] = {}
    for entry in data or []:
        loc = entry.get("location") or {}
        try:
            slat, slon = float(loc["latitude"]), float(loc["longitude"])
        except (KeyError, TypeError, ValueError):
            continue
        if loc.get("indoor"):
            continue
        sid = f"sc:{loc.get('id')}"
        st = by_loc.setdefault(sid, {
            "id": sid, "provider": "Sensor.Community", "station_type": "low_cost",
            "name": f"Citizen sensor #{loc.get('id')}", "city": None, "state": None, "lat": slat, "lon": slon,
            "distance_km": round(haversine_km(lat, lon, slat, slon), 2), "observed_at": None, "readings": {},
            "url": "https://maps.sensor.community/",
        })
        ts = entry.get("timestamp")
        if ts:
            st["observed_at"] = ts.replace(" ", "T") + "Z"
        for v in entry.get("sensordatavalues") or []:
            pol = {"P2": "pm2_5", "P1": "pm10"}.get(v.get("value_type"))
            try:
                val = float(v.get("value"))
            except (TypeError, ValueError):
                continue
            if pol and 0 <= val < 2000:
                st["readings"][pol] = {"value": round(val, 1), "unit": "µg/m³",
                                       "averaging": "~5-minute value, uncalibrated low-cost sensor"}
    out = []
    for st in by_loc.values():
        if st["readings"]:
            st["aqi"] = _station_aqi(st["readings"])
            out.append(st)
    _station_cache[cache_key] = (time.time(), out[:60])
    return out[:60]


STATION_PROVIDERS = {
    "cpcb": ("CPCB (data.gov.in)", fetch_cpcb_stations),
    "openaq": ("OpenAQ", fetch_openaq_stations),
    "sensor_community": ("Sensor.Community", fetch_sensor_community),
}


async def fetch_stations(lat: float, lon: float, radius_km: float = 25,
                         enabled: dict[str, bool] | None = None) -> dict[str, Any]:
    enabled = enabled or {}
    names = [k for k in STATION_PROVIDERS if enabled.get(k, True)]
    results = await asyncio.gather(*(STATION_PROVIDERS[k][1](lat, lon, radius_km) for k in names),
                                   return_exceptions=True)
    stations: list[dict[str, Any]] = []
    providers: list[dict[str, Any]] = []
    for k, res in zip(names, results):
        label = STATION_PROVIDERS[k][0]
        if isinstance(res, Exception):
            msg = res.message if isinstance(res, UpstreamError) else str(res)
            providers.append({"key": k, "name": label, "status": "unavailable", "message": msg, "count": 0})
        else:
            providers.append({"key": k, "name": label, "status": "ok", "message": None, "count": len(res)})
            stations.extend(res)
    stations.sort(key=lambda s: s["distance_km"])
    return {"stations": stations, "providers": providers,
            "fetched_at": datetime.now(timezone.utc).isoformat()}


def detect_hotspots(stations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Flag stations whose measured PM2.5 is well above the local median of other measured stations.

    Requires at least 4 stations with PM2.5 so the comparison is meaningful. Never interpolates.
    """
    with_pm = [s for s in stations if "pm2_5" in s.get("readings", {})]
    if len(with_pm) < 4:
        return []
    values = sorted(s["readings"]["pm2_5"]["value"] for s in with_pm)
    median = values[len(values) // 2]
    hotspots = []
    for s in with_pm:
        v = s["readings"]["pm2_5"]["value"]
        if median > 0 and v >= median * 1.4 and v - median >= 20:
            hotspots.append({"station_id": s["id"], "name": s["name"], "pm2_5": v, "local_median": median,
                             "ratio": round(v / median, 2), "provider": s["provider"]})
    return hotspots


# --------------------------------------------------------------------------- demo dataset

def demo_air_quality(now_local: datetime, past_days: int = 7, forecast_days: int = 4) -> dict[str, Any]:
    """Deterministic, clearly-labelled sample series with a typical North-Indian winter shape.

    Used only when the user explicitly opts to view sample data while live sources are down.
    """
    start = now_local.replace(minute=0, second=0, microsecond=0)
    hours = (past_days + forecast_days) * 24
    base = start - timedelta(days=past_days)
    times, pm25 = [], []
    for i in range(hours):
        t = base + timedelta(hours=i)
        times.append(t.strftime("%Y-%m-%dT%H:00"))
        h = t.hour
        diurnal = 1.35 if h in (21, 22, 23, 0, 1, 2, 7, 8, 9) else 0.75 if 12 <= h <= 16 else 1.0
        day_factor = 1 + 0.18 * math.sin(i / 24 * 1.3)
        pm25.append(round(140 * diurnal * day_factor, 1))
    hourly = {
        "pm2_5": pm25,
        "pm10": [round(v * 1.65, 1) for v in pm25],
        "no2": [round(30 + v * 0.25, 1) for v in pm25],
        "so2": [round(9 + v * 0.03, 1) for v in pm25],
        "co": [round(0.6 + v * 0.008, 3) for v in pm25],
        "o3": [round(max(5, 70 - v * 0.3), 1) for v in pm25],
        "us_aqi": [None for _ in pm25],
    }
    idx = past_days * 24
    current = {k: v[idx] for k, v in hourly.items()}
    return {
        "timezone": "Demo", "utc_offset_seconds": 19800, "grid": None, "current_time": times[idx],
        "current": current, "times": times, "hourly": hourly,
        "source": {"name": "AIRenv sample dataset (NOT real data)", "type": "demo", "url": None,
                   "note": "Illustrative values for interface demonstration only."},
    }
