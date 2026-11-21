import { ExploreScreen } from '@/components/screens/ExploreScreen';
import { getWaitScenario } from '@/lib/data';
import { parseScenario } from '@/lib/scenario';

export default async function Page({ searchParams }: PageProps<'/kiosk/wait/explore'>) {
  const scenario = parseScenario(await searchParams);
  return <ExploreScreen wait={await getWaitScenario(scenario.wait, scenario.lang)} scenario={scenario} />;
}
