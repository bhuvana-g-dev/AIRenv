"""Unit tests for deterministic community-message event extraction and redaction."""

from datetime import datetime

import pytest

from app.services import event_detection as ed

NOW = datetime(2026, 11, 19, 10, 0)  # a Thursday


# --------------------------------------------------------------------------- parse_time


@pytest.mark.parametrize(
    "text, hhmm",
    [
        ("at 4 pm", "16:00"),
        ("4:30pm", "16:30"),
        ("12 am", "00:00"),
        ("12 pm", "12:00"),
        ("7.15 a.m.", "07:15"),
        ("11 p.m.", "23:00"),
        ("18:45", "18:45"),
        ("9.30", "09:30"),
    ],
)
def test_parse_time_exact(text, hhmm):
    assert ed.parse_time(text) == (hhmm, "exact")


@pytest.mark.parametrize(
    "text, hhmm",
    [
        ("at 4", "16:00"),  # 1-6 is assumed to be afternoon
        ("at 6", "18:00"),
        ("at 7", "07:00"),
        ("at 9", "09:00"),
        ("at 18", "18:00"),
    ],
)
def test_parse_time_at_hour_heuristic(text, hhmm):
    assert ed.parse_time(text) == (hhmm, "approximate")


@pytest.mark.parametrize("text", ["at 30", "walk at 5 km", "see you soon"])
def test_parse_time_rejects_non_times(text):
    assert ed.parse_time(text) == (None, "none")


@pytest.mark.parametrize(
    "text, hhmm",
    [
        ("early morning walk", "06:30"),
        ("tomorrow morning", "08:00"),
        ("lunch at noon", "12:00"),
        ("this evening", "17:30"),
        ("party tonight", "20:00"),
        ("late night", "20:00"),
    ],
)
def test_parse_time_part_of_day(text, hhmm):
    assert ed.parse_time(text) == (hhmm, "part_of_day")


def test_parse_time_afternoon_is_15h():
    assert ed.parse_time("practice in the afternoon") == ("15:00", "part_of_day")


# --------------------------------------------------------------------------- parse_date


@pytest.mark.parametrize(
    "text, date",
    [
        ("today", "2026-11-19"),
        ("tonight", "2026-11-19"),
        ("this evening", "2026-11-19"),
        ("aaj shaam", "2026-11-19"),
        ("tomorrow", "2026-11-20"),
        ("kal subah match", "2026-11-20"),
        ("match kal", "2026-11-20"),
        ("day after tomorrow", "2026-11-21"),
        ("parso", "2026-11-21"),
    ],
)
def test_parse_date_relative(text, date):
    assert ed.parse_date(text, NOW) == (date, "relative")


@pytest.mark.parametrize(
    "text, date",
    [
        ("saturday", "2026-11-21"),
        ("monday", "2026-11-23"),
        ("thursday", "2026-11-26"),  # same weekday -> next week
        ("this thursday", "2026-11-19"),  # unless "this" is used
        ("this saturday", "2026-11-21"),
    ],
)
def test_parse_date_weekday(text, date):
    assert ed.parse_date(text, NOW) == (date, "weekday")


@pytest.mark.parametrize(
    "text, date",
    [
        ("on 25/12", "2026-12-25"),
        ("on 25/12/2026", "2026-12-25"),
        ("on 05-01-27", "2027-01-05"),
        ("on the 25th", "2026-11-25"),
        ("on 19th", "2026-11-19"),
        ("on the 5th", "2026-12-05"),  # already past this month -> next month
    ],
)
def test_parse_date_explicit(text, date):
    assert ed.parse_date(text, NOW) == (date, "explicit")


def test_parse_date_ordinal_rolls_over_year_end():
    assert ed.parse_date("on the 5th", datetime(2026, 12, 20, 9, 0)) == ("2027-01-05", "explicit")
    assert ed.parse_date("on the 1st", datetime(2026, 12, 20, 9, 0)) == ("2027-01-01", "explicit")


@pytest.mark.parametrize("text", ["on 31/02", "on 13/13", "on the 31st", "see you soon"])
def test_parse_date_invalid_or_missing(text):
    assert ed.parse_date(text, NOW) == (None, "none")


def test_parse_date_kal_needs_word_end():
    assert ed.parse_date("kalpana is coming", NOW) == (None, "none")


# --------------------------------------------------------------------------- extract


def test_extract_sports_with_full_schedule():
    r = ed.extract("Cricket match tomorrow at 4 pm in the park", NOW)
    assert r == {
        "relevant": True,
        "kind": "activity",
        "activity_type": "sports",
        "intensity": "high",
        "title": "Outdoor sports",
        "outdoor": True,
        "date": "2026-11-20",
        "date_precision": "relative",
        "time": "16:00",
        "time_precision": "exact",
        "duration_hours": 2,
    }


