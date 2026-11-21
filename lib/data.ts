/**
 * Data access for the screens. Today every function returns mock data in the
 * requested language; later they will call the backend (GTFS routing +
 * Together AI) with the same return types, so the pages don't need to change.
 */
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
  TimeOfDay,
  TripResult,
  WaitLevel,
  WaitScenario,
  WelcomeInfo,
} from './types';

export async function getWelcome(lang: Lang): Promise<WelcomeInfo> {
  return localize<WelcomeInfo>(welcome, lang);
}

/** Later: POST /scan with the decoded ticket QR payload. */
export async function getTripResult(lang: Lang): Promise<TripResult> {
  return localize<TripResult>(tripResult, lang);
}

/** Later: GET /activities?trip=…&wait=…&lang=… */
export async function getWaitScenario(level: WaitLevel, lang: Lang): Promise<WaitScenario> {
  return localize<WaitScenario>(waitScenarios[level], lang);
}

/** Later: GET /activities?trip=…&category=rest&now=…&lang=… */
export async function getRestScenario(time: TimeOfDay, lang: Lang): Promise<RestScenario> {
  return localize<RestScenario>(restScenarios[time], lang);
}

/** Later: GET /trip/{id}?lang=… (polled for updates). */
export async function getPhoneTrip(lang: Lang): Promise<PhoneTrip> {
  return localize<PhoneTrip>(phoneTrip, lang);
}
