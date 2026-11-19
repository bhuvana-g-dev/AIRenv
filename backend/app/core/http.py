"""Shared HTTP client with timeouts and a single retry for transient failures."""
from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

from app.config import get_settings

log = logging.getLogger("airenv.http")

_client: httpx.AsyncClient | None = None


class UpstreamError(RuntimeError):
    """Raised when an external data provider fails or times out."""

    def __init__(self, provider: str, message: str) -> None:
        super().__init__(f"{provider}: {message}")
        self.provider = provider
        self.message = message


def client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            timeout=httpx.Timeout(get_settings().http_timeout_seconds),
            headers={"User-Agent": "AIRenv/1.0 (environmental intelligence; contact via project repo)"},
            follow_redirects=True,
        )
    return _client


async def close_client() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


async def get_json(provider: str, url: str, *, params: dict[str, Any] | None = None,
                   headers: dict[str, str] | None = None, retries: int = 1) -> Any:
    last: Exception | None = None
    for attempt in range(retries + 1):
        try:
            resp = await client().get(url, params=params, headers=headers)
            if resp.status_code in (401, 403):
                raise UpstreamError(provider, f"authorization failed (HTTP {resp.status_code})")
            if resp.status_code == 429:
                raise UpstreamError(provider, "rate limited by provider (HTTP 429)")
            resp.raise_for_status()
            return resp.json()
        except UpstreamError:
            raise
        except httpx.TimeoutException as exc:
            last = exc
            log.warning("%s timeout (attempt %s)", provider, attempt + 1)
        except (httpx.HTTPError, ValueError) as exc:
            last = exc
            log.warning("%s request failed: %s", provider, exc)
        if attempt < retries:
            await asyncio.sleep(0.6 * (attempt + 1))
    if isinstance(last, httpx.TimeoutException):
        raise UpstreamError(provider, "request timed out")
    raise UpstreamError(provider, str(last) if last else "unknown error")
