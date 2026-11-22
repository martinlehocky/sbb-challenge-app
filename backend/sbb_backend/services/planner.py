"""Rail journey planner on the GTFS timetable (Connection Scan Algorithm, earliest arrival).

Connections are (departure, arrival, from-station, to-station, trip) pairs of consecutive stops.
They are built per service day from SQLite and cached. All times are Unix epoch seconds.
Disruptions are applied by "blocking" connections. Nobody can ride a train across a blocked
connection; the train may be boarded again after it (like "the IC3 only runs from Sargans").
For demos, given trains can run late (`delays`): every stop of that train is shifted by the delay.
"""
from __future__ import annotations

import heapq
import sqlite3
import threading
from bisect import bisect_left
from collections import OrderedDict
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Callable, Iterable

from ..timeutil import local_date, service_day_start, to_iso
from .stations import Station, StationIndex

# (dep, arr, from_station, to_station, trip_id, from_platform, to_platform)
Connection = tuple[int, int, int, int, int, "str | None", "str | None"]
BlockFn = Callable[[Connection], bool]

MAX_SERVICE_DAY_S = 36 * 3600   # GTFS times can run past 24:00; SBB trips stay well below 36 h
SQL_CHUNK = 900
# A GTFS trip runs on many days, so a connection's trip field is a "trip run" key that also encodes the
# service day. Otherwise yesterday's late run and today's run of the same trip would look like one train.
DAY_SLOTS = 16


def run_key(trip_id: int, day: date) -> int:
    return trip_id * DAY_SLOTS + day.toordinal() % DAY_SLOTS


def trip_of(run: int) -> int:
    return run // DAY_SLOTS


@dataclass
class TripInfo:
    route_id: str
    line: str | None
    category: str | None
    headsign: str | None
    train_no: str | None
    agency: str | None


@dataclass
class Leg:
    trip_id: int
    line: str | None
    category: str | None
    headsign: str | None
    train_no: str | None
    operator: str | None
    from_station: Station
    to_station: Station
    departure: int
    arrival: int
    from_platform: str | None
    to_platform: str | None
    stops: list[tuple[Station, int, int]] = field(default_factory=list)  # (station, arrival, departure)
    connections: list[Connection] = field(default_factory=list)
    delay_min: int = 0  # the train runs this late (demo delays); its times above already include it

    def to_dict(self) -> dict:
        return {
            "type": "train",
            "line": self.line,
            "category": self.category,
            "train_number": self.train_no,
            "direction": self.headsign,
            "operator": self.operator,
            "from": {"id": self.from_station.id, "name": self.from_station.name, "platform": self.from_platform},
            "to": {"id": self.to_station.id, "name": self.to_station.name, "platform": self.to_platform},
            "departure": to_iso(self.departure),
            "arrival": to_iso(self.arrival),
            "duration_min": round((self.arrival - self.departure) / 60),
            "delay_min": self.delay_min,
            "stops": [
                {"id": s.id, "name": s.name, "arrival": to_iso(a), "departure": to_iso(d)} for s, a, d in self.stops
            ],
        }


@dataclass
class Journey:
    legs: list[Leg]

    @property
    def departure(self) -> int:
        return self.legs[0].departure

    @property
    def arrival(self) -> int:
        return self.legs[-1].arrival

    @property
    def transfers(self) -> int:
        return len(self.legs) - 1

    def key(self) -> tuple:
        return tuple((leg.trip_id, leg.from_station.id, leg.to_station.id) for leg in self.legs)

    def to_dict(self) -> dict:
        return {
            "departure": to_iso(self.departure),
            "arrival": to_iso(self.arrival),
            "duration_min": round((self.arrival - self.departure) / 60),
            "transfers": self.transfers,
            "legs": [leg.to_dict() for leg in self.legs],
        }


