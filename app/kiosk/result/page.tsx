import { ResultScreen } from '@/components/screens/ResultScreen';
import { aiStatus } from '@/lib/ai';
import { getTripResult } from '@/lib/data';
import { parseScenario } from '@/lib/scenario';

export default async function Page({ searchParams }: PageProps<'/kiosk/result'>) {
  const scenario = parseScenario(await searchParams);
  const [result, ai] = await Promise.all([getTripResult(scenario.lang, scenario.to, scenario.dep), aiStatus()]);
  return <ResultScreen result={result} scenario={scenario} aiEnabled={ai.enabled} />;
}
