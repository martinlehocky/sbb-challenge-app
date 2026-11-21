/**
 * Real places near the kiosk station from Google Places, through the Python backend (which holds the key).
 * Server-only: used by the pages of screens 5 and 5b. Returns null when Google is not set up or fails,
 * so the screens fall back to the hand-written ideas.
 */
import { backendConfig } from './backend';
import type { Lang, NearbyPlace } from './types';

interface ApiPlace {
  id: string;
  name: string;
  type_label: string | null;
  address: string | null;
  rating: number | null;
  rating_count: number | null;
  walk_minutes: number;
  stay_minutes: number;
  open_now: boolean | null;
  maps_uri: string | null;
  photo: {
    url: string;
    author: string | null;
    author_uri: string | null;
  } | null;
}

export async function nearbyPlaces(
  interest: 'eat' | 'explore',
  lang: Lang,
  waitMinutes: number,
  limit = 3,
): Promise<NearbyPlace[] | null> {
  const cfg = backendConfig();
  if (!cfg || waitMinutes < 1) return null;
  try {
    const res = await fetch(`${cfg.url}/api/v1/places/nearby`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        station: cfg.kioskStation,
        at: cfg.at,
        wait_minutes: Math.min(600, Math.round(waitMinutes)),
        interest,
        lang,
        limit,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    });
    if (res.status === 503) return null; // no Google key: hand-written ideas
    if (!res.ok) throw new Error(`Backend ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { places: ApiPlace[] };
    return data.places.map((p) => ({
      id: p.id,
      name: p.name,
      typeLabel: p.type_label,
      address: p.address,
      rating: p.rating,
      ratingCount: p.rating_count,
      walkMinutes: p.walk_minutes,
      stayMinutes: p.stay_minutes,
      mapsUri: p.maps_uri,
      photo: p.photo ? { url: p.photo.url, author: p.photo.author } : null,
    }));
  } catch (err) {
    console.error('[places] Google places failed, showing hand-written ideas:', err);
    return null;
  }
}
