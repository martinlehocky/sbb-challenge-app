'use client';

import { ILLUSTRATION_TAG } from '@/lib/disruption-photos';
import type { Lang, Photo } from '@/lib/types';
import { SbbImage } from './sbb';
import styles from './DisruptionPhoto.module.css';

/**
 * Small photo next to a disruption. It is always a general SBB scene matching the cause,
 * never the incident itself, so it carries a visible "Illustration" tag.
 * (A plain wrapper on purpose: Lyne's .sbb-figure styling restyles captions and dimmed this thumbnail.)
 */
export function DisruptionPhoto({ photo, lang }: { photo: Photo; lang: Lang }) {
  if (!photo.src) return null;
  return (
    <div className={styles.box}>
      <div className={styles.frame}>
        {/* skipLqip: the blurred preview is made for SBB's image CDN; for a local file it would load the photo twice */}
        <SbbImage imageSrc={photo.src} alt={photo.label} skipLqip className={styles.image} />
        <span className={styles.tag} aria-hidden="true">
          {ILLUSTRATION_TAG[lang]}
        </span>
      </div>
      {photo.credit && <span className={styles.credit}>{photo.credit}</span>}
    </div>
  );
}
