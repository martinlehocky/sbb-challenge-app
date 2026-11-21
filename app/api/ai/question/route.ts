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

/**
 * POST /api/ai/question (multipart form): `audio` (a recording) or `text`, plus `lang`, and for a question
 * about the traveller's trip `about=trip` with optional `to` (their destination; default the ticket's).
 * Chat: `history` (JSON list of {role: "traveller"|"kiosk", text}) and `context` (destination already discussed).
 * → { question, answer, answered, tripDestination, debug }
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
  // about=trip: the question is about the traveller's journey (ticket destination if no `to`).
  const trip = form.get('about') === 'trip' ? { destination } : undefined;
  // Chat: earlier turns (JSON) and the destination already discussed, so follow-ups are understood.
  const chat = { history: parseHistory(form.get('history')), contextDestination: stationId(form.get('context')) };
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
