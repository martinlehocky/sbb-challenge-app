"""Checks against the full database built from the SBB data. Skipped when backend/data/sbb.db is missing."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from sbb_backend.api import create_app
from sbb_backend.config import Settings

from .conftest import REAL_DB

pytestmark = [
    pytest.mark.realdata,
    pytest.mark.skipif(not REAL_DB.is_file(), reason="real database not built (python -m sbb_backend.ingest)"),
]

ZURICH_HB, BERN = 8503000, 8507000


@pytest.fixture(scope="module")
def client():
    with TestClient(create_app(Settings(together_api_key=None))) as c:
        yield c


def test_health_counts(client):
    db = client.get("/api/v1/health").json()["database"]
    assert int(db["count_trips"]) > 100_000
    assert int(db["count_incidents_current"]) == 523
    assert int(db["count_via_log"]) == 2710
    assert int(db["count_kult_cases"]) == 137


def test_station_search_real_names(client):
    assert client.get("/api/v1/stations/search", params={"q": "Zürich HB"}).json()[0]["id"] == ZURICH_HB
    assert client.get("/api/v1/stations/search", params={"q": "geneve"}).json()[0]["name"].startswith("Genève")
    near = client.get("/api/v1/stations/nearest", params={"lat": 46.9490, "lon": 7.4393}).json()
    assert near[0]["id"] == BERN and near[0]["distance_m"] < 300


def test_zurich_bern_timetable(client):
    r = client.get("/api/v1/journeys", params={"origin": ZURICH_HB, "destination": BERN,
                                               "depart_after": "2026-09-10T08:00"}).json()
    j = r["journeys"][0]
    assert j["transfers"] == 0 and j["duration_min"] <= 75
    assert j["departure"] >= "2026-09-10T08:00"


def test_zurich_chur_during_waedenswil_disruption(client):
    """10 Sept 2026: overhead line fault Wädenswil - Pfäffikon SZ (IC3, IR35, S2, S8, S25 affected).

    The IC3 runs non-stop Zürich HB - Sargans, so the disruption is only found through the line-aware corridor.
    """
    r = client.post("/api/v1/advice", json={"origin": "Zürich HB", "destination": "Chur",
                                            "at": "2026-09-10T06:30:00+02:00"}).json()
    assert r["status"] == "affected"
    assert "2195005182293" in [d["id"] for d in r["affecting_disruptions"]]
    best = r["alternatives"][0]
    lines = [leg["line"] for leg in best["legs"]]
    assert not {"S2", "S8", "S25"} & set(lines)
    stations = [leg["from"]["name"] for leg in best["legs"]]
    assert "Wädenswil" not in stations and "Pfäffikon SZ" not in stations
    assert best["delay_vs_plan_min"] > 0


def test_every_scenario_can_be_advised(client):
    scenarios = client.get("/api/v1/disruptions/scenarios", params={"limit": 15}).json()
    assert scenarios
    statuses = set()
    for sc in scenarios:
        assert client.get(f"/api/v1/disruptions/{sc['id']}", params={"at": sc["replay_at"]}).status_code == 200
        if not sc["suggested_trip"]:
            continue
        r = client.post("/api/v1/advice", json={"origin": sc["suggested_trip"]["from"],
                                                "destination": sc["suggested_trip"]["to"], "at": sc["replay_at"]})
        if r.status_code in (404, 422):  # operating point that is not a passenger station, or same station
            continue
        assert r.status_code == 200, r.text
        statuses.add(r.json()["status"])
    assert statuses <= {"ok", "affected", "no_alternative", "no_connection"}
    assert "affected" in statuses


def test_ice_in_ic3_slot_is_caught(client):
    """10 Sept 2026 11:05: the ticker says the IC3 Zürich HB xx:07 to Chur is cancelled; the timetable names
    that 11:07 train "ICE" (train 275). It must be flagged and avoided."""
    r = client.post("/api/v1/advice", json={"origin": "Zürich HB", "destination": "Chur",
                                            "at": "2026-09-10T11:05:00+02:00"}).json()
    assert r["status"] == "affected"
    assert r["planned"]["departure"].startswith("2026-09-10T11:07")
    assert r["alternatives"][0]["departure"] > "2026-09-10T11:07"
