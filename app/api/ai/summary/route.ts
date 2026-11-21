import { aiSummary } from '@/lib/ai';
import { aiError, langOf } from '../http';

/** GET /api/ai/summary?lang=de&to=8507000 → { text } (plain-language advice for the trip) */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const to = params.get('to');
  try {
    const text = await aiSummary(langOf(params.get('lang')), to && /^\d{7}$/.test(to) ? to : undefined);
    return Response.json({ text });
  } catch (err) {
    return aiError('AI summary', err);
  }
}
