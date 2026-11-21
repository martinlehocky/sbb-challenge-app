'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { ChatContext, ChatRoute, ChatTurn, QuestionDebug, ChatPlace } from '@/lib/ai';
import { getMessages } from '@/lib/i18n/messages';
import { withScenario } from '@/lib/scenario';
import type { Lang, Scenario } from '@/lib/types';
import { AiChip } from '../ai/AiChip';
import { AiWorking } from '../ai/AiWorking';
import { AskDebugPanel, type AskDebugState } from '../ai/AskDebugPanel';
import { useAiStatus } from '../ai/useAiStatus';
import { KioskFooter, KioskFrame, KioskMain } from '../KioskFrame';
import { ChatPlaces } from '../ChatPlaces';
import { KioskHeader } from '../KioskHeader';
import { NavButton } from '../NavButton';
import { ScreenIntro } from '../ScreenIntro';
import { SbbButton, SbbFormField, SbbIcon, SbbNotification, SbbSecondaryButton } from '../sbb';
import styles from './AskScreen.module.css';

/** Longest recording; the kiosk stops listening by itself after this. */
const MAX_RECORDING_MS = 12_000;
/** Peak level (0-1) a recording must reach; below it we heard nothing (speech recognition would guess). */
const MIN_PEAK_LEVEL = 0.04;
const MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
/** A public kiosk: the conversation is deleted after this long without use. */
const IDLE_CLEAR_MS = 120_000;
/** Messages kept on screen (oldest dropped first). */
const MAX_MESSAGES = 30;

interface QuestionResponse {
  question: string;
  answer: string | null;
  answered: boolean;
  answerLang?: Lang;
  tripDestination: { id: string; name: string } | null;
  clarify?: boolean;
  choices?: { id: string; name: string }[];
  /** The trip this answer was about, to send back with the next question (null: no trip, keep the old one). */
  context?: ChatContext | null;
  /** A trip with stops on the way: every part, the stays, and ideas for each stop. */
  route?: ChatRoute | null;
  /** Real places from Google the answer recommends, shown with photos. */
  places?: ChatPlace[];
  debug?: QuestionDebug;
}

type Trip = { id: string; name: string };

/** One line of the chat. "notice" = a kiosk hint (heard nothing, error); it is not sent back to the AI. */
type ChatMessage =
  | { id: string; role: 'traveller'; text: string; via: 'voice' | 'text' }
  | {
      id: string;
      role: 'kiosk';
      text: string;
      answered: boolean;
      /** Language of the answer (the question's language, which may differ from the screen language). */
      lang: Lang;
      trip: Trip | null;
      /** The kiosk asks back ("Which one do you mean?") with one button per station. */
      choices: Trip[];
      /** A trip with stops ("first Interlaken, then Bern"): the full route, and how long to stay if not known. */
      route?: ChatRoute | null;
      /** Places from Google the answer recommends ("What can I do in Basel?"), shown with their photos. */
      places?: ChatPlace[];
    }
  | { id: string; role: 'notice'; text: string };

type Phase = 'idle' | 'listening' | 'thinking';

interface SavedChat {
  messages: ChatMessage[];
  context: ChatContext | null;
  at: number;
}

/** Context as saved by any version: older ones stored only the destination ({id, name}). */
function readContext(value: unknown): ChatContext | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<ChatContext> & Partial<Trip>;
  if (v.destination?.id) return { origin: v.origin?.id ? v.origin : null, destination: v.destination };
  if (typeof v.id === 'string' && typeof v.name === 'string') return { origin: null, destination: { id: v.id, name: v.name } };
  return null;
}

function extensionFor(mime: string): string {
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
}

let counter = 0;
const newId = () => `m${Date.now().toString(36)}-${(counter += 1)}`;

/** sessionStorage can be blocked (private mode, kiosk policies): the chat then simply lives in memory. */
function loadChat(key: string): SavedChat | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const saved = JSON.parse(raw) as SavedChat;
    if (!Array.isArray(saved.messages) || Date.now() - saved.at > IDLE_CLEAR_MS) {
      sessionStorage.removeItem(key);
      return null;
    }
    // Chats saved by an older version may miss newer fields.
    const messages = saved.messages.map((m) =>
      m.role === 'kiosk' ? { ...m, choices: Array.isArray(m.choices) ? m.choices : [], lang: m.lang ?? 'en' } : m,
    );
    return { ...saved, messages, context: readContext(saved.context) };
  } catch {
    return null;
  }
}

