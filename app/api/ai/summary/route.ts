import { aiSummary } from '@/lib/ai';
import { aiError, langOf } from '../http';

/** GET /api/ai/summary?lang=de&to=8507000&dep=11:32 → { text } (plain-language advice for the trip; `dep` = the
 * train the traveller picked) */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const to = params.get('to');
  const dep = params.get('dep');
  try {
    const text = await aiSummary(
      langOf(params.get('lang')),
      to && /^\d{7}$/.test(to) ? to : undefined,
      dep && /^([01]\d|2[0-3]):[0-5]\d$/.test(dep) ? dep : undefined,
    );
    return Response.json({ text });
  } catch (err) {
    return aiError('AI summary', err);
  }
}
