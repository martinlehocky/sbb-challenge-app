'use client';

import { withScenario } from '@/lib/scenario';
import type { Scenario, WaitScenario } from '@/lib/types';
import { BeBackBox } from '../BeBackBox';
import { KioskFooter, KioskFrame, KioskMain } from '../KioskFrame';
import { KioskHeader } from '../KioskHeader';
import { NavButton } from '../NavButton';
import { ScreenIntro } from '../ScreenIntro';
import { SbbCard, SbbCardLink, SbbIcon, SbbTitle } from '../sbb';
import { useClientNav } from '../useClientNav';
import styles from './WaitScreen.module.css';

const CHOICES = [
  {
    path: '/kiosk/wait/eat',
    icon: 'cup-hot-medium',
    title: 'Eat or drink something',
    text: 'Coffee, a snack or a meal',
  },
  {
    path: '/kiosk/wait/explore',
    icon: 'compass-localisation-medium',
    title: 'Have a look around',
    text: 'A short walk near the station',
  },
  {
    path: '/kiosk/wait/rest',
    icon: 'armchair-medium',
    title: 'Sit down and rest',
    text: 'A quiet seat, or a hotel if it gets late',
  },
] as const;

/** Screen 4 · What would you like to do? */
export function WaitScreen({ wait, scenario }: { wait: WaitScenario; scenario: Scenario }) {
  return (
    <KioskFrame>
      <KioskHeader
        time="11:05"
        start={
          <NavButton
            href={withScenario('/kiosk/result', scenario)}
            variant="secondary"
            iconName="chevron-small-left-small"
          >
            Back
          </NavButton>
        }
      />
      <KioskMain className={styles.main}>
        <ScreenIntro
          title={`You have ${wait.waitMinutes} minutes`}
          lead={<strong className={styles.question}>What would you like to do?</strong>}
        />
        <ul className={styles.choices}>
          {CHOICES.map((choice) => (
            <ChoiceCard key={choice.path} {...choice} href={withScenario(choice.path, scenario)} />
          ))}
        </ul>
      </KioskMain>
      <KioskFooter>
        <BeBackBox plan={wait.returnPlan} variant="platform" />
      </KioskFooter>
    </KioskFrame>
  );
}

function ChoiceCard({
  href,
  icon,
  title,
  text,
}: {
  href: string;
  icon: string;
  title: string;
  text: string;
}) {
  const onClick = useClientNav(href);
  return (
    <li>
      <SbbCard color="white" className={styles.choice}>
        <SbbCardLink href={href} onClick={onClick}>
          {title}
        </SbbCardLink>
        <div className={styles.choiceRow}>
          <span className={styles.iconCircle}>
            <SbbIcon name={icon} />
          </span>
          <span className={styles.choiceText}>
            <SbbTitle level="2" visualLevel="3" className={styles.choiceTitle}>
              {title}
            </SbbTitle>
            <span className={styles.choiceSub}>{text}</span>
          </span>
          <SbbIcon name="chevron-small-right-medium" className={styles.chevron} />
        </div>
      </SbbCard>
    </li>
  );
}