function saveChat(key: string, chat: SavedChat | null) {
  try {
    if (chat && chat.messages.length) sessionStorage.setItem(key, JSON.stringify(chat));
    else sessionStorage.removeItem(key);
  } catch {
    // storage not available: nothing to do
  }
}

/**
 * "Ask a question" as a chat: the traveller speaks or types, every question and answer stays on screen,
 * and follow-up questions ("and which platform?") are understood because the conversation so far, and the
 * trip already discussed, are sent with each question. The backend still answers from facts only.
 * The chat survives a visit to "Show my next train" and back (sessionStorage), and is deleted after
 * 2 minutes without use or with "New conversation".
 * `aboutTrip`: asked from the result screen, so the questions are about the traveller's journey.
 */
export function AskScreen({
  now,
  scenario,
  aboutTrip = false,
  debug = false,
}: {
  now: string;
  scenario: Scenario;
  aboutTrip?: boolean;
  debug?: boolean;
}) {
  const t = getMessages(scenario.lang);
  const status = useAiStatus();
  const canAsk = status?.ai ?? false;
  const storageKey = `sbb-kiosk-chat:${aboutTrip ? 'trip' : 'help'}`;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  /**
   * The trip this conversation is about (the last answer that was about a trip: "I need to get to Bern",
   * "from Winterthur to Chur", "the first one"), sent with every follow-up question.
   */
  const [context, setContext] = useState<ChatContext | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [text, setText] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const meter = useRef<{ ctx: AudioContext; timer: ReturnType<typeof setInterval>; peak: number } | null>(null);
  const recordingStart = useRef(0);
  const lastActivity = useRef(0);
  const restored = useRef(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const chatRef = useRef<HTMLOListElement | null>(null);
  const [level, setLevel] = useState({ now: 0, peak: 0 });
  const [lastDebug, setLastDebug] = useState<AskDebugState | null>(null);

  const touch = () => {
    lastActivity.current = Date.now();
  };

  // Restore the conversation after coming back (e.g. from "Show my next train"), if it is recent.
  useEffect(() => {
    const saved = loadChat(storageKey);
    if (saved) {
      setMessages(saved.messages);
      setContext(saved.context);
      lastActivity.current = saved.at;
    }
    restored.current = true;
  }, [storageKey]);

  // Keep it for this browser tab only, with the time of the last activity.
  useEffect(() => {
    if (!restored.current) return;
    saveChat(storageKey, { messages, context, at: lastActivity.current || Date.now() });
  }, [messages, context, storageKey]);

  const clearChat = useCallback(() => {
    setMessages([]);
    setContext(null);
    setText('');
    saveChat(storageKey, null);
  }, [storageKey]);

  // Public kiosk: delete the conversation after 2 minutes without use.
  useEffect(() => {
    const timer = setInterval(() => {
      if (phase === 'idle' && messages.length && Date.now() - lastActivity.current > IDLE_CLEAR_MS) clearChat();
    }, 5_000);
    return () => clearInterval(timer);
  }, [phase, messages.length, clearChat]);

  // Show the newest message. A new answer from the kiosk is shown from its first line (a long answer, or one with
  // a list of places, is read from the top); the traveller's own message and "thinking…" are shown at the end.
  const lastRole = messages.at(-1)?.role;
  useEffect(() => {
    const answer = phase === 'idle' && lastRole === 'kiosk' ? chatRef.current?.lastElementChild : null;
    if (answer) answer.scrollIntoView({ block: 'start', behavior: 'smooth' });
    else endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages.length, phase, lastRole]);

  useEffect(
    () => () => {
      if (stopTimer.current) clearTimeout(stopTimer.current);
      const rec = recorder.current;
      if (rec && rec.state !== 'inactive') rec.stop();
      rec?.stream.getTracks().forEach((track) => track.stop());
      if (meter.current) {
        clearInterval(meter.current.timer);
        void meter.current.ctx.close();
      }
    },
    [],
  );

  const add = (...items: ChatMessage[]) => setMessages((list) => [...list, ...items].slice(-MAX_MESSAGES));

  /** Tracks the loudness of the recording, so silence is not sent to speech recognition. */
  const startMeter = (stream: MediaStream) => {
    try {
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      const state = {
        ctx,
        peak: 0,
        timer: setInterval(() => {
          analyser.getFloatTimeDomainData(samples);
          let current = 0;
          for (const v of samples) current = Math.max(current, Math.abs(v));
          state.peak = Math.max(state.peak, current);
          // Smoothed for display (falls slowly), so the bar does not drop to 0 between words.
          setLevel((l) => ({ now: Math.max(current, l.now * 0.85), peak: state.peak }));
        }, 50),
      };
      meter.current = state;
    } catch {
      meter.current = null; // no Web Audio: skip the check
    }
  };

  /** Loudest level heard (1 if it could not be measured). */
  const stopMeter = (): number => {
    const m = meter.current;
    meter.current = null;
    setLevel({ now: 0, peak: 0 });
    if (!m) return 1;
    clearInterval(m.timer);
    void m.ctx.close();
    return m.peak;
  };

  /**
   * The conversation so far, as sent to the AI (kiosk hints are left out). When the kiosk asked back, the
   * stations it offered are added, so "the first one" or "Basel" can be understood; places it showed are added
   * with their walking time, so "How do I get there?" or "How do I get to the fountain?" can be answered.
   */
  const historyOf = (list: ChatMessage[]): ChatTurn[] =>
    list.flatMap((m): ChatTurn[] => {
      if (m.role === 'notice') return [];
      if (m.role === 'kiosk' && m.choices.length) {
        return [{ role: 'kiosk', text: `${m.text} (Options: ${m.choices.map((c) => c.name).join(', ')})` }];
      }
      if (m.role === 'kiosk' && m.places?.length) {
        const shown = m.places.map((p) => `${p.name}, ${p.walkMinutes} min walk from ${p.fromStation}`).join('; ');
        return [{ role: 'kiosk', text: `${m.text} (Places shown: ${shown})` }];
      }
      return [{ role: m.role, text: m.text }];
    });

  const ask = async (body: FormData, info: AskDebugState, via: 'voice' | 'text', stay?: number) => {
    touch();
    setPhase('thinking');
    setLastDebug(info);
    body.set('lang', scenario.lang);
    body.set('history', JSON.stringify(historyOf(messages)));
    if (aboutTrip) {
      body.set('about', 'trip');
      if (scenario.to) body.set('to', scenario.to);
    } else if (context) {
      body.set('context', context.destination.id);
      if (context.origin) body.set('context_origin', context.origin.id);
      if (context.via?.length) {
        // A trip with stops: the stops and how long to stay at each (null = not said yet).
        body.set('context_via', JSON.stringify(context.via.map((v) => v.id)));
        body.set('context_stays', JSON.stringify(context.via.map((_, i) => context.stays?.[i] ?? null)));
      }
    }
    if (stay) body.set('stay', String(stay));
    const started = performance.now();
    try {
      const res = await fetch('/api/ai/question', { method: 'POST', body });
      const roundTripMs = Math.round(performance.now() - started);
      if (!res.ok) {
        setLastDebug({ ...info, httpStatus: res.status, roundTripMs, clientError: (await res.text()).slice(0, 200) });
        throw new Error(`question ${res.status}`);
      }
      const data = (await res.json()) as QuestionResponse;
      setLastDebug({ ...info, httpStatus: res.status, roundTripMs, server: data.debug });
      if (!data.question || !data.answer) {
        add({ id: newId(), role: 'notice', text: t.ask.heardNothing });
        return;
      }
      const trip = data.tripDestination;
      // A typed question is already on screen; a spoken one appears as it was understood.
      const question: ChatMessage[] =
        via === 'voice' ? [{ id: newId(), role: 'traveller', text: data.question, via: 'voice' }] : [];
      add(...question, {
        id: newId(),
        role: 'kiosk',
        text: data.answer,
        answered: data.answered,
        lang: data.answerLang ?? scenario.lang,
        trip,
        choices: data.clarify ? (data.choices ?? []) : [],
        route: data.route ?? null,
        places: data.places ?? [],
      });
      // The trip this answer was about becomes the conversation's trip for follow-ups. An answer about no trip
      // ("where can I get a coffee?") keeps the old one. "About my trip" keeps the ticket's trip.
      if (data.context && !aboutTrip) setContext(data.context);
    } catch (err) {
      console.error('[ask] failed:', err);
      setLastDebug((d) => (d && !d.clientError ? { ...d, clientError: (err as Error).message } : d));
      add({ id: newId(), role: 'notice', text: t.ask.failed });
    } finally {
      touch();
      setPhase('idle');
    }
  };

  const startListening = async () => {
    touch();
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setLastDebug({ input: 'voice', clientError: 'This browser has no microphone recording (getUserMedia/MediaRecorder)' });
      add({ id: newId(), role: 'notice', text: t.ask.micDenied });
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      setLastDebug({ input: 'voice', clientError: `Microphone not available: ${(err as Error).name} ${(err as Error).message}` });
      add({ id: newId(), role: 'notice', text: t.ask.micDenied });
      return;
    }
    const mimeType = MIME_TYPES.find((m) => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      const peak = stopMeter();
      stream.getTracks().forEach((track) => track.stop());
      if (stopTimer.current) clearTimeout(stopTimer.current);
      const type = rec.mimeType || mimeType || 'audio/webm';
      const audio = new Blob(chunks, { type });
      const tooQuiet = audio.size < 1000 || peak < MIN_PEAK_LEVEL;
      const recording = {
        mimeType: type,
        durationMs: Math.round(performance.now() - recordingStart.current),
        bytes: audio.size,
        peak,
        threshold: MIN_PEAK_LEVEL,
        sent: !tooQuiet,
      };
      if (tooQuiet) {
        setLastDebug({ input: 'voice', recording });
        add({ id: newId(), role: 'notice', text: t.ask.heardNothing });
        touch();
        setPhase('idle');
        return;
      }
      const form = new FormData();
      form.set('audio', audio, `speech.${extensionFor(type)}`);
      void ask(form, { input: 'voice', recording }, 'voice');
    };
    recorder.current = rec;
    startMeter(stream);
    recordingStart.current = performance.now();
    rec.start();
    setPhase('listening');
    stopTimer.current = setTimeout(() => rec.state !== 'inactive' && rec.stop(), MAX_RECORDING_MS);
  };

  const stopListening = () => {
    const rec = recorder.current;
    if (rec && rec.state !== 'inactive') rec.stop();
  };

  const submitText = (event: FormEvent) => {
    event.preventDefault();
    const question = text.trim();
    if (!question || phase !== 'idle') return;
    add({ id: newId(), role: 'traveller', text: question, via: 'text' });
    setText('');
    const form = new FormData();
    form.set('text', question);
    void ask(form, { input: 'text', typed: question }, 'text');
  };

  /** A stay button ("Stay 2 h"): shown as the traveller's answer, sent with the minutes so nothing is guessed. */
  const pickStay = (minutes: number, label: string) => {
    if (phase !== 'idle') return;
    add({ id: newId(), role: 'traveller', text: label, via: 'text' });
    const form = new FormData();
    form.set('text', label);
    void ask(form, { input: 'text', typed: label }, 'text', minutes);
  };

  const busy = phase !== 'idle';
  const lastKiosk = [...messages].reverse().find((m) => m.role === 'kiosk')?.id;
  const back = aboutTrip
    ? { href: withScenario('/kiosk/result', scenario), label: t.common.back, icon: 'chevron-small-left-small' }
    : { href: withScenario('/kiosk', { ...scenario, to: undefined }), label: t.common.cancel, icon: 'cross-small' };

  return (
    <KioskFrame lang={scenario.lang}>
      <KioskHeader
        time={now}
        start={
          <NavButton href={back.href} variant="secondary" iconName={back.icon}>
            {back.label}
          </NavButton>
        }
      />
      <KioskMain className={styles.main}>
        {messages.length === 0 && (
          <ScreenIntro
            title={aboutTrip ? t.ask.titleTrip : t.ask.title}
            lead={aboutTrip ? t.ask.leadTrip : t.ask.lead}
          />
        )}

        {status && !canAsk && (
          <SbbNotification type="info" readOnly animation="none" className={styles.notice}>
            {t.ask.unavailable}
          </SbbNotification>
        )}

        {(messages.length > 0 || phase === 'thinking') && (
          <ol ref={chatRef} className={styles.chat} aria-live="polite" aria-relevant="additions">
            {messages.map((m) => (
              <Message
                key={m.id}
                message={m}
                scenario={scenario}
                t={t}
                // Only the newest answer's stay buttons work: an older question has been answered already.
                onStay={m.id === lastKiosk && !busy ? pickStay : undefined}
              />
            ))}
            {phase === 'thinking' && (
              <li className={styles.theirs}>
                <div className={`${styles.bubble} ${styles.kiosk}`}>
                  <AiWorking text={t.ask.thinking} />
                </div>
              </li>
            )}
          </ol>
        )}
        <div ref={endRef} />

        {debug && <AskDebugPanel live={phase === 'listening'} level={level.now} loudest={level.peak} last={lastDebug} />}
      </KioskMain>
      <KioskFooter>
        {canAsk && (
          <div className={styles.composer}>
            {phase === 'listening' ? (
              <div className={styles.voice}>
                <p className={styles.listening} role="status">
                  <span className={styles.dot} aria-hidden="true" />
                  {t.ask.listening}
                </p>
                <SbbSecondaryButton size="l" iconName="stop-small" className={styles.wide} onClick={stopListening}>
                  {t.ask.stop}
                </SbbSecondaryButton>
              </div>
            ) : (
              <SbbButton
                size="l"
                iconName="microphone-small"
                className={styles.wide}
                onClick={startListening}
                disabled={busy}
              >
                {messages.length ? `${t.ask.speak} · ${t.ask.followUp}` : t.ask.speak}
              </SbbButton>
            )}

            <form className={styles.form} onSubmit={submitText}>
              <SbbFormField size="l" className={styles.field}>
                <label>{messages.length ? t.ask.followUp : t.ask.inputLabel}</label>
                <input
                  value={text}
                  onChange={(e) => {
                    touch();
                    setText(e.target.value);
                  }}
                  placeholder={t.ask.placeholder}
                  autoComplete="off"
                  enterKeyHint="send"
                  maxLength={500}
                  disabled={busy}
                />
              </SbbFormField>
              <SbbButton size="l" type="submit" iconName="magnifying-glass-small" disabled={busy || !text.trim()}>
                {t.ask.send}
              </SbbButton>
            </form>
          </div>
        )}
        {/* "New conversation" lives here, not in the header: with it, the header had no room left for the clock. */}
        <div className={styles.footerRow}>
          <p className={styles.privacy}>
            <SbbIcon name="lock-closed-small" />
            <span>
              {t.ask.privacy} {t.ask.autoClear}
            </span>
          </p>
          {messages.length > 0 && (
            <SbbSecondaryButton size="m" iconName="arrows-circle-small" onClick={clearChat} disabled={busy}>
              {t.ask.newChat}
            </SbbSecondaryButton>
          )}
        </div>
      </KioskFooter>
    </KioskFrame>
  );
}

