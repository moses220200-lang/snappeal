"use client";

import { useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { haptic } from "@/lib/client/haptics";

/**
 * Voice-note button — tap to start, tap again to stop. Uses MediaRecorder
 * → POSTs the audio blob to /api/transcribe (Whisper-compatible). Calls
 * onTranscript with the transcribed text so the parent can paste it into
 * the notes textarea.
 *
 * Gracefully no-ops on unsupported browsers (Safari < 14, locked-down
 * iframe contexts). Renders nothing when getUserMedia isn't available.
 */
export function VoiceNoteButton({
  onTranscript,
}: {
  onTranscript: (text: string) => void;
}) {
  const [supported, setSupported] = useState(true);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const start = async () => {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setSupported(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => chunksRef.current.push(e.data);
      rec.onstop = () => stream.getTracks().forEach((t) => t.stop());
      rec.start();
      recRef.current = rec;
      setRecording(true);
      haptic("tap");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start recording");
      haptic("error");
    }
  };

  const stop = async () => {
    const rec = recRef.current;
    if (!rec) return;
    rec.stop();
    setRecording(false);
    setTranscribing(true);
    haptic("tap");

    // Wait one event loop for the final ondataavailable to fire.
    await new Promise((r) => setTimeout(r, 100));
    const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });

    try {
      const form = new FormData();
      form.append("audio", blob);
      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? `Transcribe failed (${res.status})`);
      if (json.text) onTranscript(String(json.text).trim());
      haptic("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transcribe failed");
      haptic("error");
    } finally {
      setTranscribing(false);
    }
  };

  if (!supported) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={recording ? stop : start}
        disabled={transcribing}
        className={`self-start inline-flex items-center gap-2 rounded-full text-xs font-bold px-4 py-2 transition disabled:opacity-60 ${
          recording
            ? "bg-snappeal-action text-white animate-pulse"
            : "bg-snappeal-primary-100 text-snappeal-primary-700 hover:bg-snappeal-primary-50"
        }`}
      >
        {transcribing ? (
          <>
            <Loader2 className="size-3.5 animate-spin" />
            Transcribing…
          </>
        ) : recording ? (
          <>
            <Square className="size-3.5 fill-current" />
            Tap to stop
          </>
        ) : (
          <>
            <Mic className="size-3.5" />
            Record voice note
          </>
        )}
      </button>
      {error && (
        <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-2 py-1">
          {error}
        </p>
      )}
    </div>
  );
}
