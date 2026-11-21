'use client';

import { SbbLoadingIndicatorCircle } from '../sbb';
import styles from './Ai.module.css';

/** "The AI is working" line (SBB AI pattern "AI work indicator"). */
export function AiWorking({ text }: { text: string }) {
  return (
    <p className={styles.working} role="status">
      <SbbLoadingIndicatorCircle />
      <span>{text}</span>
    </p>
  );
}
