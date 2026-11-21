/**
 * Server-side client for the Python backend (backend/, FastAPI) and the mapping
 * from its answers to the screen data types in lib/types.ts.
 *
 * Used only by lib/data.ts, which only Server Components import, so BACKEND_URL
 * and the calls never reach the browser.
 *
 * Environment (see .env.example):
 *   BACKEND_URL      e.g. http://127.0.0.1:8000. Unset = the kiosk shows mock data.
 *   DEMO_AT          The simulated "now", Swiss local time with offset.
 *                    Default 2026-09-10T11:05:00+02:00 (the disruption data covers September 2026).
 *   KIOSK_STATION    Station number of the kiosk. Default 8503000 = Zürich HB.
 *   TRIP_DESTINATION Destination read from the (simulated) ticket. Default 8509000 = Chur.
 */
import type {
  ClockTime,
  Connection,
  Disruption,
  Lang,
  Line,
  PhoneTrip,
  PhoneUpdate,
  Station,
  Trip,
  TripResult,
  WelcomeInfo,
} from './types';

// ---------------------------------------------------------------- configuration

export interface BackendConfig {
  url: string;
  at: string;
  kioskStation: string;
  destination: string;
}

const DEFAULT_AT = '2026-09-10T11:05:00+02:00';
const ISO_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2})$/;

/** Backend settings, or null when BACKEND_URL is not set (mock mode). */
export function backendConfig(): BackendConfig | null {
  const url = process.env.BACKEND_URL?.trim();
  if (!url) return null;
  const at = process.env.DEMO_AT?.trim() || DEFAULT_AT;
  if (!ISO_LOCAL.test(at)) {
    throw new Error(`DEMO_AT must look like ${DEFAULT_AT} (Swiss local time with offset), got "${at}"`);
  }
  const kioskStation = process.env.KIOSK_STATION?.trim() || '8503000';
  if (!/^\d{7}$/.test(kioskStation)) {
    throw new Error(`KIOSK_STATION must be a 7-digit station number (e.g. 8503000), got "${kioskStation}"`);
  }
  return {
    url: url.replace(/\/+$/, ''),
    at,
    kioskStation,
    destination: process.env.TRIP_DESTINATION?.trim() || '8509000',
  };
}

// ---------------------------------------------------------------- HTTP

const TIMEOUT_MS = 30_000;
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: Promise<unknown> }>();

/** JSON request to the backend. Identical requests within a minute share one answer (the data is static per DEMO_AT). */
async function call<T>(cfg: BackendConfig, path: string, body?: unknown): Promise<T> {
  const key = `${path} ${body ? JSON.stringify(body) : ''}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as Promise<T>;
  const value = (async () => {
    const res = await fetch(`${cfg.url}/api/v1${path}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`Backend ${res.status} on ${path}: ${(await res.text()).slice(0, 300)}`);
    }
    return (await res.json()) as T;
  })();
  cache.set(key, { at: Date.now(), value });
  value.catch(() => cache.delete(key)); // never keep a failure
  return value;
}

// ---------------------------------------------------------------- backend response shapes (subset we use)

interface ApiStation {
  id: number;
  name: string;
}
interface ApiLegEnd {
  id: number;
  name: string;
  platform: string | null;
}
interface ApiLeg {
  line: string | null;
  category: string | null;
  train_number: string | null;
  direction: string | null;
  from: ApiLegEnd;
  to: ApiLegEnd;
  departure: string;
  arrival: string;
}
interface ApiJourney {
  departure: string;
  arrival: string;
  transfers: number;
  legs: ApiLeg[];
  delay_vs_plan_min?: number;
}
interface ApiMessage {
  id: string;
  published_at: string | null;
  updated_at: string | null;
  title: string | null;
  text: string | null;
}
interface ApiPlace {
  id: number;
  name: string;
  role: 'start' | 'end' | 'line_from' | 'line_to' | 'mentioned';
}
export interface ApiDisruption {
  id: string;
  status: string;
  last_update: string;
  expected_end: string | null;
  expected_end_kind: 'until' | 'approx' | 'at_least' | null;
  reason: string | null;
  title: string | null;
  description: string | null;
  lines: string[];
  places: ApiPlace[];
  messages?: ApiMessage[];
}
export interface ApiAdvice {
  as_of: string;
  origin: ApiStation;
  destination: ApiStation;
  status: 'ok' | 'affected' | 'no_alternative' | 'no_connection';
  message: string;
  planned: (ApiJourney & { affected_legs: number[] }) | null;
  affecting_disruptions: ApiDisruption[];
  alternatives: ApiJourney[];
  next_move: { minutes_until_departure: number } | null;
}

