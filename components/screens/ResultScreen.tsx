'use client';

import { formatChanges } from '@/lib/format';
import { withScenario } from '@/lib/scenario';
import type { Connection, Scenario, TripResult } from '@/lib/types';
import { CountdownRing } from '../CountdownRing';
import { KioskFooter, KioskFrame, KioskMain } from '../KioskFrame';
import { KioskHeader } from '../KioskHeader';
import { LineBadge } from '../LineBadge';
import { NavButton } from '../NavButton';
import {
  SbbCard,
  SbbIcon,
  SbbNotification,
  SbbTimetableOccupancy,
  SbbTitle,
} from '../sbb';
import styles from './ResultScreen.module.css';

/** Screen 3 · Your next train. */
export function ResultScreen({ result, scenario }: { result: TripResult; scenario: Scenario }) {
  const { trip, best } = result;
  const planned = trip.plannedTrain;

  return (
    <KioskFrame>
      <KioskHeader
        time={result.now}
        start={
          <NavButton href={withScenario('/kiosk', scenario)} variant="secondary" iconName="arrows-circle-small">
            Start over
          </NavButton>
        }
        center={`${trip.ticket.from.name} → ${trip.ticket.to.name}`}
      />
      <KioskMain>
        <SbbNotification type="error" readOnly animation="none" className={styles.cancelled}>
          <SbbTitle level="1" visualLevel="4" className={styles.cancelledTitle}>
            <LineBadge line={planned.line} size="s" /> Your train at <s>{planned.departure}</s> is cancelled
          </SbbTitle>
          {result.disruption.reason}
        </SbbNotification>

        <section className={styles.section} aria-labelledby="best-train">
          <h2 id="best-train" className={styles.label}>
            Your best next train
          </h2>
          <SbbCard color="white" className={styles.bestCard}>
            <div className={styles.bestTop}>
              <div className={styles.bestLine}>
                <LineBadge line={best.train.line} size="l" />
                <span className={styles.to}>
                  to {best.train.direction ?? best.arrivalStation.name}
                  <SbbTimetableOccupancy secondClassOccupancy={best.occupancy.secondClass} />
                </span>
              </div>
              <div className={styles.bestDeparture}>
                <span className={styles.bigTime}>{best.train.departure}</span>
                <span className={styles.muted}>departs</span>
              </div>
              <CountdownRing minutes={result.minutesToDeparture} />
            </div>

            <dl className={styles.tiles}>
              <div className={styles.tile}>
                <dt>Platform</dt>
                <dd>{best.train.platform}</dd>
              </div>
              <div className={styles.tile}>
                <dt>Arrives {best.arrivalStation.name}</dt>
                <dd>{best.arrival}</dd>
              </div>
              <div className={styles.tile}>
                <dt>vs. your plan</dt>
                <dd className={styles.late}>+{best.delayVsPlanMinutes} min</dd>
              </div>
            </dl>

            <p className={styles.fact}>
              <SbbIcon name="circle-tick-small" className={styles.ok} />
              <span>
                {best.changes === 0 ? 'Direct, no changes.' : `${formatChanges(best.changes)}.`}{' '}
                {best.ticketValid && (
                  <>
                    <strong>Your ticket is valid</strong> on this train.
                  </>
                )}
              </span>
            </p>
            {best.occupancy.secondClass === 'high' && (
              <p className={styles.fact}>
                <SbbIcon name="user-group-small" />
                <span>
                  Expected to be very busy.
                  {best.boardingHint && (
                    <>
                      {' '}
                      Board at the <strong>{best.boardingHint}</strong>.
                    </>
                  )}
                </span>
              </p>
            )}
          </SbbCard>
        </section>

        <section className={styles.section} aria-labelledby="other-options">
          <h2 id="other-options" className={styles.label}>
            Other options
          </h2>
          <ul className={styles.options}>
            {result.alternatives.map((c) => (
              <OptionRow key={c.id} connection={c} />
            ))}
          </ul>
        </section>
      </KioskMain>
      <KioskFooter>
        <div className={styles.actions}>
          <NavButton href={withScenario('/kiosk/wait', scenario)}>
            What can I do in {result.minutesToDeparture} min?
          </NavButton>
          <NavButton href={withScenario('/phone', scenario)} variant="secondary" iconName="smartphone-small">
            Send to my phone
          </NavButton>
        </div>
      </KioskFooter>
    </KioskFrame>
  );
}

function OptionRow({ connection: c }: { connection: Connection }) {
  return (
    <li>
      <SbbCard color="milk" className={styles.option}>
        <div className={styles.optionRow}>
          <span className={styles.optionTime}>{c.train.departure}</span>
          <div className={styles.optionBody}>
            <strong>{c.routeLabel}</strong>
            <span className={styles.muted}>
              {c.tradeOff}: {c.arrivalStation.name} {c.arrival} · {formatChanges(c.changes)}
            </span>
          </div>
          <span className={styles.platform}>Pl. {c.train.platform}</span>
        </div>
      </SbbCard>
    </li>
  );
}
