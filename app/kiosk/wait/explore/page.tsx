import { ExploreScreen } from '@/components/screens/ExploreScreen';
import { aiStatus } from '@/lib/ai';
import { getWaitScenario } from '@/lib/data';
import { minutesBetween } from '@/lib/format';
import { nearbyPlaces } from '@/lib/places';
import { parseScenario } from '@/lib/scenario';

export default async function Page({ searchParams }: PageProps<'/kiosk/wait/explore'>) {
  const scenario = parseScenario(await searchParams);
  const [wait, ai] = await Promise.all([getWaitScenario(scenario.wait, scenario.lang, scenario.to, scenario.dep), aiStatus()]);
  // Real places from Google (backend mode with a key) that fit the time until the back-by time.
  const minutes = wait.now ? minutesBetween(wait.now, wait.returnPlan.backBy) : wait.waitMinutes;
  const places = await nearbyPlaces('explore', scenario.lang, minutes);
  return <ExploreScreen wait={wait} scenario={scenario} aiEnabled={ai.enabled} googlePlaces={places} />;
}
