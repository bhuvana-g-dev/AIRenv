"""Unit tests for the Gemini wrapper, the shared HTTP helper and the in-process event bus (no network)."""

import asyncio
import json
from datetime import datetime
from types import SimpleNamespace
from typing import Literal

import httpx
import pytest
from pydantic import BaseModel, Field

from app.config import get_settings
from app.core import http
from app.core.events_bus import EventBus
from app.services import ai_engine

# --------------------------------------------------------------------------- _to_gemini_schema


class Inner(BaseModel):
    name: str = Field(title="Name", max_length=10)


class Outer(BaseModel):
    items: list[Inner]
    note: str | None = None
    count: int = 3
    extra: Inner | None = None
    level: Literal["low", "high"] = "low"
    code: str = Field("x", pattern="^[a-z]$")


def test_gemini_schema_inlines_refs_and_drops_unsupported_keys():
    out = ai_engine._to_gemini_schema(Outer.model_json_schema())
    text = json.dumps(out)
    for banned in ("$ref", "$defs", "title", "default", "maxLength", "pattern"):
        assert banned not in text
    props = out["properties"]
    assert props["items"] == {
        "items": {"properties": {"name": {"type": "string"}}, "required": ["name"], "type": "object"},
        "type": "array",
    }
    assert props["count"] == {"type": "integer"}
    assert props["code"] == {"type": "string"}
    assert props["level"]["enum"] == ["low", "high"]
    assert out["required"] == ["items"]
    assert out["type"] == "object"


def test_gemini_schema_optional_becomes_nullable():
    props = ai_engine._to_gemini_schema(Outer.model_json_schema())["properties"]
    assert props["note"] == {"type": "string", "nullable": True}
    assert props["extra"]["nullable"] is True
    assert props["extra"]["properties"] == {"name": {"type": "string"}}


def test_gemini_schema_nullable_does_not_leak_into_shared_definition():
    props = ai_engine._to_gemini_schema(Outer.model_json_schema())["properties"]
    assert "nullable" not in props["items"]["items"]


class WithTitleField(BaseModel):
    title: str
    summary: str


def test_gemini_schema_keeps_property_named_title():
    out = ai_engine._to_gemini_schema(WithTitleField.model_json_schema())
    assert set(out["properties"]) == {"title", "summary"}


# --------------------------------------------------------------------------- numeric guard


def test_numbers_collects_nested_values():
    assert ai_engine._numbers({"a": [1.5, {"b": 200}], "c": "1,200 kg"}) == {1.5, 200.0, 1200.0}


@pytest.mark.parametrize(
    "text, allowed, bad",
    [
        ("PM2.5 near 148", {146.7}, []),  # within 2 %
        ("PM2.5 near 150", {146.7}, ["150"]),  # 3.3 away > 2 % of 146.7
        ("about 51 today", {50.0}, []),  # ±1 absolute tolerance for small values
        ("about 51.5 today", {50.0}, ["51.5"]),
        ("about 25 kids", {10.0}, ["25"]),  # integers above 24 must be supported
        ("at 7 PM, 3 groups, 24 hours", set(), []),  # small integers are always allowed
        ("ratio 3.5", set(), ["3.5"]),  # small non-integers are not
        ("emissions 1,200 kg", {1200.0}, []),
        ("PM2.5 is high", set(), []),  # the '2.5' inside a label is not a number
    ],
)
def test_unsupported_numbers_tolerance(text, allowed, bad):
    assert ai_engine.unsupported_numbers(text, allowed) == bad


def test_guard_numbers_on_model():
    class Msg(BaseModel):
        text: str

    assert ai_engine.guard_numbers(Msg(text="PM2.5 is 146.7"), {"pm": 146.7}) == (True, [])
    assert ai_engine.guard_numbers(Msg(text="AQI 391"), {"pm": 146.7}) == (False, ["391"])


# --------------------------------------------------------------------------- generate_json


class Answer(BaseModel):
    summary: str
    pm: float


CONTEXT = {"pm2_5": 146.7}


def _gemini_response(text, status=200):
    if status != 200:
        return httpx.Response(status, text="upstream error")
    return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": text}]}}]})


class FakeClient:
    def __init__(self, response=None, exc=None):
        self.response = response
        self.exc = exc
        self.calls = []

    async def post(self, url, json=None, headers=None, timeout=None):
        self.calls.append({"url": url, "json": json, "headers": headers, "timeout": timeout})
        if self.exc:
            raise self.exc
        return self.response


