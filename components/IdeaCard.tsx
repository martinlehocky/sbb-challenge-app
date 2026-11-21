'use client';

import type { ReactNode } from 'react';
import { SbbCard, SbbIcon, SbbTitle } from './sbb';
import styles from './IdeaCard.module.css';

/** Grey card used for wait ideas, sights and places to rest (screens 5–5c). */
export function IdeaCard({
  title,
  lines,
  walk,
  note,
  media,
  notePlacement = 'end',
}: {
  title: string;
  lines: ReactNode[];
  walk: string;
  /** Green note, e.g. "Back by 11:30". */
  note: string;
  media?: ReactNode;
  notePlacement?: 'end' | 'below';
}) {
  const noteEl = <p className={styles.note}>{note}</p>;
  return (
    <li>
      <SbbCard color="milk" className={styles.card}>
        <div className={`${styles.row} ${media ? styles.withMedia : ''}`}>
          {media}
          <div className={styles.body}>
            <SbbTitle level="2" visualLevel="5" className={styles.title}>
              {title}
            </SbbTitle>
            {lines.map((line, i) => (
              <p key={i} className={styles.line}>
                {line}
              </p>
            ))}
            <div className={styles.meta}>
              <p className={styles.walk}>
                <SbbIcon name="walk-small" />
                {walk}
              </p>
              {notePlacement === 'below' && noteEl}
            </div>
          </div>
          {notePlacement === 'end' && noteEl}
        </div>
      </SbbCard>
    </li>
  );
}

/** Icon in a white circle, the media of a "Sit down and rest" card. */
export function IconCircle({ name }: { name: string }) {
  return (
    <span className={styles.iconCircle}>
      <SbbIcon name={name} />
    </span>
  );
}
