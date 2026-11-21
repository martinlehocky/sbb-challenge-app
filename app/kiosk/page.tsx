import { WelcomeScreen } from '@/components/screens/WelcomeScreen';
import { getWelcome } from '@/lib/data';
import { parseScenario } from '@/lib/scenario';

export default async function Page({ searchParams }: PageProps<'/kiosk'>) {
  const scenario = parseScenario(await searchParams);
  return <WelcomeScreen info={await getWelcome(scenario.lang)} scenario={scenario} />;
}
