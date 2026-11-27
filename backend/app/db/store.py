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
import re
import sqlite3
import threading
from abc import ABC, abstractmethod
from collections.abc import Iterable
from typing import Any

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


_FIELD_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$")
# Fields used in equality filters on hot paths; expression indexes make those lookups O(log n).
_INDEXED_FIELDS = ("uid", "community_id", "location_id", "group_id", "location.id", "is_demo")


def _sql_value(value: Any) -> Any:
    # json_extract returns 1/0 for JSON true/false.
    return int(value) if isinstance(value, bool) else value


def _pushdown(filters: Iterable[Filter]) -> tuple[str, list[Any]]:
    """Translate the filters SQLite can evaluate exactly into a WHERE fragment.

    Only scalar ``==`` and ``in`` filters are pushed down. Everything is still re-checked by
    ``_match`` afterwards, so pushdown can only narrow the candidate rows, never change results.
    Field names are validated against a strict pattern before being placed in the JSON path
    literal (which must be inlined for SQLite to use the expression indexes).
    """
    clauses: list[str] = []
    params: list[Any] = []
    for field, op, value in filters:
        if not _FIELD_RE.match(field):
            raise ValueError(f"Invalid field name: {field!r}")
        expr = f"json_extract(data, '$.{field}')"
        if op == "==" and isinstance(value, (str, int, float, bool)):
            clauses.append(f"{expr} = ?")
            params.append(_sql_value(value))
        elif op == "in" and value and all(isinstance(v, (str, int, float, bool)) for v in value):
            clauses.append(f"{expr} IN ({','.join('?' * len(value))})")
            params.extend(_sql_value(v) for v in value)
    return (" AND " + " AND ".join(clauses)) if clauses else "", params


class SQLiteStore(DocumentStore):
    name = "sqlite"

    def __init__(self, path: str) -> None:
        if path != ":memory:":
            os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._lock = threading.Lock()
        with self._lock:
            if path != ":memory:":
                self._conn.execute("PRAGMA journal_mode=WAL")
                self._conn.execute("PRAGMA synchronous=NORMAL")
            self._conn.execute(
                "CREATE TABLE IF NOT EXISTS docs (collection TEXT NOT NULL, id TEXT NOT NULL, "
                "data TEXT NOT NULL, PRIMARY KEY (collection, id))"
            )
            for f in _INDEXED_FIELDS:
                name = "idx_docs_" + f.replace(".", "_")
                self._conn.execute(
                    f"CREATE INDEX IF NOT EXISTS {name} ON docs(collection, json_extract(data, '$.{f}'))")
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

    def _select(self, collection: str, filters: list[Filter]) -> list[dict[str, Any]]:
        where, params = _pushdown(filters)
        with self._lock:
            # `where` contains only validated field names and `?` placeholders (see _pushdown).
            rows = self._conn.execute(f"SELECT data FROM docs WHERE collection=?{where}",  # noqa: S608
                                      (collection, *params)).fetchall()
        return [json.loads(r[0]) for r in rows]

    async def get(self, collection: str, doc_id: str) -> dict[str, Any] | None:
        return await asyncio.to_thread(self._get, collection, doc_id)

    async def set(self, collection: str, doc_id: str, data: dict[str, Any]) -> None:
        await asyncio.to_thread(self._set, collection, doc_id, data)

    async def delete(self, collection: str, doc_id: str) -> None:
        await asyncio.to_thread(self._delete, collection, doc_id)

    async def query(self, collection, filters=None, order_by=None, descending=False, limit=None):
        docs = await asyncio.to_thread(self._select, collection, filters or [])
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
