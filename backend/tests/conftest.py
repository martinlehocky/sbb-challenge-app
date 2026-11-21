"""A tiny, hand-made network so every result can be checked by hand.

    S1:  A ── B ── C ── D      (every hour, :00 from A, 30 min end to end)
    S2:  A ────── X ────── D    (:05 from A, 45 min, avoids B-C)

Disruption 900: interruption between B and C on line S1, published 2026-09-10 07:58,
expected until 10:00, ended at 09:30. Service day used in tests: Thursday 2026-09-10.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from sbb_backend.config import Settings
from sbb_backend.db import SCHEMA
from sbb_backend.timeutil import parse_ts

STATIONS = {
    # id: (name, lat, lon)
    8500001: ("Alpha", 46.0, 7.0),
    8500002: ("Beta", 46.0, 7.1),
    8500003: ("Gamma", 46.0, 7.2),
    8500004: ("Delta", 46.0, 7.3),
    8500009: ("Xenon Nord", 46.1, 7.15),
}
A, B, C, D, X = 8500001, 8500002, 8500003, 8500004, 8500009


def hms(h: int, m: int) -> int:
    return h * 3600 + m * 60


def build_fixture_db(path: Path) -> Path:
    conn = sqlite3.connect(path)
    conn.executescript(SCHEMA)
    for sid, (name, lat, lon) in STATIONS.items():
        conn.execute(
            "INSERT INTO stations (id, name, name_norm, lat, lon, canton, rail) VALUES (?,?,?,?,?,?,1)",
            (sid, name, name.lower(), lat, lon, "BE"),
        )
    conn.execute("INSERT INTO stations (id, name, name_norm, lat, lon, rail) VALUES (8599999, 'Bus Stop', 'bus stop', 46.0, 7.05, 0)")
    conn.execute("INSERT INTO routes VALUES ('r1', 'S1', 'S', 109, 'Test Rail')")
    conn.execute("INSERT INTO routes VALUES ('r2', 'S2', 'S', 109, 'Test Rail')")
    conn.execute("INSERT INTO calendar VALUES ('WD', '1111100', '20260101', '20261231')")
    # a holiday: no service on Friday 2026-09-18
    conn.execute("INSERT INTO calendar_dates VALUES ('WD', '20260918', 2)")
    trip = 0
    for hour in range(6, 23):
        trip += 1
        conn.execute("INSERT INTO trips VALUES (?, ?, 'r1', 'WD', 'Delta', ?)", (trip, f"s1-{hour}", str(1000 + hour)))
        for seq, (sid, minute) in enumerate(((A, 0), (B, 10), (C, 20), (D, 30)), start=1):
            t = hms(hour, minute)
            conn.execute("INSERT INTO stop_times VALUES (?,?,?,?,?,?)", (trip, seq, sid, str(seq), t, t))
        trip += 1
        conn.execute("INSERT INTO trips VALUES (?, ?, 'r2', 'WD', 'Delta', ?)", (trip, f"s2-{hour}", str(2000 + hour)))
        for seq, (sid, minute) in enumerate(((A, 5), (X, 25), (D, 50)), start=1):
            t = hms(hour, minute)
            conn.execute("INSERT INTO stop_times VALUES (?,?,?,?,?,?)", (trip, seq, sid, "7", t, t))
    # late S1 run crossing midnight: A 23:40, B 23:50, C 24:00, D 24:10
    trip += 1
    conn.execute("INSERT INTO trips VALUES (?, 's1-late', 'r1', 'WD', 'Delta', '1999')", (trip,))
    for seq, (sid, t) in enumerate(((A, hms(23, 40)), (B, hms(23, 50)), (C, hms(24, 0)), (D, hms(24, 10))), start=1):
        conn.execute("INSERT INTO stop_times VALUES (?,?,?,?,?,?)", (trip, seq, sid, None, t, t))

    conn.execute("INSERT INTO reasons VALUES ('EG_008', 'Fahrleitungsstörung', 'Dérangement de la ligne de contact', "
                 "'Guasto alla linea di contatto', 'Problem with the overhead line')")
    ts = lambda s: parse_ts(f"2026-09-10 {s}")  # noqa: E731
    conn.execute(
        "INSERT INTO via_log VALUES (1, ?, '900', ?, 'BET', 'Fahrleitung', ?, NULL, 'EG_008', ?, ?, ?, ?, 'S1', ?, NULL, NULL, 'x')",
        (ts("07:55:00"), ts("07:50:00"), ts("07:58:00"), B, C, A, D, ts("07:58:00")),
    )
    conn.execute(
        "INSERT INTO via_log VALUES (2, ?, '900', ?, 'BET', 'Fahrleitung', ?, ?, 'EG_008', ?, ?, ?, ?, 'S1', ?, NULL, ?, 'x')",
        (ts("09:30:00"), ts("07:50:00"), ts("07:58:00"), ts("09:30:00"), B, C, A, D, ts("09:30:00"), ts("08:20:00")),
    )
    inc_sql = f"INSERT INTO ticker_incident_versions VALUES ({','.join('?' * 20)})"
    conn.execute(inc_sql, ("900", ts("08:00:00"), 0, ts("07:50:00"), ts("08:00:00"), "INFO", "UNTIL", None,
                           ts("10:00:00"), None, "EG_008", "DE",
                           "Störung: Beta - Gamma", "Perturbation : Beta - Gamma", "Perturbazione: Beta - Gamma",
                           "Disruption: Beta - Gamma",
                           "Kein Zugverkehr", "Pas de trafic", "Nessun treno", "No trains between Beta and Gamma"))
    conn.execute(inc_sql, ("900", ts("09:30:00"), 1, ts("07:50:00"), ts("09:30:00"), "ENDED", "UNTIL", None,
                           ts("10:00:00"), None, "EG_008", "DE",
                           "Wieder Verkehr: Beta - Gamma", "Reprise : Beta - Gamma", "Ripresa: Beta - Gamma",
                           "Service resumed: Beta - Gamma", None, None, None, "Trains run again"))
    # A ticker-only incident whose place is only in the text.
    conn.execute(inc_sql, ("901", ts("12:00:00"), 1, ts("12:00:00"), ts("12:00:00"), "INFO", "UNKNOWN", None, None,
                           None, "EG_008", "DE", "Störung Xenon Nord", None, None, "Disruption at Xenon Nord",
                           None, None, None, None))
    msg_sql = f"INSERT INTO ticker_message_versions VALUES ({','.join('?' * 14)})"
    conn.execute(msg_sql, ("m1", "900", ts("08:05:00"), 1, ts("08:05:00"), "PUBLISHED",
                           "Ersatz", "Remplacement", "Sostituzione", "Replacement",
                           "Ersatzbusse fahren", "Bus de remplacement", "Bus sostitutivi", "Replacement buses are running"))
    conn.execute(msg_sql, ("m2", "900", ts("08:06:00"), 1, ts("08:06:00"), "HIDDEN",
                           "Intern", "Interne", "Interno", "Internal", "x", "x", "x", "hidden message"))
    conn.execute("INSERT INTO kult_categories VALUES (1, 'EK_X', 'Fahrleitung', 'Ligne', 'Linea')")
    conn.execute("INSERT INTO kult_cases VALUES (5, ?, ?, 1, 0, 'Beta - Gamma', NULL, 1)", (ts("07:52:00"), ts("07:52:00")))
    conn.execute("INSERT INTO kult_messages VALUES (50, 5, ?, 'TCC', 'Fahrleitung beschädigt, Bus bestellt')", (ts("08:01:00"),))
    conn.executemany("INSERT INTO meta VALUES (?, ?)", [("built_at", "1789000000"), ("gtfs_file", "fixture")])
    conn.commit()
    conn.close()
    return path


@pytest.fixture(scope="session")
def fixture_db(tmp_path_factory) -> Path:
    return build_fixture_db(tmp_path_factory.mktemp("db") / "fixture.db")


@pytest.fixture()
def settings(fixture_db) -> Settings:
    return Settings(db_path=fixture_db, together_api_key=None)


REAL_DB = Settings().db_path
