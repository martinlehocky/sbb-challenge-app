'use client';

import { formatWalk } from '@/lib/format';
import type { Scenario, WaitScenario } from '@/lib/types';
import { IdeaCard } from '../IdeaCard';
import { WaitIdeasLayout } from '../WaitIdeasLayout';

/** Screen 5 · Ideas for your wait: eat or drink. */
export function EatScreen({ wait, scenario }: { wait: WaitScenario; scenario: Scenario }) {
  return (
    <WaitIdeasLayout
      scenario={scenario}
      time="11:05"
      title="Eat or drink something"
      intro="All of these are close by. The time to walk back is already counted."
      returnPlan={wait.returnPlan}
    >
      {wait.eat.map((idea) => (
        <IdeaCard
          key={idea.id}
          title={idea.title}
          lines={[idea.location]}
          walk={formatWalk(idea.walk)}
          note={`Back by ${idea.backBy}`}
        />
      ))}
    </WaitIdeasLayout>
  );
}
