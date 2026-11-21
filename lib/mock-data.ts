/**
 * Demo data for the scenario in docs/SCREENS.md:
 * 10 Sep 2026, Zürich HB, traveller going to Chur, IC 3 at 11:07 cancelled
 * because of overhead line damage between Wädenswil and Pfäffikon SZ.
 *
 * Everything here is mock data. Wording follows docs/SCREENS.md exactly.
 * Never add real hotel names, prices or availability: keep the placeholders.
 */
import type {
  Disruption,
  Line,
  Place,
  PhoneTrip,
  RestScenario,
  Station,
  TimeOfDay,
  Trip,
  TripResult,
  WaitLevel,
  WaitScenario,
  WelcomeInfo,
} from './types';

// ---------------------------------------------------------------------------
// Stations and lines
// ---------------------------------------------------------------------------

export const stations = {
  zurichHb: { id: '8503000', name: 'Zürich HB' },
  chur: { id: '8509000', name: 'Chur' },
  waedenswil: { id: '8503206', name: 'Wädenswil' },
  pfaeffikonSz: { id: '8503314', name: 'Pfäffikon SZ' },
} satisfies Record<string, Station>;

export const lines = {
  ic3: { name: 'IC 3', icon: 'ic-3' },
  ir35: { name: 'IR 35', icon: 'ir-35' },
  s5: { name: 'S5', icon: 's-5' },
} satisfies Record<string, Line>;

// ---------------------------------------------------------------------------
// Disruption and trip
// ---------------------------------------------------------------------------

export const disruption: Disruption = {
  id: 'wadenswil-pfaffikon-2026-09-10',
  title: 'Disruption Wädenswil – Pfäffikon SZ',
  summary:
    'Overhead line damage. IC 3, S2 and S25 are cancelled on this section until early evening.',
  reason:
    'Overhead line damage between Wädenswil and Pfäffikon SZ. Repairs expected until early evening.',
  section: { from: stations.waedenswil, to: stations.pfaeffikonSz },
  cancelledLines: ['IC 3', 'S2', 'S25'],
  updatedAt: '11:00',
};

export const welcome: WelcomeInfo = {
  now: '11:05',
  station: stations.zurichHb,
  disruptions: [disruption],
};

export const trip: Trip = {
  id: 'demo-trip-1',
  ticket: {
    from: stations.zurichHb,
    to: stations.chur,
    date: '2026-09-10',
    travelClass: 2,
    printedDate: '10.09.',
  },
  plannedTrain: {
    line: lines.ic3,
    direction: 'Chur',
    departure: '11:07',
    platform: '9',
  },
  plannedArrival: '12:22',
};

export const tripResult: TripResult = {
  trip,
  disruption,
  now: '11:05',
  minutesToDeparture: 32,
  best: {
    id: 'ir35-1137',
    train: { line: lines.ir35, direction: 'Chur', departure: '11:37', platform: '9' },
    arrival: '12:52',
    arrivalStation: stations.chur,
    changes: 0,
    routeLabel: 'IR 35 direct',
    delayVsPlanMinutes: 30,
    ticketValid: true,
    occupancy: { secondClass: 'high' },
    boardingHint: 'front (sector A)',
  },
  alternatives: [
    {
      id: 's5-1114',
      train: { line: lines.s5, departure: '11:14', platform: '4' },
      arrival: '13:02',
      arrivalStation: stations.chur,
      changes: 1,
      routeLabel: 'S5 via Rapperswil, change in Ziegelbrücke',
      tradeOff: 'Leaves sooner, arrives later',
      delayVsPlanMinutes: 40,
      ticketValid: true,
      occupancy: { secondClass: 'medium' },
    },
    {
      id: 'ir35-1237',
      train: { line: lines.ir35, direction: 'Chur', departure: '12:37', platform: '9' },
      arrival: '13:52',
      arrivalStation: stations.chur,
      changes: 0,
      routeLabel: 'IR 35 direct',
      tradeOff: 'Less crowded',
      delayVsPlanMinutes: 90,
      ticketValid: true,
      occupancy: { secondClass: 'low' },
    },
  ],
};

// ---------------------------------------------------------------------------
// Places near Zürich HB (hand-written, photos to be added in /public/photos)
// ---------------------------------------------------------------------------

