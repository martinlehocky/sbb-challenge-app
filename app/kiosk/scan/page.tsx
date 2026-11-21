import { ScanScreen } from '@/components/screens/ScanScreen';
import { getTripResult } from '@/lib/data';
import { parseScenario } from '@/lib/scenario';

export default async function Page({ searchParams }: PageProps<'/kiosk/scan'>) {
  const scenario = parseScenario(await searchParams);
  const { trip } = await getTripResult(scenario.lang);
  return <ScanScreen trip={trip} scenario={scenario} />;
}
