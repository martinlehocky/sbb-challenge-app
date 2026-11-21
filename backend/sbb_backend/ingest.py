"""Build the SQLite database from the raw SBB exports.

Usage (from the backend/ folder):
    python -m sbb_backend.ingest                 # uses SBB_DATA_DIR / defaults
    python -m sbb_backend.ingest --data-dir D:/sbb --db data/sbb.db

The raw files are read in place (zip members are streamed), so nothing is extracted to disk.
The database is written to a temporary file first and swapped in only when complete.
"""
from __future__ import annotations

import argparse
import csv
import io
import logging
import os
import sqlite3
import time
import zipfile
from pathlib import Path
from typing import Iterable, Iterator

from .config import get_settings
from .db import LANGS, SCHEMA, connect
from .textutil import normalize, strip_html
from .timeutil import gtfs_time_to_seconds, parse_ts

csv.field_size_limit(2**31 - 1)
log = logging.getLogger("sbb_backend.ingest")

BATCH = 50_000
RAIL_ROUTE_TYPES = {2} | set(range(100, 118))  # GTFS basic "rail" + extended railway service types
SERVICE_POINT_FILE = "actual-date-swiss-service-point.csv"
DATEN_ZIP = "Daten.zip"


# ---------------------------------------------------------------------------- helpers

def _text(zf: zipfile.ZipFile, name: str) -> io.TextIOWrapper:
    return io.TextIOWrapper(zf.open(name), encoding="utf-8-sig", newline="")


def _find_member(zf: zipfile.ZipFile, folder: str, prefix: str) -> str:
    matches = [
        n for n in zf.namelist()
        if n.startswith(folder) and Path(n).name.startswith(prefix) and not n.endswith("/")
    ]
    if len(matches) != 1:
        raise FileNotFoundError(f"Expected exactly one {folder}{prefix}* in the zip, found {matches}")
    return matches[0]


def _float(value: object) -> float | None:
    if value is None or str(value).strip() == "":
        return None
    try:
        out = float(value)  # type: ignore[arg-type]
    except ValueError:
        return None
    return out


def _int(value: object) -> int | None:
    if value is None or str(value).strip() == "":
        return None
    return int(float(value))  # type: ignore[arg-type]


