import { EatScreen } from '@/components/screens/EatScreen';
import { getWaitScenario } from '@/lib/data';
import { parseScenario } from '@/lib/scenario';

export default async function Page({ searchParams }: PageProps<'/kiosk/wait/eat'>) {
  const scenario = parseScenario(await searchParams);
  return <EatScreen wait={await getWaitScenario(scenario.wait)} scenario={scenario} />;
}
