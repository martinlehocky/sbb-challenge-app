"""Small text helpers shared by ingest and search."""
from __future__ import annotations

import html
import re
import unicodedata

_NON_ALNUM = re.compile(r"[^a-z0-9]+")
_TAGS = re.compile(r"<[^>]+>")
_SPACES = re.compile(r"\s+")


def normalize(text: str) -> str:
    """'Zürich HB' -> 'zurich hb', 'Genève-Aéroport' -> 'geneve aeroport'."""
    decomposed = unicodedata.normalize("NFKD", text or "")
    ascii_only = "".join(c for c in decomposed if not unicodedata.combining(c))
    return _NON_ALNUM.sub(" ", ascii_only.lower()).strip()


def strip_html(text: str | None) -> str:
    if not text:
        return ""
    no_tags = _TAGS.sub(" ", text)
    return _SPACES.sub(" ", html.unescape(no_tags)).strip()


def split_lines(value: str | None) -> list[str]:
    """'ICE, IC6, S1' -> ['ICE', 'IC6', 'S1'] (upper-case, de-duplicated, order kept)."""
    if not value:
        return []
    out: list[str] = []
    for part in re.split(r"[,;/]", value):
        token = part.strip().upper().replace(" ", "")
        if token and token not in out:
            out.append(token)
    return out
