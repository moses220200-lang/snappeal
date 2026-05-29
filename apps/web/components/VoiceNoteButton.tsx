"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Pause, Play, Square } from "lucide-react";
import { haptic } from "@/lib/client/haptics";

/** Mode the caller chooses for how the transcript merges into its notes. */
export type TranscriptMode = "append" | "replace";

/* ─────────────── Web Speech API minimal types ───────────────
 *
 * TypeScript's `lib.dom.d.ts` (the version this project ships) defines
 * `SpeechRecognitionResult` but stops short of the top-level
 * `SpeechRecognition` / `SpeechRecognitionEvent` / `SpeechRecognitionErrorEvent`
 * types — they're still considered "experimental Web Speech API". We
 * declare the minimal shape we actually use rather than `any`, so the
 * call sites below stay type-checked. If a future TS version adds
 * these to lib.dom, these locals become harmless duplicates and can
 * be deleted. */
interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message?: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

/**
 * Voice-note capture button.
 *
 * Tap to start recording, tap to stop. Live mm:ss timer while
 * recording; pause/resume support.
 *
 * 2026-05-28 — switched from MediaRecorder + Whisper (POST /api/transcribe)
 * to the browser-native Web Speech API. The previous flow recorded audio
 * for the full take, blob-posted it on stop, and waited 1–3 s for Whisper
 * to come back; the new flow streams the transcript in real time and is
 * effectively free (no network, no Whisper bill, no audio upload). The
 * old `/api/transcribe` route is left in place as a fallback / for any
 * future caller that prefers Whisper accuracy — see
 * `apps/web/app/api/transcribe/route.ts`.
 *
 * The caller-facing contract is unchanged: pass `onTranscript` and we
 * fire it once on stop with the full text. Callers picking
 * `mode="append"` get accumulation, `mode="replace"` overwrites.
 *
 * Renders nothing when SpeechRecognition is unavailable (Firefox without
 * the dom.webspeech flag, locked-down iframes, ancient Safari).
 */
