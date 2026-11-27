"""Firebase Admin SDK initialisation shared by authentication and the Firestore document store.

``firebase_admin`` is imported lazily: it is only needed when Firebase is configured, and
tests replace it with in-memory fakes through ``sys.modules``.
"""

from __future__ import annotations

import json


class FirebaseNotConfiguredError(RuntimeError):
    """Raised when Firebase is needed but no service-account credentials are configured."""

    def __init__(self) -> None:
        super().__init__("Firebase credentials are not configured (FIREBASE_CREDENTIALS)")


def ensure_firebase_app(credentials: str | None, project_id: str | None) -> None:
    """Initialise the default Firebase app once.

    ``credentials`` is either a path to a service-account JSON file or the JSON document itself.
    Does nothing if an app already exists.
    """
    import firebase_admin  # noqa: PLC0415 - optional dependency, see module docstring
    from firebase_admin import credentials as fb_credentials  # noqa: PLC0415

    if firebase_admin._apps:
        return
    raw = credentials or ""
    if not raw:
        raise FirebaseNotConfiguredError
    cert = fb_credentials.Certificate(json.loads(raw) if raw.strip().startswith("{") else raw)
    firebase_admin.initialize_app(cert, {"projectId": project_id})
