"""Real places near the station (Google Places API, New) for the "what to do while you wait" screens.

Google finds cafés, museums, parks… around the station. Code then keeps only what fits the waiting time
(walk there + stay + walk back) and is open at that moment, and adds one photo per place with its author.
Google's terms: show "Google Maps" and each photo's author with the data; do not store photos (we keep
search results in memory for a few minutes only, so paging through the screens does not bill every time).
"""
from __future__ import annotations

import math
import time
from datetime import datetime, timedelta

import httpx

from ..config import Settings
from ..geo import haversine_m
from ..timeutil import ZURICH
from .stations import Station

# What Google should look for, per screen. Types from Google's place type table A.
INTEREST_TYPES = {
    "eat": ["cafe", "coffee_shop", "bakery", "restaurant", "ice_cream_shop"],
    "explore": ["museum", "art_gallery", "park", "tourist_attraction", "church"],
    "rest": ["park", "library", "cafe"],
}
# Minutes a traveller typically stays (the place's main type; default per interest).
STAY_MIN = {
    "restaurant": 35, "cafe": 15, "coffee_shop": 15, "bakery": 10, "ice_cream_shop": 10,
    "steak_house": 35, "diner": 30, "pub": 30, "food_court": 15, "deli": 10,
    "museum": 40, "art_gallery": 30, "park": 15, "tourist_attraction": 15, "church": 10, "library": 20,
}
DEFAULT_STAY = {"eat": 15, "explore": 20, "rest": 15}
# Never suggested, even when Google also tags them as a restaurant or sight.
EXCLUDED_PRIMARY = ["hotel", "lodging", "hostel", "gas_station", "supermarket", "grocery_store", "night_club", "bar",
                    "casino", "shopping_mall", "train_station", "transit_station", "bus_station", "parking"]
MIN_REVIEWS = 30  # below this, a rating says little
WALK_M_PER_MIN = 70      # unhurried pace (many kiosk users are older)
DETOUR = 1.3             # streets are longer than the straight line
MAX_RADIUS_M = 1500
PHOTO_WIDTH_PX = 480
CACHE_TTL_S = 10 * 60
FIELDS = ",".join("places." + f for f in (
    "id", "displayName", "primaryType", "primaryTypeDisplayName", "location", "shortFormattedAddress",
    "rating", "userRatingCount", "regularOpeningHours", "photos", "googleMapsUri", "businessStatus",
))


class PlacesError(Exception):
    pass


def walk_minutes(meters: float) -> int:
    return max(1, math.ceil(meters * DETOUR / WALK_M_PER_MIN))


def stay_minutes(primary_type: str | None, interest: str) -> int:
    """Typical stay: a sit-down meal for any "…_restaurant" (except fast food), else per type or interest."""
    t = primary_type or ""
    if t in STAY_MIN:
        return STAY_MIN[t]
    if t.endswith("_restaurant") and t != "fast_food_restaurant":
        return STAY_MIN["restaurant"]
    if t in ("fast_food_restaurant", "sandwich_shop", "dessert_shop", "juice_shop", "tea_house"):
        return 10
    return DEFAULT_STAY[interest]


def _score(rating: float | None, count: int | None, walk: int) -> float:
    """Well rated first, a little preference for close places; few reviews count as an average 3.8."""
    r = rating if rating is not None and (count or 0) >= MIN_REVIEWS else 3.8
    return r - 0.05 * walk


def open_at(hours: dict | None, when: datetime) -> bool | None:
    """Is the place open at `when` (local time)? None if Google has no opening hours."""
    periods = (hours or {}).get("periods")
    if not periods:
        return None
    week = 7 * 24 * 60
    # Google: day 0 = Sunday. Python: Monday = 0.
    t = ((when.weekday() + 1) % 7) * 24 * 60 + when.hour * 60 + when.minute
    for p in periods:
        o = p.get("open") or {}
        c = p.get("close")
        if c is None:
            return True  # open around the clock
        start = o.get("day", 0) * 1440 + o.get("hour", 0) * 60 + o.get("minute", 0)
        end = c.get("day", 0) * 1440 + c.get("hour", 0) * 60 + c.get("minute", 0)
        if end <= start:
            end += week  # closes after Saturday midnight
        if start <= t < end or start <= t + week < end:
            return True
    return False


