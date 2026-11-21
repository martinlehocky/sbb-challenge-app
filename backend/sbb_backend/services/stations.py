"""Station lookup: by id, by name (fuzzy), by position, and station names mentioned in free text."""
from __future__ import annotations

import re
import sqlite3
from dataclasses import dataclass

from ..geo import haversine_m
from ..textutil import normalize


@dataclass(frozen=True)
class Station:
    id: int
    name: str
    lat: float | None
    lon: float | None
    canton: str | None
    municipality: str | None
    rail: bool
    transfer_s: int | None
    abbreviation: str | None = None

    def to_dict(self) -> dict:
        return {
            "id": self.id, "name": self.name, "lat": self.lat, "lon": self.lon, "canton": self.canton,
            "municipality": self.municipality, "rail": self.rail,
        }


class StationIndex:
    """In-memory index of all service points (about 60k rows, a few MB)."""

    def __init__(self, conn: sqlite3.Connection):
        self.by_id: dict[int, Station] = {}
        self._norm: list[tuple[str, Station]] = []
        self.by_abbreviation: dict[str, Station] = {}
        for r in conn.execute(
            "SELECT id, name, name_norm, abbreviation, lat, lon, canton, municipality, rail, transfer_s FROM stations"
        ):
            st = Station(r["id"], r["name"], r["lat"], r["lon"], r["canton"], r["municipality"], bool(r["rail"]),
                         r["transfer_s"], r["abbreviation"])
            self.by_id[st.id] = st
            self._norm.append((r["name_norm"], st))
            if st.abbreviation and st.rail:
                self.by_abbreviation.setdefault(st.abbreviation.upper(), st)
        self.rail = [s for s in self.by_id.values() if s.rail and s.lat is not None and s.lon is not None]
        # For text matching: rail station names, longest first, so "Zürich Stadelhofen" wins over "Zürich".
        names = sorted({(n, s.id) for n, s in self._norm if s.rail and len(n) >= 3}, key=lambda x: -len(x[0]))
        self._text_names = names

    def get(self, station_id: int) -> Station | None:
        return self.by_id.get(station_id)

    def search(self, query: str, limit: int = 10, rail_only: bool = True) -> list[Station]:
        """Rank: exact name > name starts with query > every query word is a word prefix > substring."""
        q = normalize(query)
        if not q:
            return []
        words = q.split()
        scored: list[tuple[int, int, str, Station]] = []
        for norm, st in self._norm:
            if rail_only and not st.rail:
                continue
            if norm == q:
                score = 0
            elif norm.startswith(q):
                score = 1
            else:
                tokens = norm.split()
                if all(any(t.startswith(w) for t in tokens) for w in words):
                    score = 2
                elif q in norm:
                    score = 3
                else:
                    continue
            scored.append((score, len(norm), norm, st))
        scored.sort(key=lambda x: (x[0], x[1], x[2]))
        out: list[Station] = []
        seen: set[int] = set()
        for _, _, _, st in scored:
            if st.id not in seen:
                seen.add(st.id)
                out.append(st)
            if len(out) >= limit:
                break
        return out

    def resolve(self, query: str | int) -> Station | None:
        """Station id (int or numeric string) or name -> best station."""
        if isinstance(query, int) or (isinstance(query, str) and query.strip().isdigit()):
            return self.get(int(query))
        hits = self.search(str(query), limit=1)
        return hits[0] if hits else None

    def nearest(self, lat: float, lon: float, limit: int = 5, max_m: float | None = None) -> list[tuple[Station, float]]:
        candidates = [(s, haversine_m(lat, lon, s.lat, s.lon)) for s in self.rail]  # type: ignore[arg-type]
        candidates.sort(key=lambda x: x[1])
        if max_m is not None:
            candidates = [c for c in candidates if c[1] <= max_m]
        return candidates[:limit]

    def mentioned_in(self, text: str | None) -> list[Station]:
        """Rail stations whose full name appears as whole words in the text (longest names first)."""
        if not text:
            return []
        hay = f" {normalize(text)} "
        found: list[Station] = []
        for name, sid in self._text_names:
            needle = f" {name} "
            if needle in hay:
                found.append(self.by_id[sid])
                hay = hay.replace(needle, " # ")  # do not match "Morges" again inside an already matched name
        return found


_ABBR = re.compile(r"^[A-Z]{2,5}$")


def looks_like_abbreviation(text: str | None) -> bool:
    return bool(text and _ABBR.match(text.strip()))
