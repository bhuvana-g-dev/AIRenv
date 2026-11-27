"""Weather observations and forecast from Open-Meteo (no API key required)."""
from __future__ import annotations

from typing import Any

from app.core.http import get_json

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
SOURCE = {
    "name": "Open-Meteo Weather Forecast API",
    "type": "model",
    "url": "https://open-meteo.com/en/docs",
    "licence": "CC BY 4.0",
}

WMO_CODES = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Depositing rime fog",
    51: "Light drizzle", 53: "Drizzle", 55: "Dense drizzle", 56: "Freezing drizzle", 57: "Freezing drizzle",
    61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Freezing rain",
    71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains", 80: "Rain showers", 81: "Rain showers",
    82: "Violent rain showers", 85: "Snow showers", 86: "Snow showers", 95: "Thunderstorm",
    96: "Thunderstorm with hail", 99: "Thunderstorm with hail",
}

HOURLY_VARS = ["temperature_2m", "relative_humidity_2m", "wind_speed_10m", "wind_direction_10m",
               "weather_code", "boundary_layer_height", "precipitation"]


def describe(code: int | None) -> str:
    return WMO_CODES.get(code, "Unknown") if code is not None else "Unavailable"


async def fetch_weather(lat: float, lon: float, past_days: int = 7, forecast_days: int = 4) -> dict[str, Any]:
    data = await get_json("Open-Meteo Weather", FORECAST_URL, params={
        "latitude": lat,
        "longitude": lon,
        "current": "temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code",
        "hourly": ",".join(HOURLY_VARS),
        "past_days": past_days,
        "forecast_days": forecast_days,
        "timezone": "auto",
        "wind_speed_unit": "kmh",
    })
    cur = data.get("current") or {}
    return {
        "timezone": data.get("timezone"),
        "utc_offset_seconds": data.get("utc_offset_seconds", 0),
        "current": {
            "time": cur.get("time"),
            "temperature_c": cur.get("temperature_2m"),
            "humidity_pct": cur.get("relative_humidity_2m"),
            "wind_speed_kmh": cur.get("wind_speed_10m"),
            "wind_direction_deg": cur.get("wind_direction_10m"),
            "weather_code": cur.get("weather_code"),
            "weather_text": describe(cur.get("weather_code")),
        },
        "hourly": data.get("hourly") or {},
        "source": SOURCE,
    }
