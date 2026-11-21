/**
 * Data shapes shared by the kiosk and phone screens.
 *
 * They mirror what the future backend (GTFS routing + Together AI) is meant
 * to return, so the mock data in `mock-data.ts` can later be replaced by API
 * calls in `data.ts` without touching the pages.
 *
 * Conventions:
 * - Times are local station times as "HH:MM" strings (Europe/Zurich).
 * - Dates are ISO "YYYY-MM-DD".
 * - Station ids are DiDok / UIC numbers as strings (e.g. "8503000" = Zürich HB).
 */

/** "HH:MM", local time. */
export type ClockTime = string;

/** Demo switch: how long the traveller has to wait for the next train. */
export type WaitLevel = 'short' | 'medium' | 'long';

/** Demo switch: time of day for the "Sit down and rest" screen. */
export type TimeOfDay = 'day' | 'evening' | 'night';

/** Kiosk languages (EN · FR · DE · IT). */
export type Lang = 'en' | 'fr' | 'de' | 'it';

export interface Scenario {
  wait: WaitLevel;
  time: TimeOfDay;
  lang: Lang;
}

export interface Station {
  id: string;
  name: string;
}

/** A public transport line, e.g. IC 3 or IR 35. */
export interface Line {
  /** Display name, e.g. "IR 35". */
  name: string;
  /**
   * SBB timetable icon name for the line badge, e.g. "ir-35". Only set when the
   * icon is in /public/sbb-icons; without it the badge shows the name as text.
   */
  icon?: string;
}

/** Occupancy levels as used by `sbb-timetable-occupancy`. */
export type Occupancy = 'none' | 'low' | 'medium' | 'high';

export interface Disruption {
  id: string;
  /** Headline, e.g. "Disruption Wädenswil – Pfäffikon SZ". */
  title: string;
  /** Short plain-language description for the welcome screen. */
  summary: string;
  /** One-line reason shown with a cancelled train. */
  reason: string;
  section: { from: Station; to: Station };
  cancelledLines: string[];
  /** Time of the last update of this disruption. */
  updatedAt: ClockTime;
}

/** What we read from the scanned ticket. */
export interface Ticket {
  from: Station;
  to: Station;
  date: string;
  travelClass: 1 | 2;
  /** Short date as printed on the ticket, e.g. "10.09.". */
  printedDate: string;
}

/** A single train departure (the planned one or a replacement). */
export interface TrainRun {
  line: Line;
  /** Final destination of the train, e.g. "Chur" (omitted when not known). */
  direction?: string;
  departure: ClockTime;
  platform: string;
}

/** The traveller's trip as recognised from the ticket. */
export interface Trip {
  id: string;
  ticket: Ticket;
  plannedTrain: TrainRun;
  /** Planned arrival at the destination. */
  plannedArrival: ClockTime;
}

/** A possible connection to the destination, as found by the router. */
export interface Connection {
  id: string;
  train: TrainRun;
  arrival: ClockTime;
  arrivalStation: Station;
  changes: number;
  /** Route description, e.g. "S5 via Rapperswil, change in Ziegelbrücke". */
  routeLabel: string;
  /** Trade-off compared with the best option, e.g. "Leaves sooner, arrives later". */
  tradeOff?: string;
  /** Minutes later than the original plan at the destination. */
  delayVsPlanMinutes: number;
  /** Only true when we actually know it; the backend cannot check tickets, so it sends false. */
  ticketValid: boolean;
  /** Left out when there is no occupancy forecast (the backend has none). */
  occupancy?: { firstClass?: Occupancy; secondClass: Occupancy };
  /** Where to board, e.g. "front (sector A)". */
  boardingHint?: string;
}

/** Result of the scan: what happened and what to do next (screen 3). */
export interface TripResult {
  trip: Trip;
  /** False when the planned train is not hit by any disruption: then `best` is the planned train itself. */
  affected: boolean;
  disruption: Disruption;
  /** Simulated "now" at the kiosk. */
  now: ClockTime;
  best: Connection;
  /** Minutes from `now` until the best train departs. */
  minutesToDeparture: number;
  alternatives: Connection[];
}

