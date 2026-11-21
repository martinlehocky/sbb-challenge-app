import { WaitScreen } from '@/components/screens/WaitScreen';
import { getWaitScenario } from '@/lib/data';
import { parseScenario } from '@/lib/scenario';

export default async function Page({ searchParams }: PageProps<'/kiosk/wait'>) {
  const scenario = parseScenario(await searchParams);
  return <WaitScreen wait={await getWaitScenario(scenario.wait, scenario.lang, scenario.to)} scenario={scenario} />;
}
