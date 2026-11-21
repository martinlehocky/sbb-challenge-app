import { AiUnavailableError } from '@/lib/ai';
import { LANGS } from '@/lib/scenario';
import type { Lang } from '@/lib/types';

export function langOf(value: unknown): Lang {
  return LANGS.includes(value as Lang) ? (value as Lang) : 'en';
}

/** JSON error: 503 when AI is off or unreachable, 502 when the AI or backend failed. */
export function aiError(what: string, err: unknown): Response {
  if (err instanceof AiUnavailableError) {
    return Response.json({ error: 'AI is not available', detail: err.message }, { status: 503 });
  }
  console.error(`[ai] ${what} failed:`, err);
  return Response.json({ error: `${what} failed`, detail: (err as Error).message }, { status: 502 });
}
