/**
 * UI text of the kiosk and phone screens in EN · FR · DE · IT.
 *
 * English follows docs/SCREENS.md exactly. Conventions for the others:
 * Swiss German (no "ß", "Billett", "Gleis"), SBB = CFF (French) / FFS (Italian),
 * formal address (Sie / vous / Lei). Official station names are not translated.
 * Content that comes from the backend (disruptions, ideas, places, …) is
 * translated in lib/mock-data.ts instead.
 */
import type { ReactNode } from 'react';
import type { Lang } from '../types';

/** Non-breaking space, used before ":" and "?" in French. */
const NB = ' ';

const en = {
  common: {
    back: 'Back',
    cancel: 'Cancel',
    startOver: 'Start over',
    chooseElse: 'Choose something else',
    backToTrain: 'Back to my train',
    walk: (min: number, max?: number) =>
      max && max !== min
        ? `${min} to ${max} minutes walk`
        : min === 1
          ? '1 minute walk'
          : `${min} minutes walk`,
    changes: (n: number) => (n === 0 ? 'no changes' : n === 1 ? '1 change' : `${n} changes`),
    backBy: (time: string) => `Back by ${time}`,
    yourTrain: (line: string, dep: string, pl: string) => `Your train: ${line} at ${dep}, platform ${pl}`,
    yourTrainShort: (line: string, dep: string) => `Your train: ${line} at ${dep}`,
    pleaseBackBy: (time: string) => `Please be back by ${time}`,
    pleaseBackAtPlatform: (pl: string, time: string) => `Please be back at platform ${pl} by ${time}`,
    firstTrainTomorrow: (line: string, dep: string, pl: string) =>
      `First train tomorrow: ${line} at ${dep}, platform ${pl}`,
    beAtStation: (time: string) => `Please be at the station by ${time}`,
    minutes: (n: number) => `${n} min`,
    /** Text inside the countdown ring: the minutes in bold plus a short word. */
    ring: (n: number): ReactNode => (
      <>
        <strong>{n} min</strong>
        <span>to go</span>
      </>
    ),
    minutesToGo: (n: number) => `${n} min to go`,
  },
  welcome: {
    product: 'Travel assistant',
    language: 'Language',
    disruptions: 'Disruptions',
    updated: (time: string) => `Updated ${time}`,
    title: 'Need help?',
    lead: 'Scan your ticket to see your journey, or ask us a question.',
    caption: 'Paper ticket, SwissPass or SBB app code',
    scan: 'Scan my ticket',
    ask: 'Ask a question',
    scanText: 'See your journey, delays and what to do while you wait',
    askText: 'By voice or text: trains, delays, food and more',
    staff: 'Prefer to talk to someone? Staff are at the info point in the main hall.',
  },
  scan: {
    cameraAbove: 'Camera is above the screen',
    title: 'Hold your ticket up to the camera',
    lead: 'Paper ticket, SwissPass or the QR code in the SBB app',
    recognised: (route: string) => `Ticket recognised: ${route}`,
    checking: 'Checking your train against live disruptions…',
    finding: 'Finding your best alternative',
    privacy: 'We only read your route. No images are stored.',
    demoContinue: 'Demo: continue',
    cameraView: 'Camera view',
    travelClass: (c: 1 | 2): string => (c === 2 ? '2nd class' : '1st class'),
  },
  result: {
    cancelled: (time: ReactNode) => <>Your train at {time} is cancelled</>,
    runsAsPlanned: (time: string) => `Your train at ${time} runs as planned`,
    bestLabel: 'Your best next train',
    to: (dest: string) => `to ${dest}`,
    departs: 'departs',
    towards: (dir: string) => `towards ${dir}`,
    yourJourney: 'Your journey',
    legArrives: (station: string, time: string) => `arrives ${station} ${time}`,
    platform: 'Platform',
    arrives: (station: string) => `Arrives ${station}`,
    vsPlan: 'vs. your plan',
    plusMin: (n: number) => `+${n}${NB}min`,
    direct: 'Direct, no changes.',
    ticketValid: (
      <>
        <strong>Your ticket is valid</strong> on this train.
      </>
    ) as ReactNode,
    busy: 'Expected to be very busy.',
    boardAt: (hint: string) => (
      <>
        Board at the <strong>{hint}</strong>.
      </>
    ),
    otherOptions: 'Other options',
    platformShort: (pl: string) => `Pl. ${pl}`,
    whatCanIDo: (n: number) => `What can I do in ${n} min?`,
    sendToPhone: 'Send to my phone',
    askTrip: 'Ask about my trip',
    goToPlatform: (pl: string) => `Not much time: please go to platform ${pl} now.`,
  },
  wait: {
    youHave: (n: number) => `You have ${n} minutes`,
    question: 'What would you like to do?',
    littleTime: (pl: string) => `There is not much time. Please stay close to platform ${pl}.`,
    eat: { title: 'Eat or drink something', text: 'Coffee, a snack or a meal' },
    explore: { title: 'Have a look around', text: 'A short walk near the station' },
    rest: { title: 'Sit down and rest', text: 'A quiet seat, or a hotel if it gets late' },
  },
  eat: {
    intro: 'All of these are close by. The time to walk back is already counted.',
  },
  places: {
    attribution: 'Places and photos: Google Maps',
    exploreIntro: 'Close to the station. The walk back is already counted.',
    photoBy: (name: string) => `Photo: ${name}`,
    stay: (min: number) => `about ${min} min there`,
  },
  ai: {
    label: 'AI-generated',
    summaryTitle: 'In plain words',
    summaryWorking: 'Our AI is writing a short explanation…',
    ideasWorking: 'Our AI is looking for more ideas…',
    ideasCheck: 'Suggested by AI. Please check on site.',
  },
  ask: {
    title: 'How can we help?',
    lead: 'Ask by voice or text, for example “Where can I get a coffee?” or “I need to get to Bern.”',
    titleTrip: 'What would you like to know?',
    leadTrip: 'Ask anything about your journey, for example “Do I have to change trains?” or “Why is my train late?”',
    speak: 'Speak',
    stop: 'Done',
    listening: 'Listening… Ask your question.',
    thinking: 'Our AI is looking for the answer…',
    inputLabel: 'Your question',
    placeholder: 'Type your question',
    send: 'Ask',
    yourQuestion: 'Your question',
    answer: 'Answer',
    showTrain: 'Show my next train',
    askAnother: 'Ask another question',
    backToTrip: 'Back to my trip',
    unavailable: 'Questions are not available right now. Please scan your ticket or ask staff at the info point.',
    voiceUnavailable: 'Voice questions are not available right now. Please type your question.',
    heardNothing: 'We did not hear anything. Please speak a little louder, close to the screen.',
    micDenied: 'We cannot use the microphone. Please type your question instead.',
    failed: 'Something went wrong. Please try again.',
    privacy: 'Your voice is sent to an AI service only to understand your question. The kiosk does not keep it.',
  },
  phone: {
    tripToday: 'Your trip today',
    newUpdate: (time: string) => `New update · ${time}`,
    updateText: (pl: string, time: string) => (
      <>
        Still platform {pl}. You can stay a bit longer: head back by <strong>{time}</strong>.
      </>
    ),
    was: (time: string) => `was ${time}`,
    to: (dest: string) => `to ${dest}`,
    platformArrives: (pl: string, station: string, time: string) =>
      `Platform ${pl} · arrives ${station} ${time}`,
    timeline: 'What happened so far',
    watching: "We're watching for you",
    watchingText:
      "If the line reopens earlier or your platform changes, you'll get a message straight away.",
    seeThings: 'See things to do nearby',
    stopUpdates: 'Stop updates',
  },
};

