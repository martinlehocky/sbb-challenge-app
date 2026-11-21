'use client';

import { getMessages } from '@/lib/i18n/messages';
import { withScenario } from '@/lib/scenario';
import type { PhoneTrip, Scenario, UpdateTone } from '@/lib/types';
import { CountdownRing } from '../CountdownRing';
import { LineBadge } from '../LineBadge';
import { NavButton } from '../NavButton';
import { PhoneFrame } from '../PhoneFrame';
import {
  SbbCard,
  SbbIcon,
  SbbLogo,
  SbbNotification,
  SbbSecondaryButton,
  SbbTitle,
} from '../sbb';
import styles from './PhoneScreen.module.css';

const TONE_CLASS: Record<UpdateTone, string> = {
  warning: styles.warning,
  success: styles.success,
  error: styles.error,
};

/** Screen 6 · Live updates on phone. */
export function PhoneScreen({ trip, scenario }: { trip: PhoneTrip; scenario: Scenario }) {
  const { latest, train } = trip;
  const t = getMessages(scenario.lang);
  return (
    <PhoneFrame lang={scenario.lang}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>{t.phone.tripToday}</p>
          <SbbTitle level="1" visualLevel="4" className={styles.route}>
            {trip.from.name} → {trip.to.name}
          </SbbTitle>
        </div>
        <SbbLogo protectiveRoom="none" className={styles.logo} />
      </header>

      <main className={styles.main}>
        <div aria-live="polite">
          <SbbNotification type="warn" readOnly animation="none" className={styles.update}>
            <SbbIcon slot="icon" name="bell-small" />
            <span className={styles.updateLabel}>{t.phone.newUpdate(latest.time)}</span>
            <strong className={styles.updateHeadline}>{latest.headline}</strong>
            <span className={styles.updateText}>{t.phone.updateText(latest.platform, latest.headBackBy)}</span>
          </SbbNotification>
        </div>

        <SbbCard color="white" className={styles.trainCard}>
          <div className={styles.trainRow}>
            <div className={styles.trainInfo}>
              <span className={styles.trainLine}>
                <LineBadge line={train.line} size="s" /> {t.phone.to(train.direction)}
              </span>
              <span className={styles.trainTime}>
                <strong>{train.departure}</strong>
                {train.plannedDeparture && (
                  <s aria-label={t.phone.was(train.plannedDeparture)}>{train.plannedDeparture}</s>
                )}
              </span>
              <span className={styles.muted}>
                {t.phone.platformArrives(train.platform, train.arrivalStation.name, train.arrival)}
              </span>
            </div>
            <CountdownRing minutes={train.minutesToDeparture} t={t} size="s" />
          </div>
        </SbbCard>

        <section aria-labelledby="timeline-title" className={styles.section}>
          <h2 id="timeline-title" className={styles.label}>
            {t.phone.timeline}
          </h2>
          <ol className={styles.timeline}>
            {trip.timeline.map((u) => (
              <li key={u.id} className={styles.event}>
                <span className={`${styles.dot} ${TONE_CLASS[u.tone]}`} aria-hidden="true" />
                <time className={styles.eventTime}>{u.time}</time>
                <span>{u.text}</span>
              </li>
            ))}
          </ol>
        </section>

        <SbbCard color="milk" className={styles.watching}>
          <p className={styles.label}>{t.phone.watching}</p>
          <p className={styles.watchingText}>{t.phone.watchingText}</p>
        </SbbCard>

        <div className={styles.actions}>
          <NavButton href={withScenario('/kiosk/wait', scenario)} size="m" className={styles.fullWidth}>
            {t.phone.seeThings}
          </NavButton>
          <SbbSecondaryButton size="m" className={styles.fullWidth}>
            {t.phone.stopUpdates}
          </SbbSecondaryButton>
        </div>
      </main>
    </PhoneFrame>
  );
}
