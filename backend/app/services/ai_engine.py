"""Gemini client with structured JSON output, schema validation and a numeric-claim guard.

The model only explains and contextualises. Every number in its output must
come from the context AIRenv supplies; otherwise the field is rejected and the
deterministic fallback is used.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, TypeVar

from pydantic import BaseModel, ValidationError

from app.config import get_settings
from app.core.http import client

log = logging.getLogger("airenv.ai")

T = TypeVar("T", bound=BaseModel)
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

LANGUAGES = {"en": "English", "hi": "Hindi", "ta": "Tamil", "bn": "Bengali", "mr": "Marathi", "te": "Telugu",
             "kn": "Kannada", "pa": "Punjabi"}

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
        try:
            out.add(float(m.replace(",", "")))
        except ValueError:
            pass
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
        if v <= 24 and float(v).is_integer():
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


async def generate_json(task: str, context: dict[str, Any], schema_model: type[T], *, language: str = "en",
                        history: list[dict[str, str]] | None = None, temperature: float = 0.3) -> T | None:
    """Call Gemini and return a validated model, or None on any failure (callers fall back to rules)."""
    s = get_settings()
    if not s.gemini_api_key:
        return None
    lang = LANGUAGES.get(language, "English")
    contents: list[dict[str, Any]] = []
    for turn in (history or [])[-8:]:
        role = "model" if turn.get("role") == "assistant" else "user"
        contents.append({"role": role, "parts": [{"text": turn.get("content", "")[:2000]}]})
    prompt = (f"TASK:\n{task}\n\nRespond in {lang}. Return JSON only, matching the response schema.\n\n"
              f"CONTEXT (JSON):\n{json.dumps(context, ensure_ascii=False, default=str)}")
    contents.append({"role": "user", "parts": [{"text": prompt}]})
    body = {
        "systemInstruction": {"parts": [{"text": SYSTEM_RULES}]},
        "contents": contents,
        "generationConfig": {
            "temperature": temperature,
            "responseMimeType": "application/json",
            "responseSchema": _to_gemini_schema(schema_model.model_json_schema()),
        },
    }
    try:
        resp = await client().post(GEMINI_URL.format(model=s.gemini_model), json=body,
                                   headers={"x-goog-api-key": s.gemini_api_key}, timeout=30)
        if resp.status_code != 200:
            log.warning("Gemini HTTP %s: %s", resp.status_code, resp.text[:300])
            return None
        data = resp.json()
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        result = schema_model.model_validate_json(text)
    except (KeyError, IndexError, ValidationError, ValueError) as exc:
        log.warning("Gemini response rejected: %s", exc)
        return None
    except Exception as exc:  # network errors, timeouts
        log.warning("Gemini call failed: %s", exc)
        return None
    ok, bad = guard_numbers(result, context)
    if not ok:
        log.warning("Gemini output contained unsupported numbers %s; using fallback", bad[:5])
        return None
    return result


def _to_gemini_schema(schema: dict[str, Any]) -> dict[str, Any]:
    """Convert a Pydantic JSON schema to the OpenAPI subset accepted by Gemini (inline $refs, drop titles)."""
    defs = schema.get("$defs", {})

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
                if k in ("title", "$defs", "default", "additionalProperties", "examples", "maxLength",
                         "minLength", "pattern"):
                    continue
                out[k] = conv(v)
            return out
        if isinstance(node, list):
            return [conv(x) for x in node]
        return node

    return conv(schema)
