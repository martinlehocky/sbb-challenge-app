from __future__ import annotations

from datetime import date

import pytest

from sbb_backend.db import connect
from sbb_backend.geo import haversine_m, point_segment_distance_m
from sbb_backend.services.advisor import Advisor
from sbb_backend.services.disruptions import DisruptionStore
from sbb_backend.services.planner import Planner, trip_of
from sbb_backend.services.stations import StationIndex
from sbb_backend.services.voice import understand_trip
from sbb_backend.textutil import normalize, split_lines, strip_html
from sbb_backend.timeutil import parse_ts, service_day_start, to_iso

from .conftest import A, B, C, D, X


def t(s: str) -> int:
    return parse_ts(s)  # type: ignore[return-value]


@pytest.fixture(scope="module")
def world(tmp_path_factory):
    from .conftest import build_fixture_db
    path = build_fixture_db(tmp_path_factory.mktemp("w") / "w.db")
    conn = connect(path, readonly=True)
    stations = StationIndex(conn)
    store = DisruptionStore(conn, stations)
    planner = Planner(conn, stations, default_transfer_s=180)
    advisor = Advisor(stations, store, planner, ai=None, radius_m=600)
    return stations, store, planner, advisor


# ---------------------------------------------------------------- helpers

def test_parse_ts_shapes():
    assert parse_ts("2024-03-04 07:55:55.054 +0100") == parse_ts("2024-03-04T06:55:55.054Z")
    # naive values are Swiss local time (CEST in September = UTC+2)
    assert parse_ts("2026-09-01 04:09:10") == parse_ts("2026-09-01T02:09:10+00:00")
    assert parse_ts("2026-09-01 04:19") == parse_ts("2026-09-01 04:19:00 +0200")
    assert parse_ts("") is None and parse_ts(None) is None
    with pytest.raises(ValueError):
        parse_ts("yesterday")


def test_service_day_start_handles_dst():
    # 2026-10-25 is the autumn DST switch; GTFS 00:00 is noon minus 12 h, which is 23:00 local the day before + 1 h
    noon = t("2026-10-25 12:00")
    assert service_day_start(date(2026, 10, 25)) == noon - 12 * 3600
    assert to_iso(service_day_start(date(2026, 9, 10))) == "2026-09-10T00:00:00+02:00"


def test_text_helpers():
    assert normalize("Genève-Aéroport") == "geneve aeroport"
    assert split_lines("ICE, IC6 ,s1, IC6") == ["ICE", "IC6", "S1"]
    assert strip_html('Unfall -&gt; <span style="x">Totalunterbruch</span>') == "Unfall -> Totalunterbruch"


def test_geometry():
    d = haversine_m(46.0, 7.0, 46.0, 7.1)
    assert 7600 < d < 7800
    assert point_segment_distance_m(46.0, 7.05, 46.0, 7.0, 46.0, 7.1) < 1
    assert point_segment_distance_m(46.01, 7.05, 46.0, 7.0, 46.0, 7.1) == pytest.approx(1112, rel=0.01)


# ---------------------------------------------------------------- stations

def test_station_search_and_nearest(world):
    stations, *_ = world
    assert stations.search("alp")[0].id == A
    assert stations.search("xen nord")[0].id == X
    assert stations.search("bus stop") == []  # not a rail station
    assert stations.search("bus stop", rail_only=False)[0].id == 8599999
    assert stations.resolve(str(B)).id == B
    nearest = stations.nearest(46.0, 7.21, limit=2)
    assert nearest[0][0].id == C and nearest[0][1] < 1000


def test_mentioned_in_order_and_whole_words(world):
    stations, *_ = world
    names = [s.id for s in stations.mentioned_in("Service resumed: Beta - Gamma")]
    assert set(names) == {B, C}
    assert stations.mentioned_in("Alphabet soup") == []


# ---------------------------------------------------------------- planner

def test_direct_journey(world):
    _, _, planner, _ = world
    j = planner.earliest_arrival(A, D, t("2026-09-10 07:59"))
    assert j is not None
    assert to_iso(j.departure) == "2026-09-10T08:00:00+02:00"
    assert to_iso(j.arrival) == "2026-09-10T08:30:00+02:00"
    assert j.transfers == 0 and j.legs[0].line == "S1"
    assert [s.id for s, _, _ in j.legs[0].stops] == [A, B, C, D]
    assert j.legs[0].from_platform == "1" and j.legs[0].to_platform == "4"