export const places = {
  stationHall: {
    id: 'zurich-hb-hall',
    name: 'The station hall',
    photo: { label: 'Photo: main hall of Zürich HB' },
    history: 'The station opened in 1871. Its great hall is one of the largest in Switzerland.',
    walk: { minutes: 1 },
  },
  nationalMuseum: {
    id: 'swiss-national-museum',
    name: 'Swiss National Museum',
    photo: { label: 'Photo: museum building' },
    history: 'Built in 1898 to look like a castle. Inside: Swiss history from early times to today.',
    walk: { minutes: 3 },
  },
  platzspitz: {
    id: 'platzspitz',
    name: 'Platzspitz park',
    photo: { label: 'Photo: park by the river' },
    history: 'A park since the 1700s, at the spot where two rivers meet.',
    walk: { minutes: 6 },
  },
  lindenhof: {
    id: 'lindenhof',
    name: 'Lindenhof hill',
    photo: { label: 'Photo: view over the old town' },
    history: 'In Roman times there was a fort on this hill. Today: a quiet square with a view.',
    walk: { minutes: 8 },
  },
} satisfies Record<string, Place>;

// ---------------------------------------------------------------------------
// Wait scenarios (screens 4, 5, 5b)
// ---------------------------------------------------------------------------

export const waitScenarios: Record<WaitLevel, WaitScenario> = {
  short: {
    level: 'short',
    waitMinutes: 9,
    returnPlan: {
      train: { line: lines.s5, departure: '11:14', platform: '4' },
      day: 'today',
      backBy: '11:10',
    },
    eat: [
      {
        id: 'kiosk-platform-4',
        title: 'Drink or snack to take away',
        location: 'Kiosk at the stairs to platform 4',
        walk: { minutes: 1 },
        backBy: '11:10',
      },
    ],
    explore: {
      intro: 'You only have a few minutes, so stay inside the station.',
      places: [{ place: places.stationHall, backBy: '11:10' }],
    },
  },
  medium: {
    level: 'medium',
    waitMinutes: 32,
    returnPlan: {
      train: { line: lines.ir35, direction: 'Chur', departure: '11:37', platform: '9' },
      day: 'today',
      backBy: '11:30',
    },
    eat: [
      {
        id: 'coffee-shopville',
        title: 'Coffee and a snack',
        location: 'Cafés one floor down, in Shopville',
        walk: { minutes: 2 },
        backBy: '11:30',
      },
      {
        id: 'lunch-main-hall',
        title: 'Lunch for the train',
        location: 'Food stalls in the main hall',
        walk: { minutes: 3 },
        backBy: '11:29',
      },
      {
        id: 'bakery-shopville',
        title: 'Bakery',
        location: 'Along the Shopville passage',
        walk: { minutes: 2 },
        backBy: '11:32',
      },
    ],
    explore: {
      intro: 'Three places close to the station. The walk back is already counted.',
      places: [
        { place: places.nationalMuseum, backBy: '11:27' },
        { place: places.platzspitz, backBy: '11:25' },
        { place: places.stationHall, backBy: '11:33' },
      ],
    },
  },
  long: {
    level: 'long',
    waitMinutes: 92,
    returnPlan: {
      train: { line: lines.ir35, direction: 'Chur', departure: '12:37', platform: '9' },
      day: 'today',
      backBy: '12:20',
    },
    eat: [
      {
        id: 'sit-down-lunch',
        title: 'Sit-down lunch',
        location: 'Restaurants in and around the station',
        walk: { minutes: 2, maxMinutes: 5 },
        backBy: '12:25',
      },
      {
        id: 'coffee-cake-shopville',
        title: 'Coffee and cake',
        location: 'Cafés one floor down, in Shopville',
        walk: { minutes: 2 },
        backBy: '12:30',
      },
      {
        id: 'lunch-main-hall',
        title: 'Lunch for the train',
        location: 'Food stalls in the main hall',
        walk: { minutes: 3 },
        backBy: '12:29',
      },
    ],
    explore: {
      intro: 'Enough time to see a bit of Zürich. The walk back is already counted.',
      places: [
        { place: places.nationalMuseum, backBy: '12:22' },
        { place: places.lindenhof, backBy: '12:20' },
        { place: places.platzspitz, backBy: '12:18' },
      ],
    },
  },
};

// ---------------------------------------------------------------------------
// Rest scenarios by time of day (screen 5c)
// ---------------------------------------------------------------------------

