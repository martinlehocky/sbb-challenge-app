"""Trips with a stop on the way ("first Interlaken, then Bern"): how long to stay, what to do there, wording.

The route itself is planned by the Assistant (one leg per part, each leaving after the stay at the stop).
This module holds what is not timetable data: the stay options the kiosk offers, hand-checked ideas for
the best-known stops (in the four kiosk languages), an AI fallback for other stops (never naming a business),
and the fixed sentences of the answer (so the times in it always come from the planner, never from the AI).
"""
from __future__ import annotations

from ..ai import AIError, TogetherClient
from .stations import Station

# Stays the kiosk offers as buttons (minutes).
STAY_OPTIONS = [60, 120, 180, 300]
MIN_STAY = 5
MAX_STAY = 12 * 60
MAX_STOPS = 3  # stops on the way (besides start and destination)
MAX_IDEAS = 4


def clean_stay(value: object) -> int | None:
    """Minutes of a stay, or None if missing or not plausible (5 min to 12 h)."""
    if isinstance(value, bool):
        return None
    try:
        minutes = int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return minutes if MIN_STAY <= minutes <= MAX_STAY else None


def stay_label(minutes: int, lang: str) -> str:
    """120 -> '2 h', 90 -> '1 h 30', 45 -> '45 min' (the same in all four languages)."""
    h, m = divmod(minutes, 60)
    if not h:
        return f"{m} min"
    return f"{h} h" if not m else f"{h} h {m:02d}"


# ---------------------------------------------------------------- answer sentences

ASK_STAY = {
    "en": "Your route: {route}. How long would you like to stay in {stop}?",
    "de": "Ihre Route: {route}. Wie lange möchten Sie in {stop} bleiben?",
    "fr": "Votre itinéraire : {route}. Combien de temps voulez-vous rester à {stop} ?",
    "it": "Il suo percorso: {route}. Quanto tempo vuole fermarsi a {stop}?",
}
FULL_ROUTE = {
    "en": "Your route: {route}. You leave {start} at {departure} and arrive in {destination} at {arrival}.",
    "de": "Ihre Route: {route}. Sie fahren um {departure} in {start} ab und kommen um {arrival} in {destination} an.",
    "fr": "Votre itinéraire : {route}. Vous partez de {start} à {departure} et arrivez à {destination} à {arrival}.",
    "it": "Il suo percorso: {route}. Parte da {start} alle {departure} e arriva a {destination} alle {arrival}.",
}
NO_TRAIN = {
    "en": "Your route: {route}. There is no train from {frm} to {to} after {time} today.",
    "de": "Ihre Route: {route}. Nach {time} fährt heute kein Zug mehr von {frm} nach {to}.",
    "fr": "Votre itinéraire\u00a0: {route}. Il n’y a plus de train de {frm} à {to} après {time} aujourd’hui.",
    "it": "Il suo percorso: {route}. Oggi dopo le {time} non ci sono più treni da {frm} a {to}.",
}
# Added to NO_TRAIN: after a stop a shorter stay may help; for the first part, only staff can.
SHORTER_STAY = {
    "en": " Please choose a shorter stay, or ask at the info point.",
    "de": " Bitte wählen Sie einen kürzeren Aufenthalt oder fragen Sie am Infoschalter.",
    "fr": " Choisissez un arrêt plus court ou adressez-vous au point d’information.",
    "it": " Scelga una sosta più breve o chieda al punto informazioni.",
}
ASK_STAFF = {
    "en": " Please ask at the info point.",
    "de": " Bitte fragen Sie am Infoschalter.",
    "fr": " Merci de vous adresser au point d’information.",
    "it": " Chieda al punto informazioni.",
}


def route_text(stops: list[Station], stays: list[int | None], lang: str) -> str:
    """'Zürich HB → Interlaken West (2 h) → Bern'."""
    parts = [stops[0].name]
    for i, st in enumerate(stops[1:-1]):
        stay = stays[i] if i < len(stays) else None
        parts.append(f"{st.name} ({stay_label(stay, lang)})" if stay else st.name)
    parts.append(stops[-1].name)
    return " → ".join(parts)


# ---------------------------------------------------------------- ideas for the stop

def _idea(minutes: int, en: str, de: str, fr: str, it: str) -> dict:
    return {"minutes": minutes, "title": {"en": en, "de": de, "fr": fr, "it": it}}


