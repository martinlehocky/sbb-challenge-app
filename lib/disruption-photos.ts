/**
 * Illustration photo for a disruption, chosen from its cause (VIA / ticker reason code "EG_…").
 *
 * The photos are general SBB scenes, never the actual incident, so the screens always tag them as
 * an illustration. Causes with no fitting photo, and sensitive ones (accidents involving a person,
 * fires, police operations, collisions…), get no photo at all.
 */
import type { Lang, Photo } from './types';

type Kind = 'repair' | 'works' | 'vehicle' | 'snow';

const KIND_BY_REASON: Record<string, Kind> = {
  // infrastructure faults: a crew repairing at the track
  EG_008: 'repair', // problem with the overhead line
  EG_006: 'repair', // damage to the track
  EG_010: 'repair', // signal box failure
  EG_011: 'repair', // power failure
  EG_001: 'repair', // barrier failure
  EG_196: 'repair', // technical malfunction of the infrastructure
  // planned or unplanned construction
  EG_158: 'works', // unscheduled construction work
  EG_004: 'works', // engineering work
  // train faults
  EG_014: 'vehicle', // technical difficulty with the engine
  EG_013: 'vehicle', // technical difficulty with the carriage
  EG_191: 'vehicle', // vehicle malfunction
  EG_197: 'vehicle', // door malfunction
  EG_125: 'vehicle', // another train has broken down
  // snow and ice
  EG_023: 'snow', // heavy snowfall
  EG_016: 'snow', // ice forming on the railway infrastructure
  EG_117: 'snow', // ice forming on the carriages
  EG_200: 'snow', // weather-related rail condition
};

const CREDIT = '© SBB CFF FFS';

const PHOTOS: Record<Kind, { src: string; label: Record<Lang, string> }> = {
  repair: {
    src: '/photos/disruption-repair.jpeg',
    label: {
      en: 'Illustration: SBB crew repairing a cable next to the track',
      de: 'Symbolbild: SBB-Team repariert ein Kabel am Gleis',
      fr: 'Image d’illustration : équipe CFF réparant un câble le long de la voie',
      it: 'Immagine illustrativa: squadra FFS ripara un cavo lungo il binario',
    },
  },
  works: {
    src: '/photos/disruption-works.jpeg',
    label: {
      en: 'Illustration: construction work at a station',
      de: 'Symbolbild: Bauarbeiten an einem Bahnhof',
      fr: 'Image d’illustration : travaux dans une gare',
      it: 'Immagine illustrativa: lavori in una stazione',
    },
  },
  vehicle: {
    src: '/photos/disruption-vehicle.jpeg',
    label: {
      en: 'Illustration: train in the workshop',
      de: 'Symbolbild: Zug in der Werkstatt',
      fr: 'Image d’illustration : train à l’atelier',
      it: 'Immagine illustrativa: treno in officina',
    },
  },
  snow: {
    src: '/photos/disruption-snow.jpeg',
    label: {
      en: 'Illustration: train in the snow',
      de: 'Symbolbild: Zug im Schnee',
      fr: 'Image d’illustration : train dans la neige',
      it: 'Immagine illustrativa: treno nella neve',
    },
  },
};

/** Short tag shown on the photo itself. */
export const ILLUSTRATION_TAG: Record<Lang, string> = {
  en: 'Illustration',
  de: 'Symbolbild',
  fr: 'Illustration',
  it: 'Illustrazione',
};

export function photoForReason(reasonId: string | null | undefined, lang: Lang): Photo | undefined {
  const kind = reasonId ? KIND_BY_REASON[reasonId] : undefined;
  if (!kind) return undefined;
  const p = PHOTOS[kind];
  return { src: p.src, label: p.label[lang], credit: CREDIT };
}
