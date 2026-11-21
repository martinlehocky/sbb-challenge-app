import { RestScreen } from '@/components/screens/RestScreen';
import { aiStatus } from '@/lib/ai';
import { getRestScenario } from '@/lib/data';
import { parseScenario } from '@/lib/scenario';

export default async function Page({ searchParams }: PageProps<'/kiosk/wait/rest'>) {
  const scenario = parseScenario(await searchParams);
  const [rest, ai] = await Promise.all([getRestScenario(scenario.time, scenario.lang, scenario.to), aiStatus()]);
  return <RestScreen rest={rest} scenario={scenario} aiEnabled={ai.enabled} />;
}
