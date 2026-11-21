/**
 * Server-side calls to the backend's AI features (Together AI behind the Python backend).
 * Only imported by the route handlers in app/api/ai/*, so the backend address never reaches the browser.
 *
 * Everything here is optional: without BACKEND_URL, or when the backend has no TOGETHER_API_KEY,
 * aiStatus() says so and the kiosk hides its AI features.
 */
import { backendConfig, type BackendConfig } from './backend';
import { localize } from './i18n/localize';
import { restScenarios, waitScenarios } from './mock-data';
import type { Lang, RestScenario, WaitScenario } from './types';

const TIMEOUT_MS = 60_000;
const CACHE_TTL_MS = 10 * 60_000;
const cache = new Map<string, { at: number; value: Promise<unknown> }>();

export class AiUnavailableError extends Error {}

function config(): BackendConfig {
  const cfg = backendConfig();
  if (!cfg) throw new AiUnavailableError('BACKEND_URL is not set');
  return cfg;
}

async function request<T>(cfg: BackendConfig, path: string, init: RequestInit, timeoutMs = TIMEOUT_MS): Promise<T> {
  const res = await fetch(`${cfg.url}/api/v1${path}`, {
    ...init,
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (res.status === 503) throw new AiUnavailableError(await res.text());
  if (!res.ok) throw new Error(`Backend ${res.status} on ${path}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

/** Same request within 10 minutes = same answer (AI calls are slow and the demo data is static). */
function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as Promise<T>;
  const value = load();
  cache.set(key, { at: Date.now(), value });
  value.catch(() => cache.delete(key));
  return value;
}

/** Swiss German does not use "ß" (the AI often writes it): "Genießen" -> "Geniessen". */
function swiss(text: string, lang: Lang): string {
  return lang === 'de' ? text.replaceAll('ß', 'ss') : text;
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

// ---------------------------------------------------------------- status

export interface AiStatus {
  /** The backend is configured and reachable (typed destination search works without AI). */
  backend: boolean;
  /** The backend has a Together AI key (voice, summaries, ideas). */
  enabled: boolean;
  reason?: string;
}

export async function aiStatus(): Promise<AiStatus> {
  const cfg = backendConfig();
  if (!cfg) return { backend: false, enabled: false, reason: 'BACKEND_URL is not set (mock data mode)' };
  try {
    const health = await cached('health', () =>
      request<{ ai_enabled: boolean }>(cfg, '/health', { method: 'GET' }, 5_000),
    );
    return health.ai_enabled
      ? { backend: true, enabled: true }
      : { backend: true, enabled: false, reason: 'The backend has no TOGETHER_API_KEY' };
  } catch (err) {
    cache.delete('health');
    return { backend: false, enabled: false, reason: `Backend not reachable: ${(err as Error).message}` };
  }
}

// ---------------------------------------------------------------- plain-language advice

/** AI rewrite of the advice for the kiosk's trip (the backend rejects rewrites that change times or stations). */
export async function aiSummary(lang: Lang, destination?: string): Promise<string> {
  const cfg = config();
  const dest = destination ?? cfg.destination;
  // Throwing inside the cached loader keeps failures out of the cache (a network blip must not stick for 10 min).
  const message = await cached(`summary ${lang} ${dest} ${cfg.at}`, async () => {
    const advice = await request<{ ai_message?: string | null; ai_error?: string; message: string }>(
      cfg,
      '/advice',
      json({ origin: cfg.kioskStation, destination: dest, at: cfg.at, lang, alternatives: 3, ai_message: true }),
    );
    if (!advice.ai_message) throw new Error(advice.ai_error || 'The AI gave no summary');
    return advice.ai_message;
  });
  return swiss(message, lang);
}

// ---------------------------------------------------------------- ideas for the wait

export type Interest = 'eat' | 'explore' | 'rest';

export interface AiIdea {
  title: string;
  category: Interest | null;
  walkMinutes: number | null;
  durationMinutes: number | null;
  description: string;
}

interface ApiSuggestion {
  title: string;
  category: Interest | null;
  walk_minutes: number | null;
  duration_minutes: number | null;
  description: string;
}

/** AI suggestions near the kiosk station that fit the waiting time (walk there + stay + walk back). */
export async function aiIdeas(interest: Interest, lang: Lang, waitMinutes: number): Promise<AiIdea[]> {
  const ideas = await loadIdeas(interest, lang, waitMinutes);
  return ideas.map((i) => ({ ...i, title: swiss(i.title, lang), description: swiss(i.description, lang) }));
}

async function loadIdeas(interest: Interest, lang: Lang, waitMinutes: number): Promise<AiIdea[]> {
  const cfg = config();
  const data = await cached(`ideas ${interest} ${lang} ${waitMinutes} ${cfg.kioskStation} ${cfg.at}`, () =>
    request<{ suggestions?: ApiSuggestion[]; suggestions_error?: string }>(
      cfg,
      '/location/analyze',
      json({
        station_id: Number(cfg.kioskStation),
        at: cfg.at,
        wait_minutes: waitMinutes,
        interest,
        lang,
        suggestions: true,
      }),
    ),
  );
  if (data.suggestions_error && !data.suggestions?.length) {
    cache.delete(`ideas ${interest} ${lang} ${waitMinutes} ${cfg.kioskStation} ${cfg.at}`); // retry next time
    throw new Error(data.suggestions_error);
  }
  return (data.suggestions ?? [])
    .filter((s) => !s.category || s.category === interest)
    .map((s) => ({
      title: s.title,
      category: s.category,
      walkMinutes: s.walk_minutes,
      durationMinutes: s.duration_minutes,
      description: s.description,
    }));
}

// ---------------------------------------------------------------- questions ("Need help?")

/** What the backend and the AI did with a question (shown in the kiosk's debug panel). */
export interface QuestionDebug {
  speech_to_text?: {
    model: string;
    first_transcript: string;
    detected_language: string | null;
    retried_in: string | null;
    prompt_echo?: boolean;
    audio_bytes: number;
    content_type: string | null;
    ms: number;
  };
  trip_intent?: {
    raw: { origin: string | null; destinations?: string[]; language: string | null } | null;
    method: string;
    destination: string | null;
    origin?: StationMatchDebug | null;
    destinations?: StationMatchDebug[];
  };
  /** How the backend used the trip: none, ticket, trip, elsewhere (other start), same, several/which (asks back). */
  trip_plan?: string;
  facts?: string[];
  ai_raw?: { answer?: string; answered?: boolean; language?: string } | null;
  rejected?: string;
  error?: string;
  ms?: number;
  model?: string;
  server_ms?: number;
}

/** One place named in a question and the station(s) it matched (exact, only, busiest, ambiguous, none). */
export interface StationMatchDebug {
  said: string;
  how: string;
  station: string | null;
  choices: string[];
}

export interface QuestionResult {
  /** The question as typed, or as heard (empty when no speech was recognised). */
  question: string;
  answer: string | null;
  /** false: the facts did not contain the answer, or the answer was rejected (then `answer` points to staff). */
  answered: boolean;
  /** Language of the answer: the language the question was asked in (else the screen language). */
  answerLang: Lang;
  /** Set when the question was a trip ("I need to get to Bern"): offer "Show my next train". */
  tripDestination: { id: string; name: string } | null;
  /** The question was unclear (two destinations, a name that fits several stations): the answer asks back. */
  clarify: boolean;
  /** With `clarify`: the stations to choose from (each opens that trip). */
  choices: { id: string; name: string }[];
  /**
   * The trip this answer was about (origin null = from the kiosk). A chat sends it back with the next
   * question, so "when does it arrive?" stays about that trip. Null when the answer was about no trip.
   */
  context: ChatContext | null;
  /** A trip with stops on the way ("first Interlaken, then Bern"): every part, the stays, ideas per stop. */
  route: ChatRoute | null;
  debug: QuestionDebug;
}

type Place = { id: string; name: string };

/**
 * The trip a chat is about: the destination, and the start station when it is not the kiosk.
 * `via` / `stays`: stops on the way and the minutes to stay at each (null = not said yet).
 */
export interface ChatContext {
  origin: Place | null;
  destination: Place;
  via?: Place[];
  stays?: (number | null)[];
}

/** One train of a route part. Times are ISO strings in Swiss time. */
export interface RouteTrain {
  line: string | null;
  direction: string | null;
  from: { name: string; platform: string | null };
  to: { name: string; platform: string | null };
  departure: string;
  arrival: string;
}

/** A trip with stops: start -> stop(s) -> destination, each part leaving after the stay at the stop before. */
export interface ChatRoute {
  stops: Place[];
  stays: (number | null)[];
  /** One per part that could be planned (a part after a stay not known yet is missing). */
  parts: { from: Place; to: Place; departAfter: string; trains: RouteTrain[] | null }[];
  /** The kiosk asks how long to stay at this stop, with these stays (minutes) as buttons. */
  askStay: { index: number; stop: Place; options: number[] } | null;
  /** Things to do at each stop (fitting the stay, when known). */
  ideas: { stop: Place; ideas: { title: string; minutes: number }[] }[];
  complete: boolean;
}

interface ApiQuestion {
  question: string;
  answer: string | null;
  answered: boolean;
  answer_lang?: string;
  trip_destination: { id: number; name: string } | null;
  clarify?: boolean;
  choices?: { id: number; name: string }[];
  context?: {
    origin: ApiPlace | null;
    destination: ApiPlace;
    via?: ApiPlace[];
    stays?: (number | null)[];
  } | null;
  route?: ApiRoute | null;
  debug?: QuestionDebug;
  error?: string;
}

type ApiPlace = { id: number; name: string };

interface ApiTrain {
  line: string | null;
  category: string | null;
  direction: string | null;
  from: { name: string; platform: string | null };
  to: { name: string; platform: string | null };
  departure: string;
  arrival: string;
}

interface ApiRoute {
  stops: ApiPlace[];
  stays: (number | null)[];
  legs: { from: ApiPlace; to: ApiPlace; depart_after: string; journey: { legs: ApiTrain[] } | null }[];
  ask_stay: { index: number; stop: ApiPlace; options: number[] } | null;
  ideas: { stop: ApiPlace; ideas: { title: string; minutes: number }[] }[];
  complete: boolean;
}

const place = (p: ApiPlace): Place => ({ id: String(p.id), name: p.name });
const stayOf = (x: unknown): number | null => (typeof x === 'number' && Number.isInteger(x) ? x : null);

function toRoute(r: ApiRoute, lang: Lang): ChatRoute {
  return {
    stops: r.stops.map(place),
    stays: r.stays.map(stayOf),
    parts: r.legs.map((leg) => ({
      from: place(leg.from),
      to: place(leg.to),
      departAfter: leg.depart_after,
      trains: leg.journey
        ? leg.journey.legs.map((t) => ({
            line: t.line || t.category,
            direction: t.direction,
            from: t.from,
            to: t.to,
            departure: t.departure,
            arrival: t.arrival,
          }))
        : null,
    })),
    askStay: r.ask_stay ? { index: r.ask_stay.index, stop: place(r.ask_stay.stop), options: r.ask_stay.options } : null,
    ideas: r.ideas.map((i) => ({
      stop: place(i.stop),
      ideas: i.ideas.map((x) => ({ title: swiss(x.title, lang), minutes: x.minutes })),
    })),
    complete: r.complete,
  };
}

/**
 * Hand-written tips for the kiosk station (only Zürich HB has them), sent to the AI as extra facts.
 * They come from the same data as screens 5-5c, in the screen language.
 */
function stationTips(cfg: BackendConfig, lang: Lang): string[] {
  if (cfg.kioskStation !== '8503000') return [];
  const walk = (w: { minutes: number; maxMinutes?: number }) =>
    w.maxMinutes ? `${w.minutes}-${w.maxMinutes} min walk` : `${w.minutes} min walk`;
  const tips = new Map<string, string>();
  for (const level of ['short', 'medium', 'long'] as const) {
    const s = localize<WaitScenario>(waitScenarios[level], lang);
    for (const i of s.eat) tips.set(`eat ${i.id}`, `Eat or drink - ${i.title}: ${i.location}, ${walk(i.walk)}.`);
    for (const { place } of s.explore.places) {
      tips.set(`see ${place.id}`, `Sight - ${place.name}: ${place.history} ${walk(place.walk)}.`);
    }
  }
  const rest = localize<RestScenario>(restScenarios.day, lang);
  for (const o of rest.options) tips.set(`rest ${o.id}`, `Rest - ${o.name}: ${o.details.join(', ')}, ${walk(o.walk)}.`);
  // Some tips name "the stairs to platform {platform}" (filled in per screen); the AI gets a neutral wording.
  return [...tips.values()].map((tip) => tip.replaceAll('{platform}', "your train's platform"));
}

const LANGS: readonly Lang[] = ['en', 'de', 'fr', 'it'];

function toQuestionResult(data: ApiQuestion, screenLang: Lang): QuestionResult {
  const lang = LANGS.find((l) => l === data.answer_lang) ?? screenLang;
  return {
    question: data.question,
    answer: data.answer ? swiss(data.answer, lang) : null,
    answered: data.answered,
    answerLang: lang,
    tripDestination: data.trip_destination
      ? { id: String(data.trip_destination.id), name: data.trip_destination.name }
      : null,
    clarify: Boolean(data.clarify),
    choices: (data.choices ?? []).map((c) => ({ id: String(c.id), name: c.name })),
    context: data.context?.destination
      ? {
          origin: data.context.origin ? place(data.context.origin) : null,
          destination: place(data.context.destination),
          ...(data.context.via?.length
            ? { via: data.context.via.map(place), stays: data.context.via.map((_, i) => stayOf(data.context?.stays?.[i])) }
            : {}),
        }
      : null,
    route: data.route ? toRoute(data.route, lang) : null,
    debug: { ...data.debug, ...(data.error ? { error: data.error } : {}) },
  };
}

/** One earlier message of a chat at the kiosk (sent back so follow-up questions are understood). */
export interface ChatTurn {
  role: 'traveller' | 'kiosk';
  text: string;
}

/** Most turns sent back: the backend reads the last 10 (and accepts at most 20). */
const MAX_CHAT_TURNS = 10;

/** Keeps only well-formed turns, trimmed to what the backend accepts. */
export function cleanChat(history: unknown): ChatTurn[] {
  if (!Array.isArray(history)) return [];
  return history
    .filter(
      (t): t is ChatTurn =>
        !!t && (t.role === 'traveller' || t.role === 'kiosk') && typeof t.text === 'string' && !!t.text.trim(),
    )
    .slice(-MAX_CHAT_TURNS)
    .map((t) => ({ role: t.role, text: t.text.trim().slice(0, 1000) }));
}

/**
 * A question at the kiosk, typed or spoken. `destination` = the traveller's trip when they ask about it
 * (after scanning); without it, a trip question ("I need to get to Bern") returns `tripDestination`.
 * `chat`: the conversation so far and the trip already discussed (destination, and start station when it
 * is not the kiosk), for follow-up questions.
 */
export async function aiQuestion(
  input: { text: string } | { audio: Blob; filename: string },
  lang: Lang,
  trip?: { destination?: string },
  chat?: {
    history: ChatTurn[];
    contextDestination?: string;
    contextOrigin?: string;
    /** Stops on the way of the trip discussed, and the minutes to stay at each (null = not said yet). */
    contextVia?: string[];
    contextStays?: (number | null)[];
    /** A stay the traveller picked with a button (minutes). */
    stay?: number;
  },
): Promise<QuestionResult> {
  const cfg = config();
  // About the traveller's trip: their chosen destination, or the scanned ticket's.
  const destination = trip ? (trip.destination ?? cfg.destination) : undefined;
  const tips = stationTips(cfg, lang);
  const history = cleanChat(chat?.history);
  const contextDestination = chat?.contextDestination;
  // A start station only makes sense together with a destination.
  const contextOrigin = contextDestination ? chat?.contextOrigin : undefined;
  // Stops only make sense with the destination; stays are aligned with the stops.
  const contextVia = contextDestination ? (chat?.contextVia ?? []).slice(0, 3) : [];
  const contextStays = contextVia.map((_, i) => stayOf(chat?.contextStays?.[i]));
  const stay = chat?.stay;
  if ('text' in input) {
    const data = await request<ApiQuestion>(
      cfg,
      '/question',
      json({
        question: input.text,
        station: cfg.kioskStation,
        at: cfg.at,
        lang,
        destination,
        extra_facts: tips,
        history,
        context_destination: contextDestination,
        context_origin: contextOrigin,
        context_via: contextVia,
        context_stays: contextStays,
        stay_minutes: stay,
      }),
    );
    return toQuestionResult(data, lang);
  }
  const form = new FormData();
  form.set('file', input.audio, input.filename);
  form.set('station', cfg.kioskStation);
  form.set('at', cfg.at);
  form.set('lang', lang);
  if (destination) form.set('destination', destination);
  form.set('extra_facts', JSON.stringify(tips));
  if (history.length) form.set('history', JSON.stringify(history));
  if (contextDestination) form.set('context_destination', contextDestination);
  if (contextOrigin) form.set('context_origin', contextOrigin);
  if (contextVia.length) {
    form.set('context_via', JSON.stringify(contextVia));
    form.set('context_stays', JSON.stringify(contextStays));
  }
  if (stay) form.set('stay_minutes', String(stay));
  return toQuestionResult(await request<ApiQuestion>(cfg, '/question/voice', { method: 'POST', body: form }), lang);
}