export type Messages = typeof en;

const de: Messages = {
  common: {
    back: 'Zurück',
    cancel: 'Abbrechen',
    startOver: 'Neu starten',
    chooseElse: 'Etwas anderes wählen',
    backToTrain: 'Zurück zu meinem Zug',
    walk: (min, max) =>
      max && max !== min
        ? `${min} bis ${max} Minuten zu Fuss`
        : min === 1
          ? '1 Minute zu Fuss'
          : `${min} Minuten zu Fuss`,
    changes: (n) => (n === 0 ? 'ohne Umsteigen' : `${n}-mal umsteigen`),
    backBy: (time) => `Zurück bis ${time}`,
    yourTrain: (line, dep, pl) => `Ihr Zug: ${line} um ${dep}, Gleis ${pl}`,
    yourTrainShort: (line, dep) => `Ihr Zug: ${line} um ${dep}`,
    pleaseBackBy: (time) => `Bitte bis ${time} zurück sein`,
    pleaseBackAtPlatform: (pl, time) => `Bitte bis ${time} zurück an Gleis ${pl}`,
    firstTrainTomorrow: (line, dep, pl) => `Erster Zug morgen: ${line} um ${dep}, Gleis ${pl}`,
    beAtStation: (time) => `Bitte bis ${time} am Bahnhof sein`,
    minutes: (n) => `${n} Min.`,
    ring: (n) => (
      <>
        <span>noch</span>
        <strong>{n} Min.</strong>
      </>
    ),
    minutesToGo: (n) => `${n} Min. bis Abfahrt`,
  },
  welcome: {
    product: 'Reiseassistent',
    language: 'Sprache',
    disruptions: 'Störungen',
    updated: (time) => `Aktualisiert ${time}`,
    title: 'Brauchen Sie Hilfe?',
    lead: 'Scannen Sie Ihr Billett für Ihre Reise, oder stellen Sie uns eine Frage.',
    caption: 'Papierbillett, SwissPass oder Code in der SBB App',
    scan: 'Mein Billett scannen',
    ask: 'Eine Frage stellen',
    scanText: 'Ihre Reise, Verspätungen und was Sie in der Wartezeit tun können',
    askText: 'Per Sprache oder Text: Züge, Verspätungen, Essen und mehr',
    staff: 'Lieber mit jemandem sprechen? Unser Personal ist am Infoschalter in der Haupthalle.',
  },
  scan: {
    cameraAbove: 'Die Kamera ist über dem Bildschirm',
    title: 'Halten Sie Ihr Billett vor die Kamera',
    lead: 'Papierbillett, SwissPass oder der QR-Code in der SBB App',
    recognised: (route) => `Billett erkannt: ${route}`,
    checking: 'Wir prüfen Ihren Zug auf aktuelle Störungen…',
    finding: 'Wir suchen die beste Alternative',
    privacy: 'Wir lesen nur Ihre Strecke. Es werden keine Bilder gespeichert.',
    demoContinue: 'Demo: weiter',
    cameraView: 'Kamerabild',
    travelClass: (c) => `${c}. Klasse`,
  },
  result: {
    cancelled: (time) => <>Ihr Zug um {time} fällt aus</>,
    runsAsPlanned: (time) => `Ihr Zug um ${time} fährt wie geplant`,
    bestLabel: 'Ihr bester nächster Zug',
    to: (dest) => `nach ${dest}`,
    departs: 'Abfahrt',
    towards: (dir) => `Richtung ${dir}`,
    yourJourney: 'Ihre Reise',
    legArrives: (station, time) => `Ankunft ${station} ${time}`,
    platform: 'Gleis',
    arrives: (station) => `Ankunft ${station}`,
    vsPlan: 'gegenüber Ihrem Plan',
    plusMin: (n) => `+${n}${NB}Min.`,
    direct: 'Direkt, ohne Umsteigen.',
    ticketValid: (
      <>
        <strong>Ihr Billett ist gültig.</strong>
      </>
    ),
    busy: 'Voraussichtlich sehr voll.',
    boardAt: (hint) => (
      <>
        Einstieg <strong>{hint}</strong>.
      </>
    ),
    otherOptions: 'Weitere Möglichkeiten',
    platformShort: (pl) => `Gl. ${pl}`,
    whatCanIDo: (n) => `Was kann ich in ${n} Min. tun?`,
    sendToPhone: 'Aufs Handy senden',
    askTrip: 'Frage zur Reise',
    goToPlatform: (pl) => `Wenig Zeit: Bitte gehen Sie jetzt zu Gleis ${pl}.`,
  },
  wait: {
    youHave: (n) => `Sie haben ${n} Minuten`,
    question: 'Was möchten Sie tun?',
    littleTime: (pl) => `Es bleibt nicht viel Zeit. Bitte bleiben Sie in der Nähe von Gleis ${pl}.`,
    eat: { title: 'Etwas essen oder trinken', text: 'Kaffee, ein Snack oder eine Mahlzeit' },
    explore: { title: 'Sich etwas umschauen', text: 'Ein kurzer Spaziergang beim Bahnhof' },
    rest: { title: 'Sich hinsetzen und ausruhen', text: 'Ein ruhiger Platz oder ein Hotel, wenn es spät wird' },
  },
  eat: {
    intro: 'Alles ganz in der Nähe. Der Rückweg ist schon eingerechnet.',
  },
  places: {
    attribution: 'Orte und Fotos: Google Maps',
    exploreIntro: 'Nahe beim Bahnhof. Der Rückweg ist schon eingerechnet.',
    photoBy: (name: string) => `Foto: ${name}`,
    stay: (min: number) => `etwa ${min} Min. vor Ort`,
  },
  ai: {
    label: 'KI-generiert',
    summaryTitle: 'Einfach erklärt',
    summaryWorking: 'Unsere KI schreibt eine kurze Erklärung…',
    ideasWorking: 'Unsere KI sucht weitere Ideen…',
    ideasCheck: 'Vorschlag der KI. Bitte vor Ort prüfen.',
  },
  ask: {
    title: 'Wie können wir helfen?',
    lead: 'Fragen Sie per Sprache oder Text, zum Beispiel «Wo bekomme ich einen Kaffee?» oder «Ich muss nach Bern».',
    titleTrip: 'Was möchten Sie wissen?',
    leadTrip: 'Fragen Sie alles zu Ihrer Reise, zum Beispiel «Muss ich umsteigen?» oder «Warum hat mein Zug Verspätung?»',
    speak: 'Sprechen',
    stop: 'Fertig',
    listening: 'Wir hören zu… Stellen Sie Ihre Frage.',
    thinking: 'Unsere KI sucht die Antwort…',
    inputLabel: 'Ihre Frage',
    placeholder: 'Frage eingeben',
    send: 'Fragen',
    yourQuestion: 'Ihre Frage',
    answer: 'Antwort',
    showTrain: 'Meinen nächsten Zug zeigen',
    askAnother: 'Weitere Frage stellen',
    backToTrip: 'Zurück zu meiner Reise',
    unavailable: 'Fragen sind im Moment nicht möglich. Bitte scannen Sie Ihr Billett oder fragen Sie am Infoschalter.',
    voiceUnavailable: 'Fragen per Sprache sind im Moment nicht möglich. Bitte tippen Sie Ihre Frage ein.',
    heardNothing: 'Wir haben nichts gehört. Bitte sprechen Sie etwas lauter und nahe am Bildschirm.',
    micDenied: 'Wir können das Mikrofon nicht verwenden. Bitte tippen Sie Ihre Frage ein.',
    failed: 'Etwas ist schiefgelaufen. Bitte versuchen Sie es nochmals.',
    privacy: 'Ihre Stimme wird nur an einen KI-Dienst gesendet, um Ihre Frage zu verstehen. Das Terminal speichert sie nicht.',
  },
  phone: {
    tripToday: 'Ihre Reise heute',
    newUpdate: (time) => `Neue Meldung · ${time}`,
    updateText: (pl, time) => (
      <>
        Weiterhin Gleis {pl}. Sie können etwas länger bleiben: Bitte bis <strong>{time}</strong> zurück
        sein.
      </>
    ),
    was: (time) => `vorher ${time}`,
    to: (dest) => `nach ${dest}`,
    platformArrives: (pl, station, time) => `Gleis ${pl} · Ankunft ${station} ${time}`,
    timeline: 'Bisheriger Verlauf',
    watching: 'Wir behalten alles im Blick',
    watchingText:
      'Wenn die Strecke früher wieder offen ist oder sich Ihr Gleis ändert, erhalten Sie sofort eine Nachricht.',
    seeThings: 'Ideen in der Nähe ansehen',
    stopUpdates: 'Keine Updates mehr',
  },
};

