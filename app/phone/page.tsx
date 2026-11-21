import { PhoneScreen } from '@/components/screens/PhoneScreen';
import { getPhoneTrip } from '@/lib/data';
import { parseScenario } from '@/lib/scenario';

export default async function Page({ searchParams }: PageProps<'/phone'>) {
  const scenario = parseScenario(await searchParams);
  return <PhoneScreen trip={await getPhoneTrip()} scenario={scenario} />;
}
