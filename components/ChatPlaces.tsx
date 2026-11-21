'use client';

import type { ChatPlace } from '@/lib/ai';
import type { Messages } from '@/lib/i18n/messages';
import type { Lang } from '@/lib/types';
import { GooglePhoto, swissNumber } from './PlaceCard';
import { SbbIcon } from './sbb';
import styles from './ChatPlaces.module.css';

/** Places recommended in the chat ("What can I do in Basel?"): photo on the left, name, rating, walking time. */
export function ChatPlaces({ places, t, lang }: { places: ChatPlace[]; t: Messages; lang: Lang }) {
  if (!places.length) return null;
  return (
    <div className={styles.wrap}>
      <ul className={styles.list}>
        {places.map((p) => {
          const rating =
            p.rating != null
              ? `★ ${swissNumber(p.rating, lang, 1)}` + (p.ratingCount ? ` (${swissNumber(p.ratingCount, lang)})` : '')
              : null;
          const kind = [rating, p.typeLabel].filter(Boolean).join(' · ');
          return (
            <li key={p.id} className={styles.place}>
              {p.photo ? (
                <GooglePhoto
                  url={p.photo.url}
                  alt={p.name}
                  credit={p.photo.author ? t.places.photoBy(p.photo.author) : undefined}
                />
              ) : (
                <span className={styles.noPhoto} aria-hidden="true">
                  <SbbIcon name="picture-large" />
                </span>
              )}
              <div className={styles.body}>
                <p className={styles.name}>{p.name}</p>
                {kind && <p className={styles.line}>{kind}</p>}
                <p className={styles.walk}>
                  <SbbIcon name="walk-small" />
                  {t.places.walkFrom(p.walkMinutes, p.fromStation)}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      <p className={styles.attribution}>{t.places.attribution}</p>
    </div>
  );
}
