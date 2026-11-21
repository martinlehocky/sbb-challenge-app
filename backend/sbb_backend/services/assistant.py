"""Question answering for the station kiosk ("Need help?").

Code collects FACTS (the traveller's journey and its alternatives, active disruptions and their latest
messages near the station, and any extra facts the kiosk sends, such as hand-written station tips). The AI
only phrases an answer from those facts. An answer that contains a time not found in the facts is rejected,
and the traveller is sent to staff instead.
"""
from __future__ import annotations

import re
import time
from datetime import datetime

from ..ai import AIError, TogetherClient
from ..timeutil import ZURICH
from .advisor import Advisor
from .disruptions import DisruptionStore
from .stations import Station, StationIndex
from .voice import understand_trip

LANG_NAMES = {"en": "English", "de": "German", "fr": "French", "it": "Italian"}
_TIME = re.compile(r"\b([01]?\d|2[0-3])[:.h]([0-5]\d)\b")
MAX_EXTRA_FACTS = 30

CANT_ANSWER = {
    "en": "Sorry, we cannot answer that reliably. Please ask staff at the info point.",
    "de": "Leider können wir das nicht sicher beantworten. Bitte fragen Sie am Infoschalter.",
    "fr": "Désolés, nous ne pouvons pas répondre de façon fiable. Merci de vous adresser au point d’information.",
    "it": "Purtroppo non possiamo rispondere in modo affidabile. Chieda al punto informazioni.",
}

ANSWER_SCHEMA = {
    "type": "object",
    "properties": {
        "answer": {"type": "string", "description": "The answer for the traveller"},
        "answered": {"type": "boolean", "description": "false if the facts do not contain the answer"},
    },
    "required": ["answer", "answered"],
}


def _times(text: str) -> set[str]:
    return {f"{int(h):02d}:{m}" for h, m in _TIME.findall(text)}


def _hhmm(iso: str | None) -> str:
    return iso[11:16] if iso else "?"


def _journey_lines(j: dict, label: str) -> list[str]:
    out = [f"{label}: departs {_hhmm(j['departure'])}, arrives {_hhmm(j['arrival'])}, {j['transfers']} change(s)."]
    for leg in j["legs"]:
        name = leg.get("line") or leg.get("category") or "train"
        platform = leg["from"].get("platform")
        where = " (platform %s)" % platform if platform else ""
        towards = " towards %s" % leg["direction"] if leg.get("direction") else ""
        out.append("  - %s from %s%s at %s%s, arrives %s at %s." % (
            name, leg["from"]["name"], where, _hhmm(leg["departure"]), towards,
            leg["to"]["name"], _hhmm(leg["arrival"])))
    return out


def advice_facts(advice: dict) -> list[str]:
    """Readable facts from an /advice answer (journey, status, alternatives, disruptions)."""
    facts = [f"Trip asked about: {advice['origin']['name']} to {advice['destination']['name']}."]
    facts.append(f"Status of the trip: {advice['status']}. Summary: {advice['message']}")
    if advice.get("planned"):
        first = advice["planned"]["legs"][0]
        name = first.get("line") or first.get("category") or "train"
        if advice["status"] in ("affected", "no_alternative"):
            facts.append(f"The traveller's originally planned train ({name} at {_hhmm(first['departure'])}) is "
                         "cancelled because of the disruption; the kiosk shows it as cancelled.")
        else:
            facts.append(f"The traveller's planned train ({name} at {_hhmm(first['departure'])}) runs as planned.")
        facts += _journey_lines(advice["planned"], "Originally planned connection")
    for i, j in enumerate(advice.get("alternatives") or []):
        label = "Best connection now" if i == 0 else f"Other connection {i}"
        delay = j.get("delay_vs_plan_min")
        facts += _journey_lines(j, label + (f" ({delay} min later than planned)" if delay else ""))
    for d in advice.get("affecting_disruptions") or []:
        facts += _disruption_lines(d, "Disruption affecting this trip")
    return facts


def _disruption_lines(d: dict, label: str) -> list[str]:
    places = ", ".join(p["name"] for p in d.get("places") or [])
    end = d.get("expected_end")
    parts = ["%s: %s - reason: %s" % (label, d.get("title") or "", d.get("reason") or "unknown")]
    if places:
        parts.append("places: " + places)
    if d.get("lines"):
        parts.append("lines: " + ", ".join(d["lines"]))
    if end:
        parts.append("expected until " + _hhmm(end))
    out = [" - ".join(parts) + "."]
    if d.get("description"):
        out.append(f"  Details: {d['description'][:400]}")
    for m in (d.get("messages") or [])[:2]:
        text = " ".join(x for x in (m.get("title"), m.get("text")) if x)
        if text:
            out.append(f"  Latest message ({_hhmm(m.get('published_at'))}): {text[:300]}")
    return out


