'use client';

import type { SbbDialogElement } from '@sbb-esta/lyne-elements/dialog.js';
import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import type { Messages } from '@/lib/i18n/messages';
import { SbbDialog, SbbDialogCloseButton, SbbDialogContent, SbbDialogTitle, SbbIcon } from './sbb';
import styles from './PlaceQrDialog.module.css';

/** What the QR window needs to know about a place from Google. */
export interface QrPlace {
  id: string;
  name: string;
  /** Google's own link to the place; built from the place id when missing. */
  mapsUri: string | null;
}

/** Link that opens the place in Google Maps (the app on a phone, the website otherwise). */
export function mapsUrl(place: QrPlace): string {
  if (place.mapsUri) return place.mapsUri;
  const query = new URLSearchParams({ api: '1', query: place.name, query_place_id: place.id });
  return `https://www.google.com/maps/search/?${query.toString()}`;
}

/**
 * Window with a QR code for a place: the traveller scans it with their phone and the place opens in Google Maps.
 * `place` set = open, null = closed. The code is drawn in the browser; nothing is sent anywhere.
 */
export function PlaceQrDialog({ place, t, onClose }: { place: QrPlace | null; t: Messages; onClose: () => void }) {
  const dialog = useRef<SbbDialogElement>(null);
  const url = place ? mapsUrl(place) : null;
  // The drawn code is kept with the link it belongs to, so another place never shows an old code.
  const [qr, setQr] = useState<{ url: string; src: string } | null>(null);
  // The last place shown stays in the window while it closes (its fade-out), instead of an empty title.
  const [shown, setShown] = useState<QrPlace | null>(null);
  if (place && place !== shown) setShown(place);

  useEffect(() => {
    if (!url) return;
    let alive = true;
    QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' })
      .then((svg) => alive && setQr({ url, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` }))
      .catch((err) => console.error('[places] QR code failed:', err));
    return () => {
      alive = false;
    };
  }, [url]);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (place) el.open();
    else el.close();
  }, [place]);

  const current = shown;
  return (
    <SbbDialog ref={dialog} backdrop="translucent" backdropAction="close" onClose={onClose} className={styles.dialog}>
      <SbbDialogCloseButton />
      <SbbDialogTitle visualLevel="5">{current?.name}</SbbDialogTitle>
      <SbbDialogContent>
        <div className={styles.body}>
          <div className={styles.frame}>
            {current && qr && qr.url === mapsUrl(current) ? (
              // eslint-disable-next-line @next/next/no-img-element -- generated SVG code, no image optimisation
              <img src={qr.src} alt={t.places.qrAlt(current.name)} className={styles.qr} />
            ) : (
              <span className={styles.qr} aria-hidden="true" />
            )}
          </div>
          <div className={styles.hint}>
            <span className={styles.phone} aria-hidden="true">
              <SbbIcon name="smartphone-medium" />
            </span>
            <p className={styles.text}>{t.places.qrText}</p>
          </div>
        </div>
      </SbbDialogContent>
    </SbbDialog>
  );
}
