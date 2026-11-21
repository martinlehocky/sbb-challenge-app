'use client';

import { SbbChipLabel } from '../sbb';
import styles from './Ai.module.css';

/** Marks content written by AI (SBB AI pattern "author"). */
export function AiChip({ label }: { label: string }) {
  return (
    <SbbChipLabel size="xs" color="charcoal" className={styles.chip}>
      {label}
    </SbbChipLabel>
  );
}
