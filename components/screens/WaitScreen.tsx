'use client';

import { getMessages } from '@/lib/i18n/messages';
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
  { key: 'eat', path: '/kiosk/wait/eat', icon: 'cup-hot-medium' },
  { key: 'explore', path: '/kiosk/wait/explore', icon: 'compass-localisation-medium' },
  { key: 'rest', path: '/kiosk/wait/rest', icon: 'armchair-medium' },
] as const;

/** Screen 4 · What would you like to do? */
export function WaitScreen({ wait, scenario }: { wait: WaitScenario; scenario: Scenario }) {
  const t = getMessages(scenario.lang);
  return (
    <KioskFrame lang={scenario.lang}>
      <KioskHeader
        time="11:05"
        start={
          <NavButton
            href={withScenario('/kiosk/result', scenario)}
            variant="secondary"
            iconName="chevron-small-left-small"
          >
            {t.common.back}
          </NavButton>
        }
      />
      <KioskMain className={styles.main}>
        <ScreenIntro
          title={t.wait.youHave(wait.waitMinutes)}
          lead={<strong className={styles.question}>{t.wait.question}</strong>}
        />
        <ul className={styles.choices}>
          {CHOICES.map((choice) => (
            <ChoiceCard
              key={choice.key}
              icon={choice.icon}
              title={t.wait[choice.key].title}
              text={t.wait[choice.key].text}
              href={withScenario(choice.path, scenario)}
            />
          ))}
        </ul>
      </KioskMain>
      <KioskFooter>
        <BeBackBox plan={wait.returnPlan} lang={scenario.lang} variant="platform" />
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
