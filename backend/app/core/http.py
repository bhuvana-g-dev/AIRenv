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


def describe_error(exc: BaseException) -> str:
    """A client-safe description of an HTTP failure.

    httpx error messages embed the full request URL, which can contain credentials
    (CPCB takes its key as a query parameter; Telegram puts the bot token in the path).
    Never return or log ``str(exc)`` for upstream requests; use this instead.
    """
    if isinstance(exc, httpx.HTTPStatusError):
        return f"HTTP {exc.response.status_code}"
    if isinstance(exc, httpx.TimeoutException):
        return "request timed out"
    if isinstance(exc, httpx.HTTPError):
        return f"network error ({type(exc).__name__})"
    if isinstance(exc, ValueError):
        return "invalid response from provider"
    return type(exc).__name__


def client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            timeout=httpx.Timeout(get_settings().http_timeout_seconds),
            limits=httpx.Limits(max_connections=50, max_keepalive_connections=20, keepalive_expiry=30),
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
            log.warning("%s request failed: %s", provider, describe_error(exc))
        if attempt < retries:
            await asyncio.sleep(0.6 * (attempt + 1))
    raise UpstreamError(provider, describe_error(last) if last else "unknown error")
