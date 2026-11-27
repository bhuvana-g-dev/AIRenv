"""Document identifiers.

``stable_id`` derives deterministic ids used for deduplication (feed events, notifications,
Telegram-extracted events). Stored documents depend on these ids, so the derivation
(parts joined with ``|``, SHA-1 hex digest, truncated) must never change.
"""

from __future__ import annotations

import hashlib
import uuid

STABLE_ID_LENGTH = 20
RANDOM_ID_LENGTH = 12


def stable_id(*parts: object, length: int = STABLE_ID_LENGTH) -> str:
    """Deterministic id: SHA-1 of the parts joined with ``|``, truncated to ``length`` hex characters."""
    key = "|".join(str(p) for p in parts)
    return hashlib.sha1(key.encode(), usedforsecurity=False).hexdigest()[:length]


def new_id() -> str:
    """Random id for user-created documents (communities, initiatives, records)."""
    return uuid.uuid4().hex[:RANDOM_ID_LENGTH]
