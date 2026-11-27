"""Gemini client with structured JSON output, schema validation and a numeric-claim guard.

The model only explains and contextualises. Every number in its output must
come from the context AIRenv supplies; otherwise the field is rejected and the
deterministic fallback is used.
"""

from __future__ import annotations

import contextlib
import json
import logging
import re
from http import HTTPStatus
from typing import Any

from pydantic import BaseModel, ValidationError

from app.config import get_settings
from app.core.http import client

log = logging.getLogger("airenv.ai")

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
REQUEST_TIMEOUT_SECONDS = 30
MAX_HISTORY_TURNS = 8
HISTORY_TURN_MAX_CHARS = 2000
# Integers up to this value may appear without support in the context (hours, counts, list ordinals).
MAX_FREE_INTEGER = 24

LANGUAGES = {
    "en": "English",
    "hi": "Hindi",
    "ta": "Tamil",
    "bn": "Bengali",
    "mr": "Marathi",
    "te": "Telugu",
    "kn": "Kannada",
    "pa": "Punjabi",
}

SYSTEM_RULES = """You are AIRenv AI, the decision-intelligence layer of an environmental platform for families,
schools and communities facing urban air pollution.
Rules you must follow:
- Use ONLY the numbers present in CONTEXT. Never invent readings, forecasts, percentages, health statistics or
  emission figures. If a number is not in CONTEXT, describe it qualitatively instead.
- Distinguish personal exposure reduction from emission reduction. Never claim an individual or community
  action has lowered local AQI.
- Do not diagnose or guarantee safety. For health concerns, advise consulting a doctor. Base health framing on
  the CPCB health statement in CONTEXT.
- Say clearly that values are model estimates when CONTEXT marks the source as a model, and that forecasts are
  uncertain.
- Never claim indoor air is measured; AIRenv has no indoor sensors.
- Be concise, practical and calm. No alarmism.
"""

_NUM = re.compile(r"(?<![\w.])\d+(?:[.,]\d+)?")


def _numbers(obj: Any) -> set[float]:
    text = json.dumps(obj, ensure_ascii=False, default=str)
    out: set[float] = set()
    for m in _NUM.findall(text):
        with contextlib.suppress(ValueError):
            out.add(float(m.replace(",", "")))
    return out


def unsupported_numbers(text: str, allowed: set[float]) -> list[str]:
    """Numbers in `text` that are not in the allowed set (allowing rounding). Small integers are permitted
    because they are used for times, counts and list ordinals."""
    bad = []
    for m in _NUM.findall(text):
        try:
            v = float(m.replace(",", ""))
        except ValueError:
            continue
        if v <= MAX_FREE_INTEGER and float(v).is_integer():
            continue
        if any(abs(v - a) <= max(1.0, abs(a) * 0.02) for a in allowed):
            continue
        bad.append(m)
    return bad


def guard_numbers(model: BaseModel, context: Any) -> tuple[bool, list[str]]:
    allowed = _numbers(context)
    text = json.dumps(model.model_dump(), ensure_ascii=False)
    bad = unsupported_numbers(text, allowed)
    return (len(bad) == 0, bad)


def available() -> bool:
    return bool(get_settings().gemini_api_key)


def _contents(
    task: str, context: dict[str, Any], language: str, history: list[dict[str, str]] | None
) -> list[dict[str, Any]]:
    """Recent chat turns followed by the task prompt with the JSON context."""
    contents: list[dict[str, Any]] = [
        {
            "role": "model" if turn.get("role") == "assistant" else "user",
            "parts": [{"text": turn.get("content", "")[:HISTORY_TURN_MAX_CHARS]}],
        }
        for turn in (history or [])[-MAX_HISTORY_TURNS:]
    ]
    prompt = (
        f"TASK:\n{task}\n\nRespond in {LANGUAGES.get(language, 'English')}. Return JSON only, matching the "
        f"response schema.\n\nCONTEXT (JSON):\n{json.dumps(context, ensure_ascii=False, default=str)}"
    )
    contents.append({"role": "user", "parts": [{"text": prompt}]})
    return contents


async def _first_candidate_text(body: dict[str, Any], model: str, api_key: str) -> str | None:
    """Raw text of Gemini's first candidate, or None on a non-200 response."""
    resp = await client().post(
        GEMINI_URL.format(model=model), json=body, headers={"x-goog-api-key": api_key}, timeout=REQUEST_TIMEOUT_SECONDS
    )
    if resp.status_code != HTTPStatus.OK:
        log.warning("Gemini HTTP %s: %s", resp.status_code, resp.text[:300])
        return None
    text: str = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
    return text


async def generate_json[T: BaseModel](
    task: str,
    context: dict[str, Any],
    schema_model: type[T],
    *,
    language: str = "en",
    history: list[dict[str, str]] | None = None,
    temperature: float = 0.3,
) -> T | None:
    """Call Gemini and return a validated model, or None on any failure (callers fall back to rules)."""
    s = get_settings()
    if not s.gemini_api_key:
        return None
    body = {
        "systemInstruction": {"parts": [{"text": SYSTEM_RULES}]},
        "contents": _contents(task, context, language, history),
        "generationConfig": {
            "temperature": temperature,
            "responseMimeType": "application/json",
            "responseSchema": _to_gemini_schema(schema_model.model_json_schema()),
        },
    }
    try:
        text = await _first_candidate_text(body, s.gemini_model, s.gemini_api_key)
        result = schema_model.model_validate_json(text) if text is not None else None
    except (KeyError, IndexError, ValidationError, ValueError) as exc:
        log.warning("Gemini response rejected: %s", exc)
        return None
    except Exception as exc:  # network errors, timeouts
        log.warning("Gemini call failed: %s", exc)
        return None
    if result is None:
        return None
    ok, bad = guard_numbers(result, context)
    if not ok:
        log.warning("Gemini output contained unsupported numbers %s; using fallback", bad[:5])
        return None
    return result


def _to_gemini_schema(schema: dict[str, Any]) -> dict[str, Any]:
    """Convert a Pydantic JSON schema to the OpenAPI subset accepted by Gemini (inline $refs, drop titles)."""
    defs = schema.get("$defs", {})
    dropped = {"title", "$defs", "default", "additionalProperties", "examples", "maxLength", "minLength", "pattern"}

    def conv(node: Any) -> Any:
        if isinstance(node, dict):
            if "$ref" in node:
                return conv(defs[node["$ref"].split("/")[-1]])
            if "anyOf" in node:
                options = [o for o in node["anyOf"] if o.get("type") != "null"]
                base = conv(options[0]) if options else {"type": "string"}
                base["nullable"] = True
                return base
            out: dict[str, Any] = {}
            for k, v in node.items():
                if k == "properties" and isinstance(v, dict):
                    # Keys here are field names (a field may be called "title"); keep them all.
                    out[k] = {name: conv(sub) for name, sub in v.items()}
                elif k not in dropped:
                    out[k] = conv(v)
            return out
        if isinstance(node, list):
            return [conv(x) for x in node]
        return node

    return conv(schema)
