'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { withScenario } from '@/lib/scenario';
import type { Scenario, Trip } from '@/lib/types';
import { KioskFooter, KioskFrame, KioskMain } from '../KioskFrame';
import { KioskHeader } from '../KioskHeader';
import { NavButton } from '../NavButton';
import { ScreenIntro } from '../ScreenIntro';
import { SbbIcon, SbbLoadingIndicatorCircle, SbbStatus } from '../sbb';
import styles from './ScanScreen.module.css';

const STEP_MS = 1000;

/** Screen 2 · Scanning ticket. */
export function ScanScreen({ trip, scenario }: { trip: Trip; scenario: Scenario }) {
  const router = useRouter();
  const resultHref = withScenario('/kiosk/result', scenario);
  const route = `${trip.ticket.from.name} → ${trip.ticket.to.name}`;

  const steps = [
    `Ticket recognised: ${route}`,
    'Checking your train against live disruptions…',
    'Finding your best alternative',
  ];

  // Index of the step in progress; steps before it are done.
  const [active, setActive] = useState(0);

  useEffect(() => {
    router.prefetch(resultHref);
  }, [router, resultHref]);

  useEffect(() => {
    if (active < steps.length) {
      const t = setTimeout(() => setActive((a) => a + 1), STEP_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => router.push(resultHref), 400);
    return () => clearTimeout(t);
  }, [active, steps.length, router, resultHref]);

  return (
    <KioskFrame>
      <KioskHeader
        time="11:05"
        start={
          <NavButton href={withScenario('/kiosk', scenario)} variant="secondary" iconName="cross-small">
            Cancel
          </NavButton>
        }
        center={
          <>
            <SbbIcon name="arrow-up-small" />
            Camera is above the screen
          </>
        }
      />
      <KioskMain className={styles.main}>
        <ScreenIntro
          align="center"
          title="Hold your ticket up to the camera"
          lead="Paper ticket, SwissPass or the QR code in the SBB app"
        />

        <Viewfinder trip={trip} />

        <ol className={styles.steps} aria-live="polite">
          {steps.map((text, i) => {
            const state = i < active ? 'success' : i === active ? 'in-progress' : 'not-started';
            return (
              <li key={text}>
                <SbbStatus type={state} className={styles.step}>
                  {state === 'in-progress' && <SbbLoadingIndicatorCircle slot="icon" />}
                  {text}
                </SbbStatus>
              </li>
            );
          })}
        </ol>
      </KioskMain>
      <KioskFooter>
        <div className={styles.footerRow}>
          <p className={styles.privacy}>
            <SbbIcon name="lock-closed-small" />
            We only read your route. No images are stored.
          </p>
          <NavButton href={resultHref} variant="accent" size="s">
            Demo: continue
          </NavButton>
        </div>
      </KioskFooter>
    </KioskFrame>
  );
}

/**
 * Dark camera viewfinder. Shows the live webcam if the browser allows it,
 * otherwise a drawn ticket. Nothing is recorded or decoded yet.
 */
function Viewfinder({ trip }: { trip: Trip }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let stream: MediaStream | undefined;
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) return;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          setLive(true);
        }
      })
      .catch(() => {
        // No camera or permission denied: keep the drawn placeholder.
      });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className={styles.viewfinder} role="img" aria-label="Camera view">
      <video ref={videoRef} className={styles.video} hidden={!live} autoPlay muted playsInline />
      {!live && (
        <div className={styles.ticket} aria-hidden="true">
          <div className={styles.ticketText}>
            <strong>
              {trip.ticket.from.name} → {trip.ticket.to.name}
            </strong>
            <span>
              {trip.ticket.travelClass === 2 ? '2nd' : '1st'} class · {trip.ticket.printedDate}
            </span>
          </div>
          <SbbIcon name="qrcode-large" className={styles.qr} />
        </div>
      )}
      <span className={`${styles.corner} ${styles.tl}`} />
      <span className={`${styles.corner} ${styles.tr}`} />
      <span className={`${styles.corner} ${styles.bl}`} />
      <span className={`${styles.corner} ${styles.br}`} />
      <span className={styles.scanLine} />
    </div>
  );
}
