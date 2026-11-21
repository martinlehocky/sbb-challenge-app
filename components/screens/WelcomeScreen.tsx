'use client';

import { withScenario } from '@/lib/scenario';
import type { Scenario, WelcomeInfo } from '@/lib/types';
import { KioskFooter, KioskFrame, KioskMain } from '../KioskFrame';
import { KioskHeader } from '../KioskHeader';
import { NavButton } from '../NavButton';
import { ScreenIntro } from '../ScreenIntro';
import {
  SbbAlert,
  SbbAlertGroup,
  SbbIcon,
  SbbLogo,
  SbbSecondaryButton,
  SbbTag,
  SbbTagGroup,
  SbbTitle,
} from '../sbb';
import styles from './WelcomeScreen.module.css';

const LANGUAGES = ['EN', 'FR', 'DE', 'IT'] as const;

/** Screen 1 · Welcome / idle. */
export function WelcomeScreen({ info, scenario }: { info: WelcomeInfo; scenario: Scenario }) {
  return (
    <KioskFrame>
      <KioskHeader
        time={info.now}
        start={
          <div className={styles.brand}>
            <SbbLogo protectiveRoom="none" className={styles.logo} />
            <span className={styles.product}>Travel assistant</span>
          </div>
        }
        end={
          <SbbTagGroup size="s" accessibilityLabel="Language" className={styles.languages}>
            {LANGUAGES.map((lang) => (
              <SbbTag key={lang} value={lang} checked={lang === 'EN'}>
                {lang}
              </SbbTag>
            ))}
          </SbbTagGroup>
        }
      />
      <KioskMain className={styles.main}>
        <SbbAlertGroup accessibilityTitle="Disruptions" accessibilityTitleLevel="2" className={styles.alerts}>
          {info.disruptions.map((d) => (
            <SbbAlert key={d.id} size="l" readOnly iconName="disruption" animation="none">
              <SbbTitle level="2" visualLevel="4">
                {d.title}
              </SbbTitle>
              {d.summary} <span className={styles.updated}>Updated {d.updatedAt}</span>
            </SbbAlert>
          ))}
        </SbbAlertGroup>

        <div className={styles.hero}>
          <ScreenIntro
            align="center"
            title="Train cancelled? Let's find your next move."
            lead="Scan your ticket. We check your journey and show you the next train you can take."
          />

          <figure className={styles.illustration}>
            <SbbIcon name="arrow-up-large" className={styles.arrow} />
            <div className={styles.ticket} aria-hidden="true">
              <SbbIcon name="qrcode-large" className={styles.qr} />
              <span className={styles.ticketLines}>
                <span />
                <span />
                <span />
              </span>
            </div>
            <figcaption className={styles.caption}>Paper ticket, SwissPass or SBB app code</figcaption>
          </figure>
        </div>
      </KioskMain>
      <KioskFooter>
        <NavButton href={withScenario('/kiosk/scan', scenario)} iconName="qrcode-small" className={styles.fullWidth}>
          Scan my ticket
        </NavButton>
        <SbbSecondaryButton size="l" className={styles.fullWidth}>
          No ticket? Type your destination
        </SbbSecondaryButton>
        <p className={styles.staff}>
          <SbbIcon name="circle-information-small" />
          Prefer to talk to someone? Staff are at the info point in the main hall.
        </p>
      </KioskFooter>
    </KioskFrame>
  );
}
