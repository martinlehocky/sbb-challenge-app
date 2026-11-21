'use client';

import type { Photo } from '@/lib/types';
import { SbbIcon, SbbImage } from './sbb';
import styles from './PhotoBox.module.css';

/**
 * Photo of a sight. Until a real image is added (set `photo.src` to a file
 * in /public/photos), shows a placeholder box with the label.
 */
export function PhotoBox({ photo }: { photo: Photo }) {
  if (photo.src) {
    return (
      <figure className={`sbb-figure ${styles.figure}`}>
        <SbbImage imageSrc={photo.src} alt={photo.label} skipLqip className={styles.image} />
        {photo.credit && <figcaption className={styles.credit}>{photo.credit}</figcaption>}
      </figure>
    );
  }
  return (
    <div className={styles.placeholder} role="img" aria-label={photo.label}>
      <SbbIcon name="picture-large" />
      <span className={styles.label}>{photo.label}</span>
    </div>
  );
}