class Assistant:
    def __init__(self, stations: StationIndex, disruptions: DisruptionStore, advisor: Advisor,
                 ai: TogetherClient, radius_m: float = 30000):
        self.stations = stations
        self.disruptions = disruptions
        self.advisor = advisor
        self.ai = ai
        self.radius_m = radius_m

    def answer(self, question: str, kiosk: Station, at: int, lang: str = "en",
               destination: Station | None = None, extra_facts: list[str] | None = None) -> dict:
        """Answer a traveller's question from facts only. `destination` = the traveller's trip, if known."""
        lang = lang if lang in LANG_NAMES else "en"
        debug: dict = {}
        trip_dest = destination
        found_trip = None
        if trip_dest is None:
            # "I need to get to Bern": also find the trip, so the kiosk can offer "Show my next train".
            intent = understand_trip(self.stations, self.ai, question)
            debug["trip_intent"] = {"raw": intent.get("raw"), "method": intent["method"],
                                    "destination": intent["destination"].name if intent["destination"] else None}
            if intent["destination"] is not None and intent["destination"].id != kiosk.id:
                trip_dest = found_trip = intent["destination"]

        now = datetime.fromtimestamp(at, ZURICH)
        facts = [f"Now: {now.strftime('%A %d %B %Y')}, {now.strftime('%H:%M')}. The kiosk is at {kiosk.name} station."]
        if trip_dest is not None and trip_dest.id != kiosk.id:
            advice = self.advisor.advise(kiosk, trip_dest, at, lang=lang, count=3)
            facts += advice_facts(advice)
        nearby = []
        if kiosk.lat is not None:
            nearby = self.disruptions.near(self.disruptions.list_at(at), kiosk.lat, kiosk.lon, self.radius_m)
        for d, _dist in nearby[:3]:
            facts += _disruption_lines(d.to_dict(lang), "Active disruption near the station")
        if not nearby:
            facts.append("No active disruption is known near the station.")
        facts += [f"Station tip: {f[:300]}" for f in (extra_facts or [])[:MAX_EXTRA_FACTS]]
        debug["facts"] = facts

        result = {
            "question": question,
            "answer": CANT_ANSWER[lang],
            "answered": False,
            "trip_destination": found_trip.to_dict() if found_trip else None,
            "debug": debug,
        }
        if not self.ai.enabled:
            debug["error"] = "AI is not configured (TOGETHER_API_KEY missing)"
            return result

        system = (
            f"You are the help desk of a Swiss railway station kiosk at {kiosk.name}. Many travellers are stressed "
            f"or elderly. Answer the traveller's question in {LANG_NAMES[lang]}, in at most 4 short, plain sentences. "
            "Answer exactly what was asked (for example: asked when they arrive, give the arrival time). "
            "Use ONLY the FACTS. Copy times, train names, platforms and station names exactly as in the facts. "
            "Never invent shops, prices, facilities, rules or times, and never mention 'facts' or 'data'. "
            "If the facts do not contain the answer, set answered to false."
        )
        user = "FACTS:\n" + "\n".join(f"- {f}" for f in facts) + f"\n\nQUESTION: {question}"
        t0 = time.perf_counter()
        try:
            data = self.ai.chat_json(system, user, ANSWER_SCHEMA, name="answer", max_tokens=400)
        except AIError as exc:
            debug["error"] = str(exc)
            return result
        finally:
            debug["ms"] = round((time.perf_counter() - t0) * 1000)
            debug["model"] = self.ai.settings.together_chat_model
        debug["ai_raw"] = data
        answer = data.get("answer") if isinstance(data, dict) else None
        if not isinstance(answer, str) or not answer.strip():
            debug["error"] = "AI returned no answer"
            return result
        invented = _times(answer) - _times("\n".join(facts))
        if invented:
            debug["rejected"] = f"answer contains times not in the facts: {sorted(invented)}"
            return result
        if data.get("answered") is False:
            return result  # our own "please ask staff" text, not the model's wording
        result["answer"] = answer.strip()
        result["answered"] = True
        return result
