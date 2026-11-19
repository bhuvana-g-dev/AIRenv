"""Location search (Open-Meteo geocoding) and reverse geocoding (OpenStreetMap Nominatim)."""
from __future__ import annotations

import time
from typing import Any

from pydantic import BaseModel, Field

from app.core.http import UpstreamError, get_json

GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
REVERSE_URL = "https://nominatim.openstreetmap.org/reverse"


class Location(BaseModel):
    id: str
    name: str
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    country: str | None = None
    admin1: str | None = None
    timezone: str | None = None


def location_id(lat: float, lon: float) -> str:
    # ~1 km grid; also the resolution at which we cache model data.
    return f"{lat:.2f}_{lon:.2f}"


def make_location(name: str, lat: float, lon: float, **extra: Any) -> Location:
    return Location(id=location_id(lat, lon), name=name, lat=round(lat, 5), lon=round(lon, 5), **extra)


_reverse_cache: dict[str, tuple[float, Location]] = {}
_last_reverse_call = 0.0


async def search(query: str, count: int = 8) -> list[Location]:
    data = await get_json("Open-Meteo Geocoding", GEOCODE_URL,
                          params={"name": query, "count": count, "language": "en", "format": "json"})
    results = []
    for r in data.get("results") or []:
        results.append(make_location(r["name"], r["latitude"], r["longitude"], country=r.get("country"),
                                     admin1=r.get("admin1"), timezone=r.get("timezone")))
    return results


async def reverse(lat: float, lon: float) -> Location:
    global _last_reverse_call
    key = location_id(lat, lon)
    cached = _reverse_cache.get(key)
    if cached and time.time() - cached[0] < 86400:
        return cached[1]
    # Nominatim usage policy: at most one request per second.
    if time.time() - _last_reverse_call < 1.1:
        return make_location(f"{lat:.3f}, {lon:.3f}", lat, lon)
    _last_reverse_call = time.time()
    try:
        data = await get_json("OpenStreetMap Nominatim", REVERSE_URL,
                              params={"lat": lat, "lon": lon, "format": "jsonv2", "zoom": 12}, retries=0)
        addr = data.get("address", {})
        name = (addr.get("suburb") or addr.get("city_district") or addr.get("city") or addr.get("town")
                or addr.get("village") or addr.get("county") or data.get("name") or f"{lat:.3f}, {lon:.3f}")
        loc = make_location(name, lat, lon, country=addr.get("country"), admin1=addr.get("state"))
    except UpstreamError:
        loc = make_location(f"{lat:.3f}, {lon:.3f}", lat, lon)
    _reverse_cache[key] = (time.time(), loc)
    return loc
