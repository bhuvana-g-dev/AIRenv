"""Deterministic extraction of community event details from short messages.

Only structured fields are returned; the original text is never stored.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Any

ACTIVITY_PATTERNS: list[tuple[str, str, str, list[str]]] = [
    # (activity_type, intensity, label, keywords)
    ("sports", "high", "Outdoor sports", [r"sports?", r"cricket", r"football", r"hockey", r"athletics", r"kabaddi",
                                          r"basketball", r"badminton", r"match", r"tournament", r"\bpe\b",
                                          r"physical education", r"khel"]),
    ("practice", "high", "Sports practice", [r"practice", r"training", r"drill", r"coaching"]),
    ("run", "high", "Run or marathon", [r"marathon", r"\brun\b", r"running", r"jog", r"cyclothon", r"walkathon"]),
    ("excursion", "moderate", "Trip or excursion", [r"picnic", r"excursion", r"field trip", r"\btrip\b", r"outing"]),
    ("walk", "moderate", "Group walk", [r"\bwalk\b", r"morning walk", r"nature walk", r"prabhat pheri"]),
    ("assembly", "light", "Outdoor assembly", [r"assembly", r"parade", r"march past", r"rally", r"prayer"]),
    ("function", "light", "Community function", [r"function", r"celebration", r"festival", r"party", r"mela",
                                                 r"get[- ]together", r"event", r"puja", r"wedding", r"program+e?"]),
]
OUTDOOR_HINTS = [r"outdoor", r"outside", r"ground", r"field", r"park", r"playground", r"lawn", r"terrace",
                 r"open air", r"maidan", r"court", r"stadium", r"garden", r"courtyard"]
INDOOR_HINTS = [r"indoor", r"\bhall\b", r"auditorium", r"classroom", r"clubhouse", r"inside"]
BURNING = [r"\bburn", r"bonfire", r"set (?:it )?on fire", r"\bfire\b.*(?:waste|garbage|leaves|kachra|kooda)",
           r"(?:waste|garbage|leaves|kachra|kooda|trash).*\b(?:burn|fire|jala)", r"\bjala(?:o|na|denge|dete)",
           r"open burning", r"stubble"]
TRANSPORT = [r"carpool", r"car pool", r"ride share", r"school bus", r"pick ?up", r"drop off", r"van"]

WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def _any(patterns: list[str], text: str) -> bool:
    return any(re.search(p, text) for p in patterns)


def parse_time(text: str) -> tuple[str | None, str]:
    """Returns (HH:MM or None, precision)."""
    m = re.search(r"\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)", text)
    if m:
        h = int(m.group(1)) % 12
        if m.group(3).startswith("p"):
            h += 12
        return f"{h:02d}:{int(m.group(2) or 0):02d}", "exact"
    m = re.search(r"\b([01]?\d|2[0-3])[:.]([0-5]\d)\b", text)
    if m:
        return f"{int(m.group(1)):02d}:{m.group(2)}", "exact"
    m = re.search(r"\bat\s+(\d{1,2})\b(?!\s*(?:km|kg|%|th|st|nd|rd))", text)
    if m:
        h = int(m.group(1))
        if 1 <= h <= 6:
            h += 12  # "at 4" in an activity context almost always means afternoon
        if h <= 23:
            return f"{h:02d}:00", "approximate"
    for word, hhmm in (("early morning", "06:30"), ("morning", "08:00"), ("noon", "12:00"),
                       ("afternoon", "15:00"), ("evening", "17:30"), ("tonight", "20:00"), ("night", "20:00")):
        if word in text:
            return hhmm, "part_of_day"
    return None, "none"


def parse_date(text: str, now: datetime) -> tuple[str | None, str]:
    if "day after tomorrow" in text or "parso" in text:
        return (now + timedelta(days=2)).strftime("%Y-%m-%d"), "relative"
    if "tomorrow" in text or "kal " in text or text.endswith("kal"):
        return (now + timedelta(days=1)).strftime("%Y-%m-%d"), "relative"
    if "today" in text or "tonight" in text or "this evening" in text or "aaj" in text:
        return now.strftime("%Y-%m-%d"), "relative"
    for i, wd in enumerate(WEEKDAYS):
        if re.search(rf"\b{wd}\b", text):
            delta = (i - now.weekday()) % 7 or 7
            if f"this {wd}" in text and delta == 7:
                delta = 0
            return (now + timedelta(days=delta)).strftime("%Y-%m-%d"), "weekday"
    m = re.search(r"\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b", text)
    if m:
        d, mo = int(m.group(1)), int(m.group(2))
        y = int(m.group(3)) if m.group(3) else now.year
        if y < 100:
            y += 2000
        try:
            return datetime(y, mo, d).strftime("%Y-%m-%d"), "explicit"
        except ValueError:
            pass
    m = re.search(r"\bon\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b", text)
    if m:
        d = int(m.group(1))
        try:
            cand = now.replace(day=d)
            if cand.date() < now.date():
                cand = (now.replace(day=1) + timedelta(days=32)).replace(day=d)
            return cand.strftime("%Y-%m-%d"), "explicit"
        except ValueError:
            pass
    return None, "none"


def extract(text: str, now: datetime) -> dict[str, Any]:
    """Extract environmental-relevant structure from a message. `now` is local time at the group location."""
    t = " ".join(text.lower().split())
    result: dict[str, Any] = {"relevant": False, "kind": None}
    if _any(BURNING, t):
        result.update({"relevant": True, "kind": "concern", "concern_type": "open_burning",
                       "title": "Open burning discussed"})
        date, _ = parse_date(t, now)
        result["date"] = date or now.strftime("%Y-%m-%d")
        return result
    activity = None
    for a_type, intensity, label, kws in ACTIVITY_PATTERNS:
        if _any(kws, t):
            activity = (a_type, intensity, label)
            break
    if activity is None:
        if _any(TRANSPORT, t):
            result.update({"relevant": True, "kind": "transport", "title": "Transport arrangement"})
        return result
    date, date_prec = parse_date(t, now)
    hhmm, time_prec = parse_time(t)
    if date is None and hhmm is None:
        return result  # mentions an activity but no schedule: not actionable
    outdoor: bool | None = True if _any(OUTDOOR_HINTS, t) else False if _any(INDOOR_HINTS, t) else None
    if outdoor is None and activity[0] in ("sports", "practice", "run", "walk", "excursion", "assembly"):
        outdoor = True
    result.update({
        "relevant": True, "kind": "activity", "activity_type": activity[0], "intensity": activity[1],
        "title": activity[2], "outdoor": outdoor,
        "date": date or now.strftime("%Y-%m-%d"), "date_precision": date_prec if date else "assumed_today",
        "time": hhmm, "time_precision": time_prec,
        "duration_hours": 2 if activity[0] in ("sports", "practice", "excursion", "function") else 1,
    })
    return result


PHONE = re.compile(r"(?:\+?\d[\d\s-]{8,}\d)")
EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
MENTION = re.compile(r"@\w+")
URL = re.compile(r"https?://\S+")


def redact(text: str) -> str:
    """Remove direct identifiers before any further processing (e.g. optional AI extraction)."""
    text = URL.sub("[link]", text)
    text = EMAIL.sub("[email]", text)
    text = PHONE.sub("[phone]", text)
    return MENTION.sub("[user]", text)
