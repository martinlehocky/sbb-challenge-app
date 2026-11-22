import { aiQuestion, cleanChat, type ChatTurn } from '@/lib/ai';
import { aiError, langOf } from '../http';

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

/** `history` form field: JSON list of {role, text}; anything malformed is ignored. */
function parseHistory(value: FormDataEntryValue | null): ChatTurn[] {
  if (typeof value !== 'string' || !value) return [];
  try {
    return cleanChat(JSON.parse(value));
  } catch {
    return [];
  }
}

/** A 7-digit station number, else undefined. */
function stationId(value: FormDataEntryValue | null): string | undefined {
  return typeof value === 'string' && /^\d{7}$/.test(value) ? value : undefined;
}

/** `context_via`: JSON list of station numbers (at most 3), else empty. */
function stationIds(value: FormDataEntryValue | null): string[] {
  if (typeof value !== 'string' || !value) return [];
  try {
    const ids: unknown = JSON.parse(value);
    if (!Array.isArray(ids) || ids.length > 3) return [];
    return ids.every((id) => typeof id === 'string' && /^\d{7}$/.test(id)) ? (ids as string[]) : [];
  } catch {
    return [];
  }
}

/** `context_stays`: JSON list of minutes or null; anything else counts as "not said". */
function stays(value: FormDataEntryValue | null): (number | null)[] {
  if (typeof value !== 'string' || !value) return [];
  try {
    const list: unknown = JSON.parse(value);
    return Array.isArray(list) ? list.slice(0, 3).map((x) => (stayMinutes(x) ?? null)) : [];
  } catch {
    return [];
  }
}

/** A stay of 5 minutes to 12 hours, else undefined. */
function stayMinutes(value: unknown): number | undefined {
  const n = typeof value === 'string' && /^\d{1,3}$/.test(value) ? Number(value) : value;
  return typeof n === 'number' && Number.isInteger(n) && n >= 5 && n <= 720 ? n : undefined;
}

/**
 * POST /api/ai/question (multipart form): `audio` (a recording) or `text`, plus `lang`, and for a question
 * about the traveller's trip `about=trip` with optional `to` (their destination; default the ticket's).
 * Chat: `history` (JSON list of {role: "traveller"|"kiosk", text}), `context` (destination already discussed)
 * and `context_origin` (its start station, when it is not the kiosk); a trip with stops on the way adds
 * `context_via` (JSON list of station numbers) and `context_stays` (JSON list of minutes or null), and a stay
 * picked with a button is `stay` (minutes).
 * → { question, answer, answered, tripDestination, context, route, debug }; `context` = the trip this answer was
 * about, `route` = every part of a trip with stops (with the stay question and ideas).
 */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: 'Expected a multipart form' }, { status: 400 });
  }
  const lang = langOf(form.get('lang'));
  const to = form.get('to');
  const destination = typeof to === 'string' && /^\d{7}$/.test(to) ? to : undefined;
  const depValue = form.get('dep');
  const dep = typeof depValue === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(depValue) ? depValue : undefined;
  // about=trip: the question is about the traveller's journey (ticket destination if no `to`), and `dep` is the
  // train they picked on the result screen.
  const trip = form.get('about') === 'trip' ? { destination, departure: dep } : undefined;
  // Chat: earlier turns (JSON) and the trip already discussed, so follow-ups are understood.
  const chat = {
    history: parseHistory(form.get('history')),
    contextDestination: stationId(form.get('context')),
    contextOrigin: stationId(form.get('context_origin')),
    contextVia: stationIds(form.get('context_via')),
    contextStays: stays(form.get('context_stays')),
    stay: stayMinutes(form.get('stay')),
  };
  const audio = form.get('audio');
  const text = form.get('text');
  const started = Date.now();
  try {
    let result;
    if (audio instanceof Blob && audio.size > 0) {
      if (audio.size > MAX_AUDIO_BYTES) return Response.json({ error: 'Recording too long' }, { status: 413 });
      const filename = audio instanceof File && audio.name ? audio.name : 'speech.webm';
      result = await aiQuestion({ audio, filename }, lang, trip, chat);
    } else if (typeof text === 'string' && text.trim()) {
      result = await aiQuestion({ text: text.trim().slice(0, 500) }, lang, trip, chat);
    } else {
      return Response.json({ error: 'Send audio or text' }, { status: 400 });
    }
    return Response.json({ ...result, debug: { ...result.debug, server_ms: Date.now() - started } });
  } catch (err) {
    return aiError('AI question', err);
  }
}
