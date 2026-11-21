'use client';

import type { Line } from '@/lib/types';
import { SbbIcon } from './sbb';
import styles from './LineBadge.module.css';

/** SBB line badge (timetable icon such as ir-35), with a text alternative. */
export function LineBadge({ line, size = 'm' }: { line: Line; size?: 's' | 'm' | 'l' }) {
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
