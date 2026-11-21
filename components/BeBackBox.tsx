'use client';

import { returnPlanLines } from '@/lib/format';
import type { ReturnPlan } from '@/lib/types';
import { SbbNotification } from './sbb';
import styles from './BeBackBox.module.css';

/** Green "Please be back by" reminder, shown on every screen after the result. */
export function BeBackBox({
  plan,
  variant = 'default',
  size = 'l',
}: {
  plan: ReturnPlan;
  /** "platform": "Please be back at platform 9 by 11:30" (screen 4). */
  variant?: 'default' | 'platform';
  size?: 'm' | 'l';
}) {
  const lines = returnPlanLines(plan, variant);
  return (
    <SbbNotification type="success" readOnly animation="none" className={`${styles.box} ${styles[size]}`}>
      <span className={styles.train}>{lines.train}</span>
      <strong className={styles.backBy}>{lines.backBy}</strong>
    </SbbNotification>
  );
}