export const restScenarios: Record<TimeOfDay, RestScenario> = {
  day: {
    time: 'day',
    now: '11:05',
    title: 'Sit down and rest',
    intro: 'Calm places close to your platform.',
    options: [
      {
        id: 'seat-charging-pl9',
        kind: 'seat',
        name: 'Seat with phone charging',
        details: ['Waiting area near platform 9'],
        walk: { minutes: 1 },
        note: 'Back by 11:34',
      },
      {
        id: 'quiet-cafe',
        kind: 'cafe',
        name: 'Quiet café',
        details: ['Cafés one floor down, in Shopville'],
        walk: { minutes: 2 },
        note: 'Back by 11:30',
      },
      {
        id: 'park-bench',
        kind: 'park',
        name: 'Bench in the park',
        details: ['Platzspitz park, just behind the station'],
        walk: { minutes: 6 },
        note: 'Back by 11:25',
      },
    ],
    returnPlan: {
      train: { line: lines.ir35, direction: 'Chur', departure: '11:37', platform: '9' },
      day: 'today',
      backBy: '11:30',
    },
  },
  evening: {
    time: 'evening',
    now: '19:40',
    title: 'A calm place for the evening',
    intro: 'Your train leaves late. Rest here, or take a room if you are tired.',
    options: [
      {
        id: 'warm-waiting-room',
        kind: 'seat',
        name: 'Warm waiting room',
        details: ['Main hall, next to platform 3'],
        walk: { minutes: 2 },
        note: 'Back by 21:30',
      },
      {
        id: 'restaurant-seats',
        kind: 'cafe',
        name: 'Restaurant with seats',
        details: ['Restaurants in and around the station'],
        walk: { minutes: 3 },
        note: 'Back by 21:25',
      },
      {
        id: 'hotel-opposite',
        kind: 'hotel',
        name: '[Hotel name]',
        details: ['Hotel opposite the station', 'rooms free tonight', '[price] per night'],
        walk: { minutes: 2 },
        note: 'Info point can book it',
      },
    ],
    returnPlan: {
      train: { line: lines.ic3, direction: 'Chur', departure: '21:37', platform: '7' },
      day: 'today',
      backBy: '21:30',
    },
  },
  night: {
    time: 'night',
    now: '23:40',
    title: 'No more trains tonight',
    intro: 'Your next train leaves tomorrow. These hotels are close.',
    options: [
      {
        id: 'hotel-opposite',
        kind: 'hotel',
        name: '[Hotel name]',
        details: ['Opposite the station', '[price] per night'],
        walk: { minutes: 2 },
        note: 'Rooms free',
      },
      {
        id: 'hotel-main-hall',
        kind: 'hotel',
        name: '[Hotel name]',
        details: ['Next to the main hall', '[price] per night'],
        walk: { minutes: 3 },
        note: 'Rooms free',
      },
      {
        id: 'hotel-river',
        kind: 'hotel',
        name: '[Hotel name]',
        details: ['Near the river', 'step-free entrance', '[price] per night'],
        walk: { minutes: 5 },
        note: 'Rooms free',
        stepFree: true,
      },
    ],
    returnPlan: {
      train: { line: lines.ic3, direction: 'Chur', departure: '06:37', platform: '7' },
      day: 'tomorrow',
      backBy: '06:30',
    },
    help: {
      title: 'Stuck because of the disruption?',
      text: 'Ask at the info point in the main hall. Staff can book a room for you and tell you if SBB pays for it.',
    },
  },
};

// ---------------------------------------------------------------------------
// Phone (screen 6)
// ---------------------------------------------------------------------------

export const phoneTrip: PhoneTrip = {
  tripId: trip.id,
  from: stations.zurichHb,
  to: stations.chur,
  latest: {
    time: '11:21',
    headline: 'Your IR 35 now leaves at 11:42 (+5 min)',
    platform: '9',
    headBackBy: '11:35',
  },
  train: {
    line: lines.ir35,
    direction: 'Chur',
    departure: '11:42',
    plannedDeparture: '11:37',
    platform: '9',
    arrival: '12:57',
    arrivalStation: stations.chur,
    minutesToDeparture: 21,
  },
  timeline: [
    {
      id: 'u3',
      time: '11:21',
      tone: 'warning',
      text: 'IR 35 delayed by 5 min. Your plan was updated.',
    },
    {
      id: 'u2',
      time: '11:06',
      tone: 'success',
      text: 'You picked the IR 35 at the kiosk in Zürich HB.',
    },
    {
      id: 'u1',
      time: '11:05',
      tone: 'error',
      text: 'Your IC 3 at 11:07 was cancelled (overhead line damage, Wädenswil – Pfäffikon SZ).',
    },
  ],
};
