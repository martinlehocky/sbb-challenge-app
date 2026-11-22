import { AskScreen } from '@/components/screens/AskScreen';
import { getNow } from '@/lib/data';
import { parseScenario } from '@/lib/scenario';

/**
 * /kiosk/ask: ask a question by voice or text.
 * ?about=trip (from the result screen): the question is about the traveller's journey (?to= = destination).
 * The debug panel (what the AI detected) is hidden; ?debug=1 shows it.
 */
export default async function Page({ searchParams }: PageProps<'/kiosk/ask'>) {
  const params = await searchParams;
  const scenario = parseScenario(params);
  const aboutTrip = params.about === 'trip';
  const debug = params.debug === '1';
  return (
    <AskScreen
      now={getNow()}
      scenario={aboutTrip ? scenario : { ...scenario, to: undefined, dep: undefined }}
      aboutTrip={aboutTrip}
      debug={debug}
    />
  );
}
