'use client';

import type { QuestionDebug } from '@/lib/ai';
import styles from './AskDebugPanel.module.css';

export interface RecordingInfo {
  mimeType: string;
  durationMs: number;
  bytes: number;
  /** Loudest moment, 0-1. */
  peak: number;
  /** Below this peak the recording is treated as silence and not sent. */
  threshold: number;
  sent: boolean;
}

export interface AskDebugState {
  input: 'voice' | 'text';
  typed?: string;
  recording?: RecordingInfo;
  /** From the backend (speech to text, AI understanding, matched stations). */
  server?: QuestionDebug;
  roundTripMs?: number;
  httpStatus?: number;
  clientError?: string;
}

const val = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));

/**
 * Debugging for the voice / text search: what the microphone heard, what Whisper transcribed,
 * what the AI extracted and which stations it matched. Hidden with ?debug=0.
 */
export function AskDebugPanel({
  live,
  level,
  loudest,
  last,
}: {
  live: boolean;
  level: number;
  loudest: number;
  last: AskDebugState | null;
}) {
  const stt = last?.server?.speech_to_text;
  return (
    <section className={styles.panel} aria-label="Debug information">
      <h2 className={styles.title}>Debug · what the AI detected</h2>

      <div className={styles.row}>
        <span className={styles.key}>Microphone</span>
        <span className={styles.value}>
          <span className={styles.meter} aria-hidden="true">
            <span className={styles.meterFill} style={{ width: `${Math.min(100, Math.round(level * 100))}%` }} />
          </span>
          {live ? `listening · level ${level.toFixed(2)} · loudest ${loudest.toFixed(2)}` : 'not listening'}
        </span>
      </div>

      {!last && <p className={styles.empty}>Speak or type a destination to see the details here.</p>}

      {last && (
        <>
          <div className={styles.row}>
            <span className={styles.key}>Input</span>
            <span className={styles.value}>{last.input === 'voice' ? 'voice' : `typed: “${last.typed}”`}</span>
          </div>

          {last.recording && (
            <div className={styles.row}>
              <span className={styles.key}>Recording</span>
              <span className={styles.value}>
                {last.recording.mimeType} · {(last.recording.durationMs / 1000).toFixed(1)} s ·{' '}
                {Math.round(last.recording.bytes / 1024)} KB · peak {last.recording.peak.toFixed(2)}{' '}
                (min {last.recording.threshold}) · {last.recording.sent ? 'sent' : 'NOT sent (too quiet)'}
              </span>
            </div>
          )}

          {stt && (
            <div className={styles.row}>
              <span className={styles.key}>Speech to text</span>
              <span className={styles.value}>
                “{stt.first_transcript}” · detected <b>{val(stt.detected_language)}</b>
                {stt.retried_in && <> · re-transcribed in <b>{stt.retried_in}</b></>}
                {stt.prompt_echo && <> · <b>prompt echo (ignored)</b></>} · {stt.ms} ms · {stt.model}
              </span>
            </div>
          )}

          {last.server?.trip_intent && (
            <div className={styles.row}>
              <span className={styles.key}>Trip in question</span>
              <span className={styles.value}>
                {last.server.trip_intent.raw
                  ? <>AI read destination <b>{val(last.server.trip_intent.raw.destination)}</b> (origin {val(last.server.trip_intent.raw.origin)})</>
                  : 'no AI answer'}{' '}
                → matched <b>{val(last.server.trip_intent.destination)}</b> · {last.server.trip_intent.method}
              </span>
            </div>
          )}

          {last.server?.facts && (
            <div className={styles.row}>
              <span className={styles.key}>Facts given ({last.server.facts.length})</span>
              <span className={`${styles.value} ${styles.facts}`}>
                {last.server.facts.map((f, i) => (
                  <span key={i}>{f}</span>
                ))}
              </span>
            </div>
          )}

          {last.server && (last.server.ai_raw || last.server.error || last.server.rejected) && (
            <div className={styles.row}>
              <span className={styles.key}>AI answer</span>
              <span className={styles.value}>
                {last.server.ai_raw && <>answered <b>{val(last.server.ai_raw.answered)}</b> · </>}
                {last.server.rejected && <><b>rejected</b>: {last.server.rejected} · </>}
                {last.server.error && <><b>error</b>: {last.server.error} · </>}
                {val(last.server.ms)} ms · {val(last.server.model)}
              </span>
            </div>
          )}

          <div className={styles.row}>
            <span className={styles.key}>Timing</span>
            <span className={styles.value}>
              {last.httpStatus !== undefined && <>HTTP {last.httpStatus} · </>}
              server {val(last.server?.server_ms)} ms · round trip {val(last.roundTripMs)} ms
              {last.clientError && <> · error: {last.clientError}</>}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
