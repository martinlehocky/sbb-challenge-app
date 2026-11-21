import { ExploreScreen } from '@/components/screens/ExploreScreen';
import { aiStatus } from '@/lib/ai';
import { getWaitScenario } from '@/lib/data';
import { parseScenario } from '@/lib/scenario';

export default async function Page({ searchParams }: PageProps<'/kiosk/wait/explore'>) {
  const scenario = parseScenario(await searchParams);
  const [wait, ai] = await Promise.all([getWaitScenario(scenario.wait, scenario.lang, scenario.to), aiStatus()]);
  return <ExploreScreen wait={wait} scenario={scenario} aiEnabled={ai.enabled} />;
}
