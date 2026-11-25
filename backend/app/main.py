"""AIRenv API entry point."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app import scheduler
from app.api import account, air, community, impact, insights
from app.config import get_settings
from app.core.events_bus import bus
from app.core.http import close_client
from app.core.middleware import BodySizeLimitMiddleware, SecurityHeadersMiddleware
from app.core.rate_limit import RateLimitMiddleware
from app.db.store import get_store
from app.services import ai_engine
from app.services import telegram_integration as tg

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("airenv")
VERSION = "1.1.0"


@asynccontextmanager
async def lifespan(_: FastAPI):
    get_settings().validate_for_runtime()
    get_store()
    scheduler.start()
    try:
        await tg.start()
    except Exception as exc:  # Telegram problems must not stop the API
        log.error("Telegram start failed: %s", type(exc).__name__)
    yield
    await scheduler.stop()
    await tg.stop()
    await close_client()


def create_app() -> FastAPI:
    settings = get_settings()
    docs = not settings.is_production
    application = FastAPI(
        title="AIRenv API",
        version=VERSION,
        lifespan=lifespan,
        docs_url="/api/docs" if docs else None,
        redoc_url=None,
        openapi_url="/api/openapi.json" if docs else None,
    )
    # Starlette runs the last-added middleware first, so this list reads inside-out.
    application.add_middleware(RateLimitMiddleware)
    # Bearer tokens are sent in the Authorization header, never cookies, so credentials stay disabled.
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
        max_age=600,
    )
    # Forecast bundles are ~100 kB of JSON; gzip cuts them by ~85%. SSE is excluded by Starlette.
    application.add_middleware(GZipMiddleware, minimum_size=1024)
    application.add_middleware(SecurityHeadersMiddleware, hsts=settings.is_production)
    application.add_middleware(BodySizeLimitMiddleware, max_bytes=settings.max_request_bytes)

    for r in (air.router, insights.router, community.router, impact.router, account.router):
        application.include_router(r)

    @application.get("/api/health", tags=["system"])
    async def health():
        return {"status": "ok", "version": VERSION}

    @application.get("/api/system/status", tags=["system"])
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
                "firebase": {"configured": s.firebase_configured,
                             "env": "FIREBASE_PROJECT_ID, FIREBASE_CREDENTIALS"},
            },
        }

    return application


app = create_app()