// ---------------------------------------------------------------- small helpers

/** "2026-09-10T11:12:00+02:00" -> "11:12". The backend sends Swiss local time. */
export function clock(iso: string): ClockTime {
  return iso.slice(11, 16);
}

export function toMinutes(time: ClockTime): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function fromMinutes(total: number): ClockTime {
  const m = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Moves every "HH:MM" in a text by `delta` minutes. */
export function shiftTimes(text: string, delta: number): string {
  return text.replace(/\b([01]\d|2[0-3]):([0-5]\d)\b/g, (t) => fromMinutes(toMinutes(t) + delta));
}

/** Minutes from `fromIso` to `toIso` (both ISO with offset). */
function minutesBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 60000);
}

/** Line badge icons that exist in /public/sbb-icons. Other lines are shown as text. */
const LOCAL_LINE_ICONS = new Set(['ic-3', 'ir-35', 's-5']);
const SPACED_CATEGORIES = new Set(['IC', 'IR', 'RE', 'EC', 'ICE', 'EN', 'NJ', 'RJX', 'PE']);

/** Backend line ("IR35", category "IR") -> display line { name: "IR 35", icon: "ir-35" }. */
export function toLine(line: string | null, category: string | null): Line {
  const raw = (line || category || '').toUpperCase();
  const m = /^([A-Z]+)(\d+[A-Z]?)$/.exec(raw);
  if (!m) return { name: raw || '—' };
  const [, cat, num] = m;
  const name = SPACED_CATEGORIES.has(cat) ? `${cat} ${num}` : `${cat}${num}`;
  const icon = `${cat.toLowerCase()}-${num.toLowerCase()}`;
  return LOCAL_LINE_ICONS.has(icon) ? { name, icon } : { name };
}

const station = (s: { id: number; name: string }): Station => ({ id: String(s.id), name: s.name });

// ---------------------------------------------------------------- texts that only exist in live mode

type L = Record<Lang, string>;
const TXT = {
  between: { en: 'between {a} and {b}', de: 'zwischen {a} und {b}', fr: 'entre {a} et {b}', it: 'tra {a} e {b}' } as L,
  at: { en: 'at {a}', de: 'bei {a}', fr: 'à {a}', it: 'a {a}' } as L,
  until: { en: 'Expected until {t}.', de: 'Voraussichtlich bis {t}.', fr: 'Prévu jusqu’à {t}.', it: 'Previsto fino alle {t}.' } as L,
  approx: {
    en: 'Expected until about {t}.',
    de: 'Voraussichtlich bis etwa {t}.',
    fr: 'Prévu jusque vers {t}.',
    it: 'Previsto fino alle {t} circa.',
  } as L,
  at_least: {
    en: 'Expected until at least {t}.',
    de: 'Voraussichtlich mindestens bis {t}.',
    fr: 'Prévu au moins jusqu’à {t}.',
    it: 'Previsto almeno fino alle {t}.',
  } as L,
  direct: { en: 'direct', de: 'direkt', fr: 'direct', it: 'diretto' } as L,
  changeIn: { en: 'change in {s}', de: 'umsteigen in {s}', fr: 'changement à {s}', it: 'cambio a {s}' } as L,
  leavesSooner: {
    en: 'Leaves sooner, arrives later',
    de: 'Fährt früher, kommt später an',
    fr: 'Part plus tôt, arrive plus tard',
    it: 'Parte prima, arriva più tardi',
  } as L,
  fewerChanges: { en: 'Fewer changes', de: 'Weniger Umsteigen', fr: 'Moins de changements', it: 'Meno cambi' } as L,
  laterTrain: { en: 'Later train', de: 'Späterer Zug', fr: 'Train plus tard', it: 'Treno successivo' } as L,
  picked: {
    en: 'You picked the {line} at the kiosk in {station}.',
    de: 'Sie haben am Terminal im {station} den {line} gewählt.',
    fr: 'Vous avez choisi le train {line} à la borne de {station}.',
    it: 'Ha scelto il treno {line} al terminale di {station}.',
  } as L,
  cancelled: {
    en: 'Your {line} at {time} is cancelled ({reason}).',
    de: 'Ihr {line} um {time} fällt aus ({reason}).',
    fr: 'Votre train {line} de {time} est supprimé ({reason}).',
    it: 'Il suo treno {line} delle {time} è soppresso ({reason}).',
  } as L,
  onTime: {
    en: 'Your train runs as planned.',
    de: 'Ihr Zug fährt wie geplant.',
    fr: 'Votre train circule comme prévu.',
    it: 'Il suo treno circola come previsto.',
  } as L,
};

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? `{${k}}`);
}

