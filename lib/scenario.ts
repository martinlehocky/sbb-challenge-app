import type { Scenario, TimeOfDay, WaitLevel } from './types';

export const WAIT_LEVELS: readonly WaitLevel[] = ['short', 'medium', 'long'];
export const TIMES_OF_DAY: readonly TimeOfDay[] = ['day', 'evening', 'night'];

export const DEFAULT_SCENARIO: Scenario = { wait: 'medium', time: 'day' };

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Reads `?wait=short|medium|long&time=day|evening|night`, with defaults. */
export function parseScenario(params: SearchParams): Scenario {
  const wait = first(params.wait);
  const time = first(params.time);
  return {
    wait: WAIT_LEVELS.includes(wait as WaitLevel) ? (wait as WaitLevel) : DEFAULT_SCENARIO.wait,
    time: TIMES_OF_DAY.includes(time as TimeOfDay) ? (time as TimeOfDay) : DEFAULT_SCENARIO.time,
  };
}

/** Builds a link that keeps the scenario switches (defaults are left out). */
export function withScenario(path: string, scenario: Scenario): string {
  const query = new URLSearchParams();
  if (scenario.wait !== DEFAULT_SCENARIO.wait) query.set('wait', scenario.wait);
  if (scenario.time !== DEFAULT_SCENARIO.time) query.set('time', scenario.time);
  const qs = query.toString();
  return qs ? `${path}?${qs}` : path;
}
