import { AskScreen } from '@/components/screens/AskScreen';
import { getNow } from '@/lib/data';
import { parseScenario } from '@/lib/scenario';

export default async function Page({ searchParams }: PageProps<'/kiosk/ask'>) {
  const params = await searchParams;
  const scenario = parseScenario(params);
  // Debug panel (what the AI detected) is shown unless ?debug=0.
  const debug = params.debug !== '0';
  return <AskScreen now={getNow()} scenario={{ ...scenario, to: undefined }} debug={debug} />;
}