/** Walking time one way, already rounded. */
export interface WalkTime {
  minutes: number;
  /** Set for ranges, e.g. "2 to 5 minutes walk". */
  maxMinutes?: number;
}

/** The train the traveller must be back for, and when. */
export interface ReturnPlan {
  train: TrainRun;
  /** Whether the train leaves today or tomorrow (overnight case). */
  day: 'today' | 'tomorrow';
  /** "Please be back by" time (departure minus buffer). */
  backBy: ClockTime;
}

/** A food or drink idea (screen 5). */
export interface Idea {
  id: string;
  title: string;
  location: string;
  walk: WalkTime;
  backBy: ClockTime;
}

export interface Photo {
  /** Path below /public, e.g. "/photos/swiss-national-museum.jpg". Empty until a real photo is added. */
  src?: string;
  /** Alt text, also used as the placeholder label (e.g. "Photo: museum building"). */
  label: string;
  /** Licence / credit line for freely licensed images. */
  credit?: string;
}

/** A sight near the station (screen 5b). */
export interface Place {
  id: string;
  name: string;
  photo: Photo;
  /** One-line history, written by hand (never invented). */
  history: string;
  walk: WalkTime;
}

export interface PlaceSuggestion {
  place: Place;
  backBy: ClockTime;
}

export interface ExploreSuggestions {
  intro: string;
  places: PlaceSuggestion[];
}

/** One wait-time scenario (screens 4, 5 and 5b). */
export interface WaitScenario {
  level: WaitLevel;
  /** Simulated "now" at the kiosk (defaults to the demo time 11:05). */
  now?: ClockTime;
  waitMinutes: number;
  returnPlan: ReturnPlan;
  eat: Idea[];
  explore: ExploreSuggestions;
}

export type RestKind = 'seat' | 'cafe' | 'park' | 'hotel';

/** A place to sit down, or a hotel (screen 5c). */
export interface RestOption {
  id: string;
  kind: RestKind;
  name: string;
  /** Detail parts, shown joined with " · ". */
  details: string[];
  walk: WalkTime;
  /** Note on the right, e.g. "Back by 11:34" or "Rooms free". */
  note: string;
  stepFree?: boolean;
}

/** One time-of-day scenario for screen 5c. */
export interface RestScenario {
  time: TimeOfDay;
  now: ClockTime;
  title: string;
  intro: string;
  options: RestOption[];
  returnPlan: ReturnPlan;
  /** Extra help box, e.g. for the overnight case. */
  help?: { title: string; text: string };
}

export type UpdateTone = 'warning' | 'success' | 'error';

/** One entry of the "what happened so far" timeline on the phone. */
export interface PhoneUpdate {
  id: string;
  time: ClockTime;
  tone: UpdateTone;
  text: string;
}

/** Live state of a saved trip, as shown on the phone (screen 6). */
export interface PhoneTrip {
  tripId: string;
  from: Station;
  to: Station;
  latest: {
    time: ClockTime;
    headline: string;
    /** Body of the update. When missing, the screen shows the "still platform … head back by …" text. */
    text?: string;
    platform: string;
    /** New "head back by" time after the update. */
    headBackBy: ClockTime;
  };
  train: {
    line: Line;
    direction: string;
    departure: ClockTime;
    /** Original departure if delayed. */
    plannedDeparture?: ClockTime;
    platform: string;
    arrival: ClockTime;
    arrivalStation: Station;
    minutesToDeparture: number;
  };
  /** Newest first. */
  timeline: PhoneUpdate[];
}

/** Content of the welcome screen (screen 1). */
export interface WelcomeInfo {
  now: ClockTime;
  station: Station;
  disruptions: Disruption[];
}
