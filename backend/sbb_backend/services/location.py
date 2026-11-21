"""Location analysis: where is the traveller, what is disrupted around them, what can they do while waiting.

The deterministic part (nearest stations, nearby disruptions) always works.
The AI part (understanding a free-text place, suggesting things to do) needs Together AI and is
clearly labelled as AI-generated in the response.
"""
from __future__ import annotations

from datetime import datetime

from ..ai import AIError, TogetherClient
from ..timeutil import ZURICH, to_iso
from .disruptions import DisruptionStore
from .stations import Station, StationIndex

INTERESTS = ("eat", "explore", "rest", "any")
LANG_NAMES = {"en": "English", "de": "German", "fr": "French", "it": "Italian"}

PLACE_SCHEMA = {
    "type": "object",
    "properties": {
        "station_name": {"type": ["string", "null"], "description": "Swiss railway station the text refers to"},
        "place_name": {"type": ["string", "null"], "description": "Town or landmark mentioned"},
    },
    "required": ["station_name", "place_name"],
}

SUGGESTION_SCHEMA = {
    "type": "object",
    "properties": {
        "suggestions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "category": {"type": "string", "enum": ["eat", "explore", "rest"]},
                    "walk_minutes": {"type": "integer"},
                    "duration_minutes": {"type": "integer"},
                    "description": {"type": "string"},
                },
                "required": ["title", "category", "walk_minutes", "duration_minutes", "description"],
            },
        }
    },
    "required": ["suggestions"],
}


class LocationService:
    def __init__(self, stations: StationIndex, disruptions: DisruptionStore, ai: TogetherClient | None):
        self.stations = stations
        self.disruptions = disruptions
        self.ai = ai

    def analyze(self, *, at: int, lat: float | None = None, lon: float | None = None, text: str | None = None,
                station_id: int | None = None, radius_m: float = 15000, wait_minutes: int | None = None,
                interest: str = "any", lang: str = "en", suggestions: bool = False) -> dict:
        lang = lang if lang in LANG_NAMES else "en"
        interest = interest if interest in INTERESTS else "any"
        resolved_from = None
        ai_notes: list[str] = []
        station: Station | None = None
        nearest: list[tuple[Station, float]] = []

        if station_id is not None:
            station = self.stations.get(station_id)
            resolved_from = "station_id"
        elif lat is not None and lon is not None:
            nearest = self.stations.nearest(lat, lon, limit=3)
            station = nearest[0][0] if nearest else None
            resolved_from = "coordinates"
        elif text:
            station, how, note = self._from_text(text)
            resolved_from = how
            if note:
                ai_notes.append(note)
        if station is None:
            return {"as_of": to_iso(at), "resolved_from": resolved_from, "station": None,
                    "error": "Could not determine a station from the input", "ai_notes": ai_notes}

        if not nearest and station.lat is not None:
            nearest = self.stations.nearest(station.lat, station.lon, limit=3)  # type: ignore[arg-type]
        center = (lat, lon) if lat is not None and lon is not None else (station.lat, station.lon)
        active = self.disruptions.active_at(at)
        nearby = self.disruptions.near(active, center[0], center[1], radius_m) if center[0] is not None else []

        out = {
            "as_of": to_iso(at),
            "resolved_from": resolved_from,
            "station": station.to_dict(),
            "nearest_stations": [{**s.to_dict(), "distance_m": round(d)} for s, d in nearest],
            "disruptions_nearby": [
                {**d.to_dict(lang, with_messages=False), "distance_m": round(dist)} for d, dist in nearby
            ],
            "ai_notes": ai_notes,
        }
        if suggestions:
            out["suggestions"], err = self._suggest(station, at, wait_minutes, interest, lang)
            if err:
                out["suggestions_error"] = err
        return out

    # ------------------------------------------------------------------ helpers

    def _from_text(self, text: str) -> tuple[Station | None, str, str | None]:
        mentioned = self.stations.mentioned_in(text)
        if mentioned:
            return mentioned[0], "text_match", None
        if self.ai is not None and self.ai.enabled:
            try:
                data = self.ai.chat_json(
                    "Extract the Swiss railway station or place the traveller refers to. Use null when unknown.",
                    text, PLACE_SCHEMA, name="place", max_tokens=200,
                )
            except AIError as exc:
                return None, "ai", f"AI place lookup failed: {exc}"
            for key in ("station_name", "place_name"):
                value = data.get(key) if isinstance(data, dict) else None
                if isinstance(value, str) and value.strip():
                    hit = self.stations.resolve(value)
                    if hit:
                        return hit, "ai", None
            return None, "ai", "AI could not identify a known station"
        hits = self.stations.search(text, limit=1)
        return (hits[0] if hits else None), "search", None

    def _suggest(self, station: Station, at: int, wait_minutes: int | None, interest: str,
                 lang: str) -> tuple[list[dict], str | None]:
        if self.ai is None or not self.ai.enabled:
            return [], "AI is not configured (TOGETHER_API_KEY missing)"
        now = datetime.fromtimestamp(at, ZURICH).strftime("%A %H:%M")
        budget = f"{wait_minutes} minutes in total, including walking there and back" if wait_minutes else "about 30 minutes"
        wanted = "any of eat, explore or rest" if interest == "any" else interest
        system = (
            "You suggest things to do near a Swiss railway station for a traveller waiting for a train, often an "
            f"elderly person. Answer in {LANG_NAMES[lang]}. Suggest at most 4 options. NEVER name a shop, café, "
            "bakery, restaurant or hotel: describe the kind of place instead (for example 'a café inside the station'). "
            "You may name only famous public landmarks (a museum, a park, a lake shore, an old town) that you are "
            "certain are near that station. walk_minutes is one way. Each suggestion must fit the time budget "
            "including the walk back."
        )
        user = f"Station: {station.name} ({station.municipality or ''}). Local time: {now}. Time budget: {budget}. Interest: {wanted}."
        try:
            data = self.ai.chat_json(system, user, SUGGESTION_SCHEMA, name="suggestions", max_tokens=700)
        except AIError as exc:
            return [], str(exc)
        items = data.get("suggestions") if isinstance(data, dict) else None
        if not isinstance(items, list):
            return [], "AI returned no suggestions"
        clean = []
        for item in items[:4]:
            if not isinstance(item, dict) or not isinstance(item.get("title"), str):
                continue
            walk = _as_int(item.get("walk_minutes"))
            dur = _as_int(item.get("duration_minutes"))
            if wait_minutes and walk is not None and dur is not None and 2 * walk + dur > wait_minutes:
                continue  # does not fit the time budget
            clean.append({
                "title": item["title"].strip(),
                "category": item.get("category") if item.get("category") in ("eat", "explore", "rest") else None,
                "walk_minutes": walk,
                "duration_minutes": dur,
                "description": str(item.get("description") or "").strip(),
                "ai_generated": True,
            })
        return clean, None


def _as_int(value: object) -> int | None:
    try:
        return int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
