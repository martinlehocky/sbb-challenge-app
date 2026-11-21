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
  const advice = await cached(`summary ${lang} ${dest} ${cfg.at}`, () =>
    request<{ ai_message?: string | null; ai_error?: string; message: string }>(
      cfg,
      '/advice',
      json({ origin: cfg.kioskStation, destination: dest, at: cfg.at, lang, alternatives: 3, ai_message: true }),
    ),
  );
  if (!advice.ai_message) throw new Error(advice.ai_error || 'The AI gave no summary');
  return swiss(advice.ai_message, lang);
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
  if (data.suggestions_error && !data.suggestions?.length) throw new Error(data.suggestions_error);
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
  debug: QuestionDebug;
}

interface ApiQuestion {
  question: string;
  answer: string | null;
  answered: boolean;
  answer_lang?: string;
  trip_destination: { id: number; name: string } | null;
  clarify?: boolean;
  choices?: { id: number; name: string }[];
  debug?: QuestionDebug;
  error?: string;
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
    debug: { ...data.debug, ...(data.error ? { error: data.error } : {}) },
  };
}

/**
 * A question at the kiosk, typed or spoken. `destination` = the traveller's trip when they ask about it
 * (after scanning); without it, a trip question ("I need to get to Bern") returns `tripDestination`.
 */
export async function aiQuestion(
  input: { text: string } | { audio: Blob; filename: string },
  lang: Lang,
  trip?: { destination?: string },
): Promise<QuestionResult> {
  const cfg = config();
  // About the traveller's trip: their chosen destination, or the scanned ticket's.
  const destination = trip ? (trip.destination ?? cfg.destination) : undefined;
  const tips = stationTips(cfg, lang);
  if ('text' in input) {
    const data = await request<ApiQuestion>(
      cfg,
      '/question',
      json({ question: input.text, station: cfg.kioskStation, at: cfg.at, lang, destination, extra_facts: tips }),
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
  return toQuestionResult(await request<ApiQuestion>(cfg, '/question/voice', { method: 'POST', body: form }), lang);
}
