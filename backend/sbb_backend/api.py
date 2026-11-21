"""HTTP API (FastAPI). Run: uvicorn sbb_backend.api:app --reload  (from the backend/ folder)."""
from __future__ import annotations

import base64
import json
import logging
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Literal

import httpx
from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from . import __version__
from .ai import AIError, TogetherClient
from .config import Settings, get_settings
from .db import connect
from .services.advisor import Advisor
from .services.assistant import Assistant
from .services.disruptions import DisruptionStore
from .services.location import LocationService
from .services.planner import Planner
from .services.stations import Station, StationIndex
from .services.places import PlacesError, PlacesService
from .services.voice import understand_trip
from .timeutil import parse_query_time, to_iso

log = logging.getLogger("sbb_backend.api")
Lang = Literal["en", "de", "fr", "it"]
MAX_AUDIO_BYTES = 25 * 1024 * 1024
def is_prompt_echo(transcript: str) -> bool:
    """True if the transcript is only a list of hint station names ("Chur, Lugano"): Whisper does that on silence."""
    parts = [p.strip(" .") for p in transcript.split(",")]
    return len(parts) >= 2 and all(p and p in STT_PROMPT for p in parts)


# Languages the kiosk speaks (ISO codes and the names some speech models report instead).
KIOSK_LANGUAGES = {"en", "de", "fr", "it", "english", "german", "french", "italian"}
# Whisper often labels short English clips as Welsh; re-transcribing those in the screen language
# would translate the English question (into French, for example), so they are retried in English.
MISDETECTED_AS = {"cy": "en", "welsh": "en"}
# Vocabulary hint for speech recognition, so short Swiss names ("Chur", "Thun") are not misheard.
# Only names, no sentence: an English sentence here makes Whisper translate Italian or French speech into English.
STT_PROMPT = (
    "Zürich HB, Bern, Basel SBB, Genève, Lausanne, Luzern, Chur, St. Gallen, Lugano, Bellinzona, Olten, "
    "Winterthur, Biel/Bienne, Fribourg, Neuchâtel, Sion, Brig, Visp, Interlaken Ost, Thun, Spiez, Zug, Aarau, "
    "Baden, Schaffhausen, Rapperswil, Ziegelbrücke, Sargans, Landquart, Wädenswil, Pfäffikon SZ, Morges, Nyon, "
    "Yverdon-les-Bains, Montreux, Vevey."
)


@dataclass
class Services:
    settings: Settings
    meta: dict[str, str]
    stations: StationIndex
    disruptions: DisruptionStore
    planner: Planner
    advisor: Advisor
    location: LocationService
    ai: TogetherClient
    assistant: Assistant
    places: PlacesService


def build_services(settings: Settings, ai_transport: httpx.BaseTransport | None = None,
                   places_transport: httpx.BaseTransport | None = None) -> Services:
    conn = connect(settings.db_path, readonly=True)
    meta = {r["key"]: r["value"] for r in conn.execute("SELECT key, value FROM meta")}
    stations = StationIndex(conn)
    disruptions = DisruptionStore(conn, stations)
    planner = Planner(conn, stations, default_transfer_s=settings.default_transfer_seconds)
    ai = TogetherClient(settings, transport=ai_transport)
    advisor = Advisor(stations, disruptions, planner, ai, settings.disruption_radius_m)
    location = LocationService(stations, disruptions, ai)
    places = PlacesService(settings, transport=places_transport)
    assistant = Assistant(stations, disruptions, advisor, ai, places=places)
    return Services(settings, meta, stations, disruptions, planner, advisor, location, ai, assistant, places)


# ---------------------------------------------------------------------------- request bodies

class AdviceRequest(BaseModel):
    origin: str = Field(..., description="Station id or name", examples=["Zürich HB"])
    destination: str = Field(..., description="Station id or name", examples=["Chur"])
    at: str | None = Field(None, description="Moment to evaluate (ISO). Default: now. Use a September 2026 time to replay.")
    depart_after: str | None = Field(None, description="Earliest departure (ISO). Default: `at`.")
    lang: Lang = "en"
    alternatives: int = Field(3, ge=1, le=5)
    ai_message: bool = Field(False, description="Also return an AI rewrite of the advice in plain words")


