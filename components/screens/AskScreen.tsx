'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { getMessages } from '@/lib/i18n/messages';
import { withScenario } from '@/lib/scenario';
import type { AskDebug } from '@/lib/ai';
import type { Scenario } from '@/lib/types';
import { AiChip } from '../ai/AiChip';
import { AskDebugPanel, type AskDebugState } from '../ai/AskDebugPanel';
import { AiWorking } from '../ai/AiWorking';
import { useAiStatus } from '../ai/useAiStatus';
import { KioskFooter, KioskFrame, KioskMain } from '../KioskFrame';
import { KioskHeader } from '../KioskHeader';
import { NavButton } from '../NavButton';
import { ScreenIntro } from '../ScreenIntro';
import {
  SbbButton,
  SbbCard,
  SbbFormField,
  SbbIcon,
  SbbNotification,
  SbbSecondaryButton,
  SbbTitle,
} from '../sbb';
import styles from './AskScreen.module.css';

/** Longest recording; the kiosk stops listening by itself after this. */
const MAX_RECORDING_MS = 10_000;
/** Peak level (0-1) a recording must reach; below it we heard nothing (speech recognition would guess). */
const MIN_PEAK_LEVEL = 0.04;
const MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

type Phase =
  | { kind: 'idle' }
  | { kind: 'listening' }
  | { kind: 'thinking' }
  | { kind: 'found'; transcript: string; destination: { id: string; name: string } }
  | { kind: 'problem'; message: string; transcript?: string };

interface AskResponse {
  transcript: string;
  destination: { id: string; name: string } | null;
  problem?: 'not_understood' | 'same_station';
  debug?: AskDebug & { server_ms?: number };
}

function extensionFor(mime: string): string {
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
}

/**
 * "No ticket? Type your destination": the traveller says or types where they want to go.
 * The AI (speech to text + trip understanding in the backend) finds the destination station,
 * shows what it understood, and the kiosk continues with the real next train to it.
 */
export function AskScreen({ now, scenario, debug = false }: { now: string; scenario: Scenario; debug?: boolean }) {
  const t = getMessages(scenario.lang);
  const status = useAiStatus();
  const canAsk = status?.backend ?? false;
  const canSpeak = status?.ai ?? false;
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

  /** Tracks the loudest moment of the recording, so silence is not sent to speech recognition. */
  const startMeter = (stream: MediaStream) => {
    try {
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      const state = { ctx, peak: 0, timer: setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        let now = 0;
        for (const v of samples) now = Math.max(now, Math.abs(v));
        state.peak = Math.max(state.peak, now);
        // Smoothed for display (falls slowly), so the bar does not drop to 0 between words.
        setLevel((l) => ({ now: Math.max(now, l.now * 0.85), peak: state.peak }));
      }, 50) };
      meter.current = state;
    } catch {
      meter.current = null; // no Web Audio: skip the check
    }
  };

  /** Peak level heard (1 if it could not be measured). */
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
    const started = performance.now();
    try {
      const res = await fetch('/api/ai/ask', { method: 'POST', body });
      const roundTripMs = Math.round(performance.now() - started);
      if (!res.ok) {
        setLastDebug({ ...info, httpStatus: res.status, roundTripMs, clientError: (await res.text()).slice(0, 200) });
        throw new Error(`ask ${res.status}`);
      }
      const data = (await res.json()) as AskResponse;
      setLastDebug({ ...info, httpStatus: res.status, roundTripMs, server: data.debug });
      if (!data.transcript) {
        setPhase({ kind: 'problem', message: t.ask.heardNothing });
      } else if (data.destination && !data.problem) {
        setPhase({ kind: 'found', transcript: data.transcript, destination: data.destination });
      } else if (data.problem === 'same_station' && data.destination) {
        setPhase({ kind: 'problem', message: t.ask.sameStation(data.destination.name), transcript: data.transcript });
      } else {
        setPhase({ kind: 'problem', message: t.ask.notUnderstood, transcript: data.transcript || undefined });
      }
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

  return (
    <KioskFrame lang={scenario.lang}>
      <KioskHeader
        time={now}
        start={
          <NavButton href={withScenario('/kiosk', scenario)} variant="secondary" iconName="cross-small">
            {t.common.cancel}
          </NavButton>
        }
      />
      <KioskMain className={styles.main}>
        <ScreenIntro title={t.ask.title} lead={t.ask.lead} />

        {status && !canAsk && (
          <SbbNotification type="info" readOnly animation="none" className={styles.notice}>
            {t.ask.unavailable}
          </SbbNotification>
        )}

        {canAsk && !canSpeak && phase.kind === 'idle' && (
          <SbbNotification type="info" readOnly animation="none" className={styles.notice}>
            {t.ask.voiceUnavailable}
          </SbbNotification>
        )}

        {canAsk && (phase.kind === 'idle' || phase.kind === 'listening') && (
          <>
            {canSpeak && (
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
            )}

            <form className={styles.form} onSubmit={submitText}>
              <SbbFormField size="l" className={styles.field}>
                <label>{t.ask.inputLabel}</label>
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={t.ask.placeholder}
                  autoComplete="off"
                  enterKeyHint="search"
                  disabled={busy}
                />
              </SbbFormField>
              <SbbButton size="l" type="submit" iconName="magnifying-glass-small" disabled={busy || !text.trim()}>
                {t.ask.search}
              </SbbButton>
            </form>
          </>
        )}

        {phase.kind === 'thinking' && (
          <div className={styles.thinking}>
            <AiWorking text={t.ask.thinking} />
          </div>
        )}

        {phase.kind === 'found' && (
          <SbbCard color="white" className={styles.found} aria-live="polite">
            <div className={styles.foundHead}>
              <span className={styles.label}>{t.ask.yourRequest}</span>
              <AiChip label={t.ai.label} />
            </div>
            <p className={styles.transcript}>“{phase.transcript}”</p>
            <span className={styles.label}>{t.ask.destination}</span>
            <SbbTitle level="2" visualLevel="2" className={styles.station}>
              <SbbIcon name="arrow-right-small" /> {phase.destination.name}
            </SbbTitle>
            <div className={styles.actions}>
              <NavButton href={withScenario('/kiosk/result', { ...scenario, to: phase.destination.id })}>
                {t.ask.showTrain}
              </NavButton>
              <SbbSecondaryButton size="l" onClick={reset}>
                {t.ask.tryAgain}
              </SbbSecondaryButton>
            </div>
          </SbbCard>
        )}

        {phase.kind === 'problem' && (
          <div className={styles.problem} aria-live="polite">
            <SbbNotification type="warn" readOnly animation="none" className={styles.notice}>
              {phase.transcript && <span className={styles.heard}>“{phase.transcript}”</span>}
              {phase.message}
            </SbbNotification>
            <SbbButton size="l" onClick={reset} className={styles.wide}>
              {t.ask.tryAgain}
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
