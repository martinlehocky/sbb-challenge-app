'use client';

import { useRouter } from 'next/navigation';
import type { MouseEvent } from 'react';

/**
 * Lyne link components (sbb-button-link, sbb-card-link, …) render a real
 * <a href> in their shadow root. This turns a plain left click into a
 * client-side Next.js navigation, while keeping the real link for
 * new-tab clicks, keyboard and screen readers.
 */
export function useClientNav(href: string) {
  const router = useRouter();
  return (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    router.push(href);
  };
}