def test_alternatives_are_distinct_and_latest_departure(world):
    _, _, planner, _ = world
    js = planner.journeys(A, D, t("2026-09-10 07:59"), count=3)
    assert [to_iso(j.departure)[11:16] for j in js] == ["08:00", "08:05", "09:00"]
    assert [to_iso(j.arrival)[11:16] for j in js] == ["08:30", "08:50", "09:30"]


def test_unreachable_returns_none(world):
    _, _, planner, _ = world
    # Both lines only run towards D, so C cannot be reached from X, nor X from B.
    assert planner.earliest_arrival(X, C, t("2026-09-10 08:00"), horizon_s=3 * 3600) is None
    assert planner.earliest_arrival(B, X, t("2026-09-10 08:00"), horizon_s=3 * 3600) is None
    assert planner.earliest_arrival(A, A, t("2026-09-10 08:00")) is None


def test_trip_after_midnight_uses_previous_service_day(world):
    _, _, planner, _ = world
    j = planner.earliest_arrival(C, D, t("2026-09-11 00:00"), horizon_s=2 * 3600)
    assert j is not None
    assert to_iso(j.departure) == "2026-09-11T00:00:00+02:00"
    assert to_iso(j.arrival) == "2026-09-11T00:10:00+02:00"


def test_runs_on_different_days_are_different_trains(world):
    _, _, planner, _ = world
    # Board the late run at A on Thursday 23:40; the "same" GTFS trip on Friday must not be joined.
    j = planner.earliest_arrival(A, D, t("2026-09-10 23:30"), horizon_s=3 * 3600)
    assert j is not None and len({trip_of(leg.trip_id) for leg in j.legs}) == 1
    assert to_iso(j.arrival) == "2026-09-11T00:10:00+02:00"


def test_calendar_exception_removes_service(world):
    _, _, planner, _ = world
    assert planner.active_services(date(2026, 9, 18)) == set()   # holiday
    assert planner.active_services(date(2026, 9, 19)) == set()   # Saturday
    assert planner.active_services(date(2026, 9, 17)) == {"WD"}


def test_blocking_stops_riding_through(world):
    _, _, planner, _ = world
    blocked = lambda c: {c[2], c[3]} == {B, C}  # noqa: E731
    j = planner.earliest_arrival(A, D, t("2026-09-10 07:59"), blocked=blocked)
    assert j is not None and j.legs[0].line == "S2"
    assert to_iso(j.arrival)[11:16] == "08:50"


def test_train_can_be_boarded_after_the_blocked_section(world):
    _, _, planner, _ = world
    blocked = lambda c: {c[2], c[3]} == {A, B}  # noqa: E731
    # From C the S1 still runs to D after the blocked A-B section.
    j = planner.earliest_arrival(C, D, t("2026-09-10 08:15"), blocked=blocked)
    assert j is not None and j.legs[0].line == "S1" and to_iso(j.departure)[11:16] == "08:20"
    # But nobody can ride from A through the block.
    j = planner.earliest_arrival(A, B, t("2026-09-10 07:59"), horizon_s=3 * 3600, blocked=blocked)
    assert j is None


# ---------------------------------------------------------------- disruptions

def test_disruption_not_known_before_first_record(world):
    _, store, _, _ = world
    assert store.state_at("900", t("2026-09-10 07:54")) is None


def test_disruption_active_then_ended(world):
    _, store, _, _ = world
    s = store.state_at("900", t("2026-09-10 08:10"))
    assert s.status == "active" and s.sources == ["via", "ticker"]
    assert s.lines == ["S1"]
    assert [p["role"] for p in s.places] == ["start", "end", "line_from", "line_to"]
    assert s.expected_end_kind == "until" and to_iso(s.expected_end)[11:16] == "10:00"
    d = s.to_dict("de")
    assert d["reason"] == "Fahrleitungsstörung"
    assert [m["text"] for m in d["messages"]] == ["Ersatzbusse fahren"]  # the HIDDEN message is not shown
    assert s.replacement_bus is False
    ended = store.state_at("900", t("2026-09-10 09:31"))
    assert ended.status == "ended" and to_iso(ended.ended_at)[11:16] == "09:30"
    assert ended.replacement_bus is True
    assert [x.id for x in store.active_at(t("2026-09-10 08:10"))] == ["900"]
    assert store.active_at(t("2026-09-10 09:31")) == []