// ---------------------------------------------------------------- mappers

function sectionOf(d: ApiDisruption): { from: ApiPlace; to: ApiPlace } | null {
  const by = (role: ApiPlace['role']) => d.places.find((p) => p.role === role);
  const from = by('start') ?? by('line_from') ?? d.places[0];
  const to = by('end') ?? by('line_to') ?? from;
  return from ? { from, to: to ?? from } : null;
}

/** One line for the cancelled-train box: reason, where, and until when. */
function reasonLine(d: ApiDisruption, lang: Lang): string {
  const sec = sectionOf(d);
  const where = sec
    ? sec.from.id === sec.to.id
      ? fill(TXT.at[lang], { a: sec.from.name })
      : fill(TXT.between[lang], { a: sec.from.name, b: sec.to.name })
    : '';
  const what = d.reason || d.title || '';
  let out = [what, where].filter(Boolean).join(' ');
  out = out ? `${out}.` : '';
  if (d.expected_end && d.expected_end_kind) {
    out = `${out} ${fill(TXT[d.expected_end_kind][lang], { t: clock(d.expected_end) })}`.trim();
  }
  return out;
}

export function mapDisruption(d: ApiDisruption, lang: Lang, fallback: { from: Station; to: Station }): Disruption {
  const sec = sectionOf(d);
  return {
    id: d.id,
    title: d.title || d.reason || '',
    summary: (d.description || d.title || '').replace(/\s*\n+\s*/g, ' ').trim(),
    reason: reasonLine(d, lang),
    section: sec ? { from: station(sec.from), to: station(sec.to) } : fallback,
    cancelledLines: d.lines.map((l) => toLine(l, null).name),
    updatedAt: clock(d.last_update),
  };
}

function routeLabel(j: ApiJourney, lang: Lang): string {
  const first = toLine(j.legs[0].line, j.legs[0].category).name;
  if (j.transfers === 0) return `${first} ${TXT.direct[lang]}`;
  const where = j.legs.slice(1).map((l) => l.from.name).join(', ');
  return `${first}, ${fill(TXT.changeIn[lang], { s: where })}`;
}

function tradeOff(j: ApiJourney, best: ApiJourney, lang: Lang): string {
  if (Date.parse(j.departure) < Date.parse(best.departure)) return TXT.leavesSooner[lang];
  if (j.transfers < best.transfers) return TXT.fewerChanges[lang];
  return TXT.laterTrain[lang];
}

export function mapConnection(j: ApiJourney, lang: Lang, dest: Station, best?: ApiJourney): Connection {
  const first = j.legs[0];
  return {
    id: `${first.line ?? first.category ?? 'train'}-${j.departure}`,
    train: {
      line: toLine(first.line, first.category),
      direction: first.direction ?? undefined,
      departure: clock(first.departure),
      platform: first.from.platform ?? '–',
    },
    arrival: clock(j.arrival),
    arrivalStation: dest,
    changes: j.transfers,
    routeLabel: routeLabel(j, lang),
    tradeOff: best ? tradeOff(j, best, lang) : undefined,
    delayVsPlanMinutes: Math.max(0, j.delay_vs_plan_min ?? 0),
    ticketValid: false, // the backend cannot check tickets, so we do not claim it
    // no occupancy: there is no forecast in the data
  };
}

// ---------------------------------------------------------------- screen data

/** The disruption advice for the kiosk's trip (ticket: kiosk station -> destination) at DEMO_AT. */
export function fetchAdvice(cfg: BackendConfig, lang: Lang): Promise<ApiAdvice> {
  return call<ApiAdvice>(cfg, '/advice', {
    origin: cfg.kioskStation,
    destination: cfg.destination,
    at: cfg.at,
    lang,
    alternatives: 3,
  });
}

export async function liveWelcome(cfg: BackendConfig, lang: Lang): Promise<WelcomeInfo> {
  const kiosk = await call<ApiStation & { lat: number; lon: number }>(
    cfg,
    `/stations/${encodeURIComponent(cfg.kioskStation)}`,
  );
  const q = new URLSearchParams({
    at: cfg.at,
    lang,
    lat: String(kiosk.lat),
    lon: String(kiosk.lon),
    radius_m: '40000',
  });
  const list = await call<{ disruptions: ApiDisruption[] }>(cfg, `/disruptions?${q}`);
  const here = station(kiosk);
  return {
    now: clock(cfg.at),
    station: here,
    disruptions: list.disruptions.slice(0, 3).map((d) => mapDisruption(d, lang, { from: here, to: here })),
  };
}

