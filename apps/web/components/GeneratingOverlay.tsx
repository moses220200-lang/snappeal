"use client";

/**
 * "Generating your appeal" overlay shown after a successful Stripe payment
 * while /api/generate-stream is running.
 *
 * Two modes:
 *
 *   - **Time-driven (legacy)** — when no `phase` prop is passed, walks
 *     through three labels on a fixed timeline. Used as a fallback if a
 *     caller doesn't have stream-event signals.
 *   - **Event-driven (preferred)** — when `phase` is passed, the milestone
 *     ladder is driven by SSE events from `/api/generate-stream`
 *     ("read" → "ground" → "draft" → "done"). When `streamedText` is also
 *     supplied, the bottom of the overlay renders the letter being typed in
 *     real time so the wait feels alive.
 */
import { CheckCircle2, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type GeneratingPhase = "read" | "ground" | "draft" | "done";

const PHASES: Array<{ id: GeneratingPhase; label: string; at: number }> = [
  { id: "read",   label: "Reading your PCN photo",            at: 0 },
  { id: "ground", label: "Identifying the strongest grounds", at: 1400 },
  { id: "draft",  label: "Drafting your representation letter", at: 2800 },
];

const PHASE_ORDER: Record<GeneratingPhase, number> = {
  read: 0,
  ground: 1,
  draft: 2,
  done: 3,
};

interface Props {
  /** Drive the ladder from SSE events. Omit to fall back to the timeline. */
  phase?: GeneratingPhase;
  /** Letter text appended chunk-by-chunk as `chunk` events arrive. */
  streamedText?: string;
}

export function GeneratingOverlay({ phase, streamedText }: Props = {}) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 250);
    return () => window.clearInterval(id);
  }, []);
  const elapsed = tick * 250;

  // Keep the live letter scrolled to the latest line.
  const previewRef = useRef<HTMLPreElement | null>(null);
  useEffect(() => {
    if (previewRef.current) {
      previewRef.current.scrollTop = previewRef.current.scrollHeight;
    }
  }, [streamedText]);

  const activeIndex = (() => {
    if (phase) return PHASE_ORDER[phase];
    for (let i = PHASES.length - 1; i >= 0; i--) {
      if (elapsed >= PHASES[i].at) return i;
    }
    return 0;
  })();

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-snappeal-navy overflow-hidden">
      <div
        className="absolute inset-0 opacity-15"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.35) 1px, transparent 0)",
          backgroundSize: "28px 28px",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 50%, rgba(0,122,255,0.25) 0%, transparent 70%)",
        }}
      />
      <div className="relative max-w-md w-full px-6 flex flex-col items-center text-center gap-6">
        <span className="snappeal-generating-scan size-28 rounded-2xl bg-snappeal-primary-100 text-snappeal-primary flex items-center justify-center relative overflow-hidden">
          <Sparkles className="size-12 text-snappeal-primary relative z-10" />
          <span className="absolute inset-x-0 h-1.5 rounded-full snappeal-generating-line bg-gradient-to-b from-transparent via-snappeal-primary to-transparent" />
        </span>
        <div>
          <p className="text-xl font-bold text-white tracking-tight">
            Drafting your appeal
          </p>
          <p className="text-sm text-white/70 mt-1">
            {phase === "draft"
              ? "Writing the letter now — almost there."
              : "Snappeal AI is on it — about 30 seconds."}
          </p>
        </div>
        <ul className="w-full flex flex-col gap-3">
          {PHASES.map((p, i) => {
            const isActive = i <= activeIndex;
            const isDone = i < activeIndex;
            return (
              <li
                key={p.id}
                className="flex items-center gap-3 text-sm text-white/85"
              >
                <span
                  className={`size-5 rounded-full flex items-center justify-center transition-all ${
                    isDone
                      ? "bg-snappeal-success"
                      : isActive
                        ? "bg-snappeal-primary animate-pulse"
                        : "bg-white/10"
                  }`}
                >
                  {isDone && (
                    <CheckCircle2 className="size-3.5 text-white" strokeWidth={3} />
                  )}
                </span>
                <span className={isActive ? "" : "opacity-60"}>{p.label}</span>
              </li>
            );
          })}
        </ul>

        {/* Live letter preview — only shown once chunks start arriving. */}
        {streamedText && streamedText.length > 0 && (
          <div className="w-full rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm p-3 text-left">
            <p className="text-[10px] uppercase tracking-wider text-white/55 mb-1.5">
              Your letter, live
            </p>
            <pre
              ref={previewRef}
              className="whitespace-pre-wrap text-[11px] text-white/85 leading-relaxed font-sans max-h-32 overflow-y-auto no-scrollbar"
            >
              {streamedText}
              <span className="snappeal-generating-cursor inline-block w-1.5 h-3 align-baseline bg-snappeal-primary ml-0.5" />
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
