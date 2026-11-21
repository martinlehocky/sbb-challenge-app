'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { QuestionDebug } from '@/lib/ai';
import { getMessages } from '@/lib/i18n/messages';
import { withScenario } from '@/lib/scenario';
import type { Lang, Scenario } from '@/lib/types';
import { AiChip } from '../ai/AiChip';
import { AiWorking } from '../ai/AiWorking';
import { AskDebugPanel, type AskDebugState } from '../ai/AskDebugPanel';
import { useAiStatus } from '../ai/useAiStatus';
import { KioskFooter, KioskFrame, KioskMain } from '../KioskFrame';
import { KioskHeader } from '../KioskHeader';
import { NavButton } from '../NavButton';
import { ScreenIntro } from '../ScreenIntro';
import { SbbButton, SbbCard, SbbFormField, SbbIcon, SbbNotification, SbbSecondaryButton } from '../sbb';
import styles from './AskScreen.module.css';

/** Longest recording; the kiosk stops listening by itself after this. */
const MAX_RECORDING_MS = 12_000;
/** Peak level (0-1) a recording must reach; below it we heard nothing (speech recognition would guess). */
const MIN_PEAK_LEVEL = 0.04;
const MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

interface QuestionResponse {
  question: string;
  answer: string | null;
  answered: boolean;
  answerLang?: Lang;
  tripDestination: { id: string; name: string } | null;
  clarify?: boolean;
  choices?: { id: string; name: string }[];
  debug?: QuestionDebug;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'listening' }
  | { kind: 'thinking' }
  | {
      kind: 'answer';
      question: string;
      answer: string;
      answered: boolean;
      answerLang: Lang;
      trip: { id: string; name: string } | null;
      /** The kiosk asks back ("Which one do you mean?") with one button per station. */
      choices: { id: string; name: string }[];
    }
  | { kind: 'problem'; message: string };

function extensionFor(mime: string): string {
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
}

