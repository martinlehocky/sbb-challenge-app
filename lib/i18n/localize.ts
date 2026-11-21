import type { Lang } from '../types';

/** A text in all kiosk languages. */
export type L10n = Record<Lang, string>;

/** `T`, but every string may also be given in all languages (used by the mock data). */
export type Localizable<T> = T extends string
  ? T | L10n
  : T extends readonly (infer U)[]
    ? Localizable<U>[]
    : T extends object
      ? { [K in keyof T]: Localizable<T[K]> }
      : T;

/** Shorthand for a text in all languages: tx(en, de, fr, it). */
export function tx(en: string, de: string, fr: string, it: string): L10n {
  return { en, de, fr, it };
}

function isL10n(value: object): value is L10n {
  const keys = Object.keys(value);
  return keys.length === 4 && ['en', 'de', 'fr', 'it'].every((k) => keys.includes(k));
}

/** Resolves every L10n text in `value` to the given language. */
export function localize<T>(value: Localizable<T>, lang: Lang): T {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      if (isL10n(v)) return v[lang];
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    }
    return v;
  };
  return walk(value) as T;
}
