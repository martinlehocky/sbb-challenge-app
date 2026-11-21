import type { ReactNode } from 'react';
import styles from './PhoneFrame.module.css';

/** 390 px wide phone page: framed on desktop, full width on a real phone. */
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className={styles.stage}>
      <div className={styles.phone}>{children}</div>
    </div>
  );
}
