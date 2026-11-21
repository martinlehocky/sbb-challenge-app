'use client';

import { formatWalk, minutesBetween } from '@/lib/format';
import { getMessages } from '@/lib/i18n/messages';
import type { Idea, Scenario, WaitScenario } from '@/lib/types';
import { AiIdeas } from '../ai/AiIdeas';
import { IdeaCard } from '../IdeaCard';
import { LittleTimeNotice } from '../LittleTimeNotice';
import { WaitIdeasLayout } from '../WaitIdeasLayout';

/** Screen 5 · Ideas for your wait: eat or drink. */
/**
 * With AI on, the screen shows 2 hand-written ideas plus 1 AI idea; the 3rd hand-written idea
 * comes back if the AI has nothing that fits.
 */
export function EatScreen({
  wait,
  scenario,
  aiEnabled = false,
}: {
  wait: WaitScenario;
  scenario: Scenario;
  aiEnabled?: boolean;
}) {
  const t = getMessages(scenario.lang);
  const card = (idea: Idea) => (
    <IdeaCard
      key={idea.id}
      title={idea.title}
      lines={[idea.location]}
      walk={formatWalk(idea.walk, t)}
      note={t.common.backBy(idea.backBy)}
    />
  );
  const shown = aiEnabled ? wait.eat.slice(0, 2) : wait.eat;
  return (
    <WaitIdeasLayout
      scenario={scenario}
      time={wait.now ?? '11:05'}
      title={t.wait.eat.title}
      intro={t.eat.intro}
      returnPlan={wait.returnPlan}
    >
      {shown.map(card)}
      {wait.eat.length === 0 && (
        <LittleTimeNotice text={t.wait.littleTime(wait.returnPlan.train.platform)} />
      )}
      {aiEnabled && (
        <AiIdeas
          interest="eat"
          lang={scenario.lang}
          minutes={wait.now ? minutesBetween(wait.now, wait.returnPlan.backBy) : wait.waitMinutes}
          backBy={wait.returnPlan.backBy}
          slots={3 - shown.length}
          fallback={wait.eat.slice(shown.length).map(card)}
        />
      )}
    </WaitIdeasLayout>
  );
}