export function tripResultFromAdvice(a: ApiAdvice, cfg: BackendConfig, lang: Lang): TripResult {
  if (!a.planned) {
    throw new Error(`Backend found no train from ${a.origin.name} to ${a.destination.name}: ${a.message}`);
  }
  if (!a.alternatives.length || !a.next_move) {
    throw new Error(`Backend found no alternative (${a.status}): ${a.message}`);
  }
  const from = station(a.origin);
  const to = station(a.destination);
  const plannedLeg = a.planned.legs[0];
  const date = cfg.at.slice(0, 10);
  const trip: Trip = {
    id: `${from.id}-${to.id}-${a.planned.departure}`,
    ticket: {
      from,
      to,
      date,
      travelClass: 2,
      printedDate: `${date.slice(8, 10)}.${date.slice(5, 7)}.`,
    },
    plannedTrain: {
      line: toLine(plannedLeg.line, plannedLeg.category),
      direction: plannedLeg.direction ?? undefined,
      departure: clock(plannedLeg.departure),
      platform: plannedLeg.from.platform ?? '–',
    },
    plannedArrival: clock(a.planned.arrival),
  };
  const affected = a.status === 'affected';
  const d = a.affecting_disruptions[0];
  const disruption: Disruption = d
    ? mapDisruption(d, lang, { from, to })
    : { id: 'none', title: '', summary: '', reason: TXT.onTime[lang], section: { from, to }, cancelledLines: [], updatedAt: clock(a.as_of) };
  const [best, ...others] = a.alternatives;
  return {
    trip,
    affected,
    disruption,
    now: clock(a.as_of),
    best: mapConnection(best, lang, to),
    minutesToDeparture: a.next_move.minutes_until_departure,
    alternatives: others.map((j) => mapConnection(j, lang, to, best)),
  };
}

export function phoneTripFromAdvice(a: ApiAdvice, cfg: BackendConfig, lang: Lang): PhoneTrip {
  const result = tripResultFromAdvice(a, cfg, lang);
  const best = a.alternatives[0];
  const firstLeg = best.legs[0];
  const line = toLine(firstLeg.line, firstLeg.category);
  const now = clock(a.as_of);
  const d = a.affecting_disruptions[0];
  const messages = (d?.messages ?? []).filter((m) => m.published_at && Date.parse(m.published_at) <= Date.parse(a.as_of));
  const newest = messages[0];

  const timeline: PhoneUpdate[] = [
    {
      id: 'picked',
      time: fromMinutes(toMinutes(now) + 1),
      tone: 'success',
      text: fill(TXT.picked[lang], { line: line.name, station: result.trip.ticket.from.name }),
    },
  ];
  if (result.affected && d) {
    timeline.push({
      id: 'cancelled',
      time: now,
      tone: 'error',
      text: fill(TXT.cancelled[lang], {
        line: result.trip.plannedTrain.line.name,
        time: result.trip.plannedTrain.departure,
        reason: d.reason || d.title || '',
      }),
    });
  }
  for (const m of messages.slice(0, 3)) {
    // Title AND text: a title alone can say the opposite of the message
    // ("Rail replacement buses" for "from 11am there will be no rail replacement buses").
    const text = [m.title, m.text].filter(Boolean).join(': ').replace(/\s*\n+\s*/g, ' ');
    timeline.push({ id: `msg-${m.id}`, time: clock(m.published_at!), tone: 'warning', text });
  }

  return {
    tripId: result.trip.id,
    from: result.trip.ticket.from,
    to: result.trip.ticket.to,
    latest: newest
      ? { time: clock(newest.published_at!), headline: newest.title || '', text: newest.text || '', platform: result.best.train.platform, headBackBy: result.best.train.departure }
      : { time: now, headline: result.affected ? result.disruption.title : TXT.onTime[lang], text: result.affected ? result.disruption.summary : '', platform: result.best.train.platform, headBackBy: result.best.train.departure },
    train: {
      line,
      direction: firstLeg.direction ?? result.trip.ticket.to.name,
      departure: clock(firstLeg.departure),
      platform: firstLeg.from.platform ?? '–',
      arrival: clock(best.arrival),
      arrivalStation: result.trip.ticket.to,
      minutesToDeparture: Math.max(0, minutesBetween(a.as_of, firstLeg.departure)),
    },
    timeline,
  };
}
