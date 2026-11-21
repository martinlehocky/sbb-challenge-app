'use client';

import { formatWalk } from '@/lib/format';
import { getMessages } from '@/lib/i18n/messages';
import type { RestKind, RestScenario, Scenario } from '@/lib/types';
import { IconCircle, IdeaCard } from '../IdeaCard';
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
export function RestScreen({ rest, scenario }: { rest: RestScenario; scenario: Scenario }) {
  const t = getMessages(scenario.lang);
  return (
    <WaitIdeasLayout
      scenario={scenario}
      time={rest.now}
      title={rest.title}
      intro={rest.intro}
      returnPlan={rest.returnPlan}
    >
      {rest.options.map((option) => (
        <IdeaCard
          key={option.id}
          media={<IconCircle name={KIND_ICONS[option.kind]} />}
          title={option.name}
          lines={[
            <>
              {option.details.join(' · ')}
              {option.stepFree && (
                <SbbIcon name="wheelchair-small" className={styles.stepFree} />
              )}
            </>,
          ]}
          walk={formatWalk(option.walk, t)}
          note={option.note}
          notePlacement="below"
        />
      ))}
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
