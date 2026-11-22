'use client';

import { getMessages, type Messages } from '@/lib/i18n/messages';
import { withScenario } from '@/lib/scenario';
import type { Connection, Scenario, TripResult } from '@/lib/types';
import { AiSummaryText } from '../ai/AiSummary';
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

/** Minutes the traveller should be back before departure (as in the demo data: 11:37 train, back by 11:30). */
const BACK_BY_BUFFER_MIN = 7;
/** Wait ideas are offered only with at least this many minutes until the back-by time. */
const MIN_WAIT_MIN = 10;

/** Screen 3 · Your next train. */
export function ResultScreen({
  result,
  scenario,
  aiEnabled = false,
}: {
  result: TripResult;
  scenario: Scenario;
  /**
   * AI is set up: the status box at the top shows the advice in plain words (AI-generated), and only one other
   * option is listed, so the screen still fits with the longer text.
   */
  aiEnabled?: boolean;
}) {
  const { trip, best } = result;
  const planned = trip.plannedTrain;
  const t = getMessages(scenario.lang);
  // "What can I do?" only with enough time: at least MIN_WAIT_MIN minutes before the back-by time.
  const canWait = result.minutesToDeparture - BACK_BY_BUFFER_MIN >= MIN_WAIT_MIN;
  const askQuery = withScenario('/kiosk/ask', scenario);
  const askHref = `${askQuery}${askQuery.includes('?') ? '&' : '?'}about=trip`;

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
      <KioskMain>
        {result.affected ? (
          <SbbNotification type="error" readOnly animation="none" className={styles.cancelled}>
            <SbbTitle level="1" visualLevel="4" className={styles.cancelledTitle}>
              <LineBadge line={planned.line} size="s" /> {t.result.cancelled(<s>{planned.departure}</s>)}
            </SbbTitle>
            <AiSummaryText
              lang={scenario.lang}
              to={scenario.to}
              enabled={aiEnabled}
              fallback={result.disruption.reason}
            />
          </SbbNotification>
        ) : (
          <SbbNotification type="success" readOnly animation="none" className={styles.cancelled}>
            <SbbTitle level="1" visualLevel="4" className={styles.cancelledTitle}>
              <LineBadge line={planned.line} size="s" /> {t.result.runsAsPlanned(planned.departure)}
            </SbbTitle>
            <AiSummaryText lang={scenario.lang} to={scenario.to} enabled={aiEnabled} fallback={null} />
          </SbbNotification>
        )}

        <section className={styles.section} aria-labelledby="best-train">
          <h2 id="best-train" className={styles.label}>
            {t.result.bestLabel}
          </h2>
          <SbbCard color="white" className={styles.bestCard}>
            <div className={styles.bestTop}>
              <div className={styles.bestLine}>
                <LineBadge line={best.train.line} size="l" />
                <span className={styles.to}>
                  {t.result.to(best.arrivalStation.name)}
                  {best.occupancy && <SbbTimetableOccupancy secondClassOccupancy={best.occupancy.secondClass} />}
                </span>
                {/* With changes, the journey list below already shows each train's direction. */}
                {best.train.direction && best.train.direction !== best.arrivalStation.name && !(best.legs && best.legs.length > 1) && (
                  <span className={styles.towards}>
                    {best.train.line.name} {t.result.towards(best.train.direction)}
                  </span>
                )}
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

            {best.train.lateMinutes ? (
              <p className={`${styles.fact} ${styles.late}`}>
                <SbbIcon name="clock-small" />
                <span>{t.result.runningLate(best.train.lateMinutes)}</span>
              </p>
            ) : null}
            {best.legs && best.legs.length > 1 ? (
              <section className={styles.journey} aria-label={t.result.yourJourney}>
                <p className={styles.journeyTitle}>
                  {t.result.yourJourney} · {t.common.changes(best.changes)}
                </p>
                <ol className={styles.legs}>
                  {best.legs.map((leg, i) => (
                    <li key={`${leg.line.name}-${leg.departure}-${i}`} className={styles.leg}>
                      <LineBadge line={leg.line} size="s" />
                      <span className={styles.legMain}>
                        <strong>
                          {leg.departure} {leg.from.name}
                          {leg.platform && `, ${t.result.platformShort(leg.platform)}`}
                        </strong>
                        <span className={styles.legSub}>
                          {leg.direction && `${t.result.towards(leg.direction)} · `}
                          {t.result.legArrives(leg.to.name, leg.arrival)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            ) : (
              <p className={styles.fact}>
                <SbbIcon name="circle-tick-small" className={styles.ok} />
                <span>
                  {best.changes === 0 ? t.result.direct : `${t.common.changes(best.changes)}.`}{' '}
                  {best.ticketValid && t.result.ticketValid}
                </span>
              </p>
            )}
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
          {canWait ? (
            <NavButton href={withScenario('/kiosk/wait', scenario)}>
              {t.result.whatCanIDo(result.minutesToDeparture)}
            </NavButton>
          ) : (
            <SbbNotification type="warn" readOnly animation="none" className={styles.goNow}>
              {/* Icon and text centred together: the notification's own icon is hidden (see .goNow). */}
              <span className={styles.goNowContent}>
                <SbbIcon name="circle-exclamation-point-small" aria-hidden="true" />
                {t.result.goToPlatform(best.train.platform)}
              </span>
            </SbbNotification>
          )}
          <div className={styles.secondaryActions}>
            <NavButton href={askHref} variant="secondary" size="m">
              {t.result.askTrip}
            </NavButton>
            <NavButton href={withScenario('/phone', scenario)} variant="secondary" size="m">
              {t.result.sendToPhone}
            </NavButton>
          </div>
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
