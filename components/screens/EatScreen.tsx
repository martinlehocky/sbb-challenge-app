'use client';

import { formatWalk } from '@/lib/format';
import { getMessages } from '@/lib/i18n/messages';
import type { Scenario, WaitScenario } from '@/lib/types';
import { IdeaCard } from '../IdeaCard';
import { WaitIdeasLayout } from '../WaitIdeasLayout';

/** Screen 5 · Ideas for your wait: eat or drink. */
export function EatScreen({ wait, scenario }: { wait: WaitScenario; scenario: Scenario }) {
  const t = getMessages(scenario.lang);
  return (
    <WaitIdeasLayout
      scenario={scenario}
      time={wait.now ?? '11:05'}
      title={t.wait.eat.title}
      intro={t.eat.intro}
      returnPlan={wait.returnPlan}
    >
      {wait.eat.map((idea) => (
        <IdeaCard
          key={idea.id}
          title={idea.title}
          lines={[idea.location]}
          walk={formatWalk(idea.walk, t)}
          note={t.common.backBy(idea.backBy)}
        />
      ))}
    </WaitIdeasLayout>
  );
}
