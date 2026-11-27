"""Authentication and role-based access control.

AUTH_MODE=firebase verifies Firebase ID tokens (production).
AUTH_MODE=local treats every request as a single local owner account. It exists
so the app can be run and demonstrated without a Firebase project and must not be
used for a public deployment.
"""

from __future__ import annotations

import copy
import logging
import secrets
from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import Depends, Header, HTTPException, status
from pydantic import BaseModel

from app.config import Settings, get_settings
from app.core.clock import utc_now_iso
from app.core.firebase import FirebaseNotConfiguredError, ensure_firebase_app
from app.db.store import get_store

log = logging.getLogger("airenv.auth")

ROLES = ("member", "community_admin", "admin")
LOCAL_UID = "local-owner"

# Defaults for a new profile. Copied per profile so callers can mutate the result safely.
DEFAULT_FAMILY_CONTEXT: dict[str, bool] = {
    "children": False,
    "older_adults": False,
    "respiratory_or_heart_condition": False,
    "outdoor_workers": False,
    "pregnancy": False,
}
DEFAULT_NOTIFICATION_PREFS: dict[str, Any] = {
    "in_app": True,
    "telegram": False,
    "min_severity": "medium",
    "quiet_hours": {"enabled": True, "start": "22:00", "end": "07:00"},
    "categories": {
        "critical": True,
        "deterioration": True,
        "forecast": True,
        "community": True,
        "recommendation": True,
        "positive": True,
    },
    "daily_limit": 6,
}
DEFAULT_DATA_SOURCES: dict[str, bool] = {"open_meteo": True, "cpcb": True, "openaq": True, "sensor_community": True}


class CurrentUser(BaseModel):
    uid: str
    email: str | None = None
    display_name: str | None = None
    role: str = "member"
    auth_mode: str = "local"

    def has_role(self, *roles: str) -> bool:
        if self.role == "admin":
            return True
        return self.role in roles


def _default_location(s: Settings) -> dict[str, Any]:
    return {
        "id": f"{round(s.default_lat, 2)}_{round(s.default_lon, 2)}",
        "name": s.default_location_name,
        "lat": s.default_lat,
        "lon": s.default_lon,
        "country": "India",
        "admin1": "Delhi",
        "timezone": s.default_timezone,
    }


def _default_privacy(s: Settings) -> dict[str, Any]:
    return {
        "conversation_intelligence": False,
        "store_extracted_events": True,
        "share_aggregate_participation": True,
        "event_retention_days": s.event_retention_days,
    }


def default_profile(uid: str, email: str | None, display_name: str | None, role: str) -> dict[str, Any]:
    s = get_settings()
    return {
        "uid": uid,
        "email": email,
        "display_name": display_name or "AIRenv member",
        "role": role,
        "created_at": utc_now_iso(),
        "onboarded": False,
        "location": _default_location(s),
        "community_type": "household",
        "family_context": dict(DEFAULT_FAMILY_CONTEXT),
        "notification_prefs": copy.deepcopy(DEFAULT_NOTIFICATION_PREFS),
        "language": "en",
        "privacy": _default_privacy(s),
        "data_sources": dict(DEFAULT_DATA_SOURCES),
        "telegram": None,
        "community_ids": [],
    }


async def _load_or_create(uid: str, email: str | None, name: str | None, role: str) -> dict[str, Any]:
    store = get_store()
    doc = await store.get("users", uid)
    if doc is None:
        doc = default_profile(uid, email, name, role)
        await store.set("users", uid, doc)
    return doc


async def _firebase_user(token: str) -> CurrentUser:
    s = get_settings()
    try:
        ensure_firebase_app(s.firebase_credentials, s.firebase_project_id)
    except FirebaseNotConfiguredError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Authentication is not configured") from exc
    from firebase_admin import auth as fb_auth  # noqa: PLC0415 - optional dependency, imported only when used

    try:
        claims = fb_auth.verify_id_token(token)
    except Exception as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired session") from exc
    email = (claims.get("email") or "").lower() or None
    role = "admin" if email and email in s.admin_email_list else "member"
    doc = await _load_or_create(claims["uid"], email, claims.get("name"), role)
    if role == "admin" and doc.get("role") != "admin":
        doc = await get_store().update("users", claims["uid"], {"role": "admin"}) or doc
    return CurrentUser(
        uid=claims["uid"],
        email=email,
        display_name=doc.get("display_name"),
        role=doc.get("role", "member"),
        auth_mode="firebase",
    )


async def get_current_user(authorization: str | None = Header(default=None)) -> CurrentUser:
    s = get_settings()
    if s.effective_auth_mode == "local":
        doc = await _load_or_create(LOCAL_UID, None, "Local owner", "admin")
        return CurrentUser(
            uid=LOCAL_UID, display_name=doc.get("display_name"), role=doc.get("role", "admin"), auth_mode="local"
        )
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in required")
    return await _firebase_user(authorization.split(" ", 1)[1].strip())


async def get_optional_user(authorization: str | None = Header(default=None)) -> CurrentUser | None:
    try:
        return await get_current_user(authorization)
    except HTTPException:
        return None


def require_role(*roles: str) -> Callable[..., Awaitable[CurrentUser]]:
    async def checker(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if not user.has_role(*roles):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have permission for this action")
        return user

    return checker


def new_token(nbytes: int = 16) -> str:
    return secrets.token_urlsafe(nbytes)