# Well-known things to do, checked by hand. `minutes` = about how long it takes, including the way there and
# back from the station. Keyed by station id (both Interlaken stations share the town's ideas).
_INTERLAKEN = [
    _idea(45, "Stroll along the Höheweg and the Höhematte meadow, with a view of the Jungfrau",
          "Spaziergang über den Höheweg und die Höhematte, mit Blick auf die Jungfrau",
          "Promenade sur le Höheweg et la Höhematte, avec vue sur la Jungfrau",
          "Passeggiata lungo lo Höheweg e la Höhematte, con vista sulla Jungfrau"),
    _idea(120, "Funicular up to Harder Kulm: view over both lakes and the Eiger, Mönch and Jungfrau",
          "Standseilbahn auf den Harder Kulm: Blick auf beide Seen und Eiger, Mönch und Jungfrau",
          "Funiculaire jusqu’au Harder Kulm : vue sur les deux lacs, l’Eiger, le Mönch et la Jungfrau",
          "Funicolare fino all’Harder Kulm: vista sui due laghi e su Eiger, Mönch e Jungfrau"),
    _idea(150, "Boat trip on Lake Thun (from Interlaken West) or Lake Brienz (from Interlaken Ost)",
          "Schifffahrt auf dem Thunersee (ab Interlaken West) oder dem Brienzersee (ab Interlaken Ost)",
          "Croisière sur le lac de Thoune (depuis Interlaken West) ou de Brienz (depuis Interlaken Ost)",
          "Gita in battello sul lago di Thun (da Interlaken West) o di Brienz (da Interlaken Ost)"),
    _idea(360, "Day trip by train to the Jungfraujoch, 3,454 m",
          "Tagesausflug mit dem Zug aufs Jungfraujoch, 3454 m",
          "Excursion d’une journée en train au Jungfraujoch, 3454 m",
          "Gita di un giorno in treno allo Jungfraujoch, 3454 m"),
]
CURATED_IDEAS: dict[int, list[dict]] = {
    8507493: _INTERLAKEN,  # Interlaken West
    8507492: _INTERLAKEN,  # Interlaken Ost
    8505000: [  # Luzern
        _idea(60, "Chapel Bridge and the old town, a few minutes’ walk from the station",
              "Kapellbrücke und Altstadt, wenige Gehminuten vom Bahnhof",
              "Pont de la Chapelle et vieille ville, à quelques minutes à pied de la gare",
              "Ponte della Cappella e città vecchia, a pochi minuti a piedi dalla stazione"),
        _idea(45, "The Lion Monument, carved into the rock",
              "Das Löwendenkmal, in den Fels gehauen",
              "Le Monument du Lion, taillé dans la roche",
              "Il Monumento al Leone, scolpito nella roccia"),
        _idea(90, "Boat trip on Lake Lucerne, from the pier in front of the station",
              "Schifffahrt auf dem Vierwaldstättersee, ab dem Steg vor dem Bahnhof",
              "Croisière sur le lac des Quatre-Cantons, depuis le quai devant la gare",
              "Gita in battello sul lago dei Quattro Cantoni, dal pontile davanti alla stazione"),
    ],
    8507000: [  # Bern
        _idea(60, "The old town’s arcades and the Zytglogge clock tower",
              "Die Lauben der Altstadt und der Zytglogge-Turm",
              "Les arcades de la vieille ville et la tour de l’horloge Zytglogge",
              "I portici della città vecchia e la torre dell’orologio Zytglogge"),
        _idea(40, "The Federal Palace and its terrace above the Aare",
              "Das Bundeshaus und seine Terrasse über der Aare",
              "Le Palais fédéral et sa terrasse au-dessus de l’Aar",
              "Palazzo federale e la sua terrazza sopra l’Aare"),
        _idea(90, "The Bear Park by the Aare, at the end of the old town",
              "Der Bärenpark an der Aare, am Ende der Altstadt",
              "Le parc aux ours au bord de l’Aar, au bout de la vieille ville",
              "Il parco degli orsi sull’Aare, in fondo alla città vecchia"),
    ],
    8503000: [  # Zürich HB
        _idea(90, "Swiss National Museum, right behind the station",
              "Landesmuseum, direkt hinter dem Bahnhof",
              "Musée national suisse, juste derrière la gare",
              "Museo nazionale svizzero, proprio dietro la stazione"),
        _idea(60, "Walk down the Bahnhofstrasse to Lake Zurich",
              "Über die Bahnhofstrasse zum Zürichsee",
              "Descendre la Bahnhofstrasse jusqu’au lac de Zurich",
              "Lungo la Bahnhofstrasse fino al lago di Zurigo"),
        _idea(60, "The old town and the Grossmünster church",
              "Die Altstadt und das Grossmünster",
              "La vieille ville et l’église du Grossmünster",
              "La città vecchia e la chiesa del Grossmünster"),
    ],
    8500010: [  # Basel SBB
        _idea(90, "The old town and the Minster, with its terrace above the Rhine",
              "Die Altstadt und das Münster mit seiner Terrasse über dem Rhein",
              "La vieille ville et la cathédrale, avec sa terrasse au-dessus du Rhin",
              "La città vecchia e la cattedrale, con la terrazza sul Reno"),
        _idea(60, "Cross the Rhine on one of the small ferries",
              "Mit einer der kleinen Fähren über den Rhein",
              "Traverser le Rhin sur l’un des petits bacs",
              "Attraversare il Reno su uno dei piccoli traghetti"),
        _idea(120, "Kunstmuseum Basel, the city’s art museum",
              "Das Kunstmuseum Basel",
              "Le Kunstmuseum, musée des beaux-arts de Bâle",
              "Il Kunstmuseum, museo d’arte di Basilea"),
    ],
    8501008: [  # Genève
        _idea(60, "The lake shore and the Jet d’Eau fountain",
              "Das Seeufer und die Fontäne Jet d’Eau",
              "Les quais et le Jet d’eau",
              "Il lungolago e la fontana Jet d’Eau"),
        _idea(90, "The old town and St. Pierre Cathedral",
              "Die Altstadt und die Kathedrale St-Pierre",
              "La vieille ville et la cathédrale Saint-Pierre",
              "La città vecchia e la cattedrale di Saint-Pierre"),
    ],
    8501120: [  # Lausanne
        _idea(90, "Metro up to the cathedral and the old town",
              "Mit der Metro hinauf zur Kathedrale und in die Altstadt",
              "Le métro jusqu’à la cathédrale et la vieille ville",
              "La metro fino alla cattedrale e alla città vecchia"),
        _idea(60, "Metro down to Ouchy and the lake shore",
              "Mit der Metro hinunter nach Ouchy an den See",
              "Le métro jusqu’à Ouchy et les quais du lac",
              "La metro fino a Ouchy e al lungolago"),
        _idea(120, "The Olympic Museum at Ouchy",
              "Das Olympische Museum in Ouchy",
              "Le Musée olympique à Ouchy",
              "Il Museo olimpico a Ouchy"),
    ],
    8501300: [  # Montreux
        _idea(60, "The lakeside promenade and the Freddie Mercury statue",
              "Die Seepromenade und die Freddie-Mercury-Statue",
              "Les quais fleuris et la statue de Freddie Mercury",
              "Il lungolago e la statua di Freddie Mercury"),
        _idea(150, "Chillon Castle on the lake, by bus or along the shore",
              "Schloss Chillon am See, mit dem Bus oder dem Ufer entlang",
              "Le château de Chillon au bord du lac, en bus ou à pied le long des quais",
              "Il castello di Chillon sul lago, in autobus o a piedi lungo la riva"),
    ],
    8505300: [  # Lugano
        _idea(60, "Funicular down to the old town and Piazza della Riforma",
              "Mit der Standseilbahn hinunter in die Altstadt und zur Piazza della Riforma",
              "Le funiculaire jusqu’à la vieille ville et la Piazza della Riforma",
              "Funicolare fino al centro e a Piazza della Riforma"),
        _idea(60, "The lakeside promenade and Parco Ciani",
              "Die Seepromenade und der Parco Ciani",
              "Les quais et le parc Ciani",
              "Il lungolago e il Parco Ciani"),
    ],
    8501689: [  # Zermatt
        _idea(60, "Walk through the village with a view of the Matterhorn",
              "Spaziergang durchs Dorf mit Blick aufs Matterhorn",
              "Promenade dans le village avec vue sur le Cervin",
              "Passeggiata nel villaggio con vista sul Cervino"),
        _idea(180, "Gornergrat railway, from the station opposite",
              "Gornergratbahn, ab dem Bahnhof gegenüber",
              "Le train du Gornergrat, depuis la gare d’en face",
              "Il treno del Gornergrat, dalla stazione di fronte"),
    ],
    8507380: [  # Grindelwald
        _idea(60, "Walk through the village below the Eiger north face",
              "Spaziergang durchs Dorf unter der Eiger-Nordwand",
              "Promenade dans le village au pied de la face nord de l’Eiger",
              "Passeggiata nel villaggio sotto la parete nord dell’Eiger"),
        _idea(180, "Gondola up to First",
              "Mit der Gondelbahn auf den First",
              "La télécabine jusqu’à First",
              "La cabinovia fino a First"),
    ],
    8507384: [  # Lauterbrunnen
        _idea(45, "The Staubbach Falls, a short walk from the station",
              "Der Staubbachfall, ein kurzer Spaziergang vom Bahnhof",
              "La chute du Staubbach, à quelques pas de la gare",
              "La cascata dello Staubbach, a pochi passi dalla stazione"),
        _idea(120, "The Trümmelbach Falls inside the mountain, by bus",
              "Die Trümmelbachfälle im Berg, mit dem Bus",
              "Les chutes du Trümmelbach dans la montagne, en bus",
              "Le cascate del Trümmelbach dentro la montagna, in autobus"),
    ],
    8507100: [  # Thun
        _idea(60, "The old town and its two-level main street",
              "Die Altstadt und die Obere Hauptgasse mit ihren Hochtrottoirs",
              "La vieille ville et sa rue principale sur deux niveaux",
              "La città vecchia e la sua via principale su due livelli"),
        _idea(90, "Thun Castle above the old town",
              "Schloss Thun über der Altstadt",
              "Le château de Thoune au-dessus de la vieille ville",
              "Il castello di Thun sopra la città vecchia"),
        _idea(120, "Boat trip on Lake Thun, from the pier next to the station",
              "Schifffahrt auf dem Thunersee, ab dem Steg beim Bahnhof",
              "Croisière sur le lac de Thoune, depuis le quai à côté de la gare",
              "Gita in battello sul lago di Thun, dal pontile accanto alla stazione"),
    ],
    8503424: [  # Schaffhausen
        _idea(90, "The old town and the Munot fortress",
              "Die Altstadt und der Munot",
              "La vieille ville et la forteresse du Munot",
              "La città vecchia e la fortezza del Munot"),
        _idea(120, "The Rhine Falls, a short train ride away",
              "Der Rheinfall, eine kurze Zugfahrt entfernt",
              "Les chutes du Rhin, à quelques minutes en train",
              "Le cascate del Reno, a pochi minuti di treno"),
    ],
    8506302: [  # St. Gallen
        _idea(90, "The Abbey Library and the cathedral",
              "Die Stiftsbibliothek und die Kathedrale",
              "La bibliothèque de l’abbaye et la cathédrale",
              "La biblioteca dell’abbazia e la cattedrale"),
    ],
    8509000: [  # Chur
        _idea(60, "The old town, one of the oldest in Switzerland",
              "Die Altstadt, eine der ältesten der Schweiz",
              "La vieille ville, l’une des plus anciennes de Suisse",
              "La città vecchia, una delle più antiche della Svizzera"),
    ],
}

