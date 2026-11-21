"""Distance helpers (WGS84, good enough for Switzerland-scale distances)."""
from __future__ import annotations

import math

EARTH_RADIUS_M = 6_371_000.0


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(a)))


def point_segment_distance_m(
    plat: float, plon: float, alat: float, alon: float, blat: float, blon: float
) -> float:
    """Shortest distance from point P to segment AB, using a local equirectangular projection."""
    lat0 = math.radians((alat + blat + plat) / 3)
    kx = math.cos(lat0) * math.pi / 180 * EARTH_RADIUS_M
    ky = math.pi / 180 * EARTH_RADIUS_M
    ax, ay = alon * kx, alat * ky
    bx, by = blon * kx, blat * ky
    px, py = plon * kx, plat * ky
    dx, dy = bx - ax, by - ay
    seg_len2 = dx * dx + dy * dy
    if seg_len2 == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg_len2))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))
