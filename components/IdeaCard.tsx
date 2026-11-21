'use client';

import type { ReactNode } from 'react';
import { SbbCard, SbbCardButton, SbbIcon, SbbTitle } from './sbb';
import styles from './IdeaCard.module.css';

/** Grey card used for wait ideas, sights and places to rest (screens 5–5c). */
export function IdeaCard({
  title,
  lines,
  walk,
  note,
  media,
  badge,
  clampLines = false,
  notePlacement = 'end',
  onSelect,
  selectLabel,
}: {
  title: string;
  /** Shown at the start of the walking-time row, e.g. the "AI-generated" chip. */
  badge?: ReactNode;
  /** Cut the text lines after two lines (for AI text, whose length we do not control). */
  clampLines?: boolean;
  lines: ReactNode[];
  walk: string;
  /** Green note, e.g. "Back by 11:30". */
  note: string;
  media?: ReactNode;
  notePlacement?: 'end' | 'below';
  /** Makes the whole card a button (e.g. a Google place: tap for the QR code to open it on a phone). */
  onSelect?: () => void;
  /** Accessible name of that button (default: the title). */
  selectLabel?: string;
}) {
  const noteEl = <p className={styles.note}>{note}</p>;
  return (
    <li>
      <SbbCard color="milk" className={styles.card}>
        {onSelect && (
          <SbbCardButton onClick={onSelect} aria-haspopup="dialog">
            {selectLabel ?? title}
          </SbbCardButton>
        )}
        <div className={`${styles.row} ${media ? styles.withMedia : ''}`}>
          {media}
          <div className={styles.body}>
            <SbbTitle level="2" visualLevel="5" className={styles.title}>
              {title}
            </SbbTitle>
            {lines.map((line, i) => (
              <p key={i} className={`${styles.line} ${clampLines ? styles.clamp : ''}`}>
                {line}
              </p>
            ))}
            <div className={styles.meta}>
              {badge}
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