/**
 * "Ask a question": the traveller speaks or types a question. The backend gathers facts (their journey,
 * disruptions, station tips) and the AI answers from those facts only, as text on the screen.
 * `aboutTrip`: asked from the result screen, so the question is about the traveller's journey.
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
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [text, setText] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const meter = useRef<{ ctx: AudioContext; timer: ReturnType<typeof setInterval>; peak: number } | null>(null);
  const recordingStart = useRef(0);
  const [level, setLevel] = useState({ now: 0, peak: 0 });
  const [lastDebug, setLastDebug] = useState<AskDebugState | null>(null);

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

  const ask = async (body: FormData, info: AskDebugState) => {
    setPhase({ kind: 'thinking' });
    setLastDebug(info);
    body.set('lang', scenario.lang);
    if (aboutTrip) {
      body.set('about', 'trip');
      if (scenario.to) body.set('to', scenario.to);
    }
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
        setPhase({ kind: 'problem', message: t.ask.heardNothing });
        return;
      }
      setPhase({
        kind: 'answer',
        question: data.question,
        answer: data.answer,
        answered: data.answered,
        answerLang: data.answerLang ?? scenario.lang,
        trip: data.tripDestination,
        choices: data.clarify ? (data.choices ?? []) : [],
      });
    } catch (err) {
      console.error('[ask] failed:', err);
      setLastDebug((d) => (d && !d.clientError ? { ...d, clientError: (err as Error).message } : d));
      setPhase({ kind: 'problem', message: t.ask.failed });
    }
  };

  const startListening = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setLastDebug({ input: 'voice', clientError: 'This browser has no microphone recording (getUserMedia/MediaRecorder)' });
      setPhase({ kind: 'problem', message: t.ask.micDenied });
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      setLastDebug({ input: 'voice', clientError: `Microphone not available: ${(err as Error).name} ${(err as Error).message}` });
      setPhase({ kind: 'problem', message: t.ask.micDenied });
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
        setPhase({ kind: 'problem', message: t.ask.heardNothing });
        return;
      }
      const form = new FormData();
      form.set('audio', audio, `speech.${extensionFor(type)}`);
      void ask(form, { input: 'voice', recording });
    };
    recorder.current = rec;
    startMeter(stream);
    recordingStart.current = performance.now();
    rec.start();
    setPhase({ kind: 'listening' });
    stopTimer.current = setTimeout(() => rec.state !== 'inactive' && rec.stop(), MAX_RECORDING_MS);
  };

  const stopListening = () => {
    const rec = recorder.current;
    if (rec && rec.state !== 'inactive') rec.stop();
  };

  const submitText = (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    const form = new FormData();
    form.set('text', text.trim());
    void ask(form, { input: 'text', typed: text.trim() });
  };

  const reset = () => {
    setText('');
    setPhase({ kind: 'idle' });
  };

  const busy = phase.kind === 'listening' || phase.kind === 'thinking';
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
        <ScreenIntro
          title={aboutTrip ? t.ask.titleTrip : t.ask.title}
          lead={aboutTrip ? t.ask.leadTrip : t.ask.lead}
        />

        {status && !canAsk && (
          <SbbNotification type="info" readOnly animation="none" className={styles.notice}>
            {t.ask.unavailable}
          </SbbNotification>
        )}

        {canAsk && (phase.kind === 'idle' || phase.kind === 'listening') && (
          <>
            <div className={styles.voice}>
              {phase.kind === 'listening' ? (
                <>
                  <SbbSecondaryButton size="l" iconName="stop-small" className={styles.wide} onClick={stopListening}>
                    {t.ask.stop}
                  </SbbSecondaryButton>
                  <p className={styles.listening} role="status">
                    <span className={styles.dot} aria-hidden="true" />
                    {t.ask.listening}
                  </p>
                </>
              ) : (
                <SbbButton size="l" iconName="microphone-small" className={styles.wide} onClick={startListening}>
                  {t.ask.speak}
                </SbbButton>
              )}
            </div>

            <form className={styles.form} onSubmit={submitText}>
              <SbbFormField size="l" className={styles.field}>
                <label>{t.ask.inputLabel}</label>
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={t.ask.placeholder}
                  autoComplete="off"
                  enterKeyHint="send"
                  disabled={busy}
                />
              </SbbFormField>
              <SbbButton size="l" type="submit" iconName="magnifying-glass-small" disabled={busy || !text.trim()}>
                {t.ask.send}
              </SbbButton>
            </form>
          </>
        )}

        {phase.kind === 'thinking' && (
          <div className={styles.thinking}>
            <AiWorking text={t.ask.thinking} />
          </div>
        )}

        {phase.kind === 'answer' && (
          <SbbCard color="white" className={styles.found} aria-live="polite">
            <div className={styles.foundHead}>
              <span className={styles.label}>{t.ask.yourQuestion}</span>
              {phase.answered && <AiChip label={t.ai.label} />}
            </div>
            <p className={styles.transcript}>“{phase.question}”</p>
            <span className={styles.label}>{t.ask.answer}</span>
            {phase.answered || phase.choices.length > 0 ? (
              <p className={styles.answer} lang={phase.answerLang}>
                {phase.answer}
              </p>
            ) : (
              <SbbNotification type="info" readOnly animation="none" className={styles.cantAnswer} lang={phase.answerLang}>
                {phase.answer}
              </SbbNotification>
            )}
            <div className={styles.actions}>
              {phase.choices.map((c) => (
                <NavButton key={c.id} href={withScenario('/kiosk/result', { ...scenario, to: c.id })} iconName="train-small">
                  {c.name}
                </NavButton>
              ))}
              {phase.trip && (
                <NavButton href={withScenario('/kiosk/result', { ...scenario, to: phase.trip.id })}>
                  {t.ask.showTrain} · {phase.trip.name}
                </NavButton>
              )}
              {aboutTrip && phase.choices.length === 0 && (
                <NavButton href={withScenario('/kiosk/result', scenario)} variant={phase.trip ? 'secondary' : 'primary'}>
                  {t.ask.backToTrip}
                </NavButton>
              )}
              <SbbSecondaryButton size="l" onClick={reset}>
                {t.ask.askAnother}
              </SbbSecondaryButton>
            </div>
          </SbbCard>
        )}

        {phase.kind === 'problem' && (
          <div className={styles.problem} aria-live="polite">
            <SbbNotification type="warn" readOnly animation="none" className={styles.notice}>
              {phase.message}
            </SbbNotification>
            <SbbButton size="l" onClick={reset} className={styles.wide}>
              {t.ask.askAnother}
            </SbbButton>
          </div>
        )}

        {debug && <AskDebugPanel live={phase.kind === 'listening'} level={level.now} loudest={level.peak} last={lastDebug} />}
      </KioskMain>
      <KioskFooter>
        <p className={styles.privacy}>
          <SbbIcon name="lock-closed-small" />
          {t.ask.privacy}
        </p>
      </KioskFooter>
    </KioskFrame>
  );
}
