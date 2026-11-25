"""In-memory sliding-window rate limiter (per client IP and route group)."""
from __future__ import annotations

import time
from collections import deque

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.config import get_settings

AI_PATHS = ("/api/assistant", "/api/insights/briefing")
EXEMPT_PATHS = ("/api/stream", "/api/telegram/webhook", "/api/health")
_SWEEP_EVERY_SECONDS = 120.0


class RateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = {}
        self._last_sweep = time.monotonic()

    def allow(self, key: str, limit: int, window: float = 60.0) -> tuple[bool, int]:
        """Record a hit. Returns (allowed, seconds until a slot frees up)."""
        now = time.monotonic()
        self._sweep(now, window)
        hits = self._hits.setdefault(key, deque())
        while hits and now - hits[0] > window:
            hits.popleft()
        if len(hits) >= limit:
            return False, max(1, int(window - (now - hits[0])) + 1)
        hits.append(now)
        return True, 0

    def _sweep(self, now: float, window: float) -> None:
        # Drop idle clients so memory stays proportional to active clients, not all clients ever seen.
        if now - self._last_sweep < _SWEEP_EVERY_SECONDS:
            return
        self._last_sweep = now
        for k in [k for k, h in self._hits.items() if not h or now - h[-1] > window]:
            del self._hits[k]

    def reset(self) -> None:
        self._hits.clear()

    def __len__(self) -> int:
        return len(self._hits)


limiter = RateLimiter()


def client_ip(request: Request, trusted_hops: int | None = None) -> str:
    """Client address, honouring X-Forwarded-For only for the configured number of trusted proxies.

    Each proxy appends the address it received the connection from, so with N trusted proxies the
    client is the N-th entry from the right. Entries further left are client-controlled.
    """
    hops = get_settings().trusted_proxy_hops if trusted_hops is None else trusted_hops
    direct = request.client.host if request.client else "unknown"
    if hops <= 0:
        return direct
    chain = [p.strip() for p in request.headers.get("x-forwarded-for", "").split(",") if p.strip()]
    if len(chain) >= hops:
        return chain[-hops]
    return chain[0] if chain else direct


def _too_many(message: str, retry_after: int) -> JSONResponse:
    return JSONResponse({"detail": message}, status_code=429, headers={"Retry-After": str(retry_after)})


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if not path.startswith("/api") or path.startswith(EXEMPT_PATHS) or request.method == "OPTIONS":
            return await call_next(request)
        s = get_settings()
        ip = client_ip(request)
        if path.startswith(AI_PATHS):
            ok, wait = limiter.allow(f"ai:{ip}", s.ai_rate_limit_per_minute)
            if not ok:
                return _too_many("AI request limit reached. Please wait a minute.", wait)
        ok, wait = limiter.allow(f"all:{ip}", s.rate_limit_per_minute)
        if not ok:
            return _too_many("Too many requests. Please slow down.", wait)
        return await call_next(request)
