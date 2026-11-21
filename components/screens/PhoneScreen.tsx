'use client';

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
  return (
    <PhoneFrame>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Your trip today</p>
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
            <span className={styles.updateLabel}>New update · {latest.time}</span>
            <strong className={styles.updateHeadline}>{latest.headline}</strong>
            <span className={styles.updateText}>
              Still platform {latest.platform}. You can stay a bit longer: head back by{' '}
              <strong>{latest.headBackBy}</strong>.
            </span>
          </SbbNotification>
        </div>

        <SbbCard color="white" className={styles.trainCard}>
          <div className={styles.trainRow}>
            <div className={styles.trainInfo}>
              <span className={styles.trainLine}>
                <LineBadge line={train.line} size="s" /> to {train.direction}
              </span>
              <span className={styles.trainTime}>
                <strong>{train.departure}</strong>
                {train.plannedDeparture && (
                  <s aria-label={`was ${train.plannedDeparture}`}>{train.plannedDeparture}</s>
                )}
              </span>
              <span className={styles.muted}>
                Platform {train.platform} · arrives {train.arrivalStation.name} {train.arrival}
              </span>
            </div>
            <CountdownRing minutes={train.minutesToDeparture} size="s" />
          </div>
        </SbbCard>

        <section aria-labelledby="timeline-title" className={styles.section}>
          <h2 id="timeline-title" className={styles.label}>
            What happened so far
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
          <p className={styles.label}>We&apos;re watching for you</p>
          <p className={styles.watchingText}>
            If the line reopens earlier or your platform changes, you&apos;ll get a message straight away.
          </p>
        </SbbCard>

        <div className={styles.actions}>
          <NavButton href={withScenario('/kiosk/wait', scenario)} size="m" className={styles.fullWidth}>
            See things to do nearby
          </NavButton>
          <SbbSecondaryButton size="m" className={styles.fullWidth}>
            Stop updates
          </SbbSecondaryButton>
        </div>
      </main>
    </PhoneFrame>
  );
}
