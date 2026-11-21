/**
 * Server-side calls to the backend's AI features (Together AI behind the Python backend).
 * Only imported by the route handlers in app/api/ai/*, so the backend address never reaches the browser.
 *
 * Everything here is optional: without BACKEND_URL, or when the backend has no TOGETHER_API_KEY,
 * aiStatus() says so and the kiosk hides its AI features.
 */
import { backendConfig, type BackendConfig } from './backend';
import type { Lang } from './types';

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

// ---------------------------------------------------------------- ask by voice or text

/** What the backend and the AI did with a request (shown in the kiosk's debug panel). */
export interface AskDebug {
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
  understanding?: {
    model: string | null;
    ai_raw: { origin: string | null; destination: string | null; language: string | null } | null;
    language: string | null;
    ms: number;
  };
  method?: string;
  note?: string | null;
  origin?: { id: number; name: string } | null;
  destination?: { id: number; name: string } | null;
  error?: string;
}

export interface AskResult {
  transcript: string;
  destination: { id: string; name: string } | null;
  /** Why no destination could be used (not understood, or same station as the kiosk). */
  problem?: 'not_understood' | 'same_station';
  debug: AskDebug;
}

interface ApiAsk {
  transcript: string;
  understood: {
    origin: { id: number; name: string } | null;
    destination: { id: number; name: string } | null;
    method?: string;
    note?: string | null;
  };
  error?: string;
  debug?: Pick<AskDebug, 'speech_to_text' | 'understanding'>;
}

function toAskResult(data: ApiAsk, cfg: BackendConfig): AskResult {
  const debug: AskDebug = {
    ...data.debug,
    method: data.understood.method,
    note: data.understood.note,
    origin: data.understood.origin,
    destination: data.understood.destination,
    error: data.error,
  };
  const dest = data.understood.destination;
  if (!dest) return { transcript: data.transcript, destination: null, problem: 'not_understood', debug };
  if (String(dest.id) === cfg.kioskStation) {
    return {
      transcript: data.transcript,
      destination: { id: String(dest.id), name: dest.name },
      problem: 'same_station',
      debug,
    };
  }
  return { transcript: data.transcript, destination: { id: String(dest.id), name: dest.name }, debug };
}

/** Typed request ("Bern", "I need to get to Lugano"): the AI finds the destination station. */
export async function aiAskText(text: string, lang: Lang): Promise<AskResult> {
  const cfg = config();
  const form = new FormData();
  form.set('text', text);
  form.set('station', cfg.kioskStation);
  form.set('at', cfg.at);
  form.set('lang', lang);
  return toAskResult(await request<ApiAsk>(cfg, '/voice/ask-text', { method: 'POST', body: form }), cfg);
}

/** Spoken request: speech to text, then the same as aiAskText. */
export async function aiAskAudio(audio: Blob, filename: string, lang: Lang): Promise<AskResult> {
  const cfg = config();
  const form = new FormData();
  form.set('file', audio, filename);
  form.set('station', cfg.kioskStation);
  form.set('at', cfg.at);
  form.set('lang', lang);
  return toAskResult(await request<ApiAsk>(cfg, '/voice/ask', { method: 'POST', body: form }), cfg);
}
