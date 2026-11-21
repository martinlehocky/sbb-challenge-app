'use client';

import { useState } from 'react';
import type { ChatPlace } from '@/lib/ai';
import type { Messages } from '@/lib/i18n/messages';
import type { Lang } from '@/lib/types';
import { GooglePhoto, swissNumber } from './PlaceCard';
import { PlaceQrDialog } from './PlaceQrDialog';
import { SbbIcon } from './sbb';
import styles from './ChatPlaces.module.css';

/**
 * Places recommended in the chat ("What can I do in Basel?"): photo on the left, name, rating, walking time.
 * Tapping a place shows a QR code that opens it in Google Maps on the traveller's phone.
 */
export function ChatPlaces({ places, t, lang }: { places: ChatPlace[]; t: Messages; lang: Lang }) {
  const [selected, setSelected] = useState<ChatPlace | null>(null);
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
            <li key={p.id}>
              <button
                type="button"
                className={styles.place}
                onClick={() => setSelected(p)}
                aria-haspopup="dialog"
                aria-label={t.places.openOnPhone(p.name)}
              >
                {p.photo ? (
                  <GooglePhoto
                    url={p.photo.url}
                    alt=""
                    credit={p.photo.author ? t.places.photoBy(p.photo.author) : undefined}
                  />
                ) : (
                  <span className={styles.noPhoto} aria-hidden="true">
                    <SbbIcon name="picture-large" />
                  </span>
                )}
                <span className={styles.body}>
                  <span className={styles.name}>{p.name}</span>
                  {kind && <span className={styles.line}>{kind}</span>}
                  <span className={styles.walk}>
                    <SbbIcon name="walk-small" />
                    {t.places.walkFrom(p.walkMinutes, p.fromStation)}
                  </span>
                </span>
                <span className={styles.qrIcon} aria-hidden="true">
                  <SbbIcon name="qrcode-small" />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className={styles.footer}>
        <p className={styles.hint}>
          <SbbIcon name="smartphone-small" />
          {t.places.tapHint}
        </p>
        <p className={styles.attribution}>{t.places.attribution}</p>
      </div>
      <PlaceQrDialog place={selected} t={t} onClose={() => setSelected(null)} />
    </div>
  );
}
