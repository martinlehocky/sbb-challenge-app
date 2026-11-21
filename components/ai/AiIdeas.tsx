'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { AiIdea, Interest } from '@/lib/ai';
import { getMessages } from '@/lib/i18n/messages';
import type { Lang } from '@/lib/types';
import { IconCircle, IdeaCard } from '../IdeaCard';
import { AiChip } from './AiChip';
import { AiWorking } from './AiWorking';
import { useAiStatus } from './useAiStatus';
import styles from './Ai.module.css';

const ICONS: Record<Interest, string> = {
  eat: 'cup-hot-medium',
  explore: 'compass-localisation-medium',
  rest: 'armchair-medium',
};

/**
 * Screens 5, 5b, 5c: extra ideas from the AI when there are free slots (fewer than 3 hand-written ideas).
 * Renders <li> items for the idea list. Hidden when AI is off or fails.
 */
export function AiIdeas({
  interest,
  lang,
  minutes,
  backBy,
  slots,
  fallback,
}: {
  interest: Interest;
  lang: Lang;
  /** Time budget: minutes until the traveller must be back. */
  minutes: number;
  /** "Back by" time shown on the cards. */
  backBy: string;
  /** How many cards may be added (keeps the screen at 3 ideas). */
  slots: number;
  /** Shown instead when there is no AI idea (AI off, failed, nothing fits): the hand-written idea it replaced. */
  fallback?: ReactNode;
}) {
  const t = getMessages(lang);
  const enabled = useAiStatus()?.ai ?? null;
  const active = Boolean(enabled) && slots > 0 && minutes >= 3;
  const query = new URLSearchParams({ interest, lang, wait: String(minutes) }).toString();
  // The answer is stored with the request it belongs to, so a new request shows "working" again.
  const [result, setResult] = useState<{ query: string; ideas: AiIdea[] | null } | null>(null);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    fetch(`/api/ai/ideas?${query}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`ideas ${r.status}`))))
      .then((d: { ideas: AiIdea[] }) => alive && setResult({ query, ideas: d.ideas }))
      .catch((err) => {
        console.warn('[ai] no AI ideas:', err);
        if (alive) setResult({ query, ideas: null });
      });
    return () => {
      alive = false;
    };
  }, [active, query]);

  const current = result?.query === query ? result : null;
  const ideas = current?.ideas ?? null;
  if (!active || (current && !ideas)) return <>{fallback}</>;
  if (!ideas) {
    return (
      <li className={styles.ideasWorking}>
        <AiWorking text={t.ai.ideasWorking} />
      </li>
    );
  }
  const shown = ideas.slice(0, slots);
  if (!shown.length) return <>{fallback}</>;
  const withMedia = interest !== 'eat';
  return (
    <>
      {shown.map((idea) => (
        <IdeaCard
          key={idea.title}
          title={idea.title}
          badge={<AiChip label={t.ai.label} />}
          media={withMedia ? <IconCircle name={ICONS[interest]} /> : undefined}
          lines={[idea.description]}
          clampLines
          walk={idea.walkMinutes != null ? t.common.walk(idea.walkMinutes) : ''}
          note={t.common.backBy(backBy)}
          notePlacement={withMedia ? 'below' : 'end'}
        />
      ))}
      <li className={styles.ideasNote}>{t.ai.ideasCheck}</li>
    </>
  );
}
