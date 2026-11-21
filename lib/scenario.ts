import type { Lang, Scenario, TimeOfDay, WaitLevel } from './types';

export const WAIT_LEVELS: readonly WaitLevel[] = ['short', 'medium', 'long'];
export const TIMES_OF_DAY: readonly TimeOfDay[] = ['day', 'evening', 'night'];
/** In the order shown on the kiosk: EN · FR · DE · IT. */
export const LANGS: readonly Lang[] = ['en', 'fr', 'de', 'it'];

export const DEFAULT_SCENARIO: Scenario = { wait: 'medium', time: 'day', lang: 'en' };

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function pick<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** Reads `?wait=…&time=…&lang=…`, with defaults for missing or unknown values. */
export function parseScenario(params: SearchParams): Scenario {
  return {
    wait: pick(first(params.wait), WAIT_LEVELS, DEFAULT_SCENARIO.wait),
    time: pick(first(params.time), TIMES_OF_DAY, DEFAULT_SCENARIO.time),
    lang: pick(first(params.lang), LANGS, DEFAULT_SCENARIO.lang),
  };
}

/** Builds a link that keeps the scenario switches and the language (defaults are left out). */
export function withScenario(path: string, scenario: Scenario): string {
  const query = new URLSearchParams();
  if (scenario.wait !== DEFAULT_SCENARIO.wait) query.set('wait', scenario.wait);
  if (scenario.time !== DEFAULT_SCENARIO.time) query.set('time', scenario.time);
  if (scenario.lang !== DEFAULT_SCENARIO.lang) query.set('lang', scenario.lang);
  const qs = query.toString();
  return qs ? `${path}?${qs}` : path;
}
