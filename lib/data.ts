/**
 * Data access for the screens.
 *
 * - BACKEND_URL not set: every function returns the mock data (lib/mock-data.ts).
 * - BACKEND_URL set: trip, disruption and train data come from the Python backend (lib/backend.ts)
 *   for the simulated moment DEMO_AT. The hand-written Zürich HB ideas (cafés, places, rest spots)
 *   stay as written; their "back by" times are moved to fit the real train.
 *   If the backend cannot be reached, the error is logged and the mock data is shown instead,
 *   unless BACKEND_STRICT=1 (then the page fails, which is what you want when testing).
 *
 * Only Server Components import this file, so the backend address never reaches the browser.
 */
import {
  backendConfig,
  clock,
  fetchAdvice,
  liveWelcome,
  phoneTripFromAdvice,
  shiftTimes,
  toMinutes,
  tripResultFromAdvice,
  type BackendConfig,
} from './backend';
import { localize } from './i18n/localize';
import {
  phoneTrip,
  restScenarios,
  tripResult,
  waitScenarios,
  welcome,
} from './mock-data';
import type {
  Lang,
  PhoneTrip,
  RestScenario,
  ReturnPlan,
  TimeOfDay,
  TripResult,
  WaitLevel,
  WaitScenario,
  WelcomeInfo,
} from './types';

/**
 * Runs `live` with the backend when configured; otherwise (or on failure, unless strict) returns `mock()`.
 * `to` replaces the ticket's destination (a station chosen by voice or text on the kiosk); `dep` is the departure
 * of the train the traveller picked under "Other options" (it becomes their train on every screen).
 */
async function fromBackend<T>(
  what: string,
  live: (cfg: BackendConfig) => Promise<T>,
  mock: () => T,
  to?: string,
  dep?: string,
): Promise<T> {
  const base = backendConfig();
  if (!base) return mock();
  const cfg = { ...base, ...(to ? { destination: to } : {}), ...(dep ? { prefer: dep } : {}) };
  try {
    return await live(cfg);
  } catch (err) {
    if (process.env.BACKEND_STRICT === '1') throw err;
    console.error(`[backend] ${what} failed, showing mock data instead:`, err);
    return mock();
  }
}

/** Fills the {platform} placeholder used in a few hand-written texts. */
function fillPlatform<T>(value: T, platform: string): T {
  return JSON.parse(JSON.stringify(value).replaceAll('{platform}', platform)) as T;
}

function backByFor(plan: ReturnPlan, deltaMinutes: number): ReturnPlan {
  return { ...plan, backBy: shiftTimes(plan.backBy, deltaMinutes) };
}

/**
 * True if there is time to walk there and still be back by `backBy` ("HH:MM", same day as `now`).
 * Ideas written for a longer wait are dropped when the real train leaves sooner.
 */
function fits(backBy: string, walkMinutes: number, now: string): boolean {
  return toMinutes(backBy) - toMinutes(now) >= walkMinutes;
}

/** First "HH:MM" in a text such as "Back by 11:34" (notes like "Rooms free" have none). */
function timeIn(text: string): string | null {
  return /\b([01]\d|2[0-3]):[0-5]\d\b/.exec(text)?.[0] ?? null;
}

/** Wait level that matches the real waiting time, so the ideas fit the time there is. */
function levelFor(minutes: number): WaitLevel {
  if (minutes <= 15) return 'short';
  if (minutes <= 60) return 'medium';
  return 'long';
}

export async function getWelcome(lang: Lang): Promise<WelcomeInfo> {
  return fromBackend('welcome', (cfg) => liveWelcome(cfg, lang), () => localize<WelcomeInfo>(welcome, lang));
}

// Live versions: they throw on any backend problem, so that the calling page falls back as a whole.

async function liveTripResult(cfg: BackendConfig, lang: Lang): Promise<TripResult> {
  return tripResultFromAdvice(await fetchAdvice(cfg, lang), cfg, lang);
}

