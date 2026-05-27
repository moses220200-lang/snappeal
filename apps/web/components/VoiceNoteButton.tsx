"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Pause, Play, Square } from "lucide-react";
import { haptic } from "@/lib/client/haptics";

/** Mode the caller chooses for how the transcript merges into its notes. */
export type TranscriptMode = "append" | "replace";

/**
 * Voice-note capture button.
 *
 * Tap to start recording, tap to stop. Live mm:ss timer while recording;
 * pause/resume support via MediaRecorder.pause/resume. On stop we POST
 * the audio to `/api/transcribe` (Whisper-compatible) and call back with
 * the text the API returned.
 *
 * The caller chooses whether the new transcript should `replace` or
 * `append` to its existing notes — the dictation panel uses `append`
 * so multiple takes accumulate; one-shot notes inputs use `replace`.
 *
 * Renders nothing when MediaRecorder / getUserMedia is unavailable
 * (locked-down iframes, ancient Safari).
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
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  /** Wall-clock anchor for the timer. Bumped forward on resume so paused
   *  time doesn't accumulate. */
  const startedAtRef = useRef<number>(0);

  // mm:ss tick while actively recording (not while paused or transcribing).
  useEffect(() => {
    if (!recording || paused) return;
    const id = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current);
    }, 200);
    return () => window.clearInterval(id);
  }, [recording, paused]);

  // Safety net — release the mic stream if the component unmounts mid-record.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const start = async () => {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setSupported(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => chunksRef.current.push(e.data);
      rec.onstop = () => stream.getTracks().forEach((t) => t.stop());
      rec.start();
      recRef.current = rec;
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      setRecording(true);
      setPaused(false);
      haptic("tap");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start recording");
      haptic("error");
    }
  };

  const pause = () => {
    const rec = recRef.current;
    if (!rec || rec.state !== "recording") return;
    rec.pause();
    setPaused(true);
    haptic("tap");
  };

  const resume = () => {
    const rec = recRef.current;
    if (!rec || rec.state !== "paused") return;
    // Re-anchor the timer so paused time is excluded.
    startedAtRef.current = Date.now() - elapsedMs;
    rec.resume();
    setPaused(false);
    haptic("tap");
  };

  const stop = async () => {
    const rec = recRef.current;
    if (!rec) return;
    rec.stop();
    setRecording(false);
    setPaused(false);
    setTranscribing(true);
    haptic("tap");

    // Wait one event loop for the final ondataavailable to fire.
    await new Promise((r) => setTimeout(r, 100));
    const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
    chunksRef.current = [];
    recRef.current = null;
    streamRef.current = null;

    try {
      const form = new FormData();
      form.append("audio", blob);
      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error?.message ?? `Transcribe failed (${res.status})`);
      }
      if (json.text) onTranscript(String(json.text).trim(), { mode });
      haptic("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transcribe failed");
      haptic("error");
    } finally {
      setTranscribing(false);
      setElapsedMs(0);
    }
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
            disabled={transcribing}
            className="self-start inline-flex items-center gap-2 rounded-full text-xs font-bold px-4 py-2 transition disabled:opacity-60 bg-parkingrabbit-primary-100 text-parkingrabbit-primary-700 hover:bg-parkingrabbit-primary-50"
          >
            {transcribing ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Transcribing…
              </>
            ) : (
              <>
                <Mic className="size-3.5" />
                Record voice note
              </>
            )}
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

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60).toString().padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
