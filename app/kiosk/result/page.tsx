import { ResultScreen } from '@/components/screens/ResultScreen';
import { getTripResult } from '@/lib/data';
import { parseScenario } from '@/lib/scenario';

export default async function Page({ searchParams }: PageProps<'/kiosk/result'>) {
  const scenario = parseScenario(await searchParams);
  return <ResultScreen result={await getTripResult(scenario.lang)} scenario={scenario} />;
}
