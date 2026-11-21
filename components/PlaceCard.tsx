'use client';

import type { Messages } from '@/lib/i18n/messages';
import type { Lang, NearbyPlace } from '@/lib/types';
import { IdeaCard } from './IdeaCard';
import { PhotoBox } from './PhotoBox';
import { PlaceQrDialog } from './PlaceQrDialog';
import { SbbIcon } from './sbb';
import styles from './PlaceCard.module.css';

/** Swiss number format, the same on server and browser (Intl differs between Node and Chrome: ' vs ’). */
export function swissNumber(n: number, lang: Lang, decimals = 0): string {
  const [int, frac] = n.toFixed(decimals).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'en' ? ',' : '’');
  return frac ? `${grouped}.${frac}` : grouped;
}

/**
 * Google's photo as a plain image: <sbb-image> adds image-CDN parameters to the URL and loads a blurred
 * preview first, which Google's photo links do not support.
 */
export function GooglePhoto({ url, alt, credit }: { url: string; alt: string; credit?: string }) {
  return (
    <figure className={styles.figure}>
      {/* eslint-disable-next-line @next/next/no-img-element -- remote Google photo, no Next image optimisation */}
      <img src={url} alt={alt} className={styles.image} loading="eager" referrerPolicy="no-referrer" />
      {credit && <figcaption className={styles.credit}>{credit}</figcaption>}
    </figure>
  );
}

/** A real place from Google Places: photo on the left (with its author), kind, rating, walk and back-by time. */
export function PlaceCard({
  place,
  backBy,
  t,
  lang,
  onOpen,
}: {
  place: NearbyPlace;
  backBy: string;
  t: Messages;
  lang: Lang;
  /** Tapping the card: show the QR code that opens the place on the traveller's phone. */
  onOpen?: (place: NearbyPlace) => void;
}) {
  const rating =
    place.rating != null
      ? `★ ${swissNumber(place.rating, lang, 1)}` + (place.ratingCount ? ` (${swissNumber(place.ratingCount, lang)})` : '')
      : null;
  // Rating first: a long kind ("Restaurant de plats à emporter") is the part that gets shortened.
  const kind = [rating, place.typeLabel].filter(Boolean).join(' · ');
  const oneLine = (text: string) => (
    <span className={styles.oneLine} title={text}>
      {text}
    </span>
  );
  return (
    <IdeaCard
      media={
        place.photo ? (
          <GooglePhoto
            url={place.photo.url}
            alt={place.name}
            credit={place.photo.author ? t.places.photoBy(place.photo.author) : undefined}
          />
        ) : (
          <PhotoBox photo={{ label: place.name }} />
        )
      }
      title={place.name}
      lines={[kind, place.address ?? t.places.stay(place.stayMinutes)].filter(Boolean).map(oneLine)}
      walk={t.common.walk(place.walkMinutes)}
      note={t.common.backBy(backBy)}
      notePlacement="below"
      onSelect={onOpen ? () => onOpen(place) : undefined}
      selectLabel={t.places.openOnPhone(place.name)}
    />
  );
}

/**
 * Under the list: "Tap a place to open it on your phone" and the "Google Maps" credit (required by Google's
 * terms). Also holds the QR window for the place tapped (`selected`).
 */
export function GoogleAttribution({
  t,
  selected = null,
  onClose = () => {},
}: {
  t: Messages;
  selected?: NearbyPlace | null;
  onClose?: () => void;
}) {
  return (
    <li className={styles.attribution}>
      <span className={styles.hint}>
        <SbbIcon name="smartphone-small" />
        {t.places.tapHint}
      </span>
      {/* Short credit here (the screen is full); the chat has room for "Places and photos: Google Maps". */}
      <span>Google Maps</span>
      <PlaceQrDialog place={selected} t={t} onClose={onClose} />
    </li>
  );
}
