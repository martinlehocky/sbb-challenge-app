'use client';

import { useEffect, useState } from 'react';
import { getMessages } from '@/lib/i18n/messages';
import type { Lang } from '@/lib/types';
import { SbbCard } from '../sbb';
import { AiChip } from './AiChip';
import { AiWorking } from './AiWorking';
import { useAiStatus } from './useAiStatus';
import styles from './Ai.module.css';

/**
 * Result screen: the advice rewritten by AI in plain words, shown as text.
 * Hidden when AI is off or fails; the screen's facts never depend on it.
 */
export function AiSummary({ lang, to }: { lang: Lang; to?: string }) {
  const t = getMessages(lang);
  const enabled = useAiStatus()?.ai ?? null;
  const query = new URLSearchParams({ lang, ...(to ? { to } : {}) }).toString();
  // The answer is stored with the request it belongs to, so a new request shows "working" again.
  const [result, setResult] = useState<{ query: string; text: string | null } | null>(null);

  useEffect(() => {
    if (!enabled) return;
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
  }, [enabled, query]);

  const current = result?.query === query ? result : null;
  const text = current?.text ?? null;
  if (!enabled || (current && !text)) return null;

  return (
    <SbbCard color="milk" className={styles.summary} aria-live="polite">
      <div className={styles.summaryHead}>
        <span className={styles.summaryTitle}>{t.ai.summaryTitle}</span>
        <AiChip label={t.ai.label} />
      </div>
      {text ? <p className={styles.summaryText}>{text}</p> : <AiWorking text={t.ai.summaryWorking} />}
    </SbbCard>
  );
}
