'use client';

import { formatWalk } from '@/lib/format';
import { getMessages } from '@/lib/i18n/messages';
import type { Scenario, WaitScenario } from '@/lib/types';
import { IdeaCard } from '../IdeaCard';
import { PhotoBox } from '../PhotoBox';
import { WaitIdeasLayout } from '../WaitIdeasLayout';

/** Screen 5b · Have a look around. */
export function ExploreScreen({ wait, scenario }: { wait: WaitScenario; scenario: Scenario }) {
  const t = getMessages(scenario.lang);
  return (
    <WaitIdeasLayout
      scenario={scenario}
      time="11:05"
      title={t.wait.explore.title}
      intro={wait.explore.intro}
      returnPlan={wait.returnPlan}
    >
      {wait.explore.places.map(({ place, backBy }) => (
        <IdeaCard
          key={place.id}
          media={<PhotoBox photo={place.photo} />}
          title={place.name}
          lines={[place.history]}
          walk={formatWalk(place.walk, t)}
          note={t.common.backBy(backBy)}
          notePlacement="below"
        />
      ))}
    </WaitIdeasLayout>
  );
}
