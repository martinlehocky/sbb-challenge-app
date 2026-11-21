'use client';

import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { demoNow, formatClockTime } from '@/lib/demo-time';
import { SbbClock } from './sbb';
import styles from './KioskHeader.module.css';

type ClockString = `${number}:${number}:${number}`;

/** The internals of the Lyne clock element we hook into (see DemoClock). */
interface ClockInternals {
  _assignCurrentTime: () => void;
  _hours: number;
  _minutes: number;
  _seconds: number;
}

/**
 * Kiosk header bar: left = back / cancel button, centre = context,
 * right = current time (text + SBB station clock), ticking from the scenario time.
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
  /** "HH:MM", the simulated scenario time the clock starts from. */
  time: string;
}) {
  const [shown, setShown] = useState(time);

  useEffect(() => {
    const update = () => setShown(formatClockTime(demoNow(time)));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [time]);

  return (
    <header className={styles.header}>
      <div className={styles.start}>{start}</div>
      {center && <div className={styles.center}>{center}</div>}
      <div className={styles.end}>
        {end}
        <time className={styles.time} dateTime={shown}>
          {shown}
        </time>
        <DemoClock start={time} />
      </div>
    </header>
  );
}

/**
 * The real Lyne SBB clock (58.5 s sweep, stop at 12, minute hand jumps), but
 * running on the simulated demo time instead of the system time.
 *
 * Lyne's clock either shows a static `now` or the system time. It renders the
 * static scenario time first (also on the server); after mount we let it read
 * the time from `demoNow()` and switch it to running mode.
 */
function DemoClock({ start }: { start: string }) {
  const ref = useRef<ComponentRef<typeof SbbClock>>(null);
  const [now, setNow] = useState<ClockString | null>(`${start}:00` as ClockString);

  useEffect(() => {
    const el = ref.current as unknown as ClockInternals | null;
    if (!el || typeof el._assignCurrentTime !== 'function') return; // Lyne internals changed: stay static
    el._assignCurrentTime = function (this: ClockInternals) {
      const date = demoNow(start);
      this._hours = date.getHours() % 12;
      this._minutes = date.getMinutes();
      this._seconds = date.getSeconds();
    };
    setNow(null);
  }, [start]);

  return <SbbClock ref={ref} className={styles.clock} now={now} aria-hidden="true" />;
}