/** One chat bubble: the traveller's question (right), the kiosk's answer (left), or a kiosk hint. */
function Message({
  message: m,
  scenario,
  t,
  onStay,
}: {
  message: ChatMessage;
  scenario: Scenario;
  t: ReturnType<typeof getMessages>;
  onStay?: (minutes: number, label: string) => void;
}) {
  if (m.role === 'notice') {
    return (
      <li className={styles.noticeRow}>
        <SbbNotification type="warn" readOnly animation="none" className={styles.notice}>
          {m.text}
        </SbbNotification>
      </li>
    );
  }
  if (m.role === 'traveller') {
    return (
      <li className={styles.mine}>
        <div className={`${styles.bubble} ${styles.traveller}`}>
          <span className={styles.who}>
            {t.ask.you}
            {m.via === 'voice' && (
              <>
                {' · '}
                <SbbIcon name="microphone-small" className={styles.whoIcon} />
                {t.ask.spoken}
              </>
            )}
          </span>
          <p className={styles.text}>{m.text}</p>
        </div>
      </li>
    );
  }
  // With buttons ("Show my next train · <station>", station choices) the bubble may use the full width,
  // so long station names are not cut off with "…".
  const withActions = Boolean(m.trip) || m.choices.length > 0 || Boolean(m.route) || Boolean(m.places?.length);
  return (
    <li className={styles.theirs}>
      <div className={`${styles.bubble} ${styles.kiosk} ${withActions ? styles.withActions : ''}`}>
        <span className={styles.who}>
          {t.welcome.product}
          {m.answered && <AiChip label={t.ai.label} />}
        </span>
        {m.answered || m.choices.length > 0 ? (
          <p className={styles.text} lang={m.lang}>
            {m.text}
          </p>
        ) : (
          <SbbNotification type="info" readOnly animation="none" className={styles.cantAnswer} lang={m.lang}>
            {m.text}
          </SbbNotification>
        )}
        {m.places && m.places.length > 0 && <ChatPlaces places={m.places} t={getMessages(m.lang)} lang={m.lang} />}
        {m.route && <RouteCard route={m.route} t={getMessages(m.lang)} lang={m.lang} onStay={onStay} />}
        {m.choices.map((c) => (
          <NavButton
            key={c.id}
            href={withScenario('/kiosk/result', { ...scenario, to: c.id })}
            iconName="train-small"
            className={styles.tripButton}
          >
            {c.name}
          </NavButton>
        ))}
        {m.trip && (
          <NavButton href={withScenario('/kiosk/result', { ...scenario, to: m.trip.id })} className={styles.tripButton}>
            {t.ask.showTrain} · {m.trip.name}
          </NavButton>
        )}
      </div>
    </li>
  );
}

