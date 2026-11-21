'use client';

import { getMessages, type Messages } from '@/lib/i18n/messages';
import { withScenario } from '@/lib/scenario';
import type { Connection, Scenario, TripResult } from '@/lib/types';
import { AiSummary } from '../ai/AiSummary';
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
export function ResultScreen({
  result,
  scenario,
  aiEnabled = false,
}: {
  result: TripResult;
  scenario: Scenario;
  /** AI summary shown: then only one other option is listed, so the screen still fits. */
  aiEnabled?: boolean;
}) {
  const { trip, best } = result;
  const planned = trip.plannedTrain;
  const t = getMessages(scenario.lang);

  return (
    <KioskFrame lang={scenario.lang}>
      <KioskHeader
        time={result.now}
        start={
          <NavButton
            href={withScenario('/kiosk', { ...scenario, to: undefined })}
            variant="secondary"
            iconName="arrows-circle-small"
          >
            {t.common.startOver}
          </NavButton>
        }
        center={`${trip.ticket.from.name} → ${trip.ticket.to.name}`}
      />
      <KioskMain className={aiEnabled ? styles.mainWithAi : undefined}>
        {result.affected ? (
          <SbbNotification type="error" readOnly animation="none" className={styles.cancelled}>
            <SbbTitle level="1" visualLevel="4" className={styles.cancelledTitle}>
              <LineBadge line={planned.line} size="s" /> {t.result.cancelled(<s>{planned.departure}</s>)}
            </SbbTitle>
            {result.disruption.reason}
          </SbbNotification>
        ) : (
          <SbbNotification type="success" readOnly animation="none" className={styles.cancelled}>
            <SbbTitle level="1" visualLevel="4" className={styles.cancelledTitle}>
              <LineBadge line={planned.line} size="s" /> {t.result.runsAsPlanned(planned.departure)}
            </SbbTitle>
          </SbbNotification>
        )}

        {aiEnabled && <AiSummary lang={scenario.lang} to={scenario.to} />}

        <section className={styles.section} aria-labelledby="best-train">
          <h2 id="best-train" className={styles.label}>
            {t.result.bestLabel}
          </h2>
          <SbbCard color="white" className={styles.bestCard}>
            <div className={styles.bestTop}>
              <div className={styles.bestLine}>
                <LineBadge line={best.train.line} size="l" />
                <span className={styles.to}>
                  {t.result.to(best.train.direction ?? best.arrivalStation.name)}
                  {best.occupancy && <SbbTimetableOccupancy secondClassOccupancy={best.occupancy.secondClass} />}
                </span>
              </div>
              <div className={styles.bestDeparture}>
                <span className={styles.bigTime}>{best.train.departure}</span>
                <span className={styles.muted}>{t.result.departs}</span>
              </div>
              <CountdownRing minutes={result.minutesToDeparture} t={t} />
            </div>

            <dl className={styles.tiles}>
              <div className={styles.tile}>
                <dt>{t.result.platform}</dt>
                <dd>{best.train.platform}</dd>
              </div>
              <div className={styles.tile}>
                <dt>{t.result.arrives(best.arrivalStation.name)}</dt>
                <dd>{best.arrival}</dd>
              </div>
              <div className={styles.tile}>
                <dt>{t.result.vsPlan}</dt>
                <dd className={best.delayVsPlanMinutes > 0 ? styles.late : undefined}>
                  {t.result.plusMin(best.delayVsPlanMinutes)}
                </dd>
              </div>
            </dl>

            <p className={styles.fact}>
              <SbbIcon name="circle-tick-small" className={styles.ok} />
              <span>
                {best.changes === 0 ? t.result.direct : `${t.common.changes(best.changes)}.`}{' '}
                {best.ticketValid && t.result.ticketValid}
              </span>
            </p>
            {best.occupancy?.secondClass === 'high' && (
              <p className={styles.fact}>
                <SbbIcon name="user-group-small" />
                <span>
                  {t.result.busy}
                  {best.boardingHint && <> {t.result.boardAt(best.boardingHint)}</>}
                </span>
              </p>
            )}
          </SbbCard>
        </section>

        {result.alternatives.length > 0 && (
          <section className={styles.section} aria-labelledby="other-options">
            <h2 id="other-options" className={styles.label}>
              {t.result.otherOptions}
            </h2>
            <ul className={styles.options}>
              {result.alternatives.slice(0, aiEnabled ? 1 : undefined).map((c) => (
                <OptionRow key={c.id} connection={c} t={t} />
              ))}
            </ul>
          </section>
        )}
      </KioskMain>
      <KioskFooter>
        <div className={styles.actions}>
          <NavButton href={withScenario('/kiosk/wait', scenario)}>
            {t.result.whatCanIDo(result.minutesToDeparture)}
          </NavButton>
          <NavButton href={withScenario('/phone', scenario)} variant="secondary" iconName="smartphone-small">
            {t.result.sendToPhone}
          </NavButton>
        </div>
      </KioskFooter>
    </KioskFrame>
  );
}

function OptionRow({ connection: c, t }: { connection: Connection; t: Messages }) {
  return (
    <li>
      <SbbCard color="milk" className={styles.option}>
        <div className={styles.optionRow}>
          <div className={styles.optionWhen}>
            <span className={styles.optionTime}>{c.train.departure}</span>
            <span className={styles.platform}>{t.result.platformShort(c.train.platform)}</span>
          </div>
          <div className={styles.optionBody}>
            <strong>{c.routeLabel}</strong>
            <span className={styles.muted}>
              {c.tradeOff}: {c.arrivalStation.name} {c.arrival} · {t.common.changes(c.changes)}
            </span>
          </div>
        </div>
      </SbbCard>
    </li>
  );
}