const fr: Messages = {
  common: {
    back: 'Retour',
    cancel: 'Annuler',
    startOver: 'Recommencer',
    chooseElse: 'Choisir autre chose',
    backToTrain: 'Retour à mon train',
    walk: (min, max) =>
      max && max !== min
        ? `${min} à ${max} minutes à pied`
        : min === 1
          ? '1 minute à pied'
          : `${min} minutes à pied`,
    changes: (n) => (n === 0 ? 'sans changement' : n === 1 ? '1 changement' : `${n} changements`),
    backBy: (time) => `De retour à ${time}`,
    yourTrain: (line, dep, pl) => `Votre train${NB}: ${line} à ${dep}, voie ${pl}`,
    yourTrainShort: (line, dep) => `Votre train${NB}: ${line} à ${dep}`,
    pleaseBackBy: (time) => `Merci d’être de retour à ${time}`,
    pleaseBackAtPlatform: (pl, time) => `Merci d’être de retour voie ${pl} à ${time}`,
    firstTrainTomorrow: (line, dep, pl) => `Premier train demain${NB}: ${line} à ${dep}, voie ${pl}`,
    beAtStation: (time) => `Merci d’être à la gare à ${time}`,
    minutes: (n) => `${n} min`,
    ring: (n) => (
      <>
        <span>dans</span>
        <strong>{n} min</strong>
      </>
    ),
    minutesToGo: (n) => `${n} min avant le départ`,
  },
  welcome: {
    product: 'Assistant de voyage',
    language: 'Langue',
    disruptions: 'Perturbations',
    updated: (time) => `Mis à jour à ${time}`,
    title: `Besoin d’aide${NB}?`,
    lead: 'Scannez votre billet pour voir votre trajet, ou posez-nous une question.',
    caption: 'Billet papier, SwissPass ou code de l’app CFF',
    scan: 'Scanner mon billet',
    ask: 'Poser une question',
    scanText: 'Votre trajet, les retards et que faire en attendant',
    askText: `À voix haute ou par écrit${NB}: trains, retards, repas et plus`,
    staff: `Vous préférez parler à quelqu’un${NB}? Notre personnel se trouve au point d’information dans le hall principal.`,
  },
  scan: {
    cameraAbove: 'La caméra se trouve au-dessus de l’écran',
    title: 'Présentez votre billet devant la caméra',
    lead: 'Billet papier, SwissPass ou code QR dans l’app CFF',
    recognised: (route) => `Billet reconnu${NB}: ${route}`,
    checking: 'Nous vérifions votre train par rapport aux perturbations en cours…',
    finding: 'Nous cherchons la meilleure alternative',
    privacy: 'Nous lisons uniquement votre trajet. Aucune image n’est enregistrée.',
    demoContinue: `Démo${NB}: continuer`,
    cameraView: 'Image de la caméra',
    travelClass: (c) => (c === 2 ? '2e classe' : '1re classe'),
  },
  result: {
    cancelled: (time) => <>Votre train de {time} est supprimé</>,
    runsAsPlanned: (time) => `Votre train de ${time} circule comme prévu`,
    bestLabel: 'Votre meilleur prochain train',
    to: (dest) => `pour ${dest}`,
    departs: 'départ',
    towards: (dir) => `direction ${dir}`,
    yourJourney: 'Votre trajet',
    legArrives: (station, time) => `arrivée à ${station} ${time}`,
    platform: 'Voie',
    arrives: (station) => `Arrivée ${station}`,
    vsPlan: 'par rapport au plan',
    plusMin: (n) => `+${n}${NB}min`,
    direct: 'Direct, sans changement.',
    ticketValid: (
      <>
        <strong>Votre billet est valable.</strong>
      </>
    ),
    busy: 'Affluence attendue.',
    boardAt: (hint) => (
      <>
        Montez <strong>{hint}</strong>.
      </>
    ),
    otherOptions: 'Autres possibilités',
    platformShort: (pl) => `Voie ${pl}`,
    whatCanIDo: (n) => `Que faire en ${n} min${NB}?`,
    sendToPhone: 'Envoyer au téléphone',
    askTrip: 'Question sur le trajet',
    goToPlatform: (pl) => `Peu de temps${NB}: merci d’aller maintenant à la voie ${pl}.`,
  },
  wait: {
    youHave: (n) => `Vous avez ${n} minutes`,
    question: `Que souhaitez-vous faire${NB}?`,
    littleTime: (pl) => `Il reste peu de temps. Merci de rester près de la voie ${pl}.`,
    eat: { title: 'Manger ou boire quelque chose', text: 'Un café, un en-cas ou un repas' },
    explore: { title: 'Faire un tour', text: 'Une courte promenade près de la gare' },
    rest: { title: 'S’asseoir et se reposer', text: 'Une place au calme, ou un hôtel s’il se fait tard' },
  },
  eat: {
    intro: 'Tout est à proximité. Le temps du retour est déjà compté.',
  },
  places: {
    attribution: `Lieux et photos${NB}: Google Maps`,
    exploreIntro: 'Près de la gare. Le temps du retour est déjà compté.',
    photoBy: (name: string) => `Photo${NB}: ${name}`,
    stay: (min: number) => `environ ${min}${NB}min sur place`,
  },
  ai: {
    label: 'Généré par IA',
    summaryTitle: 'En termes simples',
    summaryWorking: 'Notre IA rédige une courte explication…',
    ideasWorking: 'Notre IA cherche d’autres idées…',
    ideasCheck: 'Proposé par l’IA. Merci de vérifier sur place.',
  },
  ask: {
    title: `Comment pouvons-nous vous aider${NB}?`,
    lead: `Posez votre question à voix haute ou par écrit, par exemple «${NB}Où puis-je boire un café${NB}?${NB}» ou «${NB}Je dois aller à Berne${NB}».`,
    titleTrip: `Que voulez-vous savoir${NB}?`,
    leadTrip: `Posez toute question sur votre trajet, par exemple «${NB}Dois-je changer de train${NB}?${NB}» ou «${NB}Pourquoi mon train est-il en retard${NB}?${NB}»`,
    speak: 'Parler',
    stop: 'Terminé',
    listening: 'Nous vous écoutons… Posez votre question.',
    thinking: 'Notre IA cherche la réponse…',
    inputLabel: 'Votre question',
    placeholder: 'Tapez votre question',
    send: 'Demander',
    yourQuestion: 'Votre question',
    answer: 'Réponse',
    showTrain: 'Voir mon prochain train',
    askAnother: 'Poser une autre question',
    backToTrip: 'Retour à mon trajet',
    unavailable: 'Les questions ne sont pas disponibles pour le moment. Scannez votre billet ou adressez-vous au point d’information.',
    voiceUnavailable: 'Les questions à voix haute ne sont pas disponibles pour le moment. Merci de taper votre question.',
    heardNothing: 'Nous n’avons rien entendu. Merci de parler un peu plus fort, près de l’écran.',
    micDenied: 'Nous ne pouvons pas utiliser le microphone. Merci de taper votre question.',
    failed: 'Une erreur s’est produite. Merci de réessayer.',
    privacy: 'Votre voix est envoyée à un service d’IA uniquement pour comprendre votre question. La borne ne la conserve pas.',
  },
  phone: {
    tripToday: 'Votre voyage aujourd’hui',
    newUpdate: (time) => `Nouvelle info · ${time}`,
    updateText: (pl, time) => (
      <>
        Toujours voie {pl}. Vous pouvez rester un peu plus longtemps{NB}: soyez de retour à{' '}
        <strong>{time}</strong>.
      </>
    ),
    was: (time) => `initialement ${time}`,
    to: (dest) => `pour ${dest}`,
    platformArrives: (pl, station, time) => `Voie ${pl} · arrivée ${station} ${time}`,
    timeline: 'Ce qui s’est passé',
    watching: 'Nous veillons pour vous',
    watchingText:
      'Si la ligne rouvre plus tôt ou si votre voie change, vous recevrez un message immédiatement.',
    seeThings: 'Voir les idées à proximité',
    stopUpdates: 'Arrêter les notifications',
  },
};

