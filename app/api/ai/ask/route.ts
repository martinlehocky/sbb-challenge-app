import { aiAskAudio, aiAskText } from '@/lib/ai';
import { aiError, langOf } from '../http';

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

/**
 * POST /api/ai/ask (multipart form): `audio` (a recording) or `text`, plus `lang`.
 * → { transcript, destination: { id, name } | null, problem? }
 */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: 'Expected a multipart form' }, { status: 400 });
  }
  const lang = langOf(form.get('lang'));
  const audio = form.get('audio');
  const text = form.get('text');
  const started = Date.now();
  const withTiming = (r: Awaited<ReturnType<typeof aiAskText>>) =>
    Response.json({ ...r, debug: { ...r.debug, server_ms: Date.now() - started } });
  try {
    if (audio instanceof Blob && audio.size > 0) {
      if (audio.size > MAX_AUDIO_BYTES) return Response.json({ error: 'Recording too long' }, { status: 413 });
      const name = audio instanceof File && audio.name ? audio.name : 'speech.webm';
      return withTiming(await aiAskAudio(audio, name, lang));
    }
    if (typeof text === 'string' && text.trim()) {
      return withTiming(await aiAskText(text.trim().slice(0, 300), lang));
    }
    return Response.json({ error: 'Send audio or text' }, { status: 400 });
  } catch (err) {
    return aiError('AI ask', err);
  }
}