async function liveWaitScenario(cfg: BackendConfig, lang: Lang): Promise<WaitScenario> {
  const result = await liveTripResult(cfg, lang);
  const train = result.best.train;
  const real = levelFor(result.minutesToDeparture);
  const base = localize<WaitScenario>(waitScenarios[real], lang);
  const delta = toMinutes(train.departure) - toMinutes(base.returnPlan.train.departure);
  const now = clock(cfg.at);
  const scenario: WaitScenario = {
    ...base,
    now,
    waitMinutes: result.minutesToDeparture,
    returnPlan: backByFor({ ...base.returnPlan, train }, delta),
    eat: base.eat
      .map((idea) => ({ ...idea, backBy: shiftTimes(idea.backBy, delta) }))
      .filter((idea) => fits(idea.backBy, idea.walk.minutes, now)),
    explore: {
      ...base.explore,
      places: base.explore.places
        .map((p) => ({ ...p, backBy: shiftTimes(p.backBy, delta) }))
        .filter((p) => fits(p.backBy, p.place.walk.minutes, now)),
    },
  };
  return fillPlatform(scenario, train.platform);
}

/** Screen 3 (and the ticket shown on screen 2). */
export async function getTripResult(lang: Lang, to?: string, dep?: string): Promise<TripResult> {
  return fromBackend(
    'trip result',
    (cfg) => liveTripResult(cfg, lang),
    () => pickConnection(localize<TripResult>(tripResult, lang), dep),
    to,
    dep,
  );
}

/** Mock mode: the option the traveller picked becomes the best train, the old best one an option. */
function pickConnection(result: TripResult, dep?: string): TripResult {
  const picked = dep ? result.alternatives.find((c) => c.train.departure === dep) : undefined;
  if (!picked) return result;
  const minutes = toMinutes(picked.train.departure) - toMinutes(result.best.train.departure);
  return {
    ...result,
    best: picked,
    alternatives: [result.best, ...result.alternatives.filter((c) => c !== picked)],
    minutesToDeparture: result.minutesToDeparture + minutes,
  };
}

/**
 * Screens 4, 5, 5b. In mock mode `level` picks the demo scenario.
 * With the backend, the train is the real best next train and the level follows the real waiting time
 * (the `wait` URL switch then has no effect): the ideas of that level are kept, their times are moved
 * by the difference between the real departure and the demo departure, and ideas that no longer fit are dropped.
 */
export async function getWaitScenario(level: WaitLevel, lang: Lang, to?: string, dep?: string): Promise<WaitScenario> {
  return fromBackend(
    'wait scenario',
    (cfg) => liveWaitScenario(cfg, lang),
    () => {
      const scenario = localize<WaitScenario>(waitScenarios[level], lang);
      return fillPlatform(scenario, scenario.returnPlan.train.platform);
    },
    to,
    dep,
  );
}

/**
 * Screen 5c. "day" uses the real best next train (times moved like on the wait screens).
 * "evening" and "night" are imagined later moments of the day and stay demo data in both modes.
 */
export async function getRestScenario(time: TimeOfDay, lang: Lang, to?: string, dep?: string): Promise<RestScenario> {
  const mock = () => {
    const scenario = localize<RestScenario>(restScenarios[time], lang);
    return fillPlatform(scenario, scenario.returnPlan.train.platform);
  };
  if (time !== 'day') return mock();
  return fromBackend(
    'rest scenario',
    async (cfg) => {
      const result = await liveTripResult(cfg, lang);
      const train = result.best.train;
      // Same "be back by" as screens 4-5b: it follows the real waiting time, not the 32-minute demo wait.
      const { returnPlan } = await liveWaitScenario(cfg, lang);
      const base = localize<RestScenario>(restScenarios.day, lang);
      const delta = toMinutes(train.departure) - toMinutes(base.returnPlan.train.departure);
      const now = clock(cfg.at);
      const scenario: RestScenario = {
        ...base,
        now,
        options: base.options
          .map((o) => ({ ...o, note: shiftTimes(o.note, delta) }))
          .filter((o) => {
            const backBy = timeIn(o.note);
            return backBy === null || fits(backBy, o.walk.minutes, now);
          }),
        returnPlan,
      };
      return fillPlatform(scenario, train.platform);
    },
    mock,
    to,
    dep,
  );
}

/** Screen 6. */
export async function getPhoneTrip(lang: Lang, to?: string, dep?: string): Promise<PhoneTrip> {
  return fromBackend(
    'phone trip',
    async (cfg) => phoneTripFromAdvice(await fetchAdvice(cfg, lang), cfg, lang),
    () => localize<PhoneTrip>(phoneTrip, lang),
    to,
    dep,
  );
}

/** Simulated "now" of the kiosk ("HH:MM"): DEMO_AT with the backend, the demo time otherwise. */
export function getNow(): string {
  const cfg = backendConfig();
  return cfg ? clock(cfg.at) : localize<WelcomeInfo>(welcome, 'en').now;
}
