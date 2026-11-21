'use client';

import { useLayoutEffect, useState, type ReactNode } from 'react';
import styles from './KioskFrame.module.css';

export const KIOSK_WIDTH = 1080;
export const KIOSK_HEIGHT = 1920;

/**
 * Fixed 1080 x 1920 portrait canvas, scaled down (never up) to fit the
 * window and centred. On a real portrait kiosk screen the scale is 1.
 */
export function KioskFrame({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState<number | null>(null);

  useLayoutEffect(() => {
    const update = () => {
      const s = Math.min(window.innerWidth / KIOSK_WIDTH, window.innerHeight / KIOSK_HEIGHT, 1);
      setScale(s);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const s = scale ?? 1;

  return (
    <div className={styles.stage}>
      <div
        className={styles.viewport}
        style={{
          width: KIOSK_WIDTH * s,
          height: KIOSK_HEIGHT * s,
          visibility: scale === null ? 'hidden' : 'visible',
        }}
      >
        <div
          className={`sbb-kiosk-canvas ${styles.canvas}`}
          style={{ transform: `scale(${s})` }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/** Scrollable content area between header and footer. */
export function KioskMain({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={`${styles.main} ${className ?? ''}`}>{children}</main>;
}

/** Bottom area: green "be back" box, main actions. */
export function KioskFooter({ children }: { children: ReactNode }) {
  return <div className={styles.footer}>{children}</div>;
}
