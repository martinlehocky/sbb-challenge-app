'use client';

import { formatWalk } from '@/lib/format';
import type { Scenario, WaitScenario } from '@/lib/types';
import { IdeaCard } from '../IdeaCard';
import { PhotoBox } from '../PhotoBox';
import { WaitIdeasLayout } from '../WaitIdeasLayout';

/** Screen 5b · Have a look around. */
export function ExploreScreen({ wait, scenario }: { wait: WaitScenario; scenario: Scenario }) {
  return (
    <WaitIdeasLayout
      scenario={scenario}
      time="11:05"
      title="Have a look around"
      intro={wait.explore.intro}
      returnPlan={wait.returnPlan}
    >
      {wait.explore.places.map(({ place, backBy }) => (
        <IdeaCard
          key={place.id}
          media={<PhotoBox photo={place.photo} />}
          title={place.name}
          lines={[place.history]}
          walk={formatWalk(place.walk)}
          note={`Back by ${backBy}`}
          notePlacement="below"
        />
      ))}
    </WaitIdeasLayout>
  );
}
