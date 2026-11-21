/**
 * Data access for the screens. Today every function returns mock data;
 * later they will call the backend (GTFS routing + Together AI) with the same
 * return types, so the pages don't need to change.
 */
import {
  phoneTrip,
  restScenarios,
  tripResult,
  waitScenarios,
  welcome,
} from './mock-data';
import type {
  PhoneTrip,
  RestScenario,
  TimeOfDay,
  TripResult,
  WaitLevel,
  WaitScenario,
  WelcomeInfo,
} from './types';

export async function getWelcome(): Promise<WelcomeInfo> {
  return welcome;
}

/** Later: POST /scan with the decoded ticket QR payload. */
export async function getTripResult(): Promise<TripResult> {
  return tripResult;
}

/** Later: GET /activities?trip=…&wait=… */
export async function getWaitScenario(level: WaitLevel): Promise<WaitScenario> {
  return waitScenarios[level];
}

/** Later: GET /activities?trip=…&category=rest&now=… */
export async function getRestScenario(time: TimeOfDay): Promise<RestScenario> {
  return restScenarios[time];
}

/** Later: GET /trip/{id} (polled for updates). */
export async function getPhoneTrip(): Promise<PhoneTrip> {
  return phoneTrip;
}
