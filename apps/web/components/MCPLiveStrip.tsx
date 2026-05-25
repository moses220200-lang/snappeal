"use client";

/**
 * MCPLiveStrip — inline live view for an active MCP job, mounted behind a
 * "Watch live →" disclosure inside a ticket card.
 *
 * Three surfaces stacked:
 *
 *   1. Screenshot gallery — slide through every capture the agent has
 *      taken in this run, with per-shot caption and N/M indicator. When
 *      the job is still running and a new screenshot lands, we
 *      auto-advance to it ONLY if the user was already viewing the
 *      latest shot (so manual browsing doesn't get clobbered).
 *   2. Latest agent thought / step caption ticker.
 *   3. Scrollable activity log (last ~6 events visible at a time).
 *
 * Replaces the standalone post-submit `/app/tickets/[id]/mcp` page —
 * everything lives inside the smart card now.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Circle,
  Eye,
  Globe,
  Loader2,
} from "lucide-react";
import { CouncilBadge } from "@/components/CouncilBadge";
import type { ProgressEvent } from "@/hooks/useAppealLiveState";

interface CouncilInfo {
  name: string;
  logoUrl: string | null;
  logoBg: string | null;
}

interface Props {
  council: CouncilInfo | null;
  /** Latest screenshot URL, or null while the agent is warming up.
   *  Retained for the warming-up empty state — the gallery itself reads
   *  from the buffered `events` prop. */
  latestScreenshotUrl: string | null;
  /** Caption for the URL chip — latest screenshot.caption or step text. */
  latestCaption: string | null;
  /** Latest agent thought. */
  latestThought: string | null;
  /** Buffered events (from useAppealLiveState({ keepEvents: true })). */
  events: ProgressEvent[];
  /** "queued" | "running" | "done" | "failed" — drives the ticker dot. */
  status: "queued" | "running" | "done" | "failed";
}

type ScreenshotEvent = Extract<ProgressEvent, { kind: "screenshot" }>;

