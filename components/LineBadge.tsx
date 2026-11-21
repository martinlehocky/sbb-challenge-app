'use client';

import type { Line } from '@/lib/types';
import { SbbIcon } from './sbb';
import styles from './LineBadge.module.css';

/**
 * SBB line badge: the timetable icon (such as ir-35) when we have it in /public/sbb-icons,
 * otherwise the line name as a text badge (lines from the backend can be any line).
 */
export function LineBadge({ line, size = 'm' }: { line: Line; size?: 's' | 'm' | 'l' }) {
  if (!line.icon) {
    return (
      <span className={`${styles.text} ${styles[`text-${size}`]}`} role="img" aria-label={line.name}>
        {line.name}
      </span>
    );
  }
  return (
    <SbbIcon
      name={line.icon}
      className={`${styles.badge} ${styles[size]}`}
      role="img"
      aria-hidden="false"
      aria-label={line.name}
    />
  );
}
