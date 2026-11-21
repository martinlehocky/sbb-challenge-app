import { aiIdeas, type Interest } from '@/lib/ai';
import { aiError, langOf } from '../http';

const INTERESTS: Interest[] = ['eat', 'explore', 'rest'];

/** GET /api/ai/ideas?interest=eat&lang=en&wait=32 → { ideas: AiIdea[] } */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const interest = params.get('interest') as Interest;
  const wait = Number(params.get('wait'));
  if (!INTERESTS.includes(interest) || !Number.isInteger(wait) || wait < 1 || wait > 600) {
    return Response.json({ error: 'Need interest=eat|explore|rest and wait=1..600' }, { status: 400 });
  }
  try {
    return Response.json({ ideas: await aiIdeas(interest, langOf(params.get('lang')), wait) });
  } catch (err) {
    return aiError('AI ideas', err);
  }
}
