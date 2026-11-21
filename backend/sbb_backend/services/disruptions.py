"""Disruptions as they were known at any moment ("replay"), built from three sources.

* VIA event log  - structured: affected places (station numbers) and lines, publication / end times.
* Public ticker  - what customers saw: summary, description, expected end, staff messages, in 4 languages.
* Internal ticker (KULT) - staff-facing notes; only returned when explicitly asked for.

The VIA event id and the public incident id are the same number, so the two are merged per id.
Everything is evaluated "as of" a timestamp: only versions published at or before that time are used.
"""
from __future__ import annotations

import bisect
import re
import sqlite3
from dataclasses import dataclass, field

from ..db import LANGS
from ..geo import haversine_m, point_segment_distance_m
from ..textutil import split_lines
from ..timeutil import to_iso
from .stations import Station, StationIndex

STALE_NO_UPDATE_S = 24 * 3600     # no end info and silent for 24 h -> treat as over
STALE_AFTER_END_S = 6 * 3600      # expected end passed 6 h ago without news -> treat as over
KULT_LINK_WINDOW_S = 2 * 3600
KULT_LINK_RADIUS_M = 5000
LONG_SEGMENT_CORRIDOR = 0.15      # corridor = 15 % of the stop-to-stop distance, for lines VIA names
LONG_DISTANCE = ("IC", "IR", "EC", "ICE", "EN", "TGV", "RJX", "RJ", "NJ")  # categories / line prefixes

END_KIND = {
    "UNTIL": "until",
    "UNTIL_DATE": "until",
    "FROM_TO": "until",
    "UNTIL_APPROX_DATE_TIME": "approx",
    "UNTIL_AT_LEAST": "at_least",
    "UNTIL_AT_LEAST_DATE_TIME": "at_least",
}


def pick(texts: dict[str, str | None], lang: str) -> str | None:
    """Text in the requested language, falling back to en, de, fr, it."""
    for candidate in (lang, "en", "de", "fr", "it"):
        value = texts.get(candidate)
        if value:
            return value
    return None


@dataclass
class ViaRow:
    logged_at: int
    created_at: int | None
    place_code: str | None
    reason_text: str | None
    first_published_at: int | None
    ended_at: int | None
    reason_id: str | None
    ort1: int | None
    ort2: int | None
    line_from: int | None
    line_to: int | None
    lines: list[str]
    advice_published_at: int | None
    replacement_published_at: int | None


@dataclass
class TickerVersion:
    valid_from: int
    created_at_source: int | None
    updated_at_source: int | None
    lifecycle: str | None
    duration_type: str | None
    duration_to: int | None
    reason_id: str | None
    origin_language: str | None
    summary: dict[str, str | None]
    description: dict[str, str | None]


@dataclass
class MessageVersion:
    message_id: str
    valid_from: int
    created_at: int | None
    status: str | None
    title: dict[str, str | None]
    text: dict[str, str | None]


@dataclass
class Zone:
    """Where a disruption is, for matching against train paths."""
    points: list[Station]                       # every located place (with coordinates)
    section: tuple[Station, Station] | None     # interruption between two places, if known
    lines: list[str]                            # affected lines, upper-case ("IC6", "S1"); empty = unknown
    source: str                                 # "via" (structured) or "text" (names found in the summary)

    def matches_line(self, line: str | None, category: str | None = None) -> bool:
        """Is a train with this timetable line name (and category) one of the lines VIA lists?

        VIA names Swiss line numbers ("IC3"). The timetable names some long-distance trains only by brand
        ("ICE", "EC", "TGV" + a code), e.g. ICE 275 Zürich HB 11:07 - Chur runs in the IC3 slot. Such a
        brand-only train counts as matching when VIA lists at least one long-distance line.
        """
        name = (line or "").upper().replace(" ", "")
        if name in self.lines:
            return True
        cat = (category or "").upper()
        brand_only = cat in LONG_DISTANCE and not re.match(r"^[A-Z]+\d", name)
        return brand_only and any(listed.startswith(LONG_DISTANCE) for listed in self.lines)

    def on_segment(self, a: Station, b: Station, line: str | None, radius_m: float,
                   category: str | None = None) -> bool:
        """Does a train running from a to b (on `line`) pass through this zone?

        Between two stops we only know the straight line, while real track curves. A non-stop run can be
        long (Zürich HB - Sargans is 78 km and passes 10 km from that straight line at Wädenswil). So when
        VIA names the train's line, the corridor grows with the segment length; otherwise it stays tight.
        """
        line_matched = bool(self.lines) and self.matches_line(line, category)
        if self.lines and not line_matched:
            return False
        if a.lat is None or b.lat is None:
            return False
        corridor = radius_m
        if line_matched:
            seg_len = haversine_m(a.lat, a.lon, b.lat, b.lon)  # type: ignore[arg-type]
            corridor = max(radius_m, LONG_SEGMENT_CORRIDOR * seg_len)
        for p in self.points:
            if point_segment_distance_m(p.lat, p.lon, a.lat, a.lon, b.lat, b.lon) <= corridor:  # type: ignore[arg-type]
                return True
        if self.section is not None:
            s1, s2 = self.section
            span = haversine_m(s1.lat, s1.lon, s2.lat, s2.lon)  # type: ignore[arg-type]
            limit = span * 1.1 + 2 * radius_m

            def inside(s: Station) -> bool:
                return haversine_m(s.lat, s.lon, s1.lat, s1.lon) + haversine_m(s.lat, s.lon, s2.lat, s2.lon) <= limit  # type: ignore[arg-type]

            if inside(a) and inside(b):
                return True
        return False