def _str(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _bool(value: object) -> int | None:
    text = _str(value)
    if text is None:
        return None
    return 1 if text.lower() in {"true", "t", "1", "yes"} else 0


def _batched(rows: Iterable[tuple], size: int = BATCH) -> Iterator[list[tuple]]:
    batch: list[tuple] = []
    for row in rows:
        batch.append(row)
        if len(batch) >= size:
            yield batch
            batch = []
    if batch:
        yield batch


# ---------------------------------------------------------------------------- service points

def load_service_points(conn: sqlite3.Connection, path: Path) -> int:
    rows = []
    with open(path, encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f, delimiter=";"):
            number = (r.get("number") or "").strip()
            name = (r.get("designationOfficial") or "").strip()
            if not number.isdigit() or not name:
                continue
            lat, lon = _float(r.get("wgs84North")), _float(r.get("wgs84East"))
            if not lat or not lon:  # 0.0 means "no geolocation" in the export
                lat = lon = None
            rows.append((
                int(number), name, normalize(name), _str(r.get("abbreviation")), lat, lon,
                _str(r.get("cantonAbbreviation")), _str(r.get("municipalityName")), _str(r.get("meansOfTransport")),
            ))
    conn.executemany(
        "INSERT OR REPLACE INTO stations (id, name, name_norm, abbreviation, lat, lon, canton, municipality, means)"
        " VALUES (?,?,?,?,?,?,?,?,?)",
        rows,
    )
    return len(rows)


# ---------------------------------------------------------------------------- GTFS (rail only)

def load_gtfs(conn: sqlite3.Connection, zip_path: Path) -> dict[str, int]:
    counts: dict[str, int] = {}
    with zipfile.ZipFile(zip_path) as zf:
        agencies = {r["agency_id"]: r["agency_name"] for r in csv.DictReader(_text(zf, "agency.txt"))}

        routes: dict[str, tuple] = {}
        for r in csv.DictReader(_text(zf, "routes.txt")):
            try:
                route_type = int(r["route_type"])
            except (TypeError, ValueError):
                continue
            if route_type in RAIL_ROUTE_TYPES:
                routes[r["route_id"]] = (
                    r["route_id"], _str(r["route_short_name"]), _str(r["route_desc"]), route_type,
                    agencies.get(r["agency_id"]),
                )
        conn.executemany("INSERT INTO routes VALUES (?,?,?,?,?)", routes.values())
        counts["routes"] = len(routes)
        log.info("rail routes: %d", len(routes))

        trip_ids: dict[str, int] = {}
        services: set[str] = set()

        def trip_rows() -> Iterator[tuple]:
            for r in csv.DictReader(_text(zf, "trips.txt")):
                if r["route_id"] not in routes:
                    continue
                tid = len(trip_ids) + 1
                trip_ids[r["trip_id"]] = tid
                services.add(r["service_id"])
                yield (tid, r["trip_id"], r["route_id"], r["service_id"], _str(r["trip_headsign"]),
                       _str(r["trip_short_name"]))

        for batch in _batched(trip_rows()):
            conn.executemany("INSERT INTO trips VALUES (?,?,?,?,?,?)", batch)
        counts["trips"] = len(trip_ids)
        log.info("rail trips: %d", len(trip_ids))

        # Frequency-based trips are not expanded; warn loudly if a rail trip uses them.
        freq_trips = {r["trip_id"] for r in csv.DictReader(_text(zf, "frequencies.txt"))}
        rail_freq = len(freq_trips & trip_ids.keys())
        if rail_freq:
            log.warning("%d rail trips use frequencies.txt; they are imported with their template times only", rail_freq)

        # stops: platform-level stop_id -> (station number, platform)
        stop_map: dict[str, tuple[int, str | None]] = {}
        station_info: dict[int, tuple[str, float | None, float | None]] = {}
        synthetic: dict[str, int] = {}
        for r in csv.DictReader(_text(zf, "stops.txt")):
            didok = (r.get("didok") or "").strip()
            if didok.isdigit():
                sid = int(didok)
            else:  # no station number: give the parent a stable negative id
                key = r.get("parent_station") or r["stop_id"]
                sid = synthetic.setdefault(key, -(len(synthetic) + 1))
            platform = _str(r.get("platform_code"))
            stop_map[r["stop_id"]] = (sid, platform)
            if sid not in station_info or platform is None:  # prefer the station-level row for name/coords
                station_info[sid] = (r["stop_name"], _float(r["stop_lat"]), _float(r["stop_lon"]))

        rail_stations: set[int] = set()
        missing_stop = 0
        missing_time = 0
        n_stop_times = 0

        def stop_time_rows() -> Iterator[tuple]:
            nonlocal missing_stop, missing_time, n_stop_times
            reader = csv.reader(_text(zf, "stop_times.txt"))
            header = next(reader)
            i_trip, i_arr, i_dep = header.index("trip_id"), header.index("arrival_time"), header.index("departure_time")
            i_stop, i_seq = header.index("stop_id"), header.index("stop_sequence")
            for row in reader:
                tid = trip_ids.get(row[i_trip])
                if tid is None:
                    continue
                stop = stop_map.get(row[i_stop])
                if stop is None:
                    missing_stop += 1
                    continue
                arr, dep = row[i_arr].strip(), row[i_dep].strip()
                arr, dep = arr or dep, dep or arr
                if not arr:
                    missing_time += 1
                    continue
                rail_stations.add(stop[0])
                n_stop_times += 1
                yield (tid, int(row[i_seq]), stop[0], stop[1], gtfs_time_to_seconds(arr), gtfs_time_to_seconds(dep))

        t0 = time.time()
        for batch in _batched(stop_time_rows()):
            conn.executemany("INSERT INTO stop_times VALUES (?,?,?,?,?,?)", batch)
        counts["stop_times"] = n_stop_times
        log.info("rail stop_times: %d (%.0fs)", n_stop_times, time.time() - t0)
        if missing_stop or missing_time:
            log.warning("skipped stop_times: %d unknown stop_id, %d without times", missing_stop, missing_time)

        cal_rows = []
        for r in csv.DictReader(_text(zf, "calendar.txt")):
            if r["service_id"] in services:
                days = "".join(r[d] for d in ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"))
                cal_rows.append((r["service_id"], days, r["start_date"], r["end_date"]))
        conn.executemany("INSERT INTO calendar VALUES (?,?,?,?)", cal_rows)
        counts["calendar"] = len(cal_rows)

        def cal_date_rows() -> Iterator[tuple]:
            for r in csv.reader(_text(zf, "calendar_dates.txt")):
                if r[0] in services:
                    yield (r[0], r[1], int(r[2]))

        n_dates = 0
        for batch in _batched(cal_date_rows()):
            conn.executemany("INSERT OR REPLACE INTO calendar_dates VALUES (?,?,?)", batch)
            n_dates += len(batch)
        counts["calendar_dates"] = n_dates

        # Station-level minimum transfer times (rows where from == to, no route/trip restriction).
        transfer_s: dict[int, int] = {}
        reader = csv.reader(_text(zf, "transfers.txt"))
        header = next(reader)
        idx = {name: i for i, name in enumerate(header)}
        for r in reader:
            if r[idx["from_stop_id"]] != r[idx["to_stop_id"]]:
                continue
            if any(r[idx[c]] for c in ("from_route_id", "to_route_id", "from_trip_id", "to_trip_id") if c in idx):
                continue
            mtt = r[idx["min_transfer_time"]].strip()
            if not mtt:
                continue
            stop = stop_map.get(r[idx["from_stop_id"]])
            sid = stop[0] if stop else (int(r[idx["from_stop_id"]]) if r[idx["from_stop_id"]].isdigit() else None)
            if sid is not None and sid in rail_stations:
                transfer_s[sid] = max(transfer_s.get(sid, 0), int(mtt))
        counts["station_transfers"] = len(transfer_s)

    # Make sure every rail station exists in `stations` and is flagged.
    known = {row[0] for row in conn.execute("SELECT id FROM stations")}
    new_rows = []
    for sid in rail_stations - known:
        name, lat, lon = station_info.get(sid, (f"Stop {sid}", None, None))
        new_rows.append((sid, name, normalize(name), lat, lon))
    conn.executemany("INSERT INTO stations (id, name, name_norm, lat, lon) VALUES (?,?,?,?,?)", new_rows)
    conn.executemany("UPDATE stations SET rail = 1 WHERE id = ?", [(sid,) for sid in rail_stations])
    conn.executemany(
        "UPDATE stations SET lat = ?, lon = ? WHERE id = ? AND (lat IS NULL OR lon IS NULL)",
        [(info[1], info[2], sid) for sid, info in station_info.items() if sid in rail_stations and info[1] and info[2]],
    )
    conn.executemany("UPDATE stations SET transfer_s = ? WHERE id = ?", [(v, k) for k, v in transfer_s.items()])
    counts["rail_stations"] = len(rail_stations)
    counts["rail_stations_added_from_gtfs"] = len(new_rows)
    return counts


# ---------------------------------------------------------------------------- public live ticker

def load_public_ticker(conn: sqlite3.Connection, zf: zipfile.ZipFile) -> dict[str, int]:
    folder = "Daten/extern-liveticker/"
    reasons = [
        (r["id"], r["reason_de"], r["reason_fr"], r["reason_it"], r["reason_en"])
        for r in csv.DictReader(_text(zf, _find_member(zf, folder, "reason_")))
    ]
    conn.executemany("INSERT OR REPLACE INTO reasons VALUES (?,?,?,?,?)", reasons)

    def incident_row(r: dict, current: bool) -> tuple | None:
        valid_from = parse_ts(r.get("last_modified_date"))
        if not r.get("id") or valid_from is None:
            return None
        return (
            r["id"], valid_from, int(current), parse_ts(r.get("created_at_source")), parse_ts(r.get("updated_at_source")),
            _str(r.get("lifecycle")), _str(r.get("duration_type")), parse_ts(r.get("duration_from")),
            parse_ts(r.get("duration_to")), _str(r.get("duration_at_least")), _str(r.get("reason_id_fk")),
            _str(r.get("origin_language")),
            *[_str(r.get(f"summary_{lang}")) for lang in LANGS],
            *[_str(r.get(f"description_{lang}")) for lang in LANGS],
        )

    def message_row(r: dict, current: bool) -> tuple | None:
        valid_from = parse_ts(r.get("last_modified_date"))
        if not r.get("id") or not r.get("incident_id_fk") or valid_from is None:
            return None
        return (
            r["id"], r["incident_id_fk"], valid_from, int(current), parse_ts(r.get("created_date")), _str(r.get("status")),
            *[_str(r.get(f"title_{lang}")) for lang in LANGS],
            *[_str(r.get(f"message_{lang}")) for lang in LANGS],
        )

    inc_sql = f"INSERT OR REPLACE INTO ticker_incident_versions VALUES ({','.join('?' * 20)})"
    msg_sql = f"INSERT OR REPLACE INTO ticker_message_versions VALUES ({','.join('?' * 14)})"
    counts: dict[str, int] = {"reasons": len(reasons)}
    # Audit rows first, then current rows, so the current version wins on an identical timestamp.
    for prefix, sql, make, current, key in (
        ("incident_audit_", inc_sql, incident_row, False, "incident_versions_audit"),
        ("incident_2", inc_sql, incident_row, True, "incidents_current"),
        ("message_audit_", msg_sql, message_row, False, "message_versions_audit"),
        ("message_2", msg_sql, message_row, True, "messages_current"),
    ):
        rows = [row for r in csv.DictReader(_text(zf, _find_member(zf, folder, prefix))) if (row := make(r, current))]
        conn.executemany(sql, rows)
        counts[key] = len(rows)
    return counts


# ---------------------------------------------------------------------------- VIA event log

VIA_COLUMNS = (
    "id", "logging_date_time", "alea_fall_id", "alea_erstellungszeitpunkt", "alea_ort_strecke", "alea_ereignisgrund",
    "zeitpunkt_erstpublikation", "zeitpunkt_globale_endmeldung", "ereignisgrund", "stoerungs_ort1", "stoerungs_ort2",
    "stoerungs_linie_von", "stoerungs_linie_bis", "stoerungs_liniennummer", "zeitpunkt_weitere_informationen_geaendert",
    "zeitpunkt_erstpublikation_reiseempfehlung", "zeitpunkt_erstpublikation_bahnersatz", "log_info",
)


def load_via(conn: sqlite3.Connection, zf: zipfile.ZipFile) -> int:
    import openpyxl  # only needed here

    member = _find_member(zf, "Daten/Ereignismeldungen/", "Ereignismeldungen")
    wb = openpyxl.load_workbook(io.BytesIO(zf.read(member)), read_only=True, data_only=True)
    ws = wb.worksheets[0]
    rows_iter = ws.iter_rows(values_only=True)
    header = [str(h).strip() if h is not None else "" for h in next(rows_iter)]
    missing = [c for c in VIA_COLUMNS if c not in header]
    if missing:
        raise ValueError(f"VIA sheet is missing columns: {missing}")
    col = {name: header.index(name) for name in VIA_COLUMNS}
    rows = []
    for r in rows_iter:
        if r is None or r[col["alea_fall_id"]] is None or r[col["logging_date_time"]] is None:
            continue
        g = lambda name: r[col[name]]  # noqa: E731
        rows.append((
            _int(g("id")), parse_ts(g("logging_date_time")), str(_int(g("alea_fall_id"))),
            parse_ts(g("alea_erstellungszeitpunkt")), _str(g("alea_ort_strecke")), _str(g("alea_ereignisgrund")),
            parse_ts(g("zeitpunkt_erstpublikation")), parse_ts(g("zeitpunkt_globale_endmeldung")), _str(g("ereignisgrund")),
            _int(g("stoerungs_ort1")), _int(g("stoerungs_ort2")), _int(g("stoerungs_linie_von")),
            _int(g("stoerungs_linie_bis")), _str(g("stoerungs_liniennummer")),
            parse_ts(g("zeitpunkt_weitere_informationen_geaendert")), parse_ts(g("zeitpunkt_erstpublikation_reiseempfehlung")),
            parse_ts(g("zeitpunkt_erstpublikation_bahnersatz")), _str(g("log_info")),
        ))
    wb.close()
    conn.executemany(f"INSERT OR REPLACE INTO via_log VALUES ({','.join('?' * 18)})", rows)
    return len(rows)


# ---------------------------------------------------------------------------- internal live ticker (KULT)

def _sender_role(sender: str | None) -> str:
    s = (sender or "").strip()
    return s if s in {"TCC", "KOO Bhf"} else "other"  # anything else may be a personal user id


def load_kult(conn: sqlite3.Connection, zf: zipfile.ZipFile) -> dict[str, int]:
    folder = "Daten/intern-liveticker/"
    cats = [
        (_int(r["id"]), _str(r["name"]), _str(r["name_de"]), _str(r["name_fr"]), _str(r["name_it"]))
        for r in csv.DictReader(_text(zf, _find_member(zf, folder, "2__")))
    ]
    cases = [
        (_int(r["id"]), parse_ts(r["created_at"]), parse_ts(r["datum"]), _bool(r["active"]), _bool(r["archived"]),
         _str(r["zug_nr_strecke"]), _str(r["beschreibung"]), _int(r["ereigniskategorie_id"]))
        for r in csv.DictReader(_text(zf, _find_member(zf, folder, "1__")))
    ]
    # Only id, case, time, sender role and text are kept: name / vorname / telefonnummer are dropped on purpose.
    msgs = [
        (_int(r["id"]), _int(r["ereignisfall_id"]), parse_ts(r["timestamp"]), _sender_role(r.get("sender")),
         strip_html(r.get("message")))
        for r in csv.DictReader(_text(zf, _find_member(zf, folder, "3_")))
        if _str(r.get("id")) and _str(r.get("ereignisfall_id"))
    ]
    conn.executemany("INSERT OR REPLACE INTO kult_categories VALUES (?,?,?,?,?)", cats)
    conn.executemany("INSERT OR REPLACE INTO kult_cases VALUES (?,?,?,?,?,?,?,?)", cases)
    conn.executemany("INSERT OR REPLACE INTO kult_messages VALUES (?,?,?,?,?)", msgs)
    return {"kult_categories": len(cats), "kult_cases": len(cases), "kult_messages": len(msgs)}


# ---------------------------------------------------------------------------- driver

def build(data_dir: Path, db_path: Path, gtfs_zip: Path) -> dict[str, int]:
    for required in (data_dir / SERVICE_POINT_FILE, data_dir / DATEN_ZIP, gtfs_zip):
        if not required.is_file():
            raise FileNotFoundError(required)

    tmp = db_path.with_suffix(".building")
    if tmp.exists():
        tmp.unlink()
    conn = connect(tmp)
    conn.execute("PRAGMA journal_mode = OFF")
    conn.execute("PRAGMA synchronous = OFF")
    conn.executescript(SCHEMA)
    counts: dict[str, int] = {}
    try:
        t0 = time.time()
        counts["service_points"] = load_service_points(conn, data_dir / SERVICE_POINT_FILE)
        log.info("service points: %d", counts["service_points"])
        with zipfile.ZipFile(data_dir / DATEN_ZIP) as zf:
            counts.update(load_public_ticker(conn, zf))
            counts["via_log"] = load_via(conn, zf)
            counts.update(load_kult(conn, zf))
        log.info("disruption sources loaded: %s", {k: v for k, v in counts.items() if k != "service_points"})
        counts.update(load_gtfs(conn, gtfs_zip))

        for table in ("stations", "trips", "stop_times", "ticker_incident_versions", "ticker_message_versions",
                      "via_log", "kult_cases", "reasons"):
            n = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            if n == 0:
                raise RuntimeError(f"Table {table} is empty after ingest; check the input files")

        meta = {
            "built_at": str(int(time.time())),
            "gtfs_file": gtfs_zip.name,
            "data_dir": str(data_dir),
            **{f"count_{k}": str(v) for k, v in counts.items()},
        }
        conn.executemany("INSERT OR REPLACE INTO meta VALUES (?,?)", meta.items())
        conn.commit()
        conn.execute("ANALYZE")
        conn.commit()
        log.info("done in %.0fs", time.time() - t0)
    except BaseException:
        conn.close()
        tmp.unlink(missing_ok=True)
        raise
    conn.close()
    os.replace(tmp, db_path)
    return counts


def main(argv: list[str] | None = None) -> None:
    settings = get_settings()
    parser = argparse.ArgumentParser(description="Build the SBB disruption database")
    parser.add_argument("--data-dir", type=Path, default=settings.data_dir)
    parser.add_argument("--db", type=Path, default=settings.db_path)
    parser.add_argument("--gtfs", type=Path, default=None, help="GTFS zip (default: newest gtfs_*.zip in data dir)")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    gtfs = args.gtfs or (Path(settings.gtfs_zip) if settings.gtfs_zip else None)
    if gtfs is None:
        candidates = sorted(args.data_dir.glob("gtfs_*.zip"))
        if not candidates:
            raise SystemExit(f"No gtfs_*.zip in {args.data_dir}")
        gtfs = candidates[-1]
    log.info("data dir %s, gtfs %s, db %s", args.data_dir, gtfs.name, args.db)
    counts = build(args.data_dir, args.db, gtfs)
    for key, value in counts.items():
        print(f"{key:32s} {value:>12,}")


if __name__ == "__main__":
    main()
