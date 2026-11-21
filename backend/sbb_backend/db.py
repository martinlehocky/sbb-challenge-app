"""SQLite schema and connection helper."""
from __future__ import annotations

import sqlite3
from pathlib import Path

LANGS = ("de", "fr", "it", "en")

SCHEMA = f"""
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);

-- One row per service point (station or operating point), keyed by its 7-digit number (DiDok/UIC).
CREATE TABLE stations (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    name_norm TEXT NOT NULL,
    abbreviation TEXT,
    lat REAL,
    lon REAL,
    canton TEXT,
    municipality TEXT,
    means TEXT,
    rail INTEGER NOT NULL DEFAULT 0,      -- 1 if a rail trip in the GTFS feed stops here
    transfer_s INTEGER                    -- minimum transfer time from GTFS transfers.txt, if any
);
CREATE INDEX stations_name_norm ON stations(name_norm);

-- Rail part of the GTFS timetable.
CREATE TABLE routes (route_id TEXT PRIMARY KEY, short_name TEXT, category TEXT, route_type INTEGER, agency TEXT);
CREATE TABLE trips (
    id INTEGER PRIMARY KEY,
    gtfs_id TEXT NOT NULL,
    route_id TEXT NOT NULL,
    service_id TEXT NOT NULL,
    headsign TEXT,
    train_no TEXT
);
CREATE INDEX trips_service ON trips(service_id);
CREATE TABLE stop_times (
    trip INTEGER NOT NULL,
    seq INTEGER NOT NULL,
    station INTEGER NOT NULL,
    platform TEXT,
    arr INTEGER NOT NULL,               -- seconds since the start of the service day
    dep INTEGER NOT NULL,
    PRIMARY KEY (trip, seq)
) WITHOUT ROWID;
CREATE TABLE calendar (service_id TEXT PRIMARY KEY, days TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL);
CREATE TABLE calendar_dates (
    service_id TEXT NOT NULL, date TEXT NOT NULL, exception_type INTEGER NOT NULL,
    PRIMARY KEY (service_id, date)
) WITHOUT ROWID;
CREATE INDEX calendar_dates_date ON calendar_dates(date);

-- Public live ticker (incident = VIA event id).
CREATE TABLE reasons (id TEXT PRIMARY KEY, de TEXT, fr TEXT, it TEXT, en TEXT);
CREATE TABLE ticker_incident_versions (
    incident_id TEXT NOT NULL,
    valid_from INTEGER NOT NULL,          -- last_modified_date of that version
    is_current INTEGER NOT NULL,
    created_at_source INTEGER,
    updated_at_source INTEGER,
    lifecycle TEXT,
    duration_type TEXT,
    duration_from INTEGER,
    duration_to INTEGER,
    duration_at_least TEXT,
    reason_id TEXT,
    origin_language TEXT,
    {", ".join(f"summary_{l} TEXT" for l in LANGS)},
    {", ".join(f"description_{l} TEXT" for l in LANGS)},
    PRIMARY KEY (incident_id, valid_from)
);
CREATE TABLE ticker_message_versions (
    message_id TEXT NOT NULL,
    incident_id TEXT NOT NULL,
    valid_from INTEGER NOT NULL,
    is_current INTEGER NOT NULL,
    created_at INTEGER,
    status TEXT,
    {", ".join(f"title_{l} TEXT" for l in LANGS)},
    {", ".join(f"message_{l} TEXT" for l in LANGS)},
    PRIMARY KEY (message_id, valid_from)
);
CREATE INDEX ticker_message_incident ON ticker_message_versions(incident_id);

-- VIA event log (structured: places and lines).
CREATE TABLE via_log (
    log_id INTEGER PRIMARY KEY,
    logged_at INTEGER NOT NULL,
    event_id TEXT NOT NULL,
    created_at INTEGER,
    place_code TEXT,
    reason_text TEXT,
    first_published_at INTEGER,
    ended_at INTEGER,
    reason_id TEXT,
    ort1 INTEGER, ort2 INTEGER, line_from INTEGER, line_to INTEGER,
    lines TEXT,
    info_changed_at INTEGER,
    advice_published_at INTEGER,
    replacement_published_at INTEGER,
    log_info TEXT
);
CREATE INDEX via_log_event ON via_log(event_id, logged_at);

-- Internal live ticker (KULT). Personal fields (names, phone numbers, user names) are NOT imported.
CREATE TABLE kult_categories (id INTEGER PRIMARY KEY, code TEXT, de TEXT, fr TEXT, it TEXT);
CREATE TABLE kult_cases (
    id INTEGER PRIMARY KEY, created_at INTEGER, event_time INTEGER, active INTEGER, archived INTEGER,
    section TEXT, description TEXT, category_id INTEGER
);
CREATE TABLE kult_messages (id INTEGER PRIMARY KEY, case_id INTEGER NOT NULL, ts INTEGER, sender_role TEXT, text TEXT);
CREATE INDEX kult_messages_case ON kult_messages(case_id);
"""


def connect(path: Path, readonly: bool = False) -> sqlite3.Connection:
    if readonly:
        if not path.is_file():
            raise FileNotFoundError(
                f"Database {path} not found. Build it first: python -m sbb_backend.ingest"
            )
        conn = sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True, check_same_thread=False)
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn
