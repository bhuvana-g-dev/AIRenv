"""AIRenv API entry point."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import scheduler
from app.api import account, air, community, impact, insights
from app.config import get_settings
from app.core.events_bus import bus
from app.core.http import close_client
from app.core.rate_limit import RateLimitMiddleware
from app.db.store import get_store
from app.services import ai_engine
from app.services import telegram_integration as tg

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
VERSION = "1.0.0"


@asynccontextmanager
async def lifespan(_: FastAPI):
    get_store()
    scheduler.start()
    try:
        await tg.start()
    except Exception as exc:  # Telegram problems must not stop the API
        logging.getLogger("airenv").error("Telegram start failed: %s", exc)
    yield
    await scheduler.stop()
    await tg.stop()
    await close_client()


settings = get_settings()
app = FastAPI(title="AIRenv API", version=VERSION, lifespan=lifespan,
              docs_url="/api/docs", openapi_url="/api/openapi.json")
app.add_middleware(RateLimitMiddleware)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origin_list, allow_credentials=True,
                   allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
                   allow_headers=["Authorization", "Content-Type"])

for r in (air.router, insights.router, community.router, impact.router, account.router):
    app.include_router(r)


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": VERSION}


@app.get("/api/system/status")
async def system_status():
    s = get_settings()
    return {
        "version": VERSION,
        "environment": s.environment,
        "storage": get_store().name,
        "auth_mode": s.effective_auth_mode,
        "scheduler": {**scheduler.state, "interval_minutes": s.refresh_interval_minutes,
                      "enabled": s.scheduler_enabled},
        "live_subscribers": bus.subscriber_count(),
        "integrations": {
            "open_meteo": {"configured": True, "note": "No key required"},
            "gemini": {"configured": ai_engine.available(), "model": s.gemini_model,
                       "env": "GEMINI_API_KEY"},
            "telegram": {**tg.status(), "env": "TELEGRAM_BOT_TOKEN"},
            "openaq": {"configured": bool(s.openaq_api_key), "env": "OPENAQ_API_KEY"},
            "cpcb": {"configured": bool(s.data_gov_in_api_key), "env": "DATA_GOV_IN_API_KEY"},
            "sensor_community": {"configured": s.sensor_community_enabled, "note": "No key required"},
            "firebase": {"configured": s.firebase_configured, "env": "FIREBASE_PROJECT_ID, FIREBASE_CREDENTIALS"},
        },
    }
