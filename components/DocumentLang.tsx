'use client';

import { useEffect } from 'react';
import type { Lang } from '@/lib/types';

/**
 * Keeps <html lang> in sync with the kiosk language (the root layout can't
 * read the URL). Lyne components use it for their built-in screen-reader texts.
 */
export function DocumentLang({ lang }: { lang: Lang }) {
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return null;
}
