"use client";

/**
 * 3-second "generating your appeal" overlay shown after a successful
 * Stripe payment while /api/generate is running. Reuses the splash
 * timeline aesthetic (camera flash, AI scan line, success tick) but
 * stays visible until the real generation promise resolves.
 */
import { CheckCircle2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

const PHASES = [
  { id: "read", label: "Reading your PCN photo", at: 0 },
  { id: "ground", label: "Identifying the strongest grounds", at: 1400 },
  { id: "draft", label: "Drafting your representation letter", at: 2800 },
];

export function GeneratingOverlay() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 250);
    return () => window.clearInterval(id);
  }, []);
  const elapsed = tick * 250;

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
      <div className="relative max-w-sm w-full px-6 flex flex-col items-center text-center gap-6">
        <span className="snappeal-generating-scan size-28 rounded-2xl bg-snappeal-primary-100 text-snappeal-primary flex items-center justify-center relative overflow-hidden">
          <Sparkles className="size-12 text-snappeal-primary relative z-10" />
          <span className="absolute inset-x-0 h-1.5 rounded-full snappeal-generating-line bg-gradient-to-b from-transparent via-snappeal-primary to-transparent" />
        </span>
        <div>
          <p className="text-xl font-bold text-white tracking-tight">
            Drafting your appeal
          </p>
          <p className="text-sm text-white/70 mt-1">
            Snappeal AI is on it — about 30 seconds.
          </p>
        </div>
        <ul className="w-full flex flex-col gap-3">
          {PHASES.map((p, i) => {
            const isActive = elapsed >= p.at;
            const isDone = i < PHASES.length - 1 && elapsed >= PHASES[i + 1].at;
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
      </div>
    </div>
  );
}