@pytest.mark.parametrize(
    "text, activity, intensity, duration",
    [
        ("Practice session on saturday 7 am", "practice", "high", 2),
        ("Morning run tomorrow 6:30 am", "run", "high", 1),
        ("School picnic on 25/12", "excursion", "moderate", 2),
        ("Nature walk sunday 7 am", "walk", "moderate", 1),
        ("Assembly tomorrow at 9", "assembly", "light", 1),
        ("Diwali celebration tomorrow evening", "function", "light", 2),
    ],
)
def test_extract_activity_patterns(text, activity, intensity, duration):
    r = ed.extract(text, NOW)
    assert r["kind"] == "activity"
    assert r["activity_type"] == activity
    assert r["intensity"] == intensity
    assert r["duration_hours"] == duration


def test_extract_schedule_details_per_pattern():
    picnic = ed.extract("School picnic on 25/12", NOW)
    assert (picnic["date"], picnic["date_precision"], picnic["time"], picnic["time_precision"]) == (
        "2026-12-25",
        "explicit",
        None,
        "none",
    )
    walk = ed.extract("Nature walk sunday 7 am", NOW)
    assert (walk["date"], walk["time"]) == ("2026-11-22", "07:00")
    assembly = ed.extract("Assembly tomorrow at 9", NOW)
    assert (assembly["time"], assembly["time_precision"]) == ("09:00", "approximate")
    festival = ed.extract("Diwali celebration tomorrow evening", NOW)
    assert (festival["time"], festival["time_precision"]) == ("17:30", "part_of_day")


def test_extract_first_matching_pattern_wins():
    r = ed.extract("Cricket practice today at 5 pm", NOW)
    assert r["activity_type"] == "sports"
    assert r["date"] == "2026-11-19"


def test_extract_normalises_case_and_whitespace():
    r = ed.extract("  CRICKET   Match \n TOMORROW  ", NOW)
    assert r["activity_type"] == "sports"
    assert r["date"] == "2026-11-20"


def test_extract_time_only_assumes_today():
    r = ed.extract("Football match at 5 pm", NOW)
    assert r["date"] == "2026-11-19"
    assert r["date_precision"] == "assumed_today"
    assert r["time"] == "17:00"


def test_extract_activity_without_schedule_is_not_relevant():
    assert ed.extract("We all love cricket", NOW) == {"relevant": False, "kind": None}


def test_extract_unrelated_message():
    assert ed.extract("Hello everyone, good to see you", NOW) == {"relevant": False, "kind": None}


@pytest.mark.parametrize(
    "text, outdoor",
    [
        ("Birthday party at the clubhouse on saturday at 6 pm", False),  # indoor hint
        ("Assembly in the hall tomorrow at 9", False),  # indoor hint beats the default
        ("Indoor badminton tournament tomorrow at 10 am", False),
        ("Diwali celebration in the garden tomorrow evening", True),  # outdoor hint
        ("Diwali celebration tomorrow evening", None),  # functions have no default
        ("Practice session on saturday 7 am", True),  # practice defaults outdoors
    ],
)
def test_extract_outdoor_hints(text, outdoor):
    assert ed.extract(text, NOW)["outdoor"] is outdoor


@pytest.mark.parametrize("text", ["Can someone carpool to school?", "School bus is late", "Need a pickup"])
def test_extract_transport(text):
    assert ed.extract(text, NOW) == {"relevant": True, "kind": "transport", "title": "Transport arrangement"}


def test_extract_advance_is_not_transport():
    assert ed.extract("Thanks in advance everyone", NOW)["relevant"] is False


@pytest.mark.parametrize(
    "text, date",
    [
        ("They are burning garbage near the park", "2026-11-19"),
        ("kachra jala rahe hain", "2026-11-19"),
        ("Farmers clearing stubble", "2026-11-19"),
        ("Fire in the garbage dump", "2026-11-19"),
        ("Bonfire party tomorrow night", "2026-11-20"),  # burning wins over the party pattern
    ],
)
def test_extract_burning_variants(text, date):
    r = ed.extract(text, NOW)
    assert r == {
        "relevant": True,
        "kind": "concern",
        "concern_type": "open_burning",
        "title": "Open burning discussed",
        "date": date,
    }


# --------------------------------------------------------------------------- redact


@pytest.mark.parametrize(
    "text, expected",
    [
        ("see https://example.com/a?b=1 now", "see [link] now"),
        ("mail a.b+c@mail.example.org now", "mail [email] now"),
        ("call +91 98765 43210 today", "call [phone] today"),
        ("call 9876543210", "call [phone]"),
        ("call 98765-43210", "call [phone]"),
        ("ping @ravi_k please", "ping [user] please"),
        ("https://x.com/@user", "[link]"),
    ],
)
def test_redact_identifiers(text, expected):
    assert ed.redact(text) == expected


def test_redact_email_is_not_turned_into_mention():
    out = ed.redact("write to coach@school.in")
    assert out == "write to [email]"
    assert "[user]" not in out


@pytest.mark.parametrize(
    "text",
    [
        "Match at 3 PM near Block 12, gate 4",
        "2 teams of 11 players, 20 overs",
        "Meet on 25/12 at 7:30",
        "Picnic on 05-01-27",
    ],
)
def test_redact_keeps_ordinary_numbers(text):
    assert ed.redact(text) == text


def test_redact_keeps_four_digit_year_dates():
    assert ed.redact("match on 20-11-2026 at 4 pm") == "match on 20-11-2026 at 4 pm"
