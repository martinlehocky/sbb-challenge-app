'use client';

import type { ReactNode } from 'react';
import { SbbClock } from './sbb';
import styles from './KioskHeader.module.css';

/**
 * Kiosk header bar: left = back / cancel button, centre = context,
 * right = current time (text + SBB station clock).
 */
export function KioskHeader({
  start,
  center,
  end,
  time,
}: {
  start?: ReactNode;
  center?: ReactNode;
  /** Extra content before the time, e.g. the language switch. */
  end?: ReactNode;
  /** "HH:MM", the simulated scenario time. */
  time: string;
}) {
  return (
    <header className={styles.header}>
      <div className={styles.start}>{start}</div>
      {center && <div className={styles.center}>{center}</div>}
      <div className={styles.end}>
        {end}
        <time className={styles.time} dateTime={time}>
          {time}
        </time>
        <SbbClock className={styles.clock} now={`${time}:00` as `${number}:${number}:${number}`} aria-hidden="true" />
      </div>
    </header>
  );
}
