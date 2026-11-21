import { aiStatus } from '@/lib/ai';

/** GET /api/ai/status → { enabled, reason? } */
export async function GET() {
  return Response.json(await aiStatus());
}
