'use client';

import type { ReactNode } from 'react';
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
  return (
    <KioskFrame>
      <KioskHeader
        time={time}
        start={
          <NavButton
            href={withScenario('/kiosk/wait', scenario)}
            variant="secondary"
            iconName="chevron-small-left-small"
          >
            Choose something else
          </NavButton>
        }
      />
      <KioskMain>
        <ScreenIntro title={title} lead={intro} />
        <ul className={styles.list}>{children}</ul>
      </KioskMain>
      <KioskFooter>
        <BeBackBox plan={returnPlan} />
        <NavButton href={withScenario('/kiosk/result', scenario)} className={styles.fullWidth}>
          Back to my train
        </NavButton>
      </KioskFooter>
    </KioskFrame>
  );
}