const it: Messages = {
  common: {
    back: 'Indietro',
    cancel: 'Annulla',
    startOver: 'Ricomincia',
    chooseElse: 'Scegli altro',
    backToTrain: 'Torna al mio treno',
    walk: (min, max) =>
      max && max !== min
        ? `da ${min} a ${max} minuti a piedi`
        : min === 1
          ? '1 minuto a piedi'
          : `${min} minuti a piedi`,
    changes: (n) => (n === 0 ? 'senza cambi' : n === 1 ? '1 cambio' : `${n} cambi`),
    backBy: (time) => `Ritorno entro le ${time}`,
    yourTrain: (line, dep, pl) => `Il suo treno: ${line} alle ${dep}, binario ${pl}`,
    yourTrainShort: (line, dep) => `Il suo treno: ${line} alle ${dep}`,
    pleaseBackBy: (time) => `Torni entro le ${time}`,
    pleaseBackAtPlatform: (pl, time) => `Torni al binario ${pl} entro le ${time}`,
    firstTrainTomorrow: (line, dep, pl) => `Primo treno domani: ${line} alle ${dep}, binario ${pl}`,
    beAtStation: (time) => `Sia in stazione entro le ${time}`,
    minutes: (n) => `${n} min`,
    ring: (n) => (
      <>
        <span>tra</span>
        <strong>{n} min</strong>
      </>
    ),
    minutesToGo: (n) => `${n} min alla partenza`,
  },
  welcome: {
    product: 'Assistente di viaggio',
    language: 'Lingua',
    disruptions: 'Perturbazioni',
    updated: (time) => `Aggiornato alle ${time}`,
    title: 'Ha bisogno di aiuto?',
    lead: 'Scansioni il biglietto per vedere il suo viaggio, o ci faccia una domanda.',
    caption: 'Biglietto cartaceo, SwissPass o codice dell’app FFS',
    scan: 'Scansiona il mio biglietto',
    ask: 'Fare una domanda',
    scanText: 'Il suo viaggio, i ritardi e cosa fare nell’attesa',
    askText: 'A voce o per iscritto: treni, ritardi, cibo e altro',
    staff: 'Preferisce parlare con qualcuno? Il personale si trova al punto informazioni nell’atrio principale.',
  },
  scan: {
    cameraAbove: 'La telecamera è sopra lo schermo',
    title: 'Tenga il biglietto davanti alla telecamera',
    lead: 'Biglietto cartaceo, SwissPass o codice QR nell’app FFS',
    recognised: (route) => `Biglietto riconosciuto: ${route}`,
    checking: 'Verifichiamo il suo treno rispetto alle perturbazioni attuali…',
    finding: 'Cerchiamo la migliore alternativa',
    privacy: 'Leggiamo solo il suo percorso. Nessuna immagine viene salvata.',
    demoContinue: 'Demo: continua',
    cameraView: 'Immagine della telecamera',
    travelClass: (c) => `${c}a classe`,
  },
  result: {
    cancelled: (time) => <>Il treno delle {time} è soppresso</>,
    runsAsPlanned: (time) => `Il treno delle ${time} circola come previsto`,
    bestLabel: 'Il suo miglior treno successivo',
    to: (dest) => `per ${dest}`,
    departs: 'partenza',
    towards: (dir) => `direzione ${dir}`,
    yourJourney: 'Il suo viaggio',
    legArrives: (station, time) => `arrivo a ${station} ${time}`,
    platform: 'Binario',
    arrives: (station) => `Arrivo ${station}`,
    vsPlan: 'rispetto al piano',
    plusMin: (n) => `+${n}${NB}min`,
    direct: 'Diretto, senza cambi.',
    ticketValid: (
      <>
        <strong>Il suo biglietto è valido.</strong>
      </>
    ),
    busy: 'Previsto affollamento.',
    boardAt: (hint) => (
      <>
        Salga <strong>{hint}</strong>.
      </>
    ),
    otherOptions: 'Altre possibilità',
    platformShort: (pl) => `Bin. ${pl}`,
    whatCanIDo: (n) => `Cosa posso fare in ${n} min?`,
    sendToPhone: 'Invia al mio telefono',
    askTrip: 'Domanda sul viaggio',
    goToPlatform: (pl) => `Poco tempo: vada ora al binario ${pl}.`,
  },
  wait: {
    youHave: (n) => `Ha ${n} minuti`,
    question: 'Cosa desidera fare?',
    littleTime: (pl) => `Resta poco tempo. Rimanga vicino al binario ${pl}.`,
    eat: { title: 'Mangiare o bere qualcosa', text: 'Un caffè, uno spuntino o un pasto' },
    explore: { title: 'Dare un’occhiata in giro', text: 'Una breve passeggiata vicino alla stazione' },
    rest: { title: 'Sedersi e riposare', text: 'Un posto tranquillo, o un hotel se si fa tardi' },
  },
  eat: {
    intro: 'Tutto è vicino. Il tempo per tornare è già calcolato.',
  },
  places: {
    attribution: 'Luoghi e foto: Google Maps',
    exploreIntro: 'Vicino alla stazione. Il tempo per tornare è già calcolato.',
    photoBy: (name: string) => `Foto: ${name}`,
    stay: (min: number) => `circa ${min} min sul posto`,
  },
  ai: {
    label: 'Generato con IA',
    summaryTitle: 'In parole semplici',
    summaryWorking: 'La nostra IA sta scrivendo una breve spiegazione…',
    ideasWorking: 'La nostra IA cerca altre idee…',
    ideasCheck: 'Proposto dall’IA. Verifichi sul posto.',
  },
  ask: {
    title: 'Come possiamo aiutarla?',
    lead: 'Chieda a voce o per iscritto, per esempio «Dove posso prendere un caffè?» o «Devo andare a Berna».',
    titleTrip: 'Cosa desidera sapere?',
    leadTrip: 'Chieda qualsiasi cosa sul suo viaggio, per esempio «Devo cambiare treno?» o «Perché il mio treno è in ritardo?»',
    speak: 'Parlare',
    stop: 'Fatto',
    listening: 'La ascoltiamo… Faccia la sua domanda.',
    thinking: 'La nostra IA cerca la risposta…',
    inputLabel: 'La sua domanda',
    placeholder: 'Scriva la sua domanda',
    send: 'Chiedi',
    yourQuestion: 'La sua domanda',
    answer: 'Risposta',
    showTrain: 'Mostra il mio prossimo treno',
    askAnother: 'Fare un’altra domanda',
    backToTrip: 'Torna al mio viaggio',
    unavailable: 'Le domande al momento non sono disponibili. Scansioni il biglietto o chieda al punto informazioni.',
    voiceUnavailable: 'Le domande a voce al momento non sono disponibili. Scriva la sua domanda.',
    heardNothing: 'Non abbiamo sentito nulla. Parli un po’ più forte, vicino allo schermo.',
    micDenied: 'Non possiamo usare il microfono. Scriva la sua domanda.',
    failed: 'Qualcosa è andato storto. Riprovi.',
    privacy: 'La sua voce viene inviata a un servizio di IA solo per capire la domanda. Il terminale non la conserva.',
  },
  phone: {
    tripToday: 'Il suo viaggio di oggi',
    newUpdate: (time) => `Nuovo aggiornamento · ${time}`,
    updateText: (pl, time) => (
      <>
        Sempre binario {pl}. Può restare un po’ di più: torni entro le <strong>{time}</strong>.
      </>
    ),
    was: (time) => `prima ${time}`,
    to: (dest) => `per ${dest}`,
    platformArrives: (pl, station, time) => `Binario ${pl} · arrivo a ${station} ${time}`,
    timeline: 'Cosa è successo finora',
    watching: 'Teniamo d’occhio il suo viaggio',
    watchingText: 'Se la linea riapre prima o il suo binario cambia, riceverà subito un messaggio.',
    seeThings: 'Vedere cosa fare nei dintorni',
    stopUpdates: 'Interrompi gli aggiornamenti',
  },
};

const MESSAGES: Record<Lang, Messages> = { en, de, fr, it };

export function getMessages(lang: Lang): Messages {
  return MESSAGES[lang];
}

/** Labels of the language switch, in kiosk order. */
export const LANG_LABELS: Record<Lang, string> = { en: 'EN', fr: 'FR', de: 'DE', it: 'IT' };
/** Each language's name in its own language (for screen readers). */
export const LANG_NAMES: Record<Lang, string> = {
  en: 'English',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
};
