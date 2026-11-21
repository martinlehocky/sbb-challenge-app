'use client';

import type { ReactNode } from 'react';
import { getMessages } from '@/lib/i18n/messages';
import { withScenario } from '@/lib/scenario';
import type { ReturnPlan, Scenario } from '@/lib/types';
import { BeBackBox } from './BeBackBox';
import { KioskFooter, KioskFrame, KioskMain } from './KioskFrame';
import { KioskHeader } from './KioskHeader';
import { NavButton } from './NavButton';
import { ScreenIntro } from './ScreenIntro';
import styles from './WaitIdeasLayout.module.css';

/** Shared layout of screens 5, 5b and 5c. */
export function WaitIdeasLayout({
  scenario,
  time,
  title,
  intro,
  returnPlan,
  children,
}: {
  scenario: Scenario;
  time: string;
  title: string;
  intro: string;
  returnPlan: ReturnPlan;
  children: ReactNode;
}) {
  const t = getMessages(scenario.lang);
  return (
    <KioskFrame lang={scenario.lang}>
      <KioskHeader
        time={time}
        start={
          <NavButton
            href={withScenario('/kiosk/wait', scenario)}
            variant="secondary"
            iconName="chevron-small-left-small"
          >
            {t.common.chooseElse}
          </NavButton>
        }
      />
      <KioskMain>
        <ScreenIntro title={title} lead={intro} />
        <ul className={styles.list}>{children}</ul>
      </KioskMain>
      <KioskFooter>
        <BeBackBox plan={returnPlan} lang={scenario.lang} />
        <NavButton href={withScenario('/kiosk/result', scenario)} className={styles.fullWidth}>
          {t.common.backToTrain}
        </NavButton>
      </KioskFooter>
    </KioskFrame>
  );
}
