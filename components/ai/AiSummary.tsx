'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { getMessages } from '@/lib/i18n/messages';
import type { Lang } from '@/lib/types';
import { AiChip } from './AiChip';
import { useAiStatus } from './useAiStatus';
import styles from './Ai.module.css';

/**
 * Result screen: the advice rewritten by AI in plain words, as the text of the status box ("Your train at 11:07
 * is cancelled"). Until the AI text is there, and whenever AI is off or fails, the box keeps its own text
 * (`fallback`), so the screen's facts never depend on the AI.
 */
export function AiSummaryText({
  lang,
  to,
  dep,
  enabled,
  fallback,
}: {
  lang: Lang;
  to?: string;
  /** The train the traveller picked ("HH:MM"). */
  dep?: string;
  /** AI is set up for this page (the server checked); the browser checks again before asking. */
  enabled: boolean;
  fallback: ReactNode;
}) {
  const t = getMessages(lang);
  const ai = useAiStatus()?.ai ?? null;
  const active = enabled && ai === true;
  const query = new URLSearchParams({ lang, ...(to ? { to } : {}), ...(dep ? { dep } : {}) }).toString();
  // The answer is stored with the request it belongs to, so a new request does not show an old text.
  const [result, setResult] = useState<{ query: string; text: string | null } | null>(null);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    fetch(`/api/ai/summary?${query}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`summary ${r.status}`))))
      .then((d: { text: string }) => alive && setResult({ query, text: d.text }))
      .catch((err) => {
        console.warn('[ai] no AI summary:', err);
        if (alive) setResult({ query, text: null });
      });
    return () => {
      alive = false;
    };
  }, [active, query]);

  const text = active && result?.query === query ? result.text : null;
  if (!text) return <>{fallback}</>;
  return (
    <span className={styles.inlineSummary} aria-live="polite">
      <span className={styles.inlineSummaryText}>{text}</span>
      <AiChip label={t.ai.label} />
    </span>
  );
}
