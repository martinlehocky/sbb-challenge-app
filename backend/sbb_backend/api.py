"""HTTP API (FastAPI). Run: uvicorn sbb_backend.api:app --reload  (from the backend/ folder)."""
from __future__ import annotations

import base64
import logging
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
from .services.disruptions import DisruptionStore
from .services.location import LocationService
from .services.planner import Planner
from .services.stations import Station, StationIndex
from .services.voice import understand_trip
from .timeutil import parse_query_time, to_iso

log = logging.getLogger("sbb_backend.api")
Lang = Literal["en", "de", "fr", "it"]
MAX_AUDIO_BYTES = 25 * 1024 * 1024


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


def build_services(settings: Settings, ai_transport: httpx.BaseTransport | None = None) -> Services:
    conn = connect(settings.db_path, readonly=True)
    meta = {r["key"]: r["value"] for r in conn.execute("SELECT key, value FROM meta")}
    stations = StationIndex(conn)
    disruptions = DisruptionStore(conn, stations)
    planner = Planner(conn, stations, default_transfer_s=settings.default_transfer_seconds)
    ai = TogetherClient(settings, transport=ai_transport)
    advisor = Advisor(stations, disruptions, planner, ai, settings.disruption_radius_m)
    location = LocationService(stations, disruptions, ai)
    return Services(settings, meta, stations, disruptions, planner, advisor, location, ai)


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


class SpeakRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=4000)
    lang: Lang = "en"
    voice: str | None = None
    format: Literal["mp3", "wav"] = "mp3"


# ---------------------------------------------------------------------------- app

def create_app(settings: Settings | None = None, ai_transport: httpx.BaseTransport | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.services = build_services(settings, ai_transport)
        yield
        app.state.services.ai.close()

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
            text = await run_in_threadpool(svc().ai.transcribe, audio, file.filename or "audio", file.content_type, lang)
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

    @app.post("/api/v1/voice/ask", tags=["voice"])
    async def voice_ask(file: UploadFile = File(...), station: str | None = Form(None, description="Kiosk station (id or name), used when no origin is said"),
                        at: str | None = Form(None), lang: Lang = Form("en"),
                        with_audio: bool = Form(False)) -> dict:
        """Speech in, advice out: transcribe, find the trip, advise, and optionally speak the answer."""
        audio = await read_audio(file)
        s = svc()
        try:
            transcript = await run_in_threadpool(s.ai.transcribe, audio, file.filename or "audio", file.content_type, lang)
        except AIError as exc:
            raise ai_http_error(exc) from exc
        return await run_in_threadpool(ask_from_text, transcript, station, at, lang, with_audio)

    @app.post("/api/v1/voice/ask-text", tags=["voice"])
    def text_ask(text: str = Form(..., min_length=1), station: str | None = Form(None), at: str | None = Form(None),
                 lang: Lang = Form("en"), with_audio: bool = Form(False)) -> dict:
        """Same as /voice/ask but with typed text (useful for testing and for the keyboard on the kiosk)."""
        return ask_from_text(text, station, at, lang, with_audio)

    def ask_from_text(text: str, station: str | None, at: str | None, lang: str, with_audio: bool) -> dict:
        s = svc()
        intent = understand_trip(s.stations, s.ai, text)
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
