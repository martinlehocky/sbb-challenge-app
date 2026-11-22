"""The traveller's "best next move": plan the trip, check it against disruptions, propose alternatives.

The written advice is built from fixed templates (DE/FR/IT/EN), so every time, line and platform in it
comes straight from the timetable. Optionally an AI model rewrites it in simpler words; that rewrite
is rejected if it contains a time that is not in the original facts.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import datetime

from ..ai import AIError, TogetherClient
from ..textutil import normalize
from ..timeutil import ZURICH, to_iso
from .disruptions import DisruptionState, DisruptionStore, pick
from .planner import Connection, Journey, Leg, Planner
from .stations import Station, StationIndex

log = logging.getLogger("sbb_backend.advisor")

LANGS = ("en", "de", "fr", "it")
WATCH_RADIUS_M = 2000   # an active disruption this close to the route is mentioned, even if it does not block it

T = {
    "ok": {
        "en": "Your journey is not affected.",
        "de": "Ihre Reise ist nicht betroffen.",
        "fr": "Votre voyage n'est pas touché.",
        "it": "Il suo viaggio non è interessato.",
    },
    "affected": {
        "en": "Your connection is disrupted ({reason}).",
        "de": "Ihre Verbindung ist gestört ({reason}).",
        "fr": "Votre liaison est perturbée ({reason}).",
        "it": "Il suo collegamento è perturbato ({reason}).",
    },
    "take": {
        "en": "Take the {train} at {time}{platform} towards {direction}.",
        "de": "Nehmen Sie den {train} um {time}{platform} Richtung {direction}.",
        "fr": "Prenez le {train} de {time}{platform} en direction de {direction}.",
        "it": "Prenda il {train} delle {time}{platform} in direzione {direction}.",
    },
    "platform": {"en": " from platform {p}", "de": " ab Gleis {p}", "fr": ", voie {p}", "it": " dal binario {p}"},
    "late": {
        "en": " (running {m} min late)",
        "de": " (mit {m} Min. Verspätung)",
        "fr": " (avec {m} min de retard)",
        "it": " (in ritardo di {m} min)",
    },
    "change": {
        "en": "Change at {stations}.",
        "de": "Umsteigen in {stations}.",
        "fr": "Changement à {stations}.",
        "it": "Cambio a {stations}.",
    },
    "arrive": {
        "en": "You arrive in {dest} at {time}{delay}.",
        "de": "Sie kommen um {time} in {dest} an{delay}.",
        "fr": "Vous arrivez à {dest} à {time}{delay}.",
        "it": "Arriva a {dest} alle {time}{delay}.",
    },
    "delay": {
        "en": " ({minutes} min later than planned)",
        "de": " ({minutes} Min. später als geplant)",
        "fr": " ({minutes} min plus tard que prévu)",
        "it": " ({minutes} min più tardi del previsto)",
    },
    "no_alternative": {
        "en": "There is no train connection right now. Please ask staff at the station.",
        "de": "Im Moment gibt es keine Zugverbindung. Bitte wenden Sie sich an das Personal im Bahnhof.",
        "fr": "Il n'y a pas de liaison en train pour le moment. Veuillez vous adresser au personnel de la gare.",
        "it": "Al momento non c'è un collegamento in treno. Si rivolga al personale della stazione.",
    },
    "until": {
        "until": {"en": "Expected until {time}.", "de": "Voraussichtlich bis {time}.",
                  "fr": "Prévu jusqu'à {time}.", "it": "Previsto fino alle {time}."},
        "approx": {"en": "Expected until about {time}.", "de": "Voraussichtlich bis etwa {time}.",
                   "fr": "Prévu jusque vers {time}.", "it": "Previsto fino alle {time} circa."},
        "at_least": {"en": "Expected until at least {time}.", "de": "Voraussichtlich mindestens bis {time}.",
                     "fr": "Prévu au moins jusqu'à {time}.", "it": "Previsto almeno fino alle {time}."},
    },
    "watch": {
        "en": "There is a disruption nearby ({reason}). Your train is not affected so far.",
        "de": "In der Nähe gibt es eine Störung ({reason}). Ihr Zug ist bisher nicht betroffen.",
        "fr": "Il y a une perturbation à proximité ({reason}). Votre train n'est pas touché pour l'instant.",
        "it": "C'è una perturbazione nelle vicinanze ({reason}). Il suo treno finora non è interessato.",
    },
    "no_connection": {
        "en": "No train connection found for this trip in the next {hours} hours.",
        "de": "Für diese Reise wurde in den nächsten {hours} Stunden keine Zugverbindung gefunden.",
        "fr": "Aucune liaison en train trouvée pour ce trajet dans les {hours} prochaines heures.",
        "it": "Nessun collegamento in treno trovato per questo viaggio nelle prossime {hours} ore.",
    },
    "train": {"en": "train", "de": "Zug", "fr": "train", "it": "treno"},
    "disruption": {"en": "disruption", "de": "Störung", "fr": "perturbation", "it": "perturbazione"},
}

_TIME = re.compile(r"\b([01]?\d|2[0-3])[:.h]([0-5]\d)\b")


def hhmm(epoch: int) -> str:
    return datetime.fromtimestamp(epoch, ZURICH).strftime("%H:%M")


@dataclass
class BlockChecker:
    """Caches "does this disruption cover segment (a, b, line)" so each segment is computed once."""
    disruptions: list[DisruptionState]
    planner: Planner
    stations: StationIndex
    radius_m: float

    def __post_init__(self) -> None:
        self._geo: dict[tuple[int, int, str | None, str | None], list[int]] = {}

    def hits(self, c: Connection) -> list[DisruptionState]:
        info = self.planner.trip_info(c[4])
        line = info.line if info else None
        category = info.category if info else None
        key = (c[2], c[3], line, category)
        idx = self._geo.get(key)
        if idx is None:
            a, b = self.stations.get(c[2]), self.stations.get(c[3])
            idx = []
            if a is not None and b is not None:
                idx = [i for i, d in enumerate(self.disruptions)
                       if d.zone.on_segment(a, b, line, self.radius_m, category)]
            self._geo[key] = idx
        out = []
        for i in idx:
            d = self.disruptions[i]
            if d.expected_end is None or c[0] < d.expected_end:
                out.append(d)
        return out

    def __call__(self, c: Connection) -> bool:
        return bool(self.hits(c))


class Advisor:
    def __init__(self, stations: StationIndex, disruptions: DisruptionStore, planner: Planner,
                 ai: TogetherClient | None, radius_m: float):
        self.stations = stations
        self.disruptions = disruptions
        self.planner = planner
        self.ai = ai
        self.radius_m = radius_m

    def advise(self, origin: Station, dest: Station, at: int, depart_at: int | None = None, lang: str = "en",
               count: int = 3, horizon_h: int = 12, ai_message: bool = False, catch_from: int | None = None,
               prefer_departure: str | None = None) -> dict:
        """`catch_from`: the earliest departure the traveller can still reach (the kiosk is a few minutes from the
        platforms). The planned train stays the one from `depart_at`; only the advice leaves after `catch_from`.
        `prefer_departure` ("HH:MM"): the connection the traveller picked on the kiosk (one of the options leaving
        then); it becomes the advice and the others the alternatives. Unknown times are ignored."""
        lang = lang if lang in LANGS else "en"
        depart = depart_at if depart_at is not None else at
        horizon_s = horizon_h * 3600
        active = [d for d in self.disruptions.active_at(at) if d.zone.points]
        checker = BlockChecker(active, self.planner, self.stations, self.radius_m)

        planned = self.planner.journeys(origin.id, dest.id, depart, count=1, horizon_s=horizon_s)
        base = {
            "as_of": to_iso(at),
            "origin": origin.to_dict(),
            "destination": dest.to_dict(),
            "depart_after": to_iso(depart),
        }
        if not planned:
            msg = T["no_connection"][lang].format(hours=horizon_h)
            return {**base, "status": "no_connection", "message": msg, "message_source": "template",
                    "planned": None, "affecting_disruptions": [], "alternatives": [], "next_move": None}

        plan = planned[0]
        affecting: dict[str, DisruptionState] = {}
        affected_legs: list[int] = []
        for i, leg in enumerate(plan.legs):
            hit = {d.id: d for c in leg.connections for d in checker.hits(c)}
            if hit:
                affected_legs.append(i)
                affecting.update(hit)

        nearby = self._nearby(plan, active, exclude=set(affecting))

        if not affecting:
            status = "ok"
            best = plan
            # The next trains too, so "and the one after that?" has an answer.
            more = self.planner.journeys(origin.id, dest.id, depart, count=count, horizon_s=horizon_s)
            alternatives = [plan] + [j for j in more if j.departure != plan.departure][:max(count - 1, 0)]
        else:
            alternatives = self.planner.journeys(origin.id, dest.id, depart, count=count, horizon_s=horizon_s,
                                                 blocked=checker)
            status = "affected" if alternatives else "no_alternative"
            best = alternatives[0] if alternatives else None
        if catch_from is not None and best is not None and best.departure < catch_from:
            # Leaves before the traveller can reach the platform: the next ones they can still catch.
            later = self.planner.journeys(origin.id, dest.id, catch_from, count=count, horizon_s=horizon_s,
                                          blocked=checker if affecting else None)
            if not affecting and later:
                plan = later[0]  # nothing is wrong with the trip: the next train is simply the plan
            alternatives = later
            best = later[0] if later else None
            if best is None:
                status = "no_alternative"
        chosen = False
        if prefer_departure and best is not None:
            match = next((j for j in alternatives if hhmm(j.departure) == prefer_departure), None)
            if match is None:  # a later option than the first few
                more = self.planner.journeys(origin.id, dest.id, catch_from or depart, count=8, horizon_s=horizon_s,
                                             blocked=checker if affecting else None)
                match = next((j for j in more if hhmm(j.departure) == prefer_departure), None)
                if match is not None:
                    alternatives = [*alternatives, match]
            if match is not None:
                alternatives = [match, *[j for j in alternatives if j is not match]][:max(count, 2)]
                best = match
                chosen = True

        message = self._message(lang, status, plan, best, dest, list(affecting.values()), nearby)
        result = {
            **base,
            "status": status,
            "message": message,
            "message_source": "template",
            "planned": {**plan.to_dict(), "affected_legs": affected_legs},
            "affecting_disruptions": [d.to_dict(lang) for d in affecting.values()],
            "nearby_disruptions": [d.to_dict(lang, with_messages=False) for d in nearby],
            "alternatives": [
                {**j.to_dict(), "delay_vs_plan_min": round((j.arrival - plan.arrival) / 60)} for j in alternatives
            ],
            "next_move": self._next_move(best, lang, at) if best else None,
            # True when `best` is the connection the traveller picked (prefer_departure), not the kiosk's pick.
            "chosen": chosen,
        }
        if ai_message:
            rewritten, error = self._ai_rewrite(message, lang, result)
            result["ai_message"] = rewritten
            if error:
                result["ai_error"] = error
        return result

    # ------------------------------------------------------------------ helpers

    def _nearby(self, plan: Journey, active: list[DisruptionState], exclude: set[str]) -> list[DisruptionState]:
        path = [s for leg in plan.legs for s, _, _ in leg.stops if s is not None and s.lat is not None]
        out = []
        for d in active:
            if d.id in exclude:
                continue
            for p in d.zone.points:
                if any(_close(p, s, WATCH_RADIUS_M) for s in path):
                    out.append(d)
                    break
        return out

    def _next_move(self, journey: Journey, lang: str, at: int) -> dict:
        leg = journey.legs[0]
        return {
            "action": "board",
            "train": _train_label(leg, lang),
            "line": leg.line,
            "departure": to_iso(leg.departure),
            "platform": leg.from_platform,
            "station": leg.from_station.name,
            "direction": leg.headsign,
            "alight_at": leg.to_station.name,
            "minutes_until_departure": max(0, (leg.departure - at) // 60),
        }

    def _message(self, lang: str, status: str, plan: Journey, best: Journey | None, dest: Station,
                 affecting: list[DisruptionState], nearby: list[DisruptionState]) -> str:
        parts: list[str] = []
        if status == "ok":
            parts.append(T["ok"][lang])
            if nearby:
                parts.append(T["watch"][lang].format(reason=_reason(nearby[0], lang)))
        else:
            parts.append(T["affected"][lang].format(reason=_reason(affecting[0], lang)))
            d = affecting[0]
            if d.expected_end is not None and d.expected_end_kind in T["until"]:
                parts.append(T["until"][d.expected_end_kind][lang].format(time=hhmm(d.expected_end)))
            # No "replacement buses are running" sentence: VIA only records that buses were announced at some
            # point, and they may have stopped since (10 Sept 2026: "from 11am there will be no rail replacement
            # buses"). The latest official messages are returned in `affecting_disruptions[].messages` instead.
        if best is None:
            parts.append(T["no_alternative"][lang])
            return " ".join(parts)
        first = best.legs[0]
        platform = T["platform"][lang].format(p=first.from_platform) if first.from_platform else ""
        late = T["late"][lang].format(m=first.delay_min) if first.delay_min else ""
        parts.append(T["take"][lang].format(
            train=_train_label(first, lang), time=hhmm(first.departure) + late, platform=platform,
            direction=first.headsign or first.to_station.name,
        ))
        if best.transfers:
            names = ", ".join(leg.from_station.name for leg in best.legs[1:])
            parts.append(T["change"][lang].format(stations=names))
        delay_min = round((best.arrival - plan.arrival) / 60)
        delay = T["delay"][lang].format(minutes=delay_min) if delay_min > 0 else ""
        parts.append(T["arrive"][lang].format(dest=dest.name, time=hhmm(best.arrival), delay=delay))
        return " ".join(parts)

    def _ai_rewrite(self, message: str, lang: str, facts: dict) -> tuple[str | None, str | None]:
        if self.ai is None or not self.ai.enabled:
            return None, "AI is not configured (TOGETHER_API_KEY missing)"
        language = {"en": "English", "de": "German", "fr": "French", "it": "Italian"}[lang]
        system = (
            "You help railway travellers during a disruption, many of them elderly. Rewrite the advice in "
            f"{language} in plain, calm, short sentences. Keep ALL the information: every time, train name, "
            "platform, every station where to change trains, and the delay. Copy times and names exactly. "
            "Do not add any fact that is not in the advice."
        )
        user = f"Advice to rewrite:\n{message}"
        schema = {"type": "object", "properties": {"message": {"type": "string"}}, "required": ["message"]}
        try:
            data = self.ai.chat_json(system, user, schema, name="advice", max_tokens=400)
        except AIError as exc:
            return None, str(exc)
        text = data.get("message") if isinstance(data, dict) else None
        if not isinstance(text, str) or not text.strip():
            return None, "AI returned an empty message"
        problem = check_rewrite(message, text, facts)
        if problem:
            return None, f"AI message rejected: {problem}"
        return text.strip(), None


def _times(text: str) -> set[str]:
    return {f"{int(h):02d}:{m}" for h, m in _TIME.findall(text)}


def check_rewrite(original: str, rewritten: str, facts: dict) -> str | None:
    """None if the rewrite keeps every time and station of the original and invents no time; else the reason."""
    orig_times, new_times = _times(original), _times(rewritten)
    if new_times - orig_times:
        return f"it contains times not in the facts ({sorted(new_times - orig_times)})"
    if orig_times - new_times:
        return f"it leaves out times ({sorted(orig_times - new_times)})"
    best = (facts.get("alternatives") or [None])[0]
    if best:
        names = {leg["from"]["name"] for leg in best["legs"]} | {best["legs"][-1]["to"]["name"]}
        names |= {leg["direction"] for leg in best["legs"][:1] if leg.get("direction")}
        hay = normalize(rewritten)
        missing = sorted(n for n in names if n and normalize(n) in normalize(original) and normalize(n) not in hay)
        if missing:
            return f"it leaves out stations ({missing})"
    return None


def _close(a: Station, b: Station, radius_m: float) -> bool:
    from ..geo import haversine_m
    return haversine_m(a.lat, a.lon, b.lat, b.lon) <= radius_m  # type: ignore[arg-type]


def _reason(d: DisruptionState, lang: str) -> str:
    return pick(d.reason, lang) or pick(d.title, lang) or T["disruption"][lang]


def _train_label(leg: Leg, lang: str) -> str:
    name = leg.line or leg.category
    if not name:
        return T["train"][lang]
    # "le train IC1" / "il treno IC1" read naturally; "the IC1" / "den IC1" already do.
    return f"{T['train'][lang]} {name}" if lang in ("fr", "it") else name
