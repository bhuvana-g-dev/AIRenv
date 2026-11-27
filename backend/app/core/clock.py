"""Wall-clock helpers so every stored timestamp is timezone-aware UTC in the same ISO-8601 format."""

from __future__ import annotations

from datetime import UTC, datetime


def utc_now() -> datetime:
    """The current time as an aware UTC datetime."""
    return datetime.now(UTC)


def utc_now_iso() -> str:
    """The current UTC time as ISO-8601 text, e.g. ``2026-11-19T04:30:00.123456+00:00``."""
    return utc_now().isoformat()
