'use client';

import { formatWalk, minutesBetween } from '@/lib/format';
import { getMessages } from '@/lib/i18n/messages';
import type { RestKind, RestOption, RestScenario, Scenario } from '@/lib/types';
import { AiIdeas } from '../ai/AiIdeas';
import { IconCircle, IdeaCard } from '../IdeaCard';
import { LittleTimeNotice } from '../LittleTimeNotice';
import { SbbIcon, SbbNotification, SbbTitle } from '../sbb';
import { WaitIdeasLayout } from '../WaitIdeasLayout';
import styles from './RestScreen.module.css';

const KIND_ICONS: Record<RestKind, string> = {
  seat: 'armchair-medium',
  cafe: 'cup-hot-medium',
  park: 'building-tree-medium',
  hotel: 'bed-medium',
};

/** Screen 5c · Sit down and rest (changes with the time of day). */
/**
 * During the day, with AI on, the screen shows 2 hand-written ideas plus 1 AI idea; the 3rd hand-written idea
 * comes back if the AI has nothing that fits.
 */
export function RestScreen({
  rest,
  scenario,
  aiEnabled = false,
}: {
  rest: RestScenario;
  scenario: Scenario;
  aiEnabled?: boolean;
}) {
  const t = getMessages(scenario.lang);
  const withAi = aiEnabled && rest.time === 'day';
  const card = (option: RestOption) => (
    <IdeaCard
      key={option.id}
      media={<IconCircle name={KIND_ICONS[option.kind]} />}
      title={option.name}
      lines={[
        <>
          {option.details.join(' · ')}
          {option.stepFree && <SbbIcon name="wheelchair-small" className={styles.stepFree} />}
        </>,
      ]}
      walk={formatWalk(option.walk, t)}
      note={option.note}
      notePlacement="below"
    />
  );
  const shown = withAi ? rest.options.slice(0, 2) : rest.options;
  return (
    <WaitIdeasLayout
      scenario={scenario}
      time={rest.now}
      title={rest.title}
      intro={rest.intro}
      returnPlan={rest.returnPlan}
    >
      {shown.map(card)}
      {rest.options.length === 0 && (
        <LittleTimeNotice text={t.wait.littleTime(rest.returnPlan.train.platform)} />
      )}
      {withAi && (
        <AiIdeas
          interest="rest"
          lang={scenario.lang}
          minutes={minutesBetween(rest.now, rest.returnPlan.backBy)}
          backBy={rest.returnPlan.backBy}
          slots={3 - shown.length}
          fallback={rest.options.slice(shown.length).map(card)}
        />
      )}
      {rest.help && (
        <li className={styles.help}>
          <SbbNotification type="info" readOnly animation="none" className={styles.helpBox}>
            <SbbTitle level="2" visualLevel="6">
              {rest.help.title}
            </SbbTitle>
            {rest.help.text}
          </SbbNotification>
        </li>
      )}
    </WaitIdeasLayout>
  );
}