@dataclass
class DisruptionState:
    id: str
    at: int
    status: str                       # "active" | "ended" | "stale"
    sources: list[str]
    started_at: int | None
    last_update: int
    ended_at: int | None
    expected_end: int | None
    expected_end_kind: str | None
    reason_id: str | None
    reason: dict[str, str | None]
    title: dict[str, str | None]
    description: dict[str, str | None]
    lines: list[str]
    places: list[dict]
    zone: Zone
    messages: list[MessageVersion] = field(default_factory=list)
    replacement_bus: bool = False
    travel_advice: bool = False
    versions_so_far: int = 0

    @property
    def active(self) -> bool:
        return self.status == "active"

    def blocks(self, a: Station, b: Station, line: str | None, when: int, radius_m: float,
               category: str | None = None) -> bool:
        """True if a train on `line` from a to b around time `when` runs into this disruption."""
        if not self.active:
            return False
        if self.expected_end is not None and when >= self.expected_end:
            return False
        return self.zone.on_segment(a, b, line, radius_m, category)

    def to_dict(self, lang: str = "en", with_messages: bool = True) -> dict:
        out = {
            "id": self.id,
            "as_of": to_iso(self.at),
            "status": self.status,
            "sources": self.sources,
            "started_at": to_iso(self.started_at),
            "last_update": to_iso(self.last_update),
            "ended_at": to_iso(self.ended_at),
            "expected_end": to_iso(self.expected_end),
            "expected_end_kind": self.expected_end_kind,
            "reason": pick(self.reason, lang),
            "reason_id": self.reason_id,
            "title": pick(self.title, lang),
            "description": pick(self.description, lang),
            "lines": self.lines,
            "places": self.places,
            "location_source": self.zone.source,
            "replacement_bus_announced": self.replacement_bus,
            "travel_advice_published": self.travel_advice,
            "versions_so_far": self.versions_so_far,
        }
        if with_messages:
            out["messages"] = [
                {
                    "id": m.message_id,
                    "published_at": to_iso(m.created_at),
                    "updated_at": to_iso(m.valid_from),
                    "title": pick(m.title, lang),
                    "text": pick(m.text, lang),
                }
                for m in self.messages
            ]
        return out


