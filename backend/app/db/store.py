"""Document storage abstraction.

Firestore is the production database. When Firebase credentials are not
configured, an SQLite-backed document store with the same interface is used so
the application still runs end-to-end on a developer machine.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import sqlite3
import threading
from abc import ABC, abstractmethod
from typing import Any, Iterable

from app.config import get_settings

log = logging.getLogger("airenv.store")

Filter = tuple[str, str, Any]  # (field, op, value) op in == != < <= > >= in array_contains


def _match(doc: dict[str, Any], filters: Iterable[Filter]) -> bool:
    for field, op, value in filters:
        cur: Any = doc
        for part in field.split("."):
            cur = cur.get(part) if isinstance(cur, dict) else None
        if op == "==" and cur != value:
            return False
        if op == "!=" and cur == value:
            return False
        if op in ("<", "<=", ">", ">="):
            if cur is None:
                return False
            if op == "<" and not cur < value:
                return False
            if op == "<=" and not cur <= value:
                return False
            if op == ">" and not cur > value:
                return False
            if op == ">=" and not cur >= value:
                return False
        if op == "in" and cur not in value:
            return False
        if op == "array_contains" and (not isinstance(cur, list) or value not in cur):
            return False
    return True


class DocumentStore(ABC):
    name: str = "abstract"

    @abstractmethod
    async def get(self, collection: str, doc_id: str) -> dict[str, Any] | None: ...

    @abstractmethod
    async def set(self, collection: str, doc_id: str, data: dict[str, Any]) -> None: ...

    @abstractmethod
    async def delete(self, collection: str, doc_id: str) -> None: ...

    @abstractmethod
    async def query(
        self,
        collection: str,
        filters: list[Filter] | None = None,
        order_by: str | None = None,
        descending: bool = False,
        limit: int | None = None,
    ) -> list[dict[str, Any]]: ...

    async def update(self, collection: str, doc_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
        doc = await self.get(collection, doc_id)
        if doc is None:
            return None
        doc.update(patch)
        await self.set(collection, doc_id, doc)
        return doc


class SQLiteStore(DocumentStore):
    name = "sqlite"

    def __init__(self, path: str) -> None:
        if path != ":memory:":
            os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._lock = threading.Lock()
        with self._lock:
            self._conn.execute(
                "CREATE TABLE IF NOT EXISTS docs (collection TEXT NOT NULL, id TEXT NOT NULL, "
                "data TEXT NOT NULL, PRIMARY KEY (collection, id))"
            )
            self._conn.commit()

    def _get(self, collection: str, doc_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT data FROM docs WHERE collection=? AND id=?", (collection, doc_id)
            ).fetchone()
        return json.loads(row[0]) if row else None

    def _set(self, collection: str, doc_id: str, data: dict[str, Any]) -> None:
        payload = json.dumps({**data, "id": doc_id}, default=str)
        with self._lock:
            self._conn.execute(
                "INSERT INTO docs(collection,id,data) VALUES(?,?,?) "
                "ON CONFLICT(collection,id) DO UPDATE SET data=excluded.data",
                (collection, doc_id, payload),
            )
            self._conn.commit()

    def _delete(self, collection: str, doc_id: str) -> None:
        with self._lock:
            self._conn.execute("DELETE FROM docs WHERE collection=? AND id=?", (collection, doc_id))
            self._conn.commit()

    def _all(self, collection: str) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute("SELECT data FROM docs WHERE collection=?", (collection,)).fetchall()
        return [json.loads(r[0]) for r in rows]

    async def get(self, collection: str, doc_id: str) -> dict[str, Any] | None:
        return await asyncio.to_thread(self._get, collection, doc_id)

    async def set(self, collection: str, doc_id: str, data: dict[str, Any]) -> None:
        await asyncio.to_thread(self._set, collection, doc_id, data)

    async def delete(self, collection: str, doc_id: str) -> None:
        await asyncio.to_thread(self._delete, collection, doc_id)

    async def query(self, collection, filters=None, order_by=None, descending=False, limit=None):
        docs = await asyncio.to_thread(self._all, collection)
        docs = [d for d in docs if _match(d, filters or [])]
        if order_by:
            docs.sort(key=lambda d: (d.get(order_by) is None, d.get(order_by)), reverse=descending)
        return docs[:limit] if limit else docs


class FirestoreStore(DocumentStore):
    name = "firestore"

    def __init__(self, credentials: str, project_id: str) -> None:
        import firebase_admin
        from firebase_admin import credentials as fb_credentials
        from firebase_admin import firestore

        if not firebase_admin._apps:
            if credentials.strip().startswith("{"):
                cred = fb_credentials.Certificate(json.loads(credentials))
            else:
                cred = fb_credentials.Certificate(credentials)
            firebase_admin.initialize_app(cred, {"projectId": project_id})
        self._db = firestore.client()

    async def get(self, collection, doc_id):
        snap = await asyncio.to_thread(self._db.collection(collection).document(doc_id).get)
        return snap.to_dict() if snap.exists else None

    async def set(self, collection, doc_id, data):
        await asyncio.to_thread(self._db.collection(collection).document(doc_id).set, {**data, "id": doc_id})

    async def delete(self, collection, doc_id):
        await asyncio.to_thread(self._db.collection(collection).document(doc_id).delete)

    async def query(self, collection, filters=None, order_by=None, descending=False, limit=None):
        from google.cloud.firestore_v1.base_query import FieldFilter

        def run() -> list[dict[str, Any]]:
            q: Any = self._db.collection(collection)
            for field, op, value in filters or []:
                q = q.where(filter=FieldFilter(field, op, value))
            if order_by:
                q = q.order_by(order_by, direction="DESCENDING" if descending else "ASCENDING")
            if limit:
                q = q.limit(limit)
            return [d.to_dict() for d in q.stream()]

        return await asyncio.to_thread(run)


_store: DocumentStore | None = None


def get_store() -> DocumentStore:
    global _store
    if _store is None:
        s = get_settings()
        use_firestore = s.storage_backend == "firestore" or (s.storage_backend == "auto" and s.firebase_configured)
        if use_firestore:
            try:
                _store = FirestoreStore(s.firebase_credentials or "", s.firebase_project_id or "")
                log.info("Using Firestore document store")
            except Exception as exc:  # pragma: no cover - depends on credentials
                log.error("Firestore unavailable (%s); falling back to SQLite", exc)
        if _store is None:
            _store = SQLiteStore(s.sqlite_path)
            log.info("Using local SQLite document store at %s", s.sqlite_path)
    return _store


def set_store(store: DocumentStore) -> None:
    """Used by tests to inject an in-memory store."""
    global _store
    _store = store
