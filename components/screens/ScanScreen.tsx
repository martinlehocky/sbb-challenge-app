'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getMessages, type Messages } from '@/lib/i18n/messages';
import { withScenario } from '@/lib/scenario';
import type { Scenario, Trip } from '@/lib/types';
import { KioskFooter, KioskFrame, KioskMain } from '../KioskFrame';
import { KioskHeader } from '../KioskHeader';
import { NavButton } from '../NavButton';
import { ScreenIntro } from '../ScreenIntro';
import { SbbIcon, SbbLoadingIndicatorCircle, SbbStatus } from '../sbb';
import styles from './ScanScreen.module.css';

const STEP_MS = 1000;
/** How often the camera picture is checked for a QR code. */
const SCAN_EVERY_MS = 150;
/** Width the picture is scaled to before decoding (enough for a QR code held up to the camera). */
const DECODE_WIDTH = 640;

type Camera = 'starting' | 'live' | 'none';

/**
 * Screen 2 · Scanning ticket. Demo: ANY QR code shown to the camera counts as the traveller's ticket and opens
 * the demo trip (nothing in the code is read). Nothing about the ticket is shown before a code is seen.
 * Presenter backup (invisible): the Enter key counts as a scanned ticket, e.g. if the camera fails on stage.
 */
export function ScanScreen({ trip, scenario }: { trip: Trip; scenario: Scenario }) {
  const router = useRouter();
  const t = getMessages(scenario.lang);
  const resultHref = withScenario('/kiosk/result', scenario);
  const route = `${trip.ticket.from.name} → ${trip.ticket.to.name}`;
  const [camera, setCamera] = useState<Camera>('starting');
  const [found, setFound] = useState(false);

  // The first step waits for a QR code; only once one is seen does it read "Ticket recognised: route".
  const first = found ? t.scan.recognised(route) : camera === 'none' ? t.scan.noCamera : t.scan.waiting;
  const steps = [first, t.scan.checking, t.scan.finding];
  const running = found;

  // Index of the step in progress; steps before it are done.
  const [active, setActive] = useState(0);

  useEffect(() => {
    router.prefetch(resultHref);
  }, [router, resultHref]);

  const onDetected = useCallback(() => {
    setFound(true);
    setActive(1); // "Ticket recognised" is done at once
  }, [setFound, setActive]);

  // Presenter backup: Enter acts like a scanned ticket (nothing on screen gives it away).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !found) onDetected();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [found, onDetected]);

  useEffect(() => {
    if (!running) return;
    if (active < steps.length) {
      const timer = setTimeout(() => setActive((a) => a + 1), STEP_MS);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => router.push(resultHref), 400);
    return () => clearTimeout(timer);
  }, [running, active, steps.length, router, resultHref]);

  return (
    <KioskFrame lang={scenario.lang}>
      <KioskHeader
        time="11:05"
        start={
          <NavButton href={withScenario('/kiosk', scenario)} variant="secondary" iconName="cross-small">
            {t.common.cancel}
          </NavButton>
        }
        center={
          <>
            <SbbIcon name="arrow-up-small" />
            {t.scan.cameraAbove}
          </>
        }
      />
      <KioskMain className={styles.main}>
        <ScreenIntro
          align="center"
          title={t.scan.title}
          lead={t.scan.lead}
        />

        <Viewfinder t={t} found={found} onCamera={setCamera} onDetected={onDetected} />

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
            {t.scan.privacy}
          </p>
        </div>
      </KioskFooter>
    </KioskFrame>
  );
}

/** A QR decoder: the browser's own (Chrome on macOS, Android) or jsQR as fallback. Null = nothing found. */
type Decoder = (video: HTMLVideoElement) => Promise<string | null>;

interface NativeBarcodeDetector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
interface NativeBarcodeDetectorClass {
  new (options: { formats: string[] }): NativeBarcodeDetector;
  getSupportedFormats(): Promise<string[]>;
}

async function makeDecoder(): Promise<Decoder> {
  const Native = (window as unknown as { BarcodeDetector?: NativeBarcodeDetectorClass }).BarcodeDetector;
  if (Native) {
    try {
      if ((await Native.getSupportedFormats()).includes('qr_code')) {
        const detector = new Native({ formats: ['qr_code'] });
        return async (video) => (await detector.detect(video))[0]?.rawValue ?? null;
      }
    } catch {
      // fall through to jsQR
    }
  }
  const { default: jsQR } = await import('jsqr');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return async (video) => {
    if (!ctx) return null;
    const width = Math.min(DECODE_WIDTH, video.videoWidth);
    const height = Math.round((video.videoHeight * width) / video.videoWidth);
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(video, 0, 0, width, height);
    const image = ctx.getImageData(0, 0, width, height);
    return jsQR(image.data, width, height, { inversionAttempts: 'attemptBoth' })?.data ?? null;
  };
}

/**
 * Dark camera viewfinder. Shows the live webcam if the browser allows it (otherwise just the dark frame) and looks
 * for a QR code in it. Frames are only decoded in the browser; nothing is recorded or sent anywhere.
 */
function Viewfinder({
  t,
  found,
  onCamera,
  onDetected,
}: {
  t: Messages;
  found: boolean;
  onCamera: (state: Camera) => void;
  onDetected: (value: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let stream: MediaStream | undefined;
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      onCamera('none');
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 } }, audio: false })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          setLive(true);
          onCamera('live');
        }
      })
      .catch(() => {
        // No camera or permission denied: the dark frame stays, the steps run by themselves.
        if (!cancelled) onCamera('none');
      });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [onCamera]);

  // Look for a QR code a few times per second until one is found.
  useEffect(() => {
    if (!live || found) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let decode: Decoder | null = null;
    const tick = async () => {
      if (stopped) return;
      const video = videoRef.current;
      if (video && video.readyState >= 2 && video.videoWidth > 0) {
        try {
          decode ??= await makeDecoder();
          const value = await decode(video);
          if (value !== null && !stopped) {
            onDetected(value);
            return;
          }
        } catch (err) {
          console.warn('[scan] QR decoding failed:', err);
        }
      }
      if (!stopped) timer = setTimeout(tick, SCAN_EVERY_MS);
    };
    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [live, found, onDetected]);

  return (
    <div
      className={`${styles.viewfinder} ${found ? styles.found : ''}`}
      role="img"
      aria-label={t.scan.cameraView}
      data-scan-state={found ? 'found' : live ? 'scanning' : 'idle'}
    >
      <video ref={videoRef} className={styles.video} hidden={!live} autoPlay muted playsInline />
      <span className={`${styles.corner} ${styles.tl}`} />
      <span className={`${styles.corner} ${styles.tr}`} />
      <span className={`${styles.corner} ${styles.bl}`} />
      <span className={`${styles.corner} ${styles.br}`} />
      {found ? (
        <span className={styles.foundMark} aria-hidden="true">
          <SbbIcon name="tick-medium" />
        </span>
      ) : (
        <span className={styles.scanLine} />
      )}
    </div>
  );
}
