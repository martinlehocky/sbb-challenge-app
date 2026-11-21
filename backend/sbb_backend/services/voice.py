"""Understand a spoken or typed trip request ("I need to get to Geneva", "von Bern nach Olten")."""
from __future__ import annotations

from ..ai import AIError, TogetherClient
from ..textutil import normalize
from .stations import Station, StationIndex

TRIP_SCHEMA = {
    "type": "object",
    "properties": {
        "origin": {"type": ["string", "null"], "description": "Departure station, null if not said"},
        "destinations": {
            "type": "array", "items": {"type": "string"},
            "description": "Every place the traveller wants to go to, in the order said (for 'Bern or Basel' both); "
                           "not places the train passes through; empty if none",
        },
        "language": {"type": "string", "description": "Language of the request: en, de, fr or it"},
    },
    "required": ["origin", "destinations", "language"],
}


def stations_in_order(stations: StationIndex, text: str) -> list[Station]:
    """Stations named in the text, in the order they are spoken."""
    norm = f" {normalize(text)} "
    found = stations.mentioned_in(text)
    return sorted(found, key=lambda s: norm.find(f" {normalize(s.name)} "))


def _said_destinations(data: dict) -> list[str]:
    """Destination names from the AI's answer (also accepts the older single `destination` field)."""
    raw = data.get("destinations")
    names = [raw] if isinstance(raw, str) else raw if isinstance(raw, list) else []
    if not names and isinstance(data.get("destination"), str):
        names = [data["destination"]]
    out: list[str] = []
    for n in names:
        if isinstance(n, str) and n.strip() and n.strip() not in out:
            out.append(n.strip())
    return out[:4]


def _match(stations: StationIndex, said: str) -> dict:
    m = stations.match(said)
    return {"said": said, **m}


def understand_trip(stations: StationIndex, ai: TogetherClient | None, text: str) -> dict:
    """Return {'origin': Station|None, 'destination': Station|None, 'method': str, 'language': str|None,
    'note': str|None, 'raw': dict|None, 'origin_match': dict|None, 'destinations': [dict]}.

    `destination` is the first destination matched with confidence. `destinations` lists every place named
    with its match ({'said', 'station', 'choices', 'how'}, see StationIndex.match), so callers can ask
    "which one?" when several places are named or a name fits several stations.
    `raw` is the AI's answer before matching names to stations (for debugging)."""
    raw = None
    if ai is not None and ai.enabled:
        try:
            data = ai.chat_json(
                "Extract the trip a railway traveller in Switzerland asks for. Station names may be in German, "
                "French, Italian or English. Use null or an empty list for anything not said. If the traveller "
                "names only one place, it is a destination. List every destination they name (for 'Bern or "
                "Basel', both). Always give the official Swiss station name, not a translation (for example "
                "Genève for Geneva or Genf, Bern for Berne, Luzern for Lucerne, Chur for Coira, Basel SBB for "
                "Basel, St-Maurice for Saint-Maurice). For a place abroad, give its name as the traveller said it.",
                text, TRIP_SCHEMA, name="trip", max_tokens=200,
            )
            if not isinstance(data, dict):
                raise AttributeError("AI answer is not an object")
            said = _said_destinations(data)
            said_origin = data.get("origin").strip() if isinstance(data.get("origin"), str) else ""
            raw = {"origin": said_origin or None, "destinations": said, "language": data.get("language")}
            dests = [_match(stations, n) for n in said]
            origin_match = _match(stations, said_origin) if said_origin else None
            if dests or origin_match:
                lang = data.get("language") if data.get("language") in ("en", "de", "fr", "it") else None
                first = next((d["station"] for d in dests if d["station"] is not None), None)
                origin = origin_match["station"] if origin_match else None
                return {"origin": origin, "destination": first, "method": "ai", "language": lang, "note": None,
                        "raw": raw, "origin_match": origin_match, "destinations": dests}
            note = "AI found no station in the request"
        except (AIError, KeyError, AttributeError) as exc:
            note = f"AI trip extraction failed, used text matching: {exc}"
    else:
        note = None
    found = stations_in_order(stations, text)
    exact = lambda st: {"said": st.name, "station": st, "choices": [st], "how": "exact"}  # noqa: E731
    if len(found) >= 2:
        return {"origin": found[0], "destination": found[1], "method": "text_match", "language": None, "note": note,
                "raw": raw, "origin_match": exact(found[0]), "destinations": [exact(found[1])]}
    if len(found) == 1:
        return {"origin": None, "destination": found[0], "method": "text_match", "language": None, "note": note,
                "raw": raw, "origin_match": None, "destinations": [exact(found[0])]}
    return {"origin": None, "destination": None, "method": "text_match", "language": None, "note": note, "raw": raw,
            "origin_match": None, "destinations": []}
