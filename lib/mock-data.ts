/**
 * Demo data for the scenario in docs/SCREENS.md:
 * 10 Sep 2026, Zürich HB, traveller going to Sargans, IC 3 at 11:07 cancelled
 * because of overhead line damage between Wädenswil and Pfäffikon SZ.
 *
 * Everything here is mock data. Texts are given in all kiosk languages with
 * tx(en, de, fr, it); lib/data.ts returns them in the traveller's language,
 * like the backend will. English follows docs/SCREENS.md exactly.
 * Never add real hotel names, prices or availability: keep the placeholders.
 */
import { tx, type Localizable } from './i18n/localize';
import type {
  Disruption,
  Line,
  PhoneTrip,
  Place,
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
// Stations and lines (official names, not translated)
// ---------------------------------------------------------------------------

export const stations = {
  zurichHb: { id: '8503000', name: 'Zürich HB' },
  sargans: { id: '8509411', name: 'Sargans' },
  waedenswil: { id: '8503206', name: 'Wädenswil' },
  pfaeffikonSz: { id: '8503209', name: 'Pfäffikon SZ' },
} satisfies Record<string, Station>;

export const lines = {
  ic3: { name: 'IC 3', icon: 'ic-3' },
  ir35: { name: 'IR 35', icon: 'ir-35' },
  s5: { name: 'S5', icon: 's-5' },
} satisfies Record<string, Line>;

/** "Back by HH:MM" note, same wording as the UI (lib/i18n/messages.tsx). */
const backBy = (time: string) =>
  tx(`Back by ${time}`, `Zurück bis ${time}`, `De retour à ${time}`, `Ritorno entro le ${time}`);

// ---------------------------------------------------------------------------
// Disruption and trip
// ---------------------------------------------------------------------------

export const disruption: Localizable<Disruption> = {
  id: 'wadenswil-pfaffikon-2026-09-10',
  title: tx(
    'Disruption Wädenswil – Pfäffikon SZ',
    'Störung Wädenswil – Pfäffikon SZ',
    'Perturbation Wädenswil – Pfäffikon SZ',
    'Perturbazione Wädenswil – Pfäffikon SZ',
  ),
  summary: tx(
    'Overhead line damage. IC 3, S2 and S25 are cancelled on this section until early evening.',
    'Fahrleitungsschaden. IC 3, S2 und S25 fallen auf diesem Abschnitt bis am frühen Abend aus.',
    'Ligne de contact endommagée. Les IC 3, S2 et S25 sont supprimés sur ce tronçon jusqu’en début de soirée.',
    'Linea di contatto danneggiata. IC 3, S2 e S25 sono soppressi su questa tratta fino a inizio serata.',
  ),
  reason: tx(
    'Overhead line damage between Wädenswil and Pfäffikon SZ. Repairs expected until early evening.',
    'Fahrleitungsschaden zwischen Wädenswil und Pfäffikon SZ. Die Reparatur dauert voraussichtlich bis am frühen Abend.',
    'Ligne de contact endommagée entre Wädenswil et Pfäffikon SZ. Réparation prévue jusqu’en début de soirée.',
    'Linea di contatto danneggiata tra Wädenswil e Pfäffikon SZ. Riparazione prevista fino a inizio serata.',
  ),
  section: { from: stations.waedenswil, to: stations.pfaeffikonSz },
  cancelledLines: ['IC 3', 'S2', 'S25'],
  updatedAt: '11:00',
};

export const welcome: Localizable<WelcomeInfo> = {
  now: '11:05',
  station: stations.zurichHb,
  disruptions: [disruption],
};

export const trip: Trip = {
  id: 'demo-trip-1',
  ticket: {
    from: stations.zurichHb,
    to: stations.sargans,
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
  plannedArrival: '12:02',
};

export const tripResult: Localizable<TripResult> = {
  trip,
  affected: true,
  disruption,
  now: '11:05',
  minutesToDeparture: 32,
  best: {
    id: 'ir35-1137',
    train: { line: lines.ir35, direction: 'Chur', departure: '11:37', platform: '9' },
    arrival: '12:29',
    arrivalStation: stations.sargans,
    changes: 0,
    routeLabel: tx('IR 35 direct', 'IR 35 direkt', 'IR 35 direct', 'IR 35 diretto'),
    delayVsPlanMinutes: 27,
    ticketValid: true,
    occupancy: { secondClass: 'high' },
    boardingHint: tx('front (sector A)', 'vorne (Sektor A)', 'à l’avant (secteur A)', 'in testa (settore A)'),
  },
  alternatives: [
    {
      id: 's5-1114',
      train: { line: lines.s5, departure: '11:14', platform: '4' },
      arrival: '12:42',
      arrivalStation: stations.sargans,
      changes: 1,
      routeLabel: tx(
        'S5 via Rapperswil, change in Ziegelbrücke',
        'S5 über Rapperswil, umsteigen in Ziegelbrücke',
        'S5 via Rapperswil, changement à Ziegelbrücke',
        'S5 via Rapperswil, cambio a Ziegelbrücke',
      ),
      tradeOff: tx(
        'Leaves sooner, arrives later',
        'Fährt früher, kommt später an',
        'Part plus tôt, arrive plus tard',
        'Parte prima, arriva più tardi',
      ),
      delayVsPlanMinutes: 40,
      ticketValid: true,
      occupancy: { secondClass: 'medium' },
    },
    {
      id: 'ir35-1237',
      train: { line: lines.ir35, direction: 'Chur', departure: '12:37', platform: '9' },
      arrival: '13:29',
      arrivalStation: stations.sargans,
      changes: 0,
      routeLabel: tx('IR 35 direct', 'IR 35 direkt', 'IR 35 direct', 'IR 35 diretto'),
      tradeOff: tx('Less crowded', 'Weniger voll', 'Moins chargé', 'Meno affollato'),
      delayVsPlanMinutes: 87,
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
    name: tx('The station hall', 'Die Bahnhofshalle', 'Le hall de la gare', 'L’atrio della stazione'),
    photo: {
      label: tx(
        'Photo: main hall of Zürich HB',
        'Foto: Haupthalle des Zürich HB',
        'Photo : hall principal de Zürich HB',
        'Foto: atrio principale di Zürich HB',
      ),
    },
    history: tx(
      'The station opened in 1871. Its great hall is one of the largest in Switzerland.',
      'Der Bahnhof wurde 1871 eröffnet. Seine grosse Halle gehört zu den grössten der Schweiz.',
      'La gare a ouvert en 1871. Son grand hall est l’un des plus grands de Suisse.',
      'La stazione è stata aperta nel 1871. Il suo grande atrio è uno dei più grandi della Svizzera.',
    ),
    walk: { minutes: 1 },
  },
  nationalMuseum: {
    id: 'swiss-national-museum',
    name: tx('Swiss National Museum', 'Landesmuseum Zürich', 'Musée national suisse', 'Museo nazionale svizzero'),
    photo: {
      label: tx(
        'Photo: museum building',
        'Foto: Museumsgebäude',
        'Photo : bâtiment du musée',
        'Foto: edificio del museo',
      ),
    },
    history: tx(
      'Built in 1898 to look like a castle. Inside: Swiss history from early times to today.',
      'Erbaut 1898 im Stil eines Schlosses. Drinnen: Schweizer Geschichte von den Anfängen bis heute.',
      'Construit en 1898 pour ressembler à un château. À l’intérieur : l’histoire suisse des origines à nos jours.',
      'Costruito nel 1898 come un castello. All’interno: la storia svizzera dalle origini a oggi.',
    ),
    walk: { minutes: 3 },
  },
  platzspitz: {
    id: 'platzspitz',
    name: tx('Platzspitz park', 'Platzspitzpark', 'Parc du Platzspitz', 'Parco del Platzspitz'),
    photo: {
      label: tx(
        'Photo: park by the river',
        'Foto: Park am Fluss',
        'Photo : parc au bord de la rivière',
        'Foto: parco sul fiume',
      ),
    },
    history: tx(
      'A park since the 1700s, at the spot where two rivers meet.',
      'Seit dem 18. Jahrhundert ein Park, dort wo zwei Flüsse zusammenfliessen.',
      'Un parc depuis le XVIIIe siècle, à l’endroit où deux rivières se rejoignent.',
      'Un parco dal Settecento, nel punto in cui si incontrano due fiumi.',
    ),
    walk: { minutes: 6 },
  },
  lindenhof: {
    id: 'lindenhof',
    name: tx('Lindenhof hill', 'Lindenhof', 'Colline du Lindenhof', 'Collina del Lindenhof'),
    photo: {
      label: tx(
        'Photo: view over the old town',
        'Foto: Blick über die Altstadt',
        'Photo : vue sur la vieille ville',
        'Foto: vista sulla città vecchia',
      ),
    },
    history: tx(
      'In Roman times there was a fort on this hill. Today: a quiet square with a view.',
      'Zur Römerzeit stand auf diesem Hügel ein Kastell. Heute: ein ruhiger Platz mit Aussicht.',
      'À l’époque romaine, un fort se dressait sur cette colline. Aujourd’hui : une place tranquille avec vue.',
      'In epoca romana su questa collina c’era un forte. Oggi: una piazza tranquilla con vista.',
    ),
    walk: { minutes: 8 },
  },
} satisfies Record<string, Localizable<Place>>;

// ---------------------------------------------------------------------------
// Wait scenarios (screens 4, 5, 5b)
// ---------------------------------------------------------------------------

const coffeeShopville = tx(
  'Cafés one floor down, in Shopville',
  'Cafés ein Stockwerk tiefer, im Shopville',
  'Cafés à l’étage inférieur, dans le Shopville',
  'Caffè al piano di sotto, nello Shopville',
);
const lunchForTrain = tx('Lunch for the train', 'Mittagessen für den Zug', 'Un repas pour le train', 'Pranzo per il treno');
const foodStalls = tx(
  'Food stalls in the main hall',
  'Essensstände in der Haupthalle',
  'Stands de nourriture dans le hall principal',
  'Bancarelle di cibo nell’atrio principale',
);
const walkBackCounted = {
  de: 'Der Rückweg ist schon eingerechnet.',
  fr: 'Le temps du retour est déjà compté.',
  it: 'Il ritorno è già calcolato.',
};

export const waitScenarios: Record<WaitLevel, Localizable<WaitScenario>> = {
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
        title: tx(
          'Drink or snack to take away',
          'Getränk oder Snack zum Mitnehmen',
          'Boisson ou en-cas à emporter',
          'Bevanda o spuntino da asporto',
        ),
        // {platform} = platform of the train to be back for (filled in by lib/data.ts)
        location: tx(
          'Kiosk at the stairs to platform {platform}',
          'Kiosk bei der Treppe zu Gleis {platform}',
          'Kiosque près de l’escalier de la voie {platform}',
          'Chiosco vicino alle scale del binario {platform}',
        ),
        walk: { minutes: 1 },
        backBy: '11:10',
      },
    ],
    explore: {
      intro: tx(
        'You only have a few minutes, so stay inside the station.',
        'Sie haben nur wenige Minuten. Bleiben Sie deshalb im Bahnhof.',
        'Vous n’avez que quelques minutes, restez donc dans la gare.',
        'Ha solo pochi minuti, quindi resti all’interno della stazione.',
      ),
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
        title: tx('Coffee and a snack', 'Kaffee und ein Snack', 'Un café et un en-cas', 'Caffè e uno spuntino'),
        location: coffeeShopville,
        walk: { minutes: 2 },
        backBy: '11:30',
      },
      {
        id: 'lunch-main-hall',
        title: lunchForTrain,
        location: foodStalls,
        walk: { minutes: 3 },
        backBy: '11:29',
      },
      {
        id: 'bakery-shopville',
        title: tx('Bakery', 'Bäckerei', 'Boulangerie', 'Panetteria'),
        location: tx(
          'Along the Shopville passage',
          'Entlang der Shopville-Passage',
          'Le long du passage du Shopville',
          'Lungo il passaggio dello Shopville',
        ),
        walk: { minutes: 2 },
        backBy: '11:32',
      },
    ],
    explore: {
      intro: tx(
        'Three places close to the station. The walk back is already counted.',
        `Drei Orte nahe beim Bahnhof. ${walkBackCounted.de}`,
        `Trois lieux près de la gare. ${walkBackCounted.fr}`,
        `Tre luoghi vicino alla stazione. ${walkBackCounted.it}`,
      ),
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
        title: tx('Sit-down lunch', 'Mittagessen im Restaurant', 'Déjeuner au restaurant', 'Pranzo al ristorante'),
        location: tx(
          'Restaurants in and around the station',
          'Restaurants im und um den Bahnhof',
          'Restaurants dans la gare et autour',
          'Ristoranti dentro e intorno alla stazione',
        ),
        walk: { minutes: 2, maxMinutes: 5 },
        backBy: '12:25',
      },
      {
        id: 'coffee-cake-shopville',
        title: tx('Coffee and cake', 'Kaffee und Kuchen', 'Café et gâteau', 'Caffè e torta'),
        location: coffeeShopville,
        walk: { minutes: 2 },
        backBy: '12:30',
      },
      {
        id: 'lunch-main-hall',
        title: lunchForTrain,
        location: foodStalls,
        walk: { minutes: 3 },
        backBy: '12:29',
      },
    ],
    explore: {
      intro: tx(
        'Enough time to see a bit of Zürich. The walk back is already counted.',
        `Genug Zeit für ein Stück Zürich. ${walkBackCounted.de}`,
        `Assez de temps pour découvrir un peu Zurich. ${walkBackCounted.fr}`,
        `Abbastanza tempo per vedere un po’ di Zurigo. ${walkBackCounted.it}`,
      ),
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

const hotelName = tx('[Hotel name]', '[Hotelname]', '[Nom de l’hôtel]', '[Nome dell’hotel]');
const pricePerNight = tx('[price] per night', '[Preis] pro Nacht', '[prix] par nuit', '[prezzo] a notte');
const roomsFree = tx('Rooms free', 'Zimmer frei', 'Chambres libres', 'Camere libere');
const restaurantsAround = tx(
  'Restaurants in and around the station',
  'Restaurants im und um den Bahnhof',
  'Restaurants dans la gare et autour',
  'Ristoranti dentro e intorno alla stazione',
);

export const restScenarios: Record<TimeOfDay, Localizable<RestScenario>> = {
  day: {
    time: 'day',
    now: '11:05',
    title: tx('Sit down and rest', 'Sich hinsetzen und ausruhen', 'S’asseoir et se reposer', 'Sedersi e riposare'),
    intro: tx(
      'Calm places close to your platform.',
      'Ruhige Orte nahe bei Ihrem Gleis.',
      'Des endroits calmes près de votre voie.',
      'Luoghi tranquilli vicino al suo binario.',
    ),
    options: [
      {
        id: 'seat-charging-pl9',
        kind: 'seat',
        name: tx(
          'Seat with phone charging',
          'Sitzplatz mit Handy-Ladestation',
          'Place assise avec recharge de téléphone',
          'Posto a sedere con ricarica per il telefono',
        ),
        details: [
          // {platform} is filled in by lib/data.ts
          tx(
            'Waiting area near platform {platform}',
            'Wartebereich bei Gleis {platform}',
            'Zone d’attente près de la voie {platform}',
            'Zona d’attesa vicino al binario {platform}',
          ),
        ],
        walk: { minutes: 1 },
        note: backBy('11:34'),
      },
      {
        id: 'quiet-cafe',
        kind: 'cafe',
        name: tx('Quiet café', 'Ruhiges Café', 'Café calme', 'Caffè tranquillo'),
        details: [coffeeShopville],
        walk: { minutes: 2 },
        note: backBy('11:30'),
      },
      {
        id: 'park-bench',
        kind: 'park',
        name: tx('Bench in the park', 'Bank im Park', 'Banc dans le parc', 'Panchina nel parco'),
        details: [
          tx(
            'Platzspitz park, just behind the station',
            'Platzspitzpark, gleich hinter dem Bahnhof',
            'Parc du Platzspitz, juste derrière la gare',
            'Parco del Platzspitz, subito dietro la stazione',
          ),
        ],
        walk: { minutes: 6 },
        note: backBy('11:25'),
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
    title: tx(
      'A calm place for the evening',
      'Ein ruhiger Ort für den Abend',
      'Un endroit calme pour la soirée',
      'Un posto tranquillo per la serata',
    ),
    intro: tx(
      'Your train leaves late. Rest here, or take a room if you are tired.',
      'Ihr Zug fährt spät. Ruhen Sie sich hier aus oder nehmen Sie ein Zimmer, wenn Sie müde sind.',
      'Votre train part tard. Reposez-vous ici, ou prenez une chambre si la fatigue se fait sentir.',
      'Il suo treno parte tardi. Si riposi qui, oppure prenda una camera se ha bisogno di dormire.',
    ),
    options: [
      {
        id: 'warm-waiting-room',
        kind: 'seat',
        name: tx('Warm waiting room', 'Warmer Warteraum', 'Salle d’attente chauffée', 'Sala d’attesa riscaldata'),
        details: [
          tx(
            'Main hall, next to platform 3',
            'Haupthalle, neben Gleis 3',
            'Hall principal, à côté de la voie 3',
            'Atrio principale, accanto al binario 3',
          ),
        ],
        walk: { minutes: 2 },
        note: backBy('21:30'),
      },
      {
        id: 'restaurant-seats',
        kind: 'cafe',
        name: tx(
          'Restaurant with seats',
          'Restaurant mit Sitzplätzen',
          'Restaurant avec places assises',
          'Ristorante con posti a sedere',
        ),
        details: [restaurantsAround],
        walk: { minutes: 3 },
        note: backBy('21:25'),
      },
      {
        id: 'hotel-opposite',
        kind: 'hotel',
        name: hotelName,
        details: [
          tx(
            'Hotel opposite the station',
            'Hotel gegenüber dem Bahnhof',
            'Hôtel en face de la gare',
            'Hotel di fronte alla stazione',
          ),
          tx('rooms free tonight', 'heute Nacht Zimmer frei', 'chambres libres ce soir', 'camere libere stanotte'),
          pricePerNight,
        ],
        walk: { minutes: 2 },
        note: tx(
          'Info point can book it',
          'Buchbar am Infoschalter',
          'Réservable au point d’information',
          'Prenotabile al punto informazioni',
        ),
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
    title: tx(
      'No more trains tonight',
      'Heute keine Züge mehr',
      'Plus de train ce soir',
      'Nessun treno stanotte',
    ),
    intro: tx(
      'Your next train leaves tomorrow. These hotels are close.',
      'Ihr nächster Zug fährt morgen. Diese Hotels sind in der Nähe.',
      'Votre prochain train part demain. Ces hôtels sont tout proches.',
      'Il suo prossimo treno parte domani. Questi hotel sono vicini.',
    ),
    options: [
      {
        id: 'hotel-opposite',
        kind: 'hotel',
        name: hotelName,
        details: [
          tx('Opposite the station', 'Gegenüber dem Bahnhof', 'En face de la gare', 'Di fronte alla stazione'),
          pricePerNight,
        ],
        walk: { minutes: 2 },
        note: roomsFree,
      },
      {
        id: 'hotel-main-hall',
        kind: 'hotel',
        name: hotelName,
        details: [
          tx('Next to the main hall', 'Neben der Haupthalle', 'À côté du hall principal', 'Accanto all’atrio principale'),
          pricePerNight,
        ],
        walk: { minutes: 3 },
        note: roomsFree,
      },
      {
        id: 'hotel-river',
        kind: 'hotel',
        name: hotelName,
        details: [
          tx('Near the river', 'Am Fluss', 'Près de la rivière', 'Vicino al fiume'),
          tx('step-free entrance', 'stufenloser Eingang', 'entrée sans marches', 'ingresso senza gradini'),
          pricePerNight,
        ],
        walk: { minutes: 5 },
        note: roomsFree,
        stepFree: true,
      },
    ],
    returnPlan: {
      train: { line: lines.ic3, direction: 'Chur', departure: '06:37', platform: '7' },
      day: 'tomorrow',
      backBy: '06:30',
    },
    help: {
      title: tx(
        'Stuck because of the disruption?',
        'Wegen der Störung gestrandet?',
        'Voyage bloqué par la perturbation ?',
        'Viaggio bloccato dalla perturbazione?',
      ),
      text: tx(
        'Ask at the info point in the main hall. Staff can book a room for you and tell you if SBB pays for it.',
        'Fragen Sie am Infoschalter in der Haupthalle. Das Personal kann ein Zimmer für Sie buchen und Ihnen sagen, ob die SBB die Kosten übernimmt.',
        'Renseignez-vous au point d’information dans le hall principal. Le personnel peut vous réserver une chambre et vous dire si les CFF la prennent en charge.',
        'Chieda al punto informazioni nell’atrio principale. Il personale può prenotarle una camera e dirle se le FFS se ne fanno carico.',
      ),
    },
  },
};

// ---------------------------------------------------------------------------
// Phone (screen 6)
// ---------------------------------------------------------------------------

export const phoneTrip: Localizable<PhoneTrip> = {
  tripId: trip.id,
  from: stations.zurichHb,
  to: stations.sargans,
  latest: {
    time: '11:21',
    headline: tx(
      'Your IR 35 now leaves at 11:42 (+5 min)',
      'Ihr IR 35 fährt jetzt um 11:42 (+5 Min.)',
      'Votre IR 35 part maintenant à 11:42 (+5 min)',
      'Il suo IR 35 ora parte alle 11:42 (+5 min)',
    ),
    platform: '9',
    headBackBy: '11:35',
  },
  train: {
    line: lines.ir35,
    direction: 'Chur',
    departure: '11:42',
    plannedDeparture: '11:37',
    platform: '9',
    arrival: '12:34',
    arrivalStation: stations.sargans,
    minutesToDeparture: 21,
  },
  timeline: [
    {
      id: 'u3',
      time: '11:21',
      tone: 'warning',
      text: tx(
        'IR 35 delayed by 5 min. Your plan was updated.',
        'IR 35 hat 5 Min. Verspätung. Ihr Plan wurde angepasst.',
        'IR 35 retardé de 5 min. Votre plan a été mis à jour.',
        'IR 35 in ritardo di 5 min. Il suo piano è stato aggiornato.',
      ),
    },
    {
      id: 'u2',
      time: '11:06',
      tone: 'success',
      text: tx(
        'You picked the IR 35 at the kiosk in Zürich HB.',
        'Sie haben am Terminal im Zürich HB den IR 35 gewählt.',
        'Vous avez choisi l’IR 35 à la borne de Zürich HB.',
        'Ha scelto l’IR 35 al terminale di Zürich HB.',
      ),
    },
    {
      id: 'u1',
      time: '11:05',
      tone: 'error',
      text: tx(
        'Your IC 3 at 11:07 was cancelled (overhead line damage, Wädenswil – Pfäffikon SZ).',
        'Ihr IC 3 um 11:07 ist ausgefallen (Fahrleitungsschaden, Wädenswil – Pfäffikon SZ).',
        'Votre IC 3 de 11:07 a été supprimé (ligne de contact endommagée, Wädenswil – Pfäffikon SZ).',
        'Il suo IC 3 delle 11:07 è stato soppresso (linea di contatto danneggiata, Wädenswil – Pfäffikon SZ).',
      ),
    },
  ],
};