class LocationRequest(BaseModel):
    lat: float | None = Field(None, ge=-90, le=90)
    lon: float | None = Field(None, ge=-180, le=180)
    text: str | None = Field(None, description="Free-text place, e.g. 'I'm at the station in Morges'")
    station_id: int | None = None
    at: str | None = None
    radius_m: float = Field(15000, gt=0, le=100000)
    wait_minutes: int | None = Field(None, ge=1, le=600)
    interest: Literal["eat", "explore", "rest", "any"] = "any"
    lang: Lang = "en"
    suggestions: bool = Field(False, description="Ask the AI for things to do nearby")


class ChatTurn(BaseModel):
    role: Literal["traveller", "kiosk"]
    text: str = Field(..., min_length=1, max_length=1000)


def parse_history(raw: str | None) -> list[dict]:
    """History sent as a JSON form field (voice questions). Invalid items are dropped, never an error."""
    if not raw:
        return []
    try:
        items = json.loads(raw)
    except ValueError:
        return []
    out: list[dict] = []
    for item in items[-20:] if isinstance(items, list) else []:
        if isinstance(item, dict) and item.get("role") in ("traveller", "kiosk") \
                and isinstance(item.get("text"), str) and item["text"].strip():
            out.append({"role": item["role"], "text": item["text"].strip()[:1000]})
    return out


class QuestionRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=500)
    station: str = Field(..., description="Kiosk station (id or name)")
    at: str | None = None
    lang: Lang = "en"
    destination: str | None = Field(None, description="The traveller's destination, when the question is about their trip")
    extra_facts: list[str] = Field(default_factory=list, max_length=40,
                                   description="More facts the kiosk knows (e.g. hand-written station tips)")
    history: list[ChatTurn] = Field(default_factory=list, max_length=20,
                                    description="Earlier questions and answers of this conversation, oldest first")
    context_destination: str | None = Field(
        None, description="Destination already discussed in this conversation, used when the question names none")
    context_origin: str | None = Field(
        None, description="Start station of that trip, when it is not the kiosk (e.g. 'from Winterthur to Chur')")
    context_via: list[str] = Field(default_factory=list, max_length=3,
                                   description="Stops on the way of that trip ('first Interlaken, then Bern')")
    context_stays: list[int | None] = Field(default_factory=list, max_length=3,
                                            description="Minutes to stay at each of those stops (null = not said)")
    stay_minutes: int | None = Field(None, ge=5, le=720,
                                     description="A stay the traveller picked with a button (first stop without one)")


def parse_json_list(raw: str | None, limit: int = 3) -> list:
    """A JSON list sent as a form field (voice questions); anything else is an empty list, never an error."""
    if not raw:
        return []
    try:
        items = json.loads(raw)
    except ValueError:
        return []
    return items[:limit] if isinstance(items, list) else []


class PlacesRequest(BaseModel):
    station: str = Field(..., description="Kiosk station (id or name)")
    at: str | None = None
    wait_minutes: int = Field(..., ge=1, le=600, description="Minutes until the traveller must be back")
    interest: Literal["eat", "explore", "rest"] = "eat"
    lang: Lang = "en"
    limit: int = Field(3, ge=1, le=6)


class SpeakRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=4000)
    lang: Lang = "en"
    voice: str | None = None
    format: Literal["mp3", "wav"] = "mp3"


# ---------------------------------------------------------------------------- app

