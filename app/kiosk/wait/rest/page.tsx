import { RestScreen } from '@/components/screens/RestScreen';
import { getRestScenario } from '@/lib/data';
import { parseScenario } from '@/lib/scenario';

export default async function Page({ searchParams }: PageProps<'/kiosk/wait/rest'>) {
  const scenario = parseScenario(await searchParams);
  return <RestScreen rest={await getRestScenario(scenario.time)} scenario={scenario} />;
}
