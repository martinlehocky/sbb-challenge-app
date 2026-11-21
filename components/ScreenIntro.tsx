'use client';

import type { ReactNode } from 'react';
import { SbbTitle } from './sbb';
import styles from './ScreenIntro.module.css';

/** Big screen heading (h1) with an optional lead line. */
export function ScreenIntro({
  title,
  lead,
  align = 'start',
}: {
  title: ReactNode;
  lead?: ReactNode;
  align?: 'start' | 'center';
}) {
  return (
    <div className={`${styles.intro} ${styles[align]}`}>
      <SbbTitle level="1" visualLevel="2" className={styles.title}>
        {title}
      </SbbTitle>
      {lead && <p className={styles.lead}>{lead}</p>}
    </div>
  );
}
