'use client';

import { useEffect, useState } from 'react';

export interface ClientAiStatus {
  /** Backend reachable: typed destination search works (the backend falls back to text matching). */
  backend: boolean;
  /** Together AI available: voice, plain-language summary, AI ideas. */
  ai: boolean;
}

let statusPromise: Promise<ClientAiStatus> | null = null;

/** Asks the server once per page load what is available. */
function loadStatus(): Promise<ClientAiStatus> {
  statusPromise ??= fetch('/api/ai/status')
    .then((r) => r.json())
    .then((s: { backend?: boolean; enabled?: boolean }) => ({ backend: Boolean(s.backend), ai: Boolean(s.enabled) }))
    .catch(() => ({ backend: false, ai: false }));
  return statusPromise;
}

/** null while checking. */
export function useAiStatus(): ClientAiStatus | null {
  const [status, setStatus] = useState<ClientAiStatus | null>(null);
  useEffect(() => {
    let alive = true;
    loadStatus().then((v) => alive && setStatus(v));
    return () => {
      alive = false;
    };
  }, []);
  return status;
}