export function MCPLiveStrip({
  council,
  latestScreenshotUrl,
  latestCaption,
  latestThought,
  events,
  status,
}: Props) {
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [events.length]);

  // Pull every screenshot out of the event stream for the gallery — the
  // event log keeps them in chronological order, which is exactly what
  // we want for "swipe through what the agent did".
  const screenshots = useMemo<ScreenshotEvent[]>(
    () =>
      events.filter(
        (e): e is ScreenshotEvent => e.kind === "screenshot",
      ),
    [events],
  );

  const [viewIndex, setViewIndex] = useState(0);
  const stickToLatestRef = useRef(true);

  // Auto-advance to the newest shot only if the user was already on the
  // latest one. If they've manually scrolled back, leave them be.
  useEffect(() => {
    if (screenshots.length === 0) return;
    const lastIndex = screenshots.length - 1;
    if (stickToLatestRef.current) {
      setViewIndex(lastIndex);
    } else if (viewIndex > lastIndex) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setViewIndex(lastIndex);
    }
  }, [screenshots.length, viewIndex]);

  const goPrev = () => {
    setViewIndex((i) => {
      const next = Math.max(0, i - 1);
      stickToLatestRef.current = next === screenshots.length - 1;
      return next;
    });
  };
  const goNext = () => {
    setViewIndex((i) => {
      const next = Math.min(screenshots.length - 1, i + 1);
      stickToLatestRef.current = next === screenshots.length - 1;
      return next;
    });
  };

  const current = screenshots[viewIndex] ?? null;
  const hasMultiple = screenshots.length > 1;

  return (
    <div className="flex flex-col gap-3">
      {/* Screenshot gallery */}
      <section className="rounded-2xl bg-white border border-snappeal-border overflow-hidden">
        <div className="px-3 py-2 flex items-center gap-2 border-b border-snappeal-border bg-snappeal-bg/40">
          {council ? (
            <CouncilBadge
              name={council.name}
              logoUrl={council.logoUrl}
              logoBg={council.logoBg}
              size="sm"
              showName={false}
            />
          ) : (
            <Globe className="size-3.5 text-snappeal-muted" />
          )}
          <div className="flex-1 truncate text-[10.5px] text-snappeal-muted font-mono">
            {current?.caption ?? latestCaption ?? "Connecting…"}
          </div>
          {status === "running" && (
            <span className="inline-flex items-center gap-1 text-[9.5px] font-semibold text-snappeal-muted">
              <span className="snappeal-mcp-tick-dot size-1.5 rounded-full bg-snappeal-primary inline-block" />
              Live
            </span>
          )}
        </div>

        <div className="relative aspect-[16/10] bg-snappeal-navy overflow-hidden">
          {!current && !latestScreenshotUrl ? (
            <>
              <div
                aria-hidden
                className="absolute inset-0"
                style={{
                  background:
                    "radial-gradient(60% 50% at 50% 40%, rgba(0,122,255,0.18) 0%, transparent 70%)",
                }}
              />
              <div
                aria-hidden
                className="absolute inset-y-0 left-0 w-[40%] snappeal-mcp-warmup-line"
                style={{
                  background:
                    "linear-gradient(90deg, transparent 0%, rgba(0,122,255,0.5) 50%, transparent 100%)",
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center text-white text-center px-4">
                <div>
                  <div className="mx-auto size-9 rounded-full bg-white/10 backdrop-blur flex items-center justify-center mb-2">
                    <Loader2 className="size-3.5 animate-spin text-white" />
                  </div>
                  <p className="text-[12px] font-semibold">Warming up a secure browser</p>
                  <p className="text-[10px] mt-0.5 text-white/70">
                    First load can take ~30s.
                  </p>
                </div>
              </div>
            </>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element -- dynamic public screenshot */
            <img
              key={current?.url ?? latestScreenshotUrl ?? ""}
              src={current?.url ?? latestScreenshotUrl ?? ""}
              alt={current?.caption ?? latestCaption ?? "Agent screenshot"}
              className="absolute inset-0 w-full h-full object-cover"
              style={{ animation: "snappeal-mcp-fade-in 400ms ease-out" }}
            />
          )}

          {/* Prev / next arrows — only when there's more than one shot */}
          {hasMultiple && (
            <>
              <button
                type="button"
                onClick={goPrev}
                disabled={viewIndex === 0}
                aria-label="Previous screenshot"
                className="absolute left-2 top-1/2 -translate-y-1/2 size-8 rounded-full bg-black/45 hover:bg-black/65 text-white flex items-center justify-center transition disabled:opacity-30 disabled:cursor-not-allowed backdrop-blur-sm"
              >
                <ChevronLeft className="size-4" strokeWidth={2.5} />
              </button>
              <button
                type="button"
                onClick={goNext}
                disabled={viewIndex === screenshots.length - 1}
                aria-label="Next screenshot"
                className="absolute right-2 top-1/2 -translate-y-1/2 size-8 rounded-full bg-black/45 hover:bg-black/65 text-white flex items-center justify-center transition disabled:opacity-30 disabled:cursor-not-allowed backdrop-blur-sm"
              >
                <ChevronRight className="size-4" strokeWidth={2.5} />
              </button>
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-black/55 text-white text-[10px] font-bold backdrop-blur-sm">
                {viewIndex + 1} / {screenshots.length}
              </div>
            </>
          )}
        </div>

        {/* The shot's caption already renders in the gallery header
         *  above the image (URL chip), so the duplicate caption row
         *  that used to sit here under the screenshot has been
         *  removed — it was the same text twice on the same card. */}
      </section>

      {/* Agent thought ticker — calmer than the full MCPLiveView. */}
      {latestThought && (
        <div className="rounded-xl bg-snappeal-navy text-white px-3 py-2 flex items-start gap-2.5">
          <span className="text-[8.5px] font-bold uppercase tracking-[0.12em] text-snappeal-primary-200 mt-[2px] shrink-0">
            AI
          </span>
          <p
            key={latestThought}
            className="text-[11.5px] leading-snug flex-1 min-w-0"
            style={{ animation: "snappeal-mcp-ticker-in 360ms ease-out" }}
          >
            {latestThought}
          </p>
        </div>
      )}

      {/* Activity log */}
      <section className="rounded-2xl bg-white border border-snappeal-border overflow-hidden">
        <div className="px-3 py-2 border-b border-snappeal-border flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-wide text-snappeal-muted">
            Activity
          </p>
          <p className="text-[9.5px] text-snappeal-muted">{events.length} events</p>
        </div>
        <div
          ref={logRef}
          className="max-h-28 overflow-y-auto text-[11.5px] divide-y divide-snappeal-border"
        >
          {events.length === 0 ? (
            <p className="px-3 py-2 text-snappeal-muted">
              Waiting for the agent to start…
            </p>
          ) : (
            events.slice(-30).map((e, i) => <ActivityRow key={i} ev={e} />)
          )}
        </div>
      </section>
    </div>
  );
}

function ActivityRow({ ev }: { ev: ProgressEvent }) {
  let icon: React.ReactNode;
  let text: string;
  switch (ev.kind) {
    case "screenshot":
      icon = <Eye className="size-3 text-snappeal-primary" strokeWidth={1.75} />;
      text = `Captured ${ev.caption ?? "screenshot"}`;
      break;
    case "thought":
      icon = <Circle className="size-2 text-snappeal-border" strokeWidth={2} />;
      text = ev.message;
      break;
    case "metadata":
      icon = <ChevronRight className="size-3 text-snappeal-success" strokeWidth={2} />;
      text = `Read ${ev.field}: ${ev.value}`;
      break;
    case "status":
    case "step":
    default:
      icon = <ChevronRight className="size-3 text-snappeal-navy" strokeWidth={1.75} />;
      text = "message" in ev ? ev.message : "";
      break;
  }
  return (
    <div className="px-3 py-1.5 flex items-start gap-2">
      <span className="text-snappeal-muted shrink-0 w-10 font-mono text-[9.5px] mt-[1px]">
        {new Date(ev.ts).toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })}
      </span>
      <span className="shrink-0 size-4 flex items-center justify-center mt-[1px]">
        {icon}
      </span>
      <span className="text-snappeal-navy/90 truncate flex-1 min-w-0">{text}</span>
    </div>
  );
}