const hhmm = (iso: string) => iso.slice(11, 16);

/** 120 -> "2 h", 90 -> "1 h 30", 45 -> "45 min" (as the backend writes it in the answer). */
function stayLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}\u00a0min`;
  return m ? `${h}\u00a0h\u00a0${String(m).padStart(2, '0')}` : `${h}\u00a0h`;
}

/**
 * The full route of a trip with stops, as a timeline: each train (time, station, platform), then the time at
 * each stop with ideas of what to do there. Where the stay is not known yet, the kiosk asks with buttons.
 */
function RouteCard({
  route,
  t,
  lang,
  onStay,
}: {
  route: ChatRoute;
  t: ReturnType<typeof getMessages>;
  lang: Lang;
  onStay?: (minutes: number, label: string) => void;
}) {
  return (
    <section className={styles.route} lang={lang} aria-label={t.ask.route}>
      <h3 className={styles.routeTitle}>{t.ask.route}</h3>
      <ol className={styles.steps}>
        {route.parts.map((part, i) => {
          const stop = route.stops[i + 1];
          const isStop = i < route.stops.length - 2;
          const stay = route.stays[i] ?? null;
          const next = route.parts[i + 1];
          const arrived = part.trains?.at(-1)?.arrival;
          const leaves = next?.trains?.[0]?.departure;
          const ideas = route.ideas.find((x) => x.stop.id === stop.id)?.ideas ?? [];
          const asking = route.askStay?.index === i;
          return (
            <li key={`${part.from.id}-${part.to.id}-${i}`} className={styles.part}>
              {part.trains ? (
                <ol className={styles.trains}>
                  {part.trains.map((train, k) => (
                    <li key={`${train.departure}-${k}`} className={styles.train}>
                      <p className={styles.trainName}>
                        <SbbIcon name="train-small" className={styles.trainIcon} />
                        <strong>{train.line ?? ''}</strong>
                        {train.direction && <span>{t.result.towards(train.direction)}</span>}
                      </p>
                      <p className={styles.stopLine}>
                        <time className={styles.time}>{hhmm(train.departure)}</time>
                        <span className={styles.station}>{train.from.name}</span>
                        {train.from.platform && <span className={styles.platform}>{t.result.platformShort(train.from.platform)}</span>}
                      </p>
                      <p className={styles.stopLine}>
                        <time className={styles.time}>{hhmm(train.arrival)}</time>
                        <span className={styles.station}>{train.to.name}</span>
                        {train.to.platform && <span className={styles.platform}>{t.result.platformShort(train.to.platform)}</span>}
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                <SbbNotification type="warn" readOnly animation="none" className={styles.notice}>
                  {part.from.name} → {part.to.name}: {t.ask.noTrain}
                </SbbNotification>
              )}
              {isStop && part.trains && (
                <div className={styles.stay}>
                  <p className={styles.stayTitle}>
                    <SbbIcon name="walk-small" className={styles.trainIcon} />
                    <strong>{t.ask.stayAt(stop.name)}</strong>
                  </p>
                  {stay !== null ? (
                    <p className={styles.stayTime}>
                      {arrived && leaves ? t.ask.stayFor(stayLabel(stay), hhmm(arrived), hhmm(leaves)) : stayLabel(stay)}
                    </p>
                  ) : (
                    <p className={styles.stayTime}>{t.ask.howLong}</p>
                  )}
                  {ideas.length > 0 && (
                    <>
                      <p className={styles.ideasTitle}>{t.ask.ideasFor(stop.name)}</p>
                      <ul className={styles.ideas}>
                        {ideas.map((idea) => (
                          <li key={idea.title}>
                            {idea.title} <span className={styles.ideaTime}>({t.ask.about(stayLabel(idea.minutes))})</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {asking && onStay && (
                    <div className={styles.stayButtons}>
                      {route.askStay!.options.map((minutes) => {
                        const label = t.ask.stayButton(stayLabel(minutes));
                        return (
                          <SbbSecondaryButton key={minutes} size="l" onClick={() => onStay(minutes, label)}>
                            {label}
                          </SbbSecondaryButton>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
