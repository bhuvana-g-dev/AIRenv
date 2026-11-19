"""Simple in-memory sliding-window rate limiter (per client IP and route group)."""
from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.config import get_settings


class RateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str, limit: int, window: float = 60.0) -> bool:
        now = time.monotonic()
        hits = self._hits[key]
        while hits and now - hits[0] > window:
            hits.popleft()
        if len(hits) >= limit:
            return False
        hits.append(now)
        return True


limiter = RateLimiter()

AI_PATHS = ("/api/assistant", "/api/insights/briefing")
EXEMPT_PATHS = ("/api/stream", "/api/telegram/webhook", "/api/health")


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if not path.startswith("/api") or path.startswith(EXEMPT_PATHS) or request.method == "OPTIONS":
            return await call_next(request)
        s = get_settings()
        ip = client_ip(request)
        if path.startswith(AI_PATHS):
            if not limiter.allow(f"ai:{ip}", s.ai_rate_limit_per_minute):
                return JSONResponse({"detail": "AI request limit reached. Please wait a minute."}, status_code=429)
        if not limiter.allow(f"all:{ip}", s.rate_limit_per_minute):
            return JSONResponse({"detail": "Too many requests. Please slow down."}, status_code=429)
        return await call_next(request)
