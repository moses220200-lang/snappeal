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
import { CheckCircle2 } from "lucide-react";
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
  /** Email-style header — shown above the streaming body the moment the
   *  ticket is parsed, so the wait feels like a real letter being drafted. */
  letterHeader?: {
    to: string;
    subject: string;
    date: string;
  } | null;
}

export function GeneratingOverlay({ phase, streamedText, letterHeader }: Props = {}) {
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

  // Timer-driven progress percentage shown in the central tile. Eases up
  // toward 95 % over a typical ~30 s draft, snaps to 100 % the moment the
  // `done` phase lands. The exponential curve feels deliberate (fast early,
  // slow near the end) and never crosses 100 % until we actually have a
  // letter — so the user doesn't see "100 %" stalled on screen.
  const percent =
    phase === "done"
      ? 100
      : Math.min(95, Math.round(95 * (1 - Math.exp(-elapsed / 11000))));

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
        <span
          className="snappeal-generating-scan size-28 rounded-2xl bg-snappeal-primary-100 text-snappeal-primary flex items-center justify-center relative overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label="Drafting progress"
        >
          <span className="text-4xl font-extrabold tabular-nums text-snappeal-primary relative z-10 leading-none">
            {percent}
            <span className="text-xl font-bold align-top ml-0.5">%</span>
          </span>
          <span className="absolute inset-x-0 h-1.5 rounded-full snappeal-generating-line bg-gradient-to-b from-transparent via-snappeal-primary to-transparent" />
        </span>
        <div>
          <p className="text-xl font-bold text-white tracking-tight">
            Drafting your appeal
          </p>
          <p className="text-sm text-white/70 mt-1">
            {phase === "draft"
              ? "Writing the letter now — almost there."
              : "ParkingRabbit AI is on it — about 30 seconds."}
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

        {/* Live letter preview — appears as soon as either the email header
         *  is known (right after the `ticket` event) or chunks start
         *  arriving, so the user has something concrete to read during the
         *  long wait instead of staring at the milestone ladder. */}
        {(letterHeader || (streamedText && streamedText.length > 0)) && (
          <div className="w-full rounded-2xl bg-white/95 text-snappeal-navy shadow-2xl shadow-black/30 p-4 text-left flex flex-col gap-3">
            <p className="text-[10px] uppercase tracking-wider font-bold text-snappeal-primary">
              Your letter, live
            </p>
            {letterHeader && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px] pb-2.5 border-b border-snappeal-border">
                <dt className="text-snappeal-muted uppercase tracking-wide text-[9px] self-center">
                  To
                </dt>
                <dd className="font-semibold truncate">{letterHeader.to}</dd>
                <dt className="text-snappeal-muted uppercase tracking-wide text-[9px] self-center">
                  Subject
                </dt>
                <dd className="font-semibold truncate">{letterHeader.subject}</dd>
                <dt className="text-snappeal-muted uppercase tracking-wide text-[9px] self-center">
                  Date
                </dt>
                <dd className="font-medium">{letterHeader.date}</dd>
              </dl>
            )}
            <pre
              ref={previewRef}
              className="whitespace-pre-wrap text-[11.5px] text-snappeal-navy leading-relaxed font-sans max-h-36 min-h-[3rem] overflow-y-auto no-scrollbar"
            >
              {streamedText || (
                <span className="text-snappeal-muted italic">
                  ParkingRabbit AI is composing the body…
                </span>
              )}
              {streamedText && (
                <span className="snappeal-generating-cursor inline-block w-1.5 h-3 align-baseline bg-snappeal-primary ml-0.5" />
              )}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