class PlacesService:
    def __init__(self, settings: Settings, transport: httpx.BaseTransport | None = None):
        self.settings = settings
        self._client = httpx.Client(base_url=settings.google_places_base_url.rstrip("/"), timeout=10,
                                    transport=transport)
        self._cache: dict[tuple, tuple[float, list[dict]]] = {}

    @property
    def enabled(self) -> bool:
        return self.settings.places_enabled

    def close(self) -> None:
        self._client.close()

    def _headers(self, fields: str | None = None) -> dict[str, str]:
        h = {"X-Goog-Api-Key": self.settings.google_maps_api_key or ""}
        if fields:
            h["X-Goog-FieldMask"] = fields
        return h

    def _search(self, station: Station, interest: str, lang: str, radius_m: float) -> list[dict]:
        key = (station.id, interest, lang, round(radius_m, -1))
        hit = self._cache.get(key)
        if hit and time.monotonic() - hit[0] < CACHE_TTL_S:
            return hit[1]
        body = {
            "includedTypes": INTEREST_TYPES[interest],
            "excludedPrimaryTypes": EXCLUDED_PRIMARY,
            "maxResultCount": 20,
            "rankPreference": "POPULARITY",
            "languageCode": lang,
            "locationRestriction": {"circle": {"center": {"latitude": station.lat, "longitude": station.lon},
                                               "radius": radius_m}},
        }
        r = self._client.post("/places:searchNearby", json=body, headers=self._headers(FIELDS))
        if r.status_code >= 400:
            raise PlacesError(f"Google Places {r.status_code}: {r.text[:300]}")
        places = r.json().get("places") or []
        self._cache[key] = (time.monotonic(), places)
        return places

    def _photo(self, photo: dict) -> dict | None:
        """One photo's image URL (Google serves it from its own servers) and its author."""
        key = ("photo", photo.get("name"))
        hit = self._cache.get(key)
        if hit and time.monotonic() - hit[0] < CACHE_TTL_S:
            return hit[1][0] if hit[1] else None
        r = self._client.get(f"/{photo['name']}/media", params={"maxWidthPx": PHOTO_WIDTH_PX, "skipHttpRedirect": "true"},
                             headers=self._headers())
        if r.status_code >= 400:
            return None
        uri = r.json().get("photoUri")
        authors = photo.get("authorAttributions") or []
        out = {"url": uri, "author": authors[0].get("displayName") if authors else None,
               "author_uri": authors[0].get("uri") if authors else None} if uri else None
        self._cache[key] = (time.monotonic(), [out] if out else [])
        return out

    def nearby(self, station: Station, at: int, interest: str, budget_min: int, lang: str = "en",
               limit: int = 3) -> dict:
        """Places that fit `budget_min` (walk there, stay, walk back), open at that moment, with a photo."""
        if not self.enabled:
            raise PlacesError("GOOGLE_MAPS_API_KEY is not set")
        if station.lat is None or station.lon is None:
            raise PlacesError(f"{station.name} has no position")
        interest = interest if interest in INTEREST_TYPES else "eat"
        min_stay = min(STAY_MIN.get(t, DEFAULT_STAY[interest]) for t in INTEREST_TYPES[interest])
        max_walk = max(0, (budget_min - min_stay) // 2)
        debug = {"budget_min": budget_min, "max_walk_min": max_walk, "found": 0, "dropped": []}
        if max_walk < 1:
            return {"places": [], "debug": {**debug, "reason": "not enough time"}}
        radius = min(MAX_RADIUS_M, max(150.0, max_walk * WALK_M_PER_MIN / DETOUR))
        raw = self._search(station, interest, lang, radius)
        debug["found"] = len(raw)
        now = datetime.fromtimestamp(at, ZURICH)
        out: list[dict] = []
        for p in raw:
            name = (p.get("displayName") or {}).get("text") or "?"
            if p.get("businessStatus") not in (None, "OPERATIONAL"):
                debug["dropped"].append(f"{name}: {p.get('businessStatus')}")
                continue
            loc = p.get("location") or {}
            if "latitude" not in loc:
                continue
            walk = walk_minutes(haversine_m(station.lat, station.lon, loc["latitude"], loc["longitude"]))
            stay = stay_minutes(p.get("primaryType"), interest)
            if 2 * walk + stay > budget_min:
                debug["dropped"].append(f"{name}: needs {2 * walk + stay} min")
                continue
            is_open = open_at(p.get("regularOpeningHours"), now + timedelta(minutes=walk))
            if is_open is False:
                debug["dropped"].append(f"{name}: closed then")
                continue
            photos = p.get("photos") or []
            if not photos:
                debug["dropped"].append(f"{name}: no photo")
                continue
            out.append({"p": p, "name": name, "walk": walk, "stay": stay, "open": is_open,
                        "score": _score(p.get("rating"), p.get("userRatingCount"), walk)})
        out.sort(key=lambda c: -c["score"])
        debug["fitting"] = len(out)
        out = out[:limit]
        places = []
        for c in out:
            p = c["p"]
            photo = self._photo(p["photos"][0])
            places.append({
                "id": p.get("id"),
                "name": c["name"],
                "type": p.get("primaryType"),
                "type_label": (p.get("primaryTypeDisplayName") or {}).get("text"),
                "address": p.get("shortFormattedAddress"),
                "rating": p.get("rating"),
                "rating_count": p.get("userRatingCount"),
                "walk_minutes": c["walk"],
                "stay_minutes": c["stay"],
                "open_now": c["open"],
                "maps_uri": p.get("googleMapsUri"),
                "photo": photo,
            })
        return {"places": places, "debug": debug}
