"""SQLite document store: query pushdown must never change results compared with in-Python filtering."""

import asyncio
import sqlite3

import pytest

from app.db.store import SQLiteStore, _match, _pushdown

DOCS = {
    "a": {"uid": "u1", "n": 1, "flag": True, "location": {"id": "28.61_77.21"}, "tags": ["x", "y"]},
    "b": {"uid": "u2", "n": 2, "flag": False, "location": {"id": "28.54_77.39"}, "tags": ["y"]},
    "c": {"uid": "u1", "n": 3.0, "flag": True, "location": None, "tags": []},
    "d": {"uid": 1, "n": None},
}


@pytest.fixture
def store():
    s = SQLiteStore(":memory:")
    for k, v in DOCS.items():
        asyncio.run(s.set("things", k, v))
    asyncio.run(s.set("other", "a", {"uid": "u1"}))
    return s


@pytest.mark.parametrize(
    "filters",
    [
        [("uid", "==", "u1")],
        [("uid", "==", 1)],
        [("flag", "==", True)],
        [("flag", "==", False)],
        [("n", "==", 3)],
        [("location.id", "==", "28.61_77.21")],
        [("uid", "in", ["u1", "u2"])],
        [("uid", "==", "u1"), ("flag", "==", True)],
        [("tags", "array_contains", "y")],
        [("n", ">=", 2)],
        [("uid", "!=", "u1")],
        [],
    ],
)
def test_query_matches_pure_python_filtering(store, filters):
    got = sorted(d["id"] for d in asyncio.run(store.query("things", filters)))
    expected = sorted(k for k, v in DOCS.items() if _match({**v, "id": k}, filters))
    assert got == expected


def test_query_is_scoped_to_collection(store):
    assert [d["id"] for d in asyncio.run(store.query("other", [("uid", "==", "u1")]))] == ["a"]


def test_pushdown_rejects_unsafe_field_names():
    with pytest.raises(ValueError):
        _pushdown([("uid') OR 1=1 --", "==", "x")])


def test_pushdown_only_translates_exact_scalar_filters():
    where, params = _pushdown([("uid", "==", "u1"), ("n", ">", 1), ("tags", "array_contains", "x")])
    assert where.count("json_extract") == 1 and params == ["u1"]


def test_equality_lookup_uses_expression_index(store):
    plan = store._conn.execute(
        "EXPLAIN QUERY PLAN SELECT data FROM docs WHERE collection=? AND json_extract(data, '$.uid') = ?",
        ("things", "u1"),
    ).fetchall()
    assert any("idx_docs_uid" in str(row) for row in plan)


def test_order_and_limit(store):
    rows = asyncio.run(store.query("things", [("uid", "==", "u1")], order_by="n", descending=True, limit=1))
    assert [r["id"] for r in rows] == ["c"]


def test_update_and_delete(store):
    assert asyncio.run(store.update("things", "missing", {"x": 1})) is None
    assert asyncio.run(store.update("things", "a", {"n": 10}))["n"] == 10
    asyncio.run(store.delete("things", "a"))
    assert asyncio.run(store.get("things", "a")) is None


def test_file_database_uses_wal(tmp_path):
    path = tmp_path / "sub" / "db.sqlite"
    SQLiteStore(str(path))
    mode = sqlite3.connect(path).execute("PRAGMA journal_mode").fetchone()[0]
    assert mode == "wal"