def test_ticker_only_disruption_found_from_text(world):
    _, store, _, _ = world
    s = store.state_at("901", t("2026-09-10 12:05"))
    assert s.zone.source == "text" and [p.id for p in s.zone.points] == [X]
    stale = store.state_at("901", t("2026-09-11 13:00"))
    assert stale.status == "stale"


def test_timeline_and_internal_link(world):
    _, store, _, _ = world
    events = store.timeline("900", "en")
    kinds = [(e["source"], e["kind"]) for e in events]
    assert kinds[0] == ("via", "update")
    assert ("ticker", "message") in kinds
    assert all(e["source"] != "internal" for e in events)
    internal = store.timeline("900", "en", include_internal=True)
    assert any(e["source"] == "internal" and "Bus bestellt" in e["text"] for e in internal)
    assert store.internal_notes("900", t("2026-09-10 08:00")) == []
    assert len(store.internal_notes("900", t("2026-09-10 08:02"))) == 1


def test_scenarios(world):
    _, store, _, _ = world
    sc = store.scenarios()
    assert sc[0]["id"] == "900" and sc[0]["suggested_trip"] == {"from": "Alpha", "to": "Delta"}


# ---------------------------------------------------------------- advisor

def test_advice_affected_gives_alternative(world):
    stations, _, _, advisor = world
    r = advisor.advise(stations.get(A), stations.get(D), t("2026-09-10 08:00"), depart_at=t("2026-09-10 07:59"),
                       lang="en")
    assert r["status"] == "affected"
    assert r["planned"]["affected_legs"] == [0]
    assert [d["id"] for d in r["affecting_disruptions"]] == ["900"]
    best = r["alternatives"][0]
    assert best["legs"][0]["line"] == "S2" and best["delay_vs_plan_min"] == 20
    assert r["next_move"]["platform"] == "7" and r["next_move"]["minutes_until_departure"] == 5
    assert r["message"] == (
        "Your connection is disrupted (Problem with the overhead line). Expected until 10:00. "
        "Take the S2 at 08:05 from platform 7 towards Delta. "
        "You arrive in Delta at 08:50 (20 min later than planned)."
    )


def test_advice_after_expected_end_is_ok(world):
    stations, _, _, advisor = world
    # At 08:10 the disruption is active but only until 10:00; a 10:00 train is fine.
    r = advisor.advise(stations.get(A), stations.get(D), t("2026-09-10 08:10"), depart_at=t("2026-09-10 10:00"))
    assert r["status"] == "ok"
    r2 = advisor.advise(stations.get(A), stations.get(D), t("2026-09-10 09:40"), lang="de")
    assert r2["status"] == "ok"
    assert r2["message"].startswith("Ihre Reise ist nicht betroffen.")


def test_advice_unaffected_route_mentions_nearby(world):
    stations, _, _, advisor = world
    # 901 sits at X; trip A -> D via S1 does not pass X, but S1 is not near X either (X is 11 km north).
    r = advisor.advise(stations.get(A), stations.get(B), t("2026-09-10 12:05"))
    assert r["status"] == "ok" and r["nearby_disruptions"] == []


def test_advice_waits_for_expected_end_when_no_detour(world):
    stations, _, _, advisor = world
    # B-C has no detour; the first train after the expected end (10:00) is the 10:10 S1.
    r = advisor.advise(stations.get(B), stations.get(C), t("2026-09-10 08:00"))
    assert r["status"] == "affected"
    assert r["alternatives"][0]["departure"] == "2026-09-10T10:10:00+02:00"
    assert r["alternatives"][0]["delay_vs_plan_min"] == 120


def test_advice_no_alternative(world):
    stations, _, _, advisor = world
    r = advisor.advise(stations.get(B), stations.get(C), t("2026-09-10 08:00"), lang="fr", horizon_h=1)
    assert r["status"] == "no_alternative"
    assert r["alternatives"] == [] and r["next_move"] is None
    assert "Veuillez vous adresser au personnel" in r["message"]


def test_advice_no_connection(world):
    stations, _, _, advisor = world
    r = advisor.advise(stations.get(D), stations.get(A), t("2026-09-10 08:00"))
    assert r["status"] == "no_connection"


def test_understand_trip_without_ai(world):
    stations, *_ = world
    r = understand_trip(stations, None, "I want to go from Gamma to Alpha please")
    assert r["origin"].id == C and r["destination"].id == A and r["method"] == "text_match"
    r = understand_trip(stations, None, "Delta?")
    assert r["origin"] is None and r["destination"].id == D
