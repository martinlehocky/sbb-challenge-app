"""API tests on the fixture network, with Together AI replaced by a fake HTTP transport."""
from __future__ import annotations

import base64
import json
from dataclasses import replace

import httpx
import pytest
from fastapi.testclient import TestClient

from sbb_backend.ai import AIDisabled, AIError, TogetherClient
from sbb_backend.ai.together import parse_json_content
from sbb_backend.api import create_app

from .conftest import A, D


class FakeTogether:
    """Records requests and answers like the Together API."""

    def __init__(self):
        self.requests: list[httpx.Request] = []
        self.chat_answers: list[dict | str] = []
        self.reject_json_schema = False

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        assert request.headers["authorization"] == "Bearer test-key"
        path = request.url.path
        if path == "/v1/chat/completions":
            body = json.loads(request.content)
            if self.reject_json_schema and body.get("response_format", {}).get("type") == "json_schema":
                return httpx.Response(400, json={"error": {"message": "json_schema not supported", "type": "invalid_request_error"}})
            answer = self.chat_answers.pop(0) if self.chat_answers else {"message": "ok"}
            content = answer if isinstance(answer, str) else json.dumps(answer)
            return httpx.Response(200, json={"choices": [{"index": 0, "finish_reason": "stop",
                                                          "message": {"role": "assistant", "content": content}}]})
        if path == "/v1/audio/transcriptions":
            return httpx.Response(200, json={"text": " from Alpha to Delta please "})
        if path == "/v1/audio/speech":
            return httpx.Response(200, content=b"ID3fake-mp3", headers={"content-type": "audio/mpeg"})
        return httpx.Response(404, json={"error": {"message": "not found", "type": "not_found"}})


@pytest.fixture()
def fake():
    return FakeTogether()


@pytest.fixture()
def client(settings, fake):
    app = create_app(replace(settings, together_api_key="test-key"), ai_transport=httpx.MockTransport(fake))
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def client_no_ai(settings):
    with TestClient(create_app(settings)) as c:
        yield c


AT = "2026-09-10T08:00:00+02:00"


# ---------------------------------------------------------------- plain endpoints