def create_app(settings: Settings | None = None, ai_transport: httpx.BaseTransport | None = None,
               places_transport: httpx.BaseTransport | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.services = build_services(settings, ai_transport, places_transport)
        yield
        app.state.services.ai.close()
        app.state.services.places.close()

    app = FastAPI(title="SBB disruption assistant API", version=__version__, lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

    def svc() -> Services:
        return app.state.services

    def station_or_404(value: str) -> Station:
        st = svc().stations.resolve(value)
        if st is None:
            raise HTTPException(404, f"No station found for {value!r}")
        return st

    def when(value: str | None) -> int:
        try:
            return parse_query_time(value)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

    def ai_http_error(exc: AIError) -> HTTPException:
        status = 503 if exc.status in (None, 503) else 502
        return HTTPException(status, str(exc))

    # -------------------------------------------------------------- meta

    @app.get("/api/v1/health", tags=["meta"])
    def health() -> dict:
        s = svc()
        return {
            "status": "ok",
            "version": __version__,
            "database": {k: v for k, v in s.meta.items() if k != "data_dir"},
            "database_built_at": to_iso(int(s.meta["built_at"])) if s.meta.get("built_at") else None,
            "ai_enabled": s.ai.enabled,
            "places_enabled": s.places.enabled,
            "ai_models": {
                "chat": settings.together_chat_model,
                "speech_to_text": settings.together_stt_model,
                "text_to_speech": settings.together_tts_model,
            },
        }

    # -------------------------------------------------------------- stations

    @app.get("/api/v1/stations/search", tags=["stations"])
    def search_stations(q: str = Query(..., min_length=1), limit: int = Query(10, ge=1, le=50),
                        rail_only: bool = True) -> list[dict]:
        return [s.to_dict() for s in svc().stations.search(q, limit=limit, rail_only=rail_only)]

    @app.get("/api/v1/stations/nearest", tags=["stations"])
    def nearest_stations(lat: float = Query(..., ge=-90, le=90), lon: float = Query(..., ge=-180, le=180),
                         limit: int = Query(5, ge=1, le=20)) -> list[dict]:
        return [{**s.to_dict(), "distance_m": round(d)} for s, d in svc().stations.nearest(lat, lon, limit=limit)]

    @app.get("/api/v1/stations/{station_id}", tags=["stations"])
    def get_station(station_id: int) -> dict:
        st = svc().stations.get(station_id)
        if st is None:
            raise HTTPException(404, "Unknown station")
        return st.to_dict()

    # -------------------------------------------------------------- disruptions

    @app.get("/api/v1/disruptions", tags=["disruptions"])
    def list_disruptions(at: str | None = None, include_inactive: bool = False, lang: Lang = "en",
                         lat: float | None = None, lon: float | None = None,
                         radius_m: float = Query(20000, gt=0, le=200000)) -> dict:
        t = when(at)
        states = svc().disruptions.list_at(t, include_inactive=include_inactive)
        if lat is not None and lon is not None:
            items = [{**d.to_dict(lang), "distance_m": round(dist)}
                     for d, dist in svc().disruptions.near(states, lat, lon, radius_m)]
        else:
            items = [d.to_dict(lang) for d in states]
        return {"as_of": to_iso(t), "count": len(items), "disruptions": items}

    @app.get("/api/v1/disruptions/scenarios", tags=["disruptions"])
    def scenarios(limit: int = Query(20, ge=1, le=100)) -> list[dict]:
        """Disruptions from September 2026 that make good replays, with a time and a trip to try."""
        return svc().disruptions.scenarios(limit)

    @app.get("/api/v1/disruptions/{incident_id}", tags=["disruptions"])
    def get_disruption(incident_id: str, at: str | None = None, lang: Lang = "en",
                       include_internal: bool = False) -> dict:
        t = when(at)
        st = svc().disruptions.state_at(incident_id, t)
        if st is None:
            raise HTTPException(404, "Unknown disruption, or not yet known at that time")
        out = st.to_dict(lang)
        if include_internal:
            out["internal_notes"] = svc().disruptions.internal_notes(incident_id, t)
        return out

    @app.get("/api/v1/disruptions/{incident_id}/timeline", tags=["disruptions"])
    def disruption_timeline(incident_id: str, lang: Lang = "en", include_internal: bool = False) -> dict:
        if incident_id not in svc().disruptions.via and incident_id not in svc().disruptions.ticker:
            raise HTTPException(404, "Unknown disruption")
        return {"id": incident_id, "events": svc().disruptions.timeline(incident_id, lang, include_internal)}

    # -------------------------------------------------------------- journeys / advice

    @app.get("/api/v1/journeys", tags=["journeys"])
    def journeys(origin: str, destination: str, depart_after: str | None = None,
                 count: int = Query(3, ge=1, le=5)) -> dict:
        """Timetable only (no disruptions applied)."""
        o, d = station_or_404(origin), station_or_404(destination)
        t = when(depart_after)
        found = svc().planner.journeys(o.id, d.id, t, count=count)
        return {"origin": o.to_dict(), "destination": d.to_dict(), "depart_after": to_iso(t),
                "journeys": [j.to_dict() for j in found]}

    @app.post("/api/v1/advice", tags=["journeys"])
    def advice(req: AdviceRequest) -> dict:
        """Plan the trip, check it against disruptions known at `at`, and give the best next move."""
        o, d = station_or_404(req.origin), station_or_404(req.destination)
        if o.id == d.id:
            raise HTTPException(422, "Origin and destination are the same station")
        t = when(req.at)
        dep = when(req.depart_after) if req.depart_after else None
        return svc().advisor.advise(o, d, t, depart_at=dep, lang=req.lang, count=req.alternatives,
                                    ai_message=req.ai_message)

    # -------------------------------------------------------------- location

    @app.post("/api/v1/places/nearby", tags=["location"])
    def places_nearby(req: PlacesRequest) -> dict:
        """Real places near the station (Google Places) that fit the waiting time, each with one photo."""
        s = svc()
        if not s.places.enabled:
            raise HTTPException(503, "GOOGLE_MAPS_API_KEY is not set, so Google places are off")
        kiosk = station_or_404(req.station)
        try:
            out = s.places.nearby(kiosk, when(req.at), req.interest, req.wait_minutes, req.lang, req.limit)
        except PlacesError as exc:
            raise HTTPException(502, str(exc)) from exc
        except httpx.HTTPError as exc:
            raise HTTPException(502, f"Google Places not reachable: {exc}") from exc
        return {**out, "source": "google", "attribution": "Google Maps"}

    @app.post("/api/v1/location/analyze", tags=["location"])
    def analyze_location(req: LocationRequest) -> dict:
        if req.station_id is None and (req.lat is None or req.lon is None) and not req.text:
            raise HTTPException(422, "Give station_id, lat+lon, or text")
        return svc().location.analyze(
            at=when(req.at), lat=req.lat, lon=req.lon, text=req.text, station_id=req.station_id,
            radius_m=req.radius_m, wait_minutes=req.wait_minutes, interest=req.interest, lang=req.lang,
            suggestions=req.suggestions,
        )

    # -------------------------------------------------------------- voice

    async def read_audio(file: UploadFile) -> bytes:
        data = await file.read()
        if not data:
            raise HTTPException(422, "Empty audio file")
        if len(data) > MAX_AUDIO_BYTES:
            raise HTTPException(413, "Audio file too large (max 25 MB)")
        return data

    @app.post("/api/v1/voice/transcribe", tags=["voice"])
    async def transcribe(file: UploadFile = File(...), lang: Lang | None = Form(None)) -> dict:
        audio = await read_audio(file)
        try:
            text = await run_in_threadpool(svc().ai.transcribe, audio, file.filename or "audio", file.content_type, lang,
                                           STT_PROMPT)
        except AIError as exc:
            raise ai_http_error(exc) from exc
        return {"text": text}

    @app.post("/api/v1/voice/speak", tags=["voice"])
    def speak(req: SpeakRequest) -> Response:
        try:
            result = svc().ai.speak(req.text, voice=req.voice, language=req.lang, fmt=req.format)
        except AIError as exc:
            raise ai_http_error(exc) from exc
        return Response(content=result.audio, media_type=result.content_type)

    async def transcribe_request(file: UploadFile, station: str | None, lang: str) -> tuple[str, dict]:
        """Speech to text for kiosk requests. Returns (transcript or "" if no speech, debug info)."""
        audio = await read_audio(file)
        s = svc()
        hint = STT_PROMPT
        if station:
            kiosk = s.stations.resolve(station)
            if kiosk and kiosk.name not in hint:
                hint = f"{kiosk.name}, {hint}"
        name = file.filename or "audio"
        t0 = time.perf_counter()
        try:
            # No language given to Whisper first: travellers may speak another language than the screen shows.
            # Short clips are sometimes detected as an unrelated language (and translated into it), so anything
            # outside the kiosk languages is transcribed again in the screen language.
            transcript, detected = await run_in_threadpool(s.ai.transcribe_with_language, audio, name,
                                                           file.content_type, None, hint)
            stt = {"model": settings.together_stt_model, "first_transcript": transcript,
                   "detected_language": detected, "retried_in": None, "audio_bytes": len(audio),
                   "content_type": file.content_type}
            if detected is not None and detected.lower() not in KIOSK_LANGUAGES:
                retry = MISDETECTED_AS.get(detected.lower(), lang)
                transcript = await run_in_threadpool(s.ai.transcribe, audio, name, file.content_type, retry, hint)
                stt["retried_in"] = retry
        except AIError as exc:
            raise ai_http_error(exc) from exc
        stt["ms"] = round((time.perf_counter() - t0) * 1000)
        stt["prompt_echo"] = bool(transcript.strip()) and is_prompt_echo(transcript)
        if stt["prompt_echo"]:
            transcript = ""
        return transcript.strip(), stt

    def answer_question(question: str, station: str, at: str | None, lang: str, destination: str | None,
                        extra_facts: list[str], spoken_lang: str | None = None,
                        history: list[dict] | None = None, context_destination: str | None = None,
                        context_origin: str | None = None, context_via: list | None = None,
                        context_stays: list | None = None, stay_minutes: int | None = None) -> dict:
        s = svc()
        kiosk = station_or_404(station)
        dest = station_or_404(destination) if destination else None
        # The trip remembered from the conversation is only a hint: an unknown station is ignored, not an error.
        context = s.stations.resolve(context_destination) if context_destination else None
        start = s.stations.resolve(context_origin) if context_origin and context is not None else None
        # Stops on the way: all of them known, or the route is forgotten (the stays must stay aligned).
        via = [s.stations.resolve(str(v)) for v in (context_via or []) if isinstance(v, (str, int))]
        if context is None or not via or any(v is None for v in via) or len(via) != len(context_via or []):
            via = []
        stays = [x if isinstance(x, int) and not isinstance(x, bool) else None for x in (context_stays or [])]
        return s.assistant.answer(question, kiosk, when(at), lang=lang, destination=dest, extra_facts=extra_facts,
                                  spoken_lang=spoken_lang, history=history, context_destination=context,
                                  context_origin=start, context_via=via, context_stays=stays[:len(via)],
                                  stay_minutes=stay_minutes)

    @app.post("/api/v1/question", tags=["assistant"])
    def question(req: QuestionRequest) -> dict:
        """Answer a traveller's question at the kiosk from facts only (journey, disruptions, station tips).

        `history` (earlier turns) lets follow-up questions such as "the first one" or "when does it arrive?" be
        understood; the answer's `context` (the trip it was about) is meant to be sent back as
        `context_destination` / `context_origin` with the next question.
        """
        return answer_question(req.question, req.station, req.at, req.lang, req.destination, req.extra_facts,
                               history=[t.model_dump() for t in req.history],
                               context_destination=req.context_destination, context_origin=req.context_origin,
                               context_via=req.context_via, context_stays=req.context_stays,
                               stay_minutes=req.stay_minutes)

    @app.post("/api/v1/question/voice", tags=["assistant"])
    async def question_voice(file: UploadFile = File(...), station: str = Form(...), at: str | None = Form(None),
                             lang: Lang = Form("en"), destination: str | None = Form(None),
                             extra_facts: str | None = Form(None, description="JSON list of strings"),
                             history: str | None = Form(None, description='JSON list of {"role", "text"}'),
                             context_destination: str | None = Form(None),
                             context_origin: str | None = Form(None),
                             context_via: str | None = Form(None, description="JSON list of station ids"),
                             context_stays: str | None = Form(None, description="JSON list of minutes or null"),
                             stay_minutes: int | None = Form(None, ge=5, le=720)) -> dict:
        """Spoken question: speech to text, then the same as /question."""
        transcript, stt = await transcribe_request(file, station, lang)
        if not transcript:
            return {"question": "", "answer": None, "answered": False, "trip_destination": None,
                    "debug": {"speech_to_text": stt}, "error": "No speech recognised"}
        try:
            facts = json.loads(extra_facts) if extra_facts else []
            facts = [str(f) for f in facts][:40] if isinstance(facts, list) else []
        except ValueError:
            facts = []
        # The language Whisper heard (or the screen language it re-transcribed in) is the answer language.
        spoken = stt.get("retried_in") or stt.get("detected_language")
        out = await run_in_threadpool(lambda: answer_question(
            transcript, station, at, lang, destination, facts, spoken_lang=spoken,
            history=parse_history(history), context_destination=context_destination,
            context_origin=context_origin, context_via=parse_json_list(context_via),
            context_stays=parse_json_list(context_stays), stay_minutes=stay_minutes))
        out["debug"] = {"speech_to_text": stt, **out.get("debug", {})}
        return out

    @app.post("/api/v1/voice/ask", tags=["voice"])
    async def voice_ask(file: UploadFile = File(...), station: str | None = Form(None, description="Kiosk station (id or name), used when no origin is said"),
                        at: str | None = Form(None), lang: Lang = Form("en"),
                        with_audio: bool = Form(False)) -> dict:
        """Speech in, advice out: transcribe, find the trip, advise, and optionally speak the answer."""
        transcript, stt = await transcribe_request(file, station, lang)
        if not transcript:
            return {"transcript": "", "understood": {"origin": None, "destination": None, "method": "none",
                                                     "note": "No speech recognised"},
                    "advice": None, "error": "No speech recognised", "debug": {"speech_to_text": stt}}
        out = await run_in_threadpool(ask_from_text, transcript, station, at, lang, with_audio)
        out["debug"] = {"speech_to_text": stt, **out.get("debug", {})}
        return out

    @app.post("/api/v1/voice/ask-text", tags=["voice"])
    def text_ask(text: str = Form(..., min_length=1), station: str | None = Form(None), at: str | None = Form(None),
                 lang: Lang = Form("en"), with_audio: bool = Form(False)) -> dict:
        """Same as /voice/ask but with typed text (useful for testing and for the keyboard on the kiosk)."""
        return ask_from_text(text, station, at, lang, with_audio)

    def ask_from_text(text: str, station: str | None, at: str | None, lang: str, with_audio: bool) -> dict:
        s = svc()
        t0 = time.perf_counter()
        intent = understand_trip(s.stations, s.ai, text)
        understand_ms = round((time.perf_counter() - t0) * 1000)
        origin = intent["origin"] or (station_or_404(station) if station else None)
        dest = intent["destination"]
        reply_lang = intent["language"] or lang
        out: dict = {
            "transcript": text,
            "understood": {
                "origin": origin.to_dict() if origin else None,
                "destination": dest.to_dict() if dest else None,
                "method": intent["method"],
                "note": intent["note"],
            },
            "debug": {
                "understanding": {
                    "model": settings.together_chat_model if intent["method"] == "ai" else None,
                    "ai_raw": intent.get("raw"),
                    "language": intent["language"],
                    "ms": understand_ms,
                },
            },
        }
        if origin is None or dest is None or origin.id == dest.id:
            out["advice"] = None
            out["error"] = "Could not understand both a departure and a destination station"
            return out
        out["advice"] = s.advisor.advise(origin, dest, when(at), lang=reply_lang)
        if with_audio:
            try:
                speech = s.ai.speak(out["advice"]["message"], language=reply_lang)
                out["audio"] = {"content_type": speech.content_type,
                                "base64": base64.b64encode(speech.audio).decode("ascii")}
            except AIError as exc:
                out["audio_error"] = str(exc)
        return out

    return app


app = create_app()