@pytest.fixture
def gemini_key(monkeypatch):
    monkeypatch.setattr(get_settings(), "gemini_api_key", "test-key")


def _install_client(monkeypatch, fake):
    monkeypatch.setattr(ai_engine, "client", lambda: fake)
    return fake


def test_generate_json_without_key_returns_none(monkeypatch):
    monkeypatch.setattr(get_settings(), "gemini_api_key", None)
    fake = _install_client(monkeypatch, FakeClient(exc=AssertionError("must not be called")))
    assert asyncio.run(ai_engine.generate_json("task", CONTEXT, Answer)) is None
    assert fake.calls == []
    assert ai_engine.available() is False


def test_generate_json_accepts_valid_grounded_output(monkeypatch, gemini_key):
    fake = _install_client(monkeypatch, FakeClient(_gemini_response('{"summary": "PM2.5 is 146.7", "pm": 146.7}')))
    history = [{"role": "assistant" if i % 2 else "user", "content": f"turn {i}"} for i in range(10)]
    result = asyncio.run(ai_engine.generate_json("Explain", CONTEXT, Answer, language="hi", history=history))
    assert result == Answer(summary="PM2.5 is 146.7", pm=146.7)
    call = fake.calls[0]
    assert call["headers"] == {"x-goog-api-key": "test-key"}
    assert call["url"].endswith(f"{get_settings().gemini_model}:generateContent")
    body = call["json"]
    assert len(body["contents"]) == 9  # last 8 history turns + the prompt
    assert body["contents"][0]["parts"][0]["text"] == "turn 2"
    assert {c["role"] for c in body["contents"][:8]} == {"user", "model"}
    assert "Respond in Hindi" in body["contents"][-1]["parts"][0]["text"]
    assert body["generationConfig"]["responseMimeType"] == "application/json"
    assert "$defs" not in json.dumps(body["generationConfig"]["responseSchema"])


@pytest.mark.parametrize(
    "fake",
    [
        FakeClient(_gemini_response('{"summary": 5}')),  # schema mismatch
        FakeClient(_gemini_response("not json at all")),  # invalid JSON
        FakeClient(_gemini_response("", status=500)),  # non-200
        FakeClient(httpx.Response(200, json={"candidates": []})),  # missing candidate
        FakeClient(exc=httpx.ConnectError("offline")),  # network error
    ],
)
def test_generate_json_failures_return_none(monkeypatch, gemini_key, fake):
    _install_client(monkeypatch, fake)
    assert asyncio.run(ai_engine.generate_json("Explain", CONTEXT, Answer)) is None
    assert len(fake.calls) == 1


def test_generate_json_rejects_invented_numbers(monkeypatch, gemini_key):
    _install_client(monkeypatch, FakeClient(_gemini_response('{"summary": "This cuts risk by 73%", "pm": 146.7}')))
    assert asyncio.run(ai_engine.generate_json("Explain", CONTEXT, Answer)) is None


# --------------------------------------------------------------------------- http.get_json


def _get_json(monkeypatch, handler, **kwargs):
    """Run get_json against a MockTransport; returns (result_or_exception, request_count, sleeps)."""
    sleeps = []
    requests = []

    async def fake_sleep(delay):
        sleeps.append(delay)

    monkeypatch.setattr(http, "asyncio", SimpleNamespace(sleep=fake_sleep))

    def counting(request):
        requests.append(request)
        return handler(request, len(requests))

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(counting)) as c:
            monkeypatch.setattr(http, "client", lambda: c)
            try:
                return await http.get_json("TestProvider", "https://example.test/data", **kwargs)
            except http.UpstreamError as exc:
                return exc

    return asyncio.run(run()), requests, sleeps


def test_get_json_success_passes_params_and_headers(monkeypatch):
    def handler(request, n):
        assert request.url.params["lat"] == "28.6"
        assert request.headers["X-API-Key"] == "k"
        return httpx.Response(200, json={"ok": True})

    result, requests, sleeps = _get_json(monkeypatch, handler, params={"lat": 28.6}, headers={"X-API-Key": "k"})
    assert result == {"ok": True}
    assert len(requests) == 1
    assert sleeps == []