IDEAS_SCHEMA = {
    "type": "object",
    "properties": {
        "ideas": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "What to do, at most 12 words"},
                    "minutes": {"type": "integer",
                                "description": "About how long it takes, including the way there and back"},
                },
                "required": ["title", "minutes"],
            },
        },
    },
    "required": ["ideas"],
}
LANG_NAMES = {"en": "English", "de": "German", "fr": "French", "it": "Italian"}


class StopIdeas:
    """Things to do during a stop: hand-checked ideas first; for other stops, careful AI ideas (cached)."""

    def __init__(self, ai: TogetherClient | None):
        self.ai = ai
        self._cache: dict[tuple[int, str], list[dict]] = {}

    def for_stop(self, station: Station, stay: int | None, lang: str) -> list[dict]:
        """[{'title', 'minutes', 'source': 'curated'|'ai'}] that fit the stay (all, if the stay is not known)."""
        lang = lang if lang in LANG_NAMES else "en"
        curated = CURATED_IDEAS.get(station.id)
        if curated is not None:
            ideas = [{"title": i["title"][lang], "minutes": i["minutes"], "source": "curated"} for i in curated]
        else:
            ideas = self._from_ai(station, lang)
        if stay is not None:
            ideas = [i for i in ideas if i["minutes"] <= stay]
        return sorted(ideas, key=lambda i: i["minutes"])[:MAX_IDEAS]

    def _from_ai(self, station: Station, lang: str) -> list[dict]:
        key = (station.id, lang)
        if key in self._cache:
            return self._cache[key]
        if self.ai is None or not self.ai.enabled:
            return []
        town = station.municipality or station.name
        system = (
            "You suggest things a visitor can do during a stop of a few hours in a Swiss town they reach by train. "
            f"Answer in {LANG_NAMES[lang]}. Suggest at most 3 ideas. Name a sight only if it is famous AND you are "
            "completely sure it is in this town; otherwise describe the kind of thing (for example 'a walk "
            "through the old town', 'a walk along the lake'), and only if the town has it. NEVER name a shop, café, "
            "restaurant, bar or hotel, and never give prices or opening hours. If you are not sure, return fewer "
            "ideas or none. minutes = about how long it takes, including the way from the station and back."
        )
        try:
            data = self.ai.chat_json(system, f"Town: {town}. Station: {station.name}.", IDEAS_SCHEMA,
                                     name="ideas", max_tokens=400)
        except AIError:
            return []  # not cached: retried next time
        items = data.get("ideas") if isinstance(data, dict) else None
        ideas = []
        for item in items if isinstance(items, list) else []:
            if not isinstance(item, dict) or not isinstance(item.get("title"), str) or not item["title"].strip():
                continue
            minutes = clean_stay(item.get("minutes"))
            if minutes is None:
                continue
            ideas.append({"title": item["title"].strip()[:120], "minutes": minutes, "source": "ai"})
        self._cache[key] = ideas[:3]
        return self._cache[key]