class DisruptionStore:
    def __init__(self, conn: sqlite3.Connection, stations: StationIndex):
        self.stations = stations
        self.reasons: dict[str, dict[str, str | None]] = {
            r["id"]: {lang: r[lang] for lang in LANGS} for r in conn.execute("SELECT * FROM reasons")
        }
        self.via: dict[str, list[ViaRow]] = {}
        for r in conn.execute("SELECT * FROM via_log ORDER BY event_id, logged_at, log_id"):
            self.via.setdefault(r["event_id"], []).append(ViaRow(
                r["logged_at"], r["created_at"], r["place_code"], r["reason_text"], r["first_published_at"],
                r["ended_at"], r["reason_id"], r["ort1"], r["ort2"], r["line_from"], r["line_to"],
                split_lines(r["lines"]), r["advice_published_at"], r["replacement_published_at"],
            ))
        self.ticker: dict[str, list[TickerVersion]] = {}
        for r in conn.execute("SELECT * FROM ticker_incident_versions ORDER BY incident_id, valid_from"):
            self.ticker.setdefault(r["incident_id"], []).append(TickerVersion(
                r["valid_from"], r["created_at_source"], r["updated_at_source"], r["lifecycle"], r["duration_type"],
                r["duration_to"], r["reason_id"], r["origin_language"],
                {lang: r[f"summary_{lang}"] for lang in LANGS}, {lang: r[f"description_{lang}"] for lang in LANGS},
            ))
        self.messages: dict[str, list[MessageVersion]] = {}
        for r in conn.execute("SELECT * FROM ticker_message_versions ORDER BY incident_id, message_id, valid_from"):
            self.messages.setdefault(r["incident_id"], []).append(MessageVersion(
                r["message_id"], r["valid_from"], r["created_at"], r["status"],
                {lang: r[f"title_{lang}"] for lang in LANGS}, {lang: r[f"message_{lang}"] for lang in LANGS},
            ))
        self._via_times = {k: [v.logged_at for v in rows] for k, rows in self.via.items()}
        self._ticker_times = {k: [v.valid_from for v in rows] for k, rows in self.ticker.items()}
        self.ids = sorted(set(self.via) | set(self.ticker))
        # first time each id becomes visible, for quick filtering
        self._first_seen = {
            i: min(x for x in (
                self.via[i][0].logged_at if i in self.via else None,
                self.ticker[i][0].valid_from if i in self.ticker else None,
            ) if x is not None)
            for i in self.ids
        }
        self.kult_cases = [dict(r) for r in conn.execute("SELECT * FROM kult_cases ORDER BY created_at")]
        self.kult_categories = {r["id"]: r["de"] for r in conn.execute("SELECT id, de FROM kult_categories")}
        self.kult_messages: dict[int, list[dict]] = {}
        for r in conn.execute("SELECT * FROM kult_messages ORDER BY case_id, ts, id"):
            self.kult_messages.setdefault(r["case_id"], []).append(dict(r))
        self._kult_links = self._link_kult_cases()

    # ------------------------------------------------------------------ state at a moment

    def state_at(self, incident_id: str, at: int) -> DisruptionState | None:
        via_rows = self.via.get(incident_id, [])
        tick_rows = self.ticker.get(incident_id, [])
        vi = bisect.bisect_right(self._via_times.get(incident_id, []), at)
        ti = bisect.bisect_right(self._ticker_times.get(incident_id, []), at)
        via = via_rows[vi - 1] if vi else None
        tick = tick_rows[ti - 1] if ti else None
        if via is None and tick is None:
            return None

        sources = [s for s, row in (("via", via), ("ticker", tick)) if row is not None]
        last_update = max(x for x in ((via.logged_at if via else None), (tick.valid_from if tick else None)) if x)
        started = min(x for x in (
            via.created_at if via else None, tick.created_at_source if tick else None, last_update,
        ) if x is not None)

        ended_at = None
        if via and via.ended_at is not None and via.ended_at <= at:
            ended_at = via.ended_at
        if tick and tick.lifecycle in ("ENDED", "DELETED"):
            ended_at = min(ended_at, tick.valid_from) if ended_at else tick.valid_from

        expected_end = tick.duration_to if tick else None
        expected_end_kind = END_KIND.get(tick.duration_type or "") if tick and tick.duration_to else None

        if ended_at is not None:
            status = "ended"
        elif expected_end is not None and at > expected_end + STALE_AFTER_END_S:
            status = "stale"
        elif expected_end is None and at > last_update + STALE_NO_UPDATE_S:
            status = "stale"
        else:
            status = "active"

        reason_id = (tick.reason_id if tick else None) or (via.reason_id if via else None)
        reason = dict(self.reasons.get(reason_id or "", {}))
        if not any(reason.values()) and via and via.reason_text:
            reason = {"de": via.reason_text}

        zone, places = self._zone(via, tick)
        if tick and any(tick.summary.values()):
            title = tick.summary
            description = tick.description
        else:
            names = " - ".join(p["name"] for p in places if p["role"] in ("start", "end")) or (via.place_code if via else "")
            title = {"de": f"{via.reason_text or 'Störung'}: {names}".strip()} if via else {}
            description = {}

        messages = self._messages_at(incident_id, at)
        versions = vi + ti
        return DisruptionState(
            id=incident_id, at=at, status=status, sources=sources, started_at=started, last_update=last_update,
            ended_at=ended_at, expected_end=expected_end, expected_end_kind=expected_end_kind, reason_id=reason_id,
            reason=reason, title=title, description=description, lines=zone.lines, places=places, zone=zone,
            messages=messages,
            replacement_bus=bool(via and via.replacement_published_at and via.replacement_published_at <= at),
            travel_advice=bool(via and via.advice_published_at and via.advice_published_at <= at),
            versions_so_far=versions,
        )

    def _zone(self, via: ViaRow | None, tick: TickerVersion | None) -> tuple[Zone, list[dict]]:
        places: list[dict] = []
        if via is not None and (via.ort1 or via.ort2):
            def add(sid: int | None, role: str) -> Station | None:
                if sid is None:
                    return None
                st = self.stations.get(sid)
                places.append({"id": sid, "name": st.name if st else str(sid), "role": role,
                               "lat": st.lat if st else None, "lon": st.lon if st else None})
                return st if st and st.lat is not None else None

            s1, s2 = add(via.ort1, "start"), add(via.ort2, "end")
            add(via.line_from, "line_from")
            add(via.line_to, "line_to")
            points = [s for s in (s1, s2) if s is not None]
            section = (s1, s2) if s1 is not None and s2 is not None and s1.id != s2.id else None
            return Zone(points, section, list(via.lines), "via"), places

        # No structured places: look for station names in the public summary (English first).
        found: list[Station] = []
        if tick is not None:
            for lang in ("en", "de", "fr", "it"):
                found = [s for s in self.stations.mentioned_in(tick.summary.get(lang)) if len(s.name) >= 4]
                if found:
                    break
        for i, st in enumerate(found):
            places.append({"id": st.id, "name": st.name, "role": "start" if i == 0 else ("end" if i == 1 else "mentioned"),
                           "lat": st.lat, "lon": st.lon})
        section = (found[0], found[1]) if len(found) >= 2 else None
        lines = list(via.lines) if via else []
        return Zone(found, section, lines, "text" if found else "none"), places

    def _messages_at(self, incident_id: str, at: int) -> list[MessageVersion]:
        latest: dict[str, MessageVersion] = {}
        for m in self.messages.get(incident_id, []):
            if m.valid_from <= at:
                latest[m.message_id] = m  # rows are sorted by valid_from per message
        visible = [m for m in latest.values() if m.status == "PUBLISHED"]
        visible.sort(key=lambda m: (m.created_at or m.valid_from), reverse=True)
        return visible

    # ------------------------------------------------------------------ queries

    def list_at(self, at: int, include_inactive: bool = False) -> list[DisruptionState]:
        out = []
        for incident_id in self.ids:
            if self._first_seen[incident_id] > at:
                continue
            st = self.state_at(incident_id, at)
            if st and (include_inactive or st.active):
                out.append(st)
        out.sort(key=lambda s: s.last_update, reverse=True)
        return out

    def active_at(self, at: int) -> list[DisruptionState]:
        return self.list_at(at, include_inactive=False)

    def near(self, states: list[DisruptionState], lat: float, lon: float, radius_m: float) -> list[tuple[DisruptionState, float]]:
        out = []
        for st in states:
            dists = [haversine_m(lat, lon, p.lat, p.lon) for p in st.zone.points]  # type: ignore[arg-type]
            if dists and min(dists) <= radius_m:
                out.append((st, min(dists)))
        out.sort(key=lambda x: x[1])
        return out

    def timeline(self, incident_id: str, lang: str = "en", include_internal: bool = False) -> list[dict]:
        """Every change to an incident, oldest first: what a passenger (or staff) could have seen, and when."""
        events: list[dict] = []
        prev: ViaRow | None = None
        for row in self.via.get(incident_id, []):
            changes = []
            if prev is None:
                changes.append("event recorded in VIA")
            else:
                if row.lines != prev.lines:
                    changes.append(f"affected lines now: {', '.join(row.lines) or 'none'}")
                if (row.ort1, row.ort2) != (prev.ort1, prev.ort2):
                    changes.append("affected places changed")
                if row.replacement_published_at and not prev.replacement_published_at:
                    changes.append("replacement buses announced")
                if row.advice_published_at and not prev.advice_published_at:
                    changes.append("travel advice published")
                if row.ended_at and not prev.ended_at:
                    changes.append("event closed")
            if changes:
                events.append({"at": to_iso(row.logged_at), "source": "via", "kind": "update", "text": "; ".join(changes)})
            prev = row
        prev_t: TickerVersion | None = None
        for v in self.ticker.get(incident_id, []):
            summary = pick(v.summary, lang)
            if prev_t is None or summary != pick(prev_t.summary, lang) or v.lifecycle != prev_t.lifecycle \
                    or v.duration_to != prev_t.duration_to:
                events.append({
                    "at": to_iso(v.valid_from), "source": "ticker", "kind": "incident",
                    "lifecycle": v.lifecycle, "expected_end": to_iso(v.duration_to), "text": summary,
                })
            prev_t = v
        seen: dict[str, str | None] = {}
        for m in sorted(self.messages.get(incident_id, []), key=lambda m: m.valid_from):
            text = pick(m.text, lang)
            if m.status != "PUBLISHED":
                continue
            kind = "message" if m.message_id not in seen else "message_edit"
            if seen.get(m.message_id) == text:
                continue
            seen[m.message_id] = text
            events.append({"at": to_iso(m.valid_from), "source": "ticker", "kind": kind,
                           "title": pick(m.title, lang), "text": text})
        if include_internal:
            for case_id in self._kult_links.get(incident_id, []):
                for m in self.kult_messages.get(case_id, []):
                    events.append({"at": to_iso(m["ts"]), "source": "internal", "kind": "staff_note",
                                   "sender": m["sender_role"], "text": m["text"]})
        events.sort(key=lambda e: e["at"] or "")
        return events

    def internal_notes(self, incident_id: str, at: int) -> list[dict]:
        notes = []
        for case_id in self._kult_links.get(incident_id, []):
            for m in self.kult_messages.get(case_id, []):
                if m["ts"] is not None and m["ts"] <= at:
                    notes.append({"at": to_iso(m["ts"]), "sender": m["sender_role"], "text": m["text"]})
        return notes

    def scenarios(self, limit: int = 20) -> list[dict]:
        """Incidents worth replaying in a demo: known to VIA (places + lines) and to the public ticker."""
        out = []
        for incident_id in self.ids:
            via_rows = self.via.get(incident_id)
            if not via_rows:
                continue
            first = via_rows[0]
            publish = next((r.first_published_at for r in via_rows if r.first_published_at), None) or first.logged_at
            at = publish + 15 * 60
            st = self.state_at(incident_id, at)
            if st is None or not st.zone.points:
                continue
            roles = {p["role"]: p for p in st.places}
            pair = (roles.get("line_from"), roles.get("line_to"))
            if None in pair or pair[0]["id"] == pair[1]["id"]:  # type: ignore[index]
                pair = (roles.get("start"), roles.get("end"))
            ends = [p for p in pair if p is not None]
            out.append({
                "id": incident_id,
                "replay_at": to_iso(at),
                "title": pick(st.title, "en"),
                "reason": pick(st.reason, "en"),
                "lines": st.lines,
                "places": [p["name"] for p in st.places],
                "in_public_ticker": incident_id in self.ticker,
                "messages": len(self.messages.get(incident_id, [])),
                "suggested_trip": {"from": ends[0]["name"], "to": ends[-1]["name"]} if len(ends) >= 2 else None,
            })
        out.sort(key=lambda s: (not s["in_public_ticker"], -s["messages"], s["replay_at"]))
        return out[:limit]

    # ------------------------------------------------------------------ internal ticker linking

    def _link_kult_cases(self) -> dict[str, list[int]]:
        """Attach internal cases to VIA events: created within 2 h and at (or within 5 km of) the same place."""
        links: dict[str, list[int]] = {}
        events = []
        for incident_id, rows in self.via.items():
            created = rows[0].created_at or rows[0].logged_at
            pts = [self.stations.get(s) for r in rows[:1] for s in (r.ort1, r.ort2, r.line_from, r.line_to) if s]
            events.append((incident_id, created, [p for p in pts if p and p.lat is not None]))
        for case in self.kult_cases:
            created = case["created_at"]
            if created is None:
                continue
            case_points = [s for s in self.stations.mentioned_in(case["section"]) if s.lat is not None]
            best: tuple[float, str] | None = None
            for incident_id, ev_created, pts in events:
                dt = abs(ev_created - created)
                if dt > KULT_LINK_WINDOW_S or not pts or not case_points:
                    continue
                dist = min(haversine_m(a.lat, a.lon, b.lat, b.lon) for a in case_points for b in pts)  # type: ignore[arg-type]
                if dist <= KULT_LINK_RADIUS_M:
                    score = dist + dt / 10  # 10 s of time difference ~ 1 m
                    if best is None or score < best[0]:
                        best = (score, incident_id)
            if best:
                links.setdefault(best[1], []).append(case["id"])
        return links
