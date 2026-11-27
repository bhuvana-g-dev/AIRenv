"""Deterministic extraction of community event details from short messages.

Only structured fields are returned; the original text is never stored.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from datetime import datetime, timedelta
from typing import Any

DAYS_PER_WEEK = 7
TWO_DIGIT_YEAR_LIMIT = 100  # "5/12/26" means 2026
CENTURY = 2000
LAST_HOUR = 23
AMBIGUOUS_AFTERNOON_HOURS = range(1, 7)  # "at 1".."at 6" without am/pm
OUTDOOR_BY_DEFAULT = ("sports", "practice", "run", "walk", "excursion", "assembly")
TWO_HOUR_ACTIVITIES = ("sports", "practice", "excursion", "function")

ACTIVITY_PATTERNS: list[tuple[str, str, str, list[str]]] = [
    # (activity_type, intensity, label, keywords)
    (
        "sports",
        "high",
        "Outdoor sports",
        [
            r"sports?",
            r"cricket",
            r"football",
            r"hockey",
            r"athletics",
            r"kabaddi",
            r"basketball",
            r"badminton",
            r"match",
            r"tournament",
            r"\bpe\b",
            r"physical education",
            r"khel",
        ],
    ),
    ("practice", "high", "Sports practice", [r"practice", r"training", r"drill", r"coaching"]),
    ("run", "high", "Run or marathon", [r"marathon", r"\brun\b", r"running", r"jog", r"cyclothon", r"walkathon"]),
    ("excursion", "moderate", "Trip or excursion", [r"picnic", r"excursion", r"field trip", r"\btrip\b", r"outing"]),
    ("walk", "moderate", "Group walk", [r"\bwalk\b", r"morning walk", r"nature walk", r"prabhat pheri"]),
    ("assembly", "light", "Outdoor assembly", [r"assembly", r"parade", r"march past", r"rally", r"prayer"]),
    (
        "function",
        "light",
        "Community function",
        [
            r"function",
            r"celebration",
            r"festival",
            r"party",
            r"mela",
            r"get[- ]together",
            r"event",
            r"puja",
            r"wedding",
            r"program+e?",
        ],
    ),
]
OUTDOOR_HINTS = [
    r"outdoor",
    r"outside",
    r"ground",
    r"field",
    r"park",
    r"playground",
    r"lawn",
    r"terrace",
    r"open air",
    r"maidan",
    r"court",
    r"stadium",
    r"garden",
    r"courtyard",
]
INDOOR_HINTS = [r"indoor", r"\bhall\b", r"auditorium", r"classroom", r"clubhouse", r"inside"]
BURNING = [
    r"\bburn",
    r"bonfire",
    r"set (?:it )?on fire",
    r"\bfire\b.*(?:waste|garbage|leaves|kachra|kooda)",
    r"(?:waste|garbage|leaves|kachra|kooda|trash).*\b(?:burn|fire|jala)",
    r"\bjala(?:o|na|denge|dete)",
    r"open burning",
    r"stubble",
]
TRANSPORT = [r"carpool", r"car pool", r"ride share", r"school bus", r"\bpick ?up\b", r"\bdrop off\b", r"\bvan\b"]

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
        if h in AMBIGUOUS_AFTERNOON_HOURS:
            h += 12  # "at 4" in an activity context almost always means afternoon
        if h <= LAST_HOUR:
            return f"{h:02d}:00", "approximate"
    # Whole-word matches, longest phrases first ("afternoon" contains "noon").
    for word, hhmm in (
        ("early morning", "06:30"),
        ("afternoon", "15:00"),
        ("morning", "08:00"),
        ("noon", "12:00"),
        ("evening", "17:30"),
        ("tonight", "20:00"),
        ("night", "20:00"),
    ):
        if re.search(rf"\b{word}\b", text):
            return hhmm, "part_of_day"
    return None, "none"


DateMatch = tuple[str, str]  # (YYYY-MM-DD, precision)


def _day(now: datetime, days: int = 0) -> str:
    return (now + timedelta(days=days)).strftime("%Y-%m-%d")


def _relative_date(text: str, now: datetime) -> DateMatch | None:
    if "day after tomorrow" in text or "parso" in text:
        return _day(now, 2), "relative"
    if "tomorrow" in text or "kal " in text or text.endswith("kal"):
        return _day(now, 1), "relative"
    if "today" in text or "tonight" in text or "this evening" in text or "aaj" in text:
        return _day(now), "relative"
    return None


def _weekday_date(text: str, now: datetime) -> DateMatch | None:
    """The next occurrence of a named weekday ("this <day>" may mean today)."""
    for i, wd in enumerate(WEEKDAYS):
        if re.search(rf"\b{wd}\b", text):
            delta = (i - now.weekday()) % DAYS_PER_WEEK or DAYS_PER_WEEK
            if f"this {wd}" in text and delta == DAYS_PER_WEEK:
                delta = 0
            return _day(now, delta), "weekday"
    return None


def _numeric_date(text: str, now: datetime) -> DateMatch | None:
    """dd/mm, dd-mm-yy or dd/mm/yyyy."""
    m = re.search(r"\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b", text)
    if not m:
        return None
    d, mo = int(m.group(1)), int(m.group(2))
    y = int(m.group(3)) if m.group(3) else now.year
    if y < TWO_DIGIT_YEAR_LIMIT:
        y += CENTURY
    try:
        return datetime(y, mo, d).strftime("%Y-%m-%d"), "explicit"
    except ValueError:
        return None


def _ordinal_date(text: str, now: datetime) -> DateMatch | None:
    """Ordinal day ("on the 5th"): this month, or next month if that day has passed."""
    m = re.search(r"\bon\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b", text)
    if not m:
        return None
    d = int(m.group(1))
    try:
        cand = now.replace(day=d)
        if cand.date() < now.date():
            cand = (now.replace(day=1) + timedelta(days=32)).replace(day=d)
    except ValueError:
        return None
    return cand.strftime("%Y-%m-%d"), "explicit"


# Tried in order; the first parser that recognises a date wins.
DATE_PARSERS: tuple[Callable[[str, datetime], DateMatch | None], ...] = (
    _relative_date,
    _weekday_date,
    _numeric_date,
    _ordinal_date,
)


def parse_date(text: str, now: datetime) -> tuple[str | None, str]:
    for parser in DATE_PARSERS:
        if (found := parser(text, now)) is not None:
            return found
    return None, "none"


def _match_activity(text: str) -> tuple[str, str, str] | None:
    """(activity_type, intensity, label) of the first matching activity pattern."""
    for a_type, intensity, label, kws in ACTIVITY_PATTERNS:
        if _any(kws, text):
            return a_type, intensity, label
    return None


def _is_outdoor(text: str, activity_type: str) -> bool | None:
    if _any(OUTDOOR_HINTS, text):
        return True
    if _any(INDOOR_HINTS, text):
        return False
    return True if activity_type in OUTDOOR_BY_DEFAULT else None


def extract(text: str, now: datetime) -> dict[str, Any]:
    """Extract environmental-relevant structure from a message. `now` is local time at the group location."""
    t = " ".join(text.lower().split())
    result: dict[str, Any] = {"relevant": False, "kind": None}
    if _any(BURNING, t):
        date, _ = parse_date(t, now)
        title = "Open burning discussed"
        result.update({"relevant": True, "kind": "concern", "concern_type": "open_burning", "title": title})
        result["date"] = date or _day(now)
        return result
    activity = _match_activity(t)
    if activity is None:
        if _any(TRANSPORT, t):
            result.update({"relevant": True, "kind": "transport", "title": "Transport arrangement"})
        return result
    a_type, intensity, label = activity
    date, date_prec = parse_date(t, now)
    hhmm, time_prec = parse_time(t)
    if date is None and hhmm is None:
        return result  # mentions an activity but no schedule: not actionable
    result.update(
        {
            "relevant": True,
            "kind": "activity",
            "activity_type": a_type,
            "intensity": intensity,
            "title": label,
            "outdoor": _is_outdoor(t, a_type),
            "date": date or _day(now),
            "date_precision": date_prec if date else "assumed_today",
            "time": hhmm,
            "time_precision": time_prec,
            "duration_hours": 2 if a_type in TWO_HOUR_ACTIVITIES else 1,
        }
    )
    return result


PHONE = re.compile(r"(?:\+?\d[\d\s-]{8,}\d)")
EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
MENTION = re.compile(r"@\w+")
URL = re.compile(r"https?://\S+")


DATE_LIKE = re.compile(r"^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$")
MIN_PHONE_DIGITS = 10  # Indian mobile numbers have 10 digits; dd-mm-yyyy dates have 8.


def _phone_or_keep(m: re.Match[str]) -> str:
    candidate = m.group(0)
    if DATE_LIKE.match(candidate) or sum(ch.isdigit() for ch in candidate) < MIN_PHONE_DIGITS:
        return candidate
    return "[phone]"


def redact(text: str) -> str:
    """Remove direct identifiers before any further processing (e.g. optional AI extraction)."""
    text = URL.sub("[link]", text)
    text = EMAIL.sub("[email]", text)
    text = PHONE.sub(_phone_or_keep, text)
    return MENTION.sub("[user]", text)
