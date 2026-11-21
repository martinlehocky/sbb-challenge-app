"""Time helpers. All instants are stored as Unix epoch seconds (UTC)."""
from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

ZURICH = ZoneInfo("Europe/Zurich")

_TS = re.compile(
    r"^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?\s*(Z|[+-]\d{2}:?\d{2})?$"
)


def parse_ts(value: object) -> int | None:
    """Parse the timestamp shapes found in the SBB exports.

    Examples: "2024-03-04 07:55:55.054 +0100", "2026-09-01 04:09:10.625",
    "2026-09-01T04:19:00+02:00". Values without an offset are Swiss local time.
    datetime objects (from the VIA spreadsheet) are naive Swiss local time too.
    """
    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value if value.tzinfo else value.replace(tzinfo=ZURICH)
        return int(dt.timestamp())
    text = str(value).strip()
    if not text:
        return None
    m = _TS.match(text)
    if not m:
        raise ValueError(f"Unrecognised timestamp: {text!r}")
    y, mo, d, h, mi, s, frac, off = m.groups()
    micro = int((frac or "0").ljust(6, "0"))
    if off is None:
        tz = ZURICH
    elif off == "Z":
        tz = timezone.utc
    else:
        sign = 1 if off[0] == "+" else -1
        digits = off[1:].replace(":", "")
        tz = timezone(sign * timedelta(hours=int(digits[:2]), minutes=int(digits[2:])))
    dt = datetime(int(y), int(mo), int(d), int(h), int(mi), int(s or 0), micro, tzinfo=tz)
    return int(dt.timestamp())


def to_iso(epoch: int | None) -> str | None:
    """Epoch seconds -> ISO 8601 string in Swiss local time."""
    if epoch is None:
        return None
    return datetime.fromtimestamp(epoch, ZURICH).isoformat()


def local_date(epoch: int) -> date:
    return datetime.fromtimestamp(epoch, ZURICH).date()


def service_day_start(day: date) -> int:
    """GTFS times count from "noon minus 12h" of the service day (handles DST days correctly)."""
    noon = datetime(day.year, day.month, day.day, 12, 0, tzinfo=ZURICH)
    return int(noon.timestamp()) - 12 * 3600


def gtfs_time_to_seconds(text: str) -> int:
    """'25:03:00' -> 90180. GTFS allows hours >= 24 for trips running past midnight."""
    h, m, s = text.strip().split(":")
    return int(h) * 3600 + int(m) * 60 + int(s)


def parse_query_time(value: str | None) -> int:
    """API helper: ISO datetime (offset optional, Swiss local if missing) or None for now."""
    if value is None or not str(value).strip():
        return int(datetime.now(timezone.utc).timestamp())
    parsed = parse_ts(value)
    assert parsed is not None
    return parsed