export function VoiceNoteButton({
  onTranscript,
  mode = "replace",
}: {
  onTranscript: (text: string, opts: { mode: TranscriptMode }) => void;
  /** Default merge mode — caller can flip per-mount. */
  mode?: TranscriptMode;
}) {
  const [supported, setSupported] = useState(true);
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  // True between user-tapped Start and user-tapped Stop. The `onend`
  // handler reads this to decide whether an end was user-initiated
  // (pause/stop) or a platform-internal timeout — Chrome silently caps
  // `continuous=true` sessions around the ~60 s mark and fires `onend`
  // even though the user is still talking. When this flag is true we
  // restart a fresh recognition so the take feels truly continuous.
  const intentRecordingRef = useRef(false);
  const pausedRef = useRef(false);
  // Final transcripts accumulated across this whole take (survives
  // pause/resume + auto-restart).
  const finalTextRef = useRef("");
  // The last interim string from the in-flight result batch — kept on
  // a ref so the `stop` closure reads the latest value without forcing
  // a re-render for every word the user speaks. We emit `final +
  // interim` on stop because Web Speech occasionally drops the trailing
  // segment without flipping `isFinal`.
  const interimTextRef = useRef("");
  /** Wall-clock anchor for the mm:ss timer. Bumped forward on resume
   *  so paused time doesn't accumulate. */
  const startedAtRef = useRef<number>(0);

  // mm:ss tick while actively recording (not while paused).
  useEffect(() => {
    if (!recording || paused) return;
    const id = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current);
    }, 200);
    return () => window.clearInterval(id);
  }, [recording, paused]);

  // Safety net — abort recognition and clear refs on unmount so a
  // mid-take navigation doesn't leak a live mic.
  useEffect(() => {
    return () => {
      intentRecordingRef.current = false;
      pausedRef.current = false;
      try {
        recognitionRef.current?.abort();
      } catch {
        /* already torn down */
      }
      recognitionRef.current = null;
    };
  }, []);

  const createRecognition = (): SpeechRecognition | null => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return null;
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    // UK-only PCN app — pin to British English. The brief listed a
    // multi-language wishlist (it, fr, es, de, pt, ar, auto) but we
    // intentionally skipped that scope: there's no language picker
    // anywhere in the product yet, and faking auto-detect from
    // navigator.language would mis-fire for ESL users dictating an
    // appeal in English. When a picker lands, wire it here.
    r.lang = "en-GB";
    r.maxAlternatives = 1;
    r.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) {
          // Single space between segments; trim avoids leading-space
          // artefacts when this is the first chunk of the take.
          finalTextRef.current = (finalTextRef.current + " " + text).trim();
        } else {
          interim += text;
        }
      }
      interimTextRef.current = interim;
    };
    r.onerror = (event: SpeechRecognitionErrorEvent) => {
      // `no-speech` is benign — Chrome fires it after a brief silence
      // and we want to keep listening. The `onend` auto-restart loop
      // takes over from here, so we just suppress the toast and let
      // the user carry on.
      if (event.error === "no-speech") return;
      setError(mapRecognitionError(event.error));
      intentRecordingRef.current = false;
      pausedRef.current = false;
      setRecording(false);
      setPaused(false);
      haptic("error");
    };
    r.onend = () => {
      recognitionRef.current = null;
      // Surprise end while the user still intends to be recording.
      // Spin up a fresh recognition so the timer + transcript keep
      // accumulating without the user noticing. Wrapped in try/catch
      // because rapid pause → resume can race against this restart.
      if (intentRecordingRef.current && !pausedRef.current) {
        const next = createRecognition();
        if (next) {
          recognitionRef.current = next;
          try {
            next.start();
          } catch {
            /* race with another call — ignore */
          }
        }
      }
    };
    return r;
  };

  const start = () => {
    setError(null);
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setSupported(false);
      setError(
        "Voice input isn't supported in this browser. Try Chrome, or type your note instead.",
      );
      haptic("error");
      return;
    }
    finalTextRef.current = "";
    interimTextRef.current = "";
    intentRecordingRef.current = true;
    pausedRef.current = false;
    const r = createRecognition();
    if (!r) {
      setSupported(false);
      return;
    }
    recognitionRef.current = r;
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    setRecording(true);
    setPaused(false);
    try {
      r.start();
      haptic("tap");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start recording");
      intentRecordingRef.current = false;
      setRecording(false);
      haptic("error");
    }
  };

  const pause = () => {
    if (paused || !recording) return;
    pausedRef.current = true;
    setPaused(true);
    try {
      recognitionRef.current?.stop();
    } catch {
      /* already stopped */
    }
    haptic("tap");
  };

  const resume = () => {
    if (!paused) return;
    pausedRef.current = false;
    // Re-anchor the timer so paused time is excluded.
    startedAtRef.current = Date.now() - elapsedMs;
    setPaused(false);
    // The previous session's `onend` may not have fired yet (it's
    // async). Wait for `recognitionRef` to clear, then start fresh.
    // Bounded so a hung end event doesn't strand the user — after
    // ~1 s we just give up rather than spin forever.
    let attempts = 0;
    const tryStart = () => {
      if (recognitionRef.current) {
        if (attempts++ < 40) {
          window.setTimeout(tryStart, 25);
        }
        return;
      }
      const r = createRecognition();
      if (!r) return;
      recognitionRef.current = r;
      try {
        r.start();
      } catch {
        /* race — ignore */
      }
    };
    tryStart();
    haptic("tap");
  };

  const stop = () => {
    intentRecordingRef.current = false;
    pausedRef.current = false;
    try {
      recognitionRef.current?.stop();
    } catch {
      /* already stopped */
    }
    setRecording(false);
    setPaused(false);
    haptic("tap");
    // Emit whatever we've accumulated. Any interim text that hadn't
    // been finalised at the moment of stop is still meaningful — Web
    // Speech sometimes drops the trailing segment without flipping
    // `isFinal`, so glueing the interim on guards against losing it.
    const fullText = `${finalTextRef.current} ${interimTextRef.current}`
      .replace(/\s+/g, " ")
      .trim();
    if (fullText) {
      onTranscript(fullText, { mode });
      haptic("success");
    }
    setElapsedMs(0);
    finalTextRef.current = "";
    interimTextRef.current = "";
  };

  if (!supported) return null;

  const mmss = formatElapsed(elapsedMs);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        {!recording && (
          <button
            type="button"
            onClick={start}
            className="self-start inline-flex items-center gap-2 rounded-full text-xs font-bold px-4 py-2 transition bg-parkingrabbit-primary-100 text-parkingrabbit-primary-700 hover:bg-parkingrabbit-primary-50"
          >
            <Mic className="size-3.5" />
            Record voice note
          </button>
        )}

        {recording && (
          <>
            <button
              type="button"
              onClick={stop}
              className="self-start inline-flex items-center gap-2 rounded-full text-xs font-bold px-4 py-2 transition bg-parkingrabbit-action text-white"
            >
              <Square className="size-3.5 fill-current" />
              Stop
            </button>
            <button
              type="button"
              onClick={paused ? resume : pause}
              aria-label={paused ? "Resume recording" : "Pause recording"}
              className="self-start inline-flex items-center gap-1.5 rounded-full text-xs font-bold px-3 py-2 transition bg-white border border-parkingrabbit-border text-parkingrabbit-navy hover:border-parkingrabbit-primary"
            >
              {paused ? (
                <>
                  <Play className="size-3.5 fill-current" />
                  Resume
                </>
              ) : (
                <>
                  <Pause className="size-3.5 fill-current" />
                  Pause
                </>
              )}
            </button>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full text-[11px] font-semibold px-3 py-1.5 ${
                paused
                  ? "bg-parkingrabbit-bg text-parkingrabbit-muted"
                  : "bg-red-50 text-red-700"
              }`}
            >
              {!paused && (
                <span className="size-1.5 rounded-full bg-red-600 animate-pulse" />
              )}
              {mmss}
              {paused && " · paused"}
            </span>
          </>
        )}
      </div>
      {error && (
        <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-2 py-1">
          {error}
        </p>
      )}
    </div>
  );
}

/** SSR-safe lookup for the Web Speech API constructor. Chromium ships
 *  it as `webkitSpeechRecognition`; Safari aliases both names; Firefox
 *  exposes neither unless `dom.webspeech.recognition.enable` is on. */
function getSpeechRecognitionCtor():
  | (new () => SpeechRecognition)
  | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Map a SpeechRecognition error code to a friendly toast. Codes are
 *  defined in the Web Speech spec; we only surface ones a user can
 *  reasonably act on. `no-speech` is intentionally handled at the
 *  call site (non-fatal, auto-recovers via `onend` restart). */
function mapRecognitionError(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access was blocked. Please allow microphone access and try again.";
    case "audio-capture":
      return "No microphone was found.";
    case "network":
      return "Network error during voice recognition. Please check your connection.";
    case "aborted":
      return "Recording was interrupted.";
    case "language-not-supported":
      return "English voice input isn't available on this device.";
    default:
      return "Voice recognition failed. Please try again.";
  }
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60).toString().padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
