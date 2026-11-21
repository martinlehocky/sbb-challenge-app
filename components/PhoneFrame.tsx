'use client';

import type { ReactNode } from 'react';
import type { Lang } from '@/lib/types';
import { DocumentLang } from './DocumentLang';
import styles from './PhoneFrame.module.css';

/** 390 px wide phone page: framed on desktop, full width on a real phone. */
export function PhoneFrame({ children, lang }: { children: ReactNode; lang: Lang }) {
  return (
    <div className={styles.stage}>
      <div className={styles.phone} lang={lang}>
        <DocumentLang lang={lang} />
        {children}
      </div>
    </div>
  );
}