def test_health(client_no_ai):
    r = client_no_ai.get("/api/v1/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok" and body["ai_enabled"] is False
    assert "data_dir" not in body["database"]


def test_station_endpoints(client_no_ai):
    assert client_no_ai.get("/api/v1/stations/search", params={"q": "gam"}).json()[0]["name"] == "Gamma"
    near = client_no_ai.get("/api/v1/stations/nearest", params={"lat": 46.0, "lon": 7.3}).json()
    assert near[0]["id"] == D and near[0]["distance_m"] == 0
    assert client_no_ai.get(f"/api/v1/stations/{A}").json()["name"] == "Alpha"
    assert client_no_ai.get("/api/v1/stations/1").status_code == 404


def test_disruption_endpoints(client_no_ai):
    r = client_no_ai.get("/api/v1/disruptions", params={"at": AT, "lang": "fr"}).json()
    assert r["count"] == 1 and r["disruptions"][0]["title"] == "Perturbation : Beta - Gamma"
    assert client_no_ai.get("/api/v1/disruptions", params={"at": "2026-09-10T07:00"}).json()["count"] == 0
    near = client_no_ai.get("/api/v1/disruptions", params={"at": AT, "lat": 46.3, "lon": 7.1, "radius_m": 5000}).json()
    assert near["count"] == 0
    one = client_no_ai.get("/api/v1/disruptions/900", params={"at": AT, "include_internal": True}).json()
    assert one["status"] == "active" and one["internal_notes"] == []
    assert client_no_ai.get("/api/v1/disruptions/900", params={"at": "2026-09-01T00:00"}).status_code == 404
    tl = client_no_ai.get("/api/v1/disruptions/900/timeline").json()
    assert tl["events"] and all(e["source"] != "internal" for e in tl["events"])
    assert client_no_ai.get("/api/v1/disruptions/nope/timeline").status_code == 404
    assert client_no_ai.get("/api/v1/disruptions/scenarios").json()[0]["id"] == "900"
    assert client_no_ai.get("/api/v1/disruptions", params={"at": "not a time"}).status_code == 422


def test_journeys_and_advice(client_no_ai):
    j = client_no_ai.get("/api/v1/journeys", params={"origin": "Alpha", "destination": "Delta",
                                                     "depart_after": "2026-09-10T07:59"}).json()
    assert j["journeys"][0]["legs"][0]["line"] == "S1"
    r = client_no_ai.post("/api/v1/advice", json={"origin": "Alpha", "destination": str(D), "at": AT,
                                                  "depart_after": "2026-09-10T07:59", "lang": "it"})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "affected" and body["alternatives"][0]["legs"][0]["line"] == "S2"
    assert body["message"].startswith("Il suo collegamento è perturbato")
    assert "ai_message" not in body
    assert client_no_ai.post("/api/v1/advice", json={"origin": "Alpha", "destination": "Alpha"}).status_code == 422
    assert client_no_ai.post("/api/v1/advice", json={"origin": "Nowhere", "destination": "Alpha"}).status_code == 404
    assert client_no_ai.post("/api/v1/advice", json={"origin": "Alpha", "destination": "Delta", "lang": "xx"}).status_code == 422


def test_location_without_ai(client_no_ai):
    r = client_no_ai.post("/api/v1/location/analyze", json={"lat": 46.0, "lon": 7.11, "at": AT}).json()
    assert r["station"]["name"] == "Beta" and r["resolved_from"] == "coordinates"
    assert [d["id"] for d in r["disruptions_nearby"]] == ["900"]
    r = client_no_ai.post("/api/v1/location/analyze", json={"text": "I am waiting in Gamma", "at": AT,
                                                            "suggestions": True}).json()
    assert r["station"]["name"] == "Gamma" and r["suggestions"] == []
    assert "TOGETHER_API_KEY" in r["suggestions_error"]
    assert client_no_ai.post("/api/v1/location/analyze", json={}).status_code == 422


def test_voice_endpoints_need_ai(client_no_ai):
    r = client_no_ai.post("/api/v1/voice/speak", json={"text": "hello"})
    assert r.status_code == 503
    r = client_no_ai.post("/api/v1/voice/transcribe", files={"file": ("a.wav", b"RIFF....", "audio/wav")})
    assert r.status_code == 503
    # typed request still works without AI (text matching)
    r = client_no_ai.post("/api/v1/voice/ask-text", data={"text": "Delta", "station": "Alpha", "at": AT}).json()
    assert r["understood"]["origin"]["name"] == "Alpha" and r["advice"]["status"] == "affected"


# ---------------------------------------------------------------- with (fake) Together AI

def test_ai_rewrite_accepted_and_rejected(client, fake):
    payload = {"origin": "Alpha", "destination": "Delta", "at": AT, "depart_after": "2026-09-10T07:59",
               "ai_message": True}
    good = ("Your train is disrupted until 10:00. Take the S2 at 08:05 on platform 7 towards Delta. "
            "You reach Delta at 08:50, 20 minutes late.")
    fake.chat_answers = [{"message": good}]
    body = client.post("/api/v1/advice", json=payload).json()
    assert body["ai_message"] == good and "ai_error" not in body
    sent = json.loads(fake.requests[-1].content)
    assert sent["model"] == "Qwen/Qwen3.5-9B" and sent["reasoning"] == {"enabled": False}
    assert sent["response_format"]["type"] == "json_schema"

    fake.chat_answers = [{"message": good.replace("08:05", "08:15")}]  # 08:15 is invented
    body = client.post("/api/v1/advice", json=payload).json()
    assert body["ai_message"] is None and "08:15" in body["ai_error"]

    fake.chat_answers = [{"message": "Take the S2 at 08:05 towards Delta, arriving 08:50."}]  # drops 10:00
    body = client.post("/api/v1/advice", json=payload).json()
    assert body["ai_message"] is None and "leaves out times" in body["ai_error"]

    fake.chat_answers = [{"message": "Disrupted until 10:00. Take the S2 at 08:05, you arrive at 08:50."}]  # no Delta
    body = client.post("/api/v1/advice", json=payload).json()
    assert body["ai_message"] is None and "leaves out stations" in body["ai_error"]


def test_json_schema_fallback(client, fake):
    fake.reject_json_schema = True
    msg = "Until 10:00: take the S2 at 08:05 to Delta, arriving at 08:50."
    fake.chat_answers = [{"message": msg}]
    body = client.post("/api/v1/advice", json={"origin": "Alpha", "destination": "Delta", "at": AT,
                                               "depart_after": "2026-09-10T07:59", "ai_message": True}).json()
    assert body["ai_message"] == msg
    formats = [json.loads(r.content)["response_format"]["type"] for r in fake.requests]
    assert formats == ["json_schema", "json_object"]


def test_transcribe_and_speak(client, fake):
    r = client.post("/api/v1/voice/transcribe", files={"file": ("q.mp3", b"ID3data", "audio/mpeg")},
                    data={"lang": "de"})
    assert r.status_code == 200 and r.json() == {"text": "from Alpha to Delta please"}
    body = fake.requests[-1].content
    assert b'name="model"' in body and b"openai/whisper-large-v3" in body
    assert b'name="language"' in body and b'name="file"; filename="q.mp3"' in body
    assert b'name="prompt"' in body and "Chur".encode() in body
    assert body.index(b'name="model"') < body.index(b'name="file"')

    r = client.post("/api/v1/voice/speak", json={"text": "Gleis 7", "lang": "de"})
    assert r.status_code == 200 and r.content == b"ID3fake-mp3" and r.headers["content-type"] == "audio/mpeg"
    sent = json.loads(fake.requests[-1].content)
    assert sent == {"model": "canopylabs/orpheus-3b-0.1-ft", "input": "Gleis 7", "voice": "tara",
                    "response_format": "mp3", "stream": False, "language": "de"}


def test_voice_ask_full_flow(client, fake):
    fake.chat_answers = [{"origin": "Alpha", "destination": "Delta", "language": "en"}]
    r = client.post("/api/v1/voice/ask", files={"file": ("q.wav", b"RIFF", "audio/wav")},
                    data={"at": AT, "with_audio": "true"})
    assert r.status_code == 200
    body = r.json()
    assert body["transcript"] == "from Alpha to Delta please"
    assert body["understood"]["method"] == "ai"
    assert body["advice"]["status"] == "affected"
    assert base64.b64decode(body["audio"]["base64"]) == b"ID3fake-mp3"


def test_location_suggestions_filtered_by_time_budget(client, fake):
    fake.chat_answers = [{"suggestions": [
        {"title": "Café", "category": "eat", "walk_minutes": 2, "duration_minutes": 10, "description": "coffee"},
        {"title": "Museum", "category": "explore", "walk_minutes": 10, "duration_minutes": 45, "description": "too long"},
    ]}]
    r = client.post("/api/v1/location/analyze", json={"station_id": A, "at": AT, "wait_minutes": 30,
                                                      "suggestions": True}).json()
    assert [s["title"] for s in r["suggestions"]] == ["Café"]
    assert r["suggestions"][0]["ai_generated"] is True


# ---------------------------------------------------------------- client unit tests

def test_client_disabled_without_key(settings):
    c = TogetherClient(settings)
    with pytest.raises(AIDisabled):
        c.chat([{"role": "user", "content": "hi"}])


def test_client_retries_then_fails(settings):
    calls = []

    def handler(request):
        calls.append(1)
        return httpx.Response(429, json={"error": {"message": "slow down", "type": "rate_limit"}})

    c = TogetherClient(replace(settings, together_api_key="k"), transport=httpx.MockTransport(handler))
    with pytest.raises(AIError) as exc:
        c.transcribe(b"x", "a.wav")
    assert exc.value.status == 429 and "slow down" in str(exc.value) and len(calls) == 3


def test_parse_json_content():
    assert parse_json_content('```json\n{"a": 1}\n```') == {"a": 1}
    assert parse_json_content('<think>hmm</think> Sure: {"a": 2}') == {"a": 2}
    with pytest.raises(ValueError):
        parse_json_content("no json here")


# ---------------------------------------------------------------- assistant (questions at the kiosk)

def test_question_answered_from_facts(client, fake):
    fake.chat_answers = [{"answer": "Your trip to Delta is affected; take the next connection.", "answered": True}]
    r = client.post("/api/v1/question", json={"question": "Is my train on time?", "station": str(A),
                                               "destination": str(D), "at": AT, "lang": "en",
                                               "extra_facts": ["Cafés one floor down"]})
    assert r.status_code == 200
    body = r.json()
    assert body["answered"] is True and body["answer"].startswith("Your trip to Delta")
    facts = body["debug"]["facts"]
    assert any(f.startswith("Trip asked about: Alpha to Delta") for f in facts)
    assert "Station tip: Cafés one floor down" in facts
    sent = json.loads(fake.requests[-1].content)
    assert "FACTS:" in sent["messages"][1]["content"] and "QUESTION: Is my train on time?" in sent["messages"][1]["content"]


def test_question_with_invented_time_is_rejected(client, fake):
    fake.chat_answers = [{"answer": "Your train leaves at 23:59.", "answered": True}]
    r = client.post("/api/v1/question", json={"question": "When does it leave?", "station": str(A),
                                               "destination": str(D), "at": AT})
    body = r.json()
    assert body["answered"] is False and "info point" in body["answer"]
    assert "23:59" in body["debug"]["rejected"]


def test_question_about_a_trip_offers_the_destination(client, fake):
    fake.chat_answers = [
        {"origin": None, "destination": "Delta", "language": "en"},  # trip extraction
        {"answer": "There are trains to Delta.", "answered": True},
    ]
    r = client.post("/api/v1/question", json={"question": "I need to get to Delta", "station": str(A), "at": AT})
    body = r.json()
    assert body["trip_destination"]["name"] == "Delta"
    assert body["debug"]["trip_intent"]["destination"] == "Delta"


def test_question_without_ai(client_no_ai):
    r = client_no_ai.post("/api/v1/question", json={"question": "Where is my train?", "station": str(A), "at": AT})
    body = r.json()
    assert r.status_code == 200 and body["answered"] is False and "info point" in body["answer"]


def test_spoken_question(client, fake):
    fake.chat_answers = [
        {"origin": "Alpha", "destination": "Delta", "language": "en"},
        {"answer": "Trains run from Alpha to Delta.", "answered": True},
    ]
    r = client.post("/api/v1/question/voice", files={"file": ("q.wav", b"RIFF", "audio/wav")},
                    data={"station": str(A), "at": AT, "extra_facts": json.dumps(["A tip"])})
    body = r.json()
    assert body["question"] == "from Alpha to Delta please"
    assert body["answered"] is True and body["debug"]["speech_to_text"]["model"]
