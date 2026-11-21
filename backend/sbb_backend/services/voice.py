"""Understand a spoken or typed trip request ("I need to get to Geneva", "von Bern nach Olten")."""
from __future__ import annotations

from ..ai import AIError, TogetherClient
from ..textutil import normalize
from .stations import Station, StationIndex

TRIP_SCHEMA = {
    "type": "object",
    "properties": {
        "origin": {"type": ["string", "null"], "description": "Departure station, null if not said"},
        "destination": {"type": ["string", "null"], "description": "Destination station, null if not said"},
        "language": {"type": "string", "description": "Language of the request: en, de, fr or it"},
    },
    "required": ["origin", "destination", "language"],
}


def stations_in_order(stations: StationIndex, text: str) -> list[Station]:
    """Stations named in the text, in the order they are spoken."""
    norm = f" {normalize(text)} "
    found = stations.mentioned_in(text)
    return sorted(found, key=lambda s: norm.find(f" {normalize(s.name)} "))


def understand_trip(stations: StationIndex, ai: TogetherClient | None, text: str) -> dict:
    """Return {'origin': Station|None, 'destination': Station|None, 'method': str, 'language': str|None,
    'note': str|None, 'raw': dict|None}. `raw` is the AI's answer before matching names to stations (for debugging)."""
    raw = None
    if ai is not None and ai.enabled:
        try:
            data = ai.chat_json(
                "Extract the trip a railway traveller in Switzerland asks for. Station names may be in German, "
                "French, Italian or English. Use null for anything not said. If the traveller names only one "
                "place, it is the destination. Always give the official Swiss station name, not a translation "
                "(for example Genève for Geneva or Genf, Bern for Berne, Luzern for Lucerne, Chur for Coira, "
                "Basel SBB for Basel).",
                text, TRIP_SCHEMA, name="trip", max_tokens=200,
            )
            raw = {k: data.get(k) for k in ("origin", "destination", "language")} if isinstance(data, dict) else None
            origin = stations.resolve(data["origin"]) if isinstance(data.get("origin"), str) and data["origin"].strip() else None
            dest = stations.resolve(data["destination"]) if isinstance(data.get("destination"), str) and data["destination"].strip() else None
            if dest is not None or origin is not None:
                lang = data.get("language") if data.get("language") in ("en", "de", "fr", "it") else None
                return {"origin": origin, "destination": dest, "method": "ai", "language": lang, "note": None, "raw": raw}
            note = "AI found no station in the request"
        except (AIError, KeyError, AttributeError) as exc:
            note = f"AI trip extraction failed, used text matching: {exc}"
    else:
        note = None
    found = stations_in_order(stations, text)
    if len(found) >= 2:
        return {"origin": found[0], "destination": found[1], "method": "text_match", "language": None, "note": note,
                "raw": raw}
    if len(found) == 1:
        return {"origin": None, "destination": found[0], "method": "text_match", "language": None, "note": note,
                "raw": raw}
    return {"origin": None, "destination": None, "method": "text_match", "language": None, "note": note, "raw": raw}