def test_get_json_retries_once_after_server_error(monkeypatch):
    def handler(request, n):
        return httpx.Response(500) if n == 1 else httpx.Response(200, json=[1, 2])

    result, requests, sleeps = _get_json(monkeypatch, handler)
    assert result == [1, 2]
    assert len(requests) == 2
    assert sleeps == [0.6]


def test_get_json_gives_up_after_retries(monkeypatch):
    result, requests, sleeps = _get_json(monkeypatch, lambda r, n: httpx.Response(503), retries=2)
    assert isinstance(result, http.UpstreamError)
    assert result.provider == "TestProvider"
    assert "503" in result.message
    assert len(requests) == 3
    assert sleeps == [0.6, 1.2]


@pytest.mark.parametrize(
    "status, message",
    [
        (401, "authorization failed (HTTP 401)"),
        (403, "authorization failed (HTTP 403)"),
        (429, "rate limited by provider (HTTP 429)"),
    ],
)
def test_get_json_does_not_retry_auth_or_rate_limit(monkeypatch, status, message):
    result, requests, sleeps = _get_json(monkeypatch, lambda r, n: httpx.Response(status))
    assert isinstance(result, http.UpstreamError)
    assert result.message == message
    assert str(result) == f"TestProvider: {message}"
    assert len(requests) == 1
    assert sleeps == []


def test_get_json_timeout(monkeypatch):
    def handler(request, n):
        raise httpx.ReadTimeout("slow", request=request)

    result, requests, sleeps = _get_json(monkeypatch, handler)
    assert isinstance(result, http.UpstreamError)
    assert result.message == "request timed out"
    assert len(requests) == 2
    assert sleeps == [0.6]


def test_get_json_timeout_then_success(monkeypatch):
    def handler(request, n):
        if n == 1:
            raise httpx.ConnectTimeout("slow", request=request)
        return httpx.Response(200, json={"v": 1})

    result, requests, _ = _get_json(monkeypatch, handler)
    assert result == {"v": 1}
    assert len(requests) == 2


def test_get_json_invalid_json_is_an_upstream_error(monkeypatch):
    result, requests, _ = _get_json(monkeypatch, lambda r, n: httpx.Response(200, content=b"<html>"))
    assert isinstance(result, http.UpstreamError)
    assert len(requests) == 2


def test_get_json_without_retries(monkeypatch):
    result, requests, sleeps = _get_json(monkeypatch, lambda r, n: httpx.Response(500), retries=0)
    assert isinstance(result, http.UpstreamError)
    assert len(requests) == 1
    assert sleeps == []


# --------------------------------------------------------------------------- EventBus


def test_bus_publish_formats_sse_message():
    bus = EventBus()
    q = bus.subscribe(["location:a"])
    bus.publish("location:a", "snapshot.updated", {"aqi": 150, "at": datetime(2026, 11, 19, 10, 0)})
    assert q.get_nowait() == ('event: snapshot.updated\ndata: {"aqi": 150, "at": "2026-11-19 10:00:00"}\n\n')
    assert q.empty()


def test_bus_topic_isolation_and_multi_topic_subscription():
    bus = EventBus()
    both = bus.subscribe(["location:a", "user:1"])
    other = bus.subscribe(["location:b"])
    bus.publish("location:a", "feed.created", {"n": 1})
    bus.publish("user:1", "notification.created", {"n": 2})
    bus.publish("nobody:listens", "x", {})
    assert both.qsize() == 2
    assert other.empty()


def test_bus_unsubscribe_and_count():
    bus = EventBus()
    a = bus.subscribe(["t1", "t2"])
    b = bus.subscribe(["t1"])
    assert bus.subscriber_count() == 2  # a queue on two topics counts once
    bus.unsubscribe(a)
    assert bus.subscriber_count() == 1
    bus.publish("t1", "e", 1)
    bus.publish("t2", "e", 2)
    assert a.empty()
    assert b.qsize() == 1
    bus.unsubscribe(b)
    assert bus.subscriber_count() == 0


def test_bus_full_queue_drops_oldest():
    bus = EventBus()
    q = bus.subscribe(["t"])
    for i in range(101):
        bus.publish("t", "e", i)
    assert q.qsize() == 100
    messages = [q.get_nowait() for _ in range(100)]
    assert messages[0] == "event: e\ndata: 1\n\n"  # message 0 was dropped
    assert messages[-1] == "event: e\ndata: 100\n\n"
