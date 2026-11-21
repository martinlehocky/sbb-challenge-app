import type { Messages } from '@/lib/i18n/messages';
import styles from './CountdownRing.module.css';

/** Ring showing the minutes left until departure (full ring = 60 min). */
export function CountdownRing({
  minutes,
  t,
  size = 'l',
}: {
  minutes: number;
  t: Messages;
  size?: 's' | 'l';
}) {
  const r = 44;
  const c = 2 * Math.PI * r;
  const share = Math.max(0, Math.min(1, minutes / 60));
  return (
    <div className={`${styles.ring} ${styles[size]}`} role="img" aria-label={t.common.minutesToGo(minutes)}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className={styles.track} cx="50" cy="50" r={r} />
        <circle
          className={styles.value}
          cx="50"
          cy="50"
          r={r}
          strokeDasharray={`${c * share} ${c}`}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <span className={styles.label} aria-hidden="true">
        {size === 'l' ? t.common.ring(minutes) : <strong>{t.common.minutes(minutes)}</strong>}
      </span>
    </div>
  );
}
