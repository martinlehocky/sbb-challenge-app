'use client';

import { SbbNotification } from './sbb';
import styles from './LittleTimeNotice.module.css';

/** Shown on the idea screens when none of the hand-written ideas fits the time left. */
export function LittleTimeNotice({ text }: { text: string }) {
  return (
    <li>
      <SbbNotification type="info" readOnly animation="none" className={styles.notice}>
        {text}
      </SbbNotification>
    </li>
  );
}