class Planner:
    def __init__(self, conn: sqlite3.Connection, stations: StationIndex, default_transfer_s: int = 180,
                 cache_days: int = 3, delays: dict[tuple[date, str], int] | None = None):
        self.conn = conn
        # Demo delays: (service day, train number) -> minutes late; _late_runs: trip run -> minutes late.
        self.delays = dict(delays or {})
        self._late_runs: dict[int, int] = {}
        self.stations = stations
        self.default_transfer_s = default_transfer_s
        self._lock = threading.Lock()
        self._cache: OrderedDict[date, list[Connection]] = OrderedDict()
        self._cache_days = cache_days
        routes = {
            r["route_id"]: (r["short_name"], r["category"], r["agency"])
            for r in conn.execute("SELECT route_id, short_name, category, agency FROM routes")
        }
        self._trip_service: dict[int, str] = {}
        self._service_trips: dict[str, list[int]] = {}
        self.trips: dict[int, TripInfo] = {}
        for r in conn.execute("SELECT id, route_id, service_id, headsign, train_no FROM trips"):
            line, category, agency = routes.get(r["route_id"], (None, None, None))
            self.trips[r["id"]] = TripInfo(r["route_id"], line, category, r["headsign"], r["train_no"], agency)
            self._service_trips.setdefault(r["service_id"], []).append(r["id"])

    # ------------------------------------------------------------------ timetable loading

    def active_services(self, day: date) -> set[str]:
        ds = day.strftime("%Y%m%d")
        weekday = day.weekday()
        active = {
            sid for sid, days in self.conn.execute(
                "SELECT service_id, days FROM calendar WHERE start_date <= ? AND end_date >= ?", (ds, ds)
            ) if len(days) == 7 and days[weekday] == "1"
        }
        for sid, exception_type in self.conn.execute(
            "SELECT service_id, exception_type FROM calendar_dates WHERE date = ?", (ds,)
        ):
            if exception_type == 1:
                active.add(sid)
            elif exception_type == 2:
                active.discard(sid)
        return active

    def connections_for_day(self, day: date) -> list[Connection]:
        with self._lock:
            cached = self._cache.get(day)
            if cached is not None:
                self._cache.move_to_end(day)
                return cached
        trip_ids = sorted(t for sid in self.active_services(day) for t in self._service_trips.get(sid, []))
        base = service_day_start(day)
        slot = day.toordinal() % DAY_SLOTS
        late: dict[int, int] = {}
        if self.delays:
            for t in trip_ids:
                info = self.trips.get(t)
                minutes = self.delays.get((day, str(info.train_no))) if info and info.train_no else None
                if minutes:
                    late[t] = minutes
        conns: list[Connection] = []
        for i in range(0, len(trip_ids), SQL_CHUNK):
            chunk = trip_ids[i:i + SQL_CHUNK]
            rows = self.conn.execute(
                f"SELECT trip, station, platform, arr, dep FROM stop_times WHERE trip IN ({','.join('?' * len(chunk))})"
                " ORDER BY trip, seq",
                chunk,
            ).fetchall()
            prev = None
            for trip, station, platform, arr, dep in rows:
                if prev is not None and prev[0] == trip:
                    p_station, p_platform, p_dep = prev[1], prev[2], prev[4]
                    shift = late.get(trip, 0) * 60
                    a = base + arr + shift
                    d = base + p_dep + shift
                    if a >= d:  # guard against broken rows
                        conns.append((d, a, p_station, station, trip * DAY_SLOTS + slot, p_platform, platform))
                prev = (trip, station, platform, arr, dep)
        conns.sort(key=lambda c: (c[0], c[1]))
        with self._lock:
            for t, minutes in late.items():
                self._late_runs[t * DAY_SLOTS + slot] = minutes
            self._cache[day] = conns
            while len(self._cache) > self._cache_days:
                self._cache.popitem(last=False)
        return conns

    def _window(self, start: int, horizon_s: int) -> list[Connection]:
        end = start + horizon_s
        first_day = local_date(start) - timedelta(days=1)
        days = [first_day + timedelta(days=i) for i in range(4)]
        lists = []
        for d in days:
            day_start = service_day_start(d)
            if day_start > end or day_start + MAX_SERVICE_DAY_S < start:
                continue
            conns = self.connections_for_day(d)
            lo = bisect_left(conns, (start,))
            hi = bisect_left(conns, (end + 1,))
            if lo < hi:
                lists.append(conns[lo:hi])
        if len(lists) == 1:
            return lists[0]
        return list(heapq.merge(*lists, key=lambda c: (c[0], c[1])))

    # ------------------------------------------------------------------ search

    def transfer_s(self, station_id: int) -> int:
        st = self.stations.get(station_id)
        return st.transfer_s if st and st.transfer_s else self.default_transfer_s

    def earliest_arrival(self, origin: int, dest: int, depart_at: int, horizon_s: int = 12 * 3600,
                         blocked: BlockFn | None = None, banned_trips: Iterable[int] = ()) -> Journey | None:
        if origin == dest:
            return None
        conns = self._window(depart_at, horizon_s)
        inf = float("inf")
        best: dict[int, float] = {origin: depart_at}
        boarded: dict[int, int] = {}            # trip -> index of the connection where it was boarded
        broken: set[int] = set(banned_trips)
        journey_ptr: dict[int, tuple[int, int]] = {}  # station -> (board index, alight index)
        for i, c in enumerate(conns):
            dep, arr, frm, to, trip = c[0], c[1], c[2], c[3], c[4]
            if dep > best.get(dest, inf):
                break
            if trip in broken:
                continue
            if blocked is not None and blocked(c):
                boarded.pop(trip, None)  # whoever is on board cannot continue through the blocked section
                continue
            if trip not in boarded:
                reached = best.get(frm)
                if reached is None:
                    continue
                ready = reached if frm == origin else reached + self.transfer_s(frm)
                if ready > dep:
                    continue
                boarded[trip] = i
            if arr < best.get(to, inf):
                best[to] = arr
                journey_ptr[to] = (boarded[trip], i)
        if dest not in journey_ptr:
            return None
        return self._build_journey(conns, journey_ptr, origin, dest)

    def _build_journey(self, conns: list[Connection], ptr: dict[int, tuple[int, int]], origin: int, dest: int) -> Journey | None:
        legs: list[Leg] = []
        station = dest
        guard = 0
        while station != origin:
            guard += 1
            if guard > 50 or station not in ptr:
                return None
            b, a = ptr[station]
            legs.append(self._make_leg(conns, b, a))
            station = conns[b][2]
        legs.reverse()
        return Journey(legs)

    def _make_leg(self, conns: list[Connection], b: int, a: int) -> Leg:
        run = conns[b][4]
        trip = trip_of(run)
        seq = [c for c in conns[b:a + 1] if c[4] == run]
        # conns between b and a include other trips; the trip's own connections form a contiguous chain
        chain: list[Connection] = []
        cursor = conns[b][2]
        for c in seq:
            if c[2] == cursor:
                chain.append(c)
                cursor = c[3]
            if c is conns[a]:
                break
        info = self.trips.get(trip)
        first, last = chain[0], chain[-1]
        get = self.stations.get
        stops: list[tuple[Station, int, int]] = [(get(first[2]), first[0], first[0])]  # type: ignore[list-item]
        for prev, nxt in zip(chain, chain[1:]):
            stops.append((get(prev[3]), prev[1], nxt[0]))  # type: ignore[arg-type]
        stops.append((get(last[3]), last[1], last[1]))  # type: ignore[arg-type]
        return Leg(
            trip_id=run, line=info.line if info else None, category=info.category if info else None,
            headsign=info.headsign if info else None, train_no=info.train_no if info else None,
            operator=info.agency if info else None, from_station=get(first[2]), to_station=get(last[3]),  # type: ignore[arg-type]
            departure=first[0], arrival=last[1], from_platform=first[5], to_platform=last[6],
            stops=stops, connections=chain, delay_min=self._late_runs.get(run, 0),
        )

    def journeys(self, origin: int, dest: int, depart_at: int, count: int = 3, horizon_s: int = 12 * 3600,
                 blocked: BlockFn | None = None) -> list[Journey]:
        """Up to `count` journeys, each with a different arrival time, earliest arrival first.

        For each arrival time only one journey is kept: the one leaving latest, then with fewest changes
        (no needless waiting at the start, no needless change).
        """
        by_arrival: dict[int, Journey] = {}
        t = depart_at
        end = depart_at + horizon_s
        for _ in range(count * 6):  # bounded: every run moves t forward by at least a minute
            if t >= end:
                break
            j = self.earliest_arrival(origin, dest, t, horizon_s=end - t, blocked=blocked)
            if j is None:
                break
            kept = by_arrival.get(j.arrival)
            if kept is None:
                if len(by_arrival) >= count:
                    break  # a new, later arrival time: we already have enough
                by_arrival[j.arrival] = j
            elif (j.departure, -j.transfers) > (kept.departure, -kept.transfers):
                by_arrival[j.arrival] = j
            t = j.departure + 60
        return [by_arrival[a] for a in sorted(by_arrival)]

    def trip_info(self, run: int) -> TripInfo | None:
        return self.trips.get(trip_of(run))

    def line_of(self, run: int) -> str | None:
        info = self.trip_info(run)
        return info.line if info else None
