"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  ClipboardCheck,
  Eye,
  FileCheck,
  Globe,
  Keyboard,
  Loader2,
  MailCheck,
  Pause,
  Play,
  Search,
  XCircle,
} from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { getOrCreateSessionId } from "@/lib/client/session";

type ProgressEvent =
  | { ts: string; kind: "status"; message: string }
  | { ts: string; kind: "step"; message: string }
  | { ts: string; kind: "thought"; message: string }
  | { ts: string; kind: "screenshot"; step: number; url: string; caption?: string };

type StreamStatus = "queued" | "running" | "done" | "failed";

const MILESTONES: { key: number; label: string; icon: typeof Globe }[] = [
  { key: 1, label: "Opens portal", icon: Globe },
  { key: 2, label: "Finds form", icon: Search },
  { key: 3, label: "Enters details", icon: Keyboard },
  { key: 4, label: "Pastes letter", icon: FileCheck },
  { key: 5, label: "Reviews entry", icon: Eye },
  { key: 6, label: "Submitted", icon: MailCheck },
];

export default function SubmittingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [status, setStatus] = useState<StreamStatus>("queued");
  const [queue, setQueue] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [result, setResult] = useState<{ councilReference?: string | null; appealId?: string | null } | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  // SSE subscription.
  useEffect(() => {
    // SSE can't send custom headers, so pass the anonymous session id as a
    // query param. Signed-in users authenticate via the snappeal.token cookie.
    const es = new EventSource(
      `/api/submissions/${id}/progress?session=${encodeURIComponent(getOrCreateSessionId())}`,
    );
    es.addEventListener("progress", (e) => {
      try {
        const ev = JSON.parse((e as MessageEvent).data) as ProgressEvent;
        setEvents((prev) => [...prev, ev]);
      } catch {
        /* ignore */
      }
    });
    es.addEventListener("status", (e) => {
      try {
        const { status: s, lastError: err } = JSON.parse((e as MessageEvent).data) as {
          status: StreamStatus;
          lastError: string | null;
        };
        setStatus(s);
        if (err) setLastError(err);
      } catch {
        /* ignore */
      }
    });
    es.addEventListener("queue", (e) => {
      try {
        const { position } = JSON.parse((e as MessageEvent).data) as { position: number };
        setQueue(position);
      } catch {
        /* ignore */
      }
    });
    es.addEventListener("done", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as {
          result?: { councilReference?: string | null; appealId?: string | null };
        };
        setStatus("done");
        setResult(data.result ?? null);
        es.close();
      } catch {
        /* ignore */
      }
    });
    es.addEventListener("error", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as { message?: string };
        if (data?.message) setLastError(data.message);
      } catch {
        /* heartbeat error from EventSource — ignore */
      }
    });

    return () => es.close();
  }, [id]);

  // Auto-scroll the event log.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [events.length]);

  const screenshots = useMemo(
    () => events.filter((e): e is Extract<ProgressEvent, { kind: "screenshot" }> => e.kind === "screenshot"),
    [events],
  );

  // Slideshow / carousel state. While the agent is still running we auto-
  // advance to the latest screenshot. The moment the user clicks a nav arrow
  // or hits Play, we lock to their selected index (`pinned`) so the agent's
  // newest frame doesn't yank them away. `playing` runs a 2s timer that
  // walks the index forward (loops to 0 at the end).
  const [pinnedIndex, setPinnedIndex] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const screenshotIndex =
    pinnedIndex !== null
      ? Math.min(pinnedIndex, Math.max(screenshots.length - 1, 0))
      : Math.max(screenshots.length - 1, 0);
  const currentScreenshot = screenshots[screenshotIndex] ?? null;
  const latestScreenshot = screenshots[screenshots.length - 1] ?? null;

  // Autoplay loop — only ticks when `playing` is on and we have ≥2 frames.
  useEffect(() => {
    if (!playing || screenshots.length < 2) return;
    const t = setInterval(() => {
      setPinnedIndex((prev) => {
        const next = ((prev ?? 0) + 1) % screenshots.length;
        return next;
      });
    }, 2000);
    return () => clearInterval(t);
  }, [playing, screenshots.length]);

  // Stop autoplay if the run finishes and we land on the last frame, so we
  // don't loop forever for a customer just reviewing.
  useEffect(() => {
    if (status !== "done" && status !== "failed") return;
    if (!playing) return;
    // Let it finish the loop once, then stop.
    if (pinnedIndex === screenshots.length - 1) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional one-shot terminator after autoplay wraps to the last frame on a finished run
      setPlaying(false);
    }
  }, [pinnedIndex, screenshots.length, status, playing]);
  const latestStep = useMemo(
    () =>
      [...events]
        .reverse()
        .find((e): e is Extract<ProgressEvent, { kind: "step" }> => e.kind === "step")?.message ?? null,
    [events],
  );
  const milestonesReached = latestScreenshot?.step ?? (status === "done" ? 6 : 0);

  const statusHeadline =
    status === "done"
      ? "Appeal lodged"
      : status === "failed"
        ? "We couldn't reach the portal"
        : status === "queued"
          ? queue !== null
            ? queue === 0
              ? "You're next in the queue"
              : `You're #${queue + 1} in the queue`
            : "Queueing your appeal"
          : latestStep ?? "Connecting to the council portal";

  const statusDetail =
    status === "queued"
      ? "We submit appeals one at a time so the council portal stays responsive."
      : status === "running"
        ? "Snappeal AI is operating the portal on your behalf."
        : status === "done"
          ? "Your appeal has been submitted. We'll email when the council replies."
          : "Your draft is safe — you can retry from the ticket page.";

  return (
    <>
      <BackHeader
        title="Submitting your appeal"
        subtitle={status === "running" ? "Snappeal AI is filing it now" : status === "queued" ? "Waiting in queue" : status === "done" ? "Submitted" : "Halted"}
        back="/app/tickets"
      />
      <div className="flex flex-col gap-4 px-5 pt-4 pb-10 snappeal-content-top">
        {/* Status card — same visual language as other cards in the app */}
        <section className="rounded-2xl bg-white border border-snappeal-border p-5">
          <div className="flex items-start gap-3">
            <span
              className={`size-10 rounded-xl flex items-center justify-center shrink-0 ${
                status === "done"
                  ? "bg-green-100 text-green-700"
                  : status === "failed"
                    ? "bg-red-100 text-red-700"
                    : "bg-snappeal-primary-50 text-snappeal-primary"
              }`}
            >
              {status === "done" ? (
                <CheckCircle2 className="size-5" />
              ) : status === "failed" ? (
                <XCircle className="size-5" />
              ) : (
                <Loader2 className="size-5 animate-spin" />
              )}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold text-snappeal-navy">{statusHeadline}</p>
              <p className="text-xs text-snappeal-muted mt-0.5">{statusDetail}</p>
            </div>
            {status === "running" && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide rounded-full bg-snappeal-primary-50 text-snappeal-primary-700 px-2 py-1">
                <span className="size-1.5 rounded-full bg-snappeal-primary animate-pulse" />
                Live
              </span>
            )}
          </div>
        </section>

        {/* Live portal preview — clean white surface with a thin URL chip */}
        <section className="rounded-2xl bg-white border border-snappeal-border overflow-hidden">
          <div className="px-4 py-2.5 flex items-center gap-2 border-b border-snappeal-border bg-snappeal-bg/40">
            <Globe className="size-3.5 text-snappeal-muted" />
            <div className="flex-1 truncate text-[11px] text-snappeal-muted font-mono">
              {latestScreenshot?.caption ? `council portal · ${latestScreenshot.caption}` : "council portal · connecting…"}
            </div>
            {status === "running" && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-snappeal-muted">
                <span className="size-1.5 rounded-full bg-snappeal-primary animate-pulse" />
                AI driving
              </span>
            )}
          </div>

          <div className="relative aspect-[16/10] bg-snappeal-bg/60 flex items-center justify-center overflow-hidden">
            {currentScreenshot ? (
              // eslint-disable-next-line @next/next/no-img-element -- dynamic public screenshot
              <img
                key={currentScreenshot.url}
                src={currentScreenshot.url}
                alt={currentScreenshot.caption ?? `Step ${currentScreenshot.step}`}
                className="w-full h-full object-cover animate-[snappeal-fade_400ms_ease-out]"
              />
            ) : (
              <div className="text-center text-snappeal-muted px-6">
                <div className="mx-auto size-11 rounded-full border border-snappeal-border bg-white flex items-center justify-center mb-2.5">
                  <Loader2 className="size-4 animate-spin text-snappeal-primary" />
                </div>
                <p className="text-sm font-semibold text-snappeal-navy">Connecting to the council portal</p>
                <p className="text-[11px] mt-1">First load can take ~30s while we boot a secure browser.</p>
              </div>
            )}

            {/* Slideshow controls — only render once we have ≥2 frames. The
             *  buttons sit over the image edges and stay tappable on mobile. */}
            {screenshots.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Previous screenshot"
                  onClick={() => {
                    setPlaying(false);
                    setPinnedIndex((prev) => {
                      const cur = prev ?? screenshots.length - 1;
                      return (cur - 1 + screenshots.length) % screenshots.length;
                    });
                  }}
                  className="absolute left-2 top-1/2 -translate-y-1/2 size-8 rounded-full bg-white/90 border border-snappeal-border text-snappeal-navy flex items-center justify-center shadow-md hover:bg-white transition"
                >
                  <ChevronLeft className="size-4" strokeWidth={2} />
                </button>
                <button
                  type="button"
                  aria-label="Next screenshot"
                  onClick={() => {
                    setPlaying(false);
                    setPinnedIndex((prev) => {
                      const cur = prev ?? screenshots.length - 1;
                      return (cur + 1) % screenshots.length;
                    });
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 size-8 rounded-full bg-white/90 border border-snappeal-border text-snappeal-navy flex items-center justify-center shadow-md hover:bg-white transition"
                >
                  <ChevronRight className="size-4" strokeWidth={2} />
                </button>
              </>
            )}
          </div>

          {/* Caption + nav strip — sits below the image. Shows the active
           *  step's caption, an N/M counter, dot indicators, and a Play /
           *  Pause toggle so customers can run the slideshow hands-free. */}
          {screenshots.length > 0 ? (
            <div className="px-4 py-2.5 border-t border-snappeal-border flex items-center justify-between gap-3 text-[12px] text-snappeal-navy">
              <span className="truncate">
                {currentScreenshot?.caption
                  ? <><span className="font-semibold">Step {currentScreenshot.step}</span> · {currentScreenshot.caption}</>
                  : "Loading screenshot…"}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <div className="hidden sm:flex items-center gap-1">
                  {screenshots.map((_, i) => (
                    <span
                      key={i}
                      className={`size-1.5 rounded-full transition ${
                        i === screenshotIndex ? "bg-snappeal-primary w-3" : "bg-snappeal-border"
                      }`}
                    />
                  ))}
                </div>
                <span className="text-snappeal-muted text-[11px] font-mono tabular-nums">
                  {screenshotIndex + 1}/{screenshots.length}
                </span>
                {screenshots.length > 1 && (
                  <button
                    type="button"
                    aria-label={playing ? "Pause slideshow" : "Play slideshow"}
                    onClick={() => {
                      if (!playing && pinnedIndex === null) {
                        // Start from first frame when the customer hits play
                        // for the first time — feels like a fresh replay.
                        setPinnedIndex(0);
                      }
                      setPlaying((p) => !p);
                    }}
                    className="size-7 rounded-full border border-snappeal-border bg-white text-snappeal-navy flex items-center justify-center hover:border-snappeal-primary transition"
                  >
                    {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" fill="currentColor" />}
                  </button>
                )}
              </div>
            </div>
          ) : null}

          {latestStep && status === "running" && (
            <div className="px-4 py-2.5 border-t border-snappeal-border flex items-center gap-2 text-[12px] text-snappeal-navy">
              <span className="size-1.5 rounded-full bg-snappeal-primary animate-pulse shrink-0" />
              <span className="truncate">{latestStep}</span>
            </div>
          )}
        </section>

        {/* Milestone progress — flat list with outline icons */}
        <section className="rounded-2xl bg-white border border-snappeal-border p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-snappeal-muted mb-3">Progress</p>
          <ol className="flex flex-col gap-2">
            {MILESTONES.map((m) => {
              const reached = milestonesReached >= m.key;
              const current = milestonesReached + 1 === m.key && status === "running";
              const Icon = m.icon;
              return (
                <li
                  key={m.key}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2 transition ${
                    reached
                      ? "bg-snappeal-primary-50"
                      : current
                        ? "bg-snappeal-bg/50"
                        : "bg-transparent"
                  }`}
                >
                  <span
                    className={`size-8 rounded-full border flex items-center justify-center shrink-0 ${
                      reached
                        ? "border-snappeal-primary bg-snappeal-primary text-white"
                        : current
                          ? "border-snappeal-primary text-snappeal-primary bg-white"
                          : "border-snappeal-border text-snappeal-muted bg-white"
                    }`}
                  >
                    {reached ? <CheckCircle2 className="size-4" strokeWidth={2.25} /> : current ? <Loader2 className="size-4 animate-spin" strokeWidth={2} /> : <Icon className="size-4" strokeWidth={1.75} />}
                  </span>
                  <span
                    className={`text-sm font-medium ${
                      reached ? "text-snappeal-navy" : current ? "text-snappeal-navy" : "text-snappeal-muted"
                    }`}
                  >
                    {m.label}
                  </span>
                  {current && (
                    <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-snappeal-primary">
                      now
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </section>

        {/* Activity log — calmer, outline icons, neutral colours */}
        <section className="rounded-2xl bg-white border border-snappeal-border overflow-hidden">
          <div className="px-4 py-2.5 border-b border-snappeal-border flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wide text-snappeal-muted">Activity</p>
            <p className="text-[10px] text-snappeal-muted">{events.length} events</p>
          </div>
          <div ref={logRef} className="h-44 overflow-y-auto text-[12px] divide-y divide-snappeal-border">
            {events.length === 0 && (
              <p className="px-4 py-3 text-snappeal-muted">Waiting for the agent to start…</p>
            )}
            {events.map((e, i) => (
              <div key={i} className="px-4 py-2 flex items-start gap-3">
                <span className="text-snappeal-muted shrink-0 w-12 font-mono text-[11px]">
                  {new Date(e.ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
                <span className="shrink-0 size-5 flex items-center justify-center mt-0.5">
                  {e.kind === "screenshot" ? (
                    <Eye className="size-3.5 text-snappeal-primary" strokeWidth={1.75} />
                  ) : e.kind === "status" ? (
                    <ClipboardCheck className="size-3.5 text-snappeal-muted" strokeWidth={1.75} />
                  ) : e.kind === "thought" ? (
                    <Circle className="size-2.5 text-snappeal-border" strokeWidth={2} />
                  ) : (
                    <ChevronRight className="size-3.5 text-snappeal-navy" strokeWidth={1.75} />
                  )}
                </span>
                <span className="text-snappeal-navy/90 truncate">
                  {e.kind === "screenshot" ? `Captured ${e.caption ?? "screenshot"}` : e.message}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Terminal states — keep visible even after the customer revisits,
         *  so the "done" page works as a permanent submission badge with a
         *  full replay history above. */}
        {status === "done" && (
          <section className="rounded-2xl bg-gradient-to-br from-green-50 to-white border border-green-200 p-5 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <span className="size-11 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                <CheckCircle2 className="size-6 text-green-700" strokeWidth={1.75} />
              </span>
              <div className="flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-green-700">
                  Snappeal AI · Submission complete
                </p>
                <p className="text-lg font-bold text-snappeal-navy mt-0.5">
                  Appeal lodged with the council
                </p>
                <p className="text-xs text-snappeal-muted mt-1">
                  We&apos;ll email you the moment the council replies. You can revisit this replay any time from your ticket.
                </p>
              </div>
            </div>
            {result?.councilReference && (
              <div className="rounded-xl bg-white border border-snappeal-border p-3 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-snappeal-muted uppercase tracking-wide">
                  Council reference
                </span>
                <span className="font-mono text-sm text-snappeal-navy">
                  {result.councilReference}
                </span>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => router.push("/app/tickets")}
                className="inline-flex items-center gap-1.5 rounded-2xl bg-snappeal-primary !text-white font-semibold text-sm px-4 py-2.5 hover:bg-snappeal-primary-600 transition"
              >
                <span className="text-white">Back to my tickets</span>
                <ArrowRight className="size-4 text-white" strokeWidth={2} />
              </button>
              {result?.appealId && (
                <Link
                  href={`/app/tickets/${result.appealId}`}
                  className="inline-flex items-center gap-1.5 rounded-2xl bg-white border border-snappeal-border text-snappeal-navy font-semibold text-sm px-4 py-2.5 hover:border-snappeal-primary transition"
                >
                  View this ticket
                </Link>
              )}
            </div>
          </section>
        )}

        {status === "failed" && (
          <section className="rounded-2xl bg-white border border-red-200 p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <XCircle className="size-5 text-red-600" strokeWidth={1.75} />
              <p className="font-bold text-snappeal-navy">Submission didn&apos;t go through</p>
            </div>
            {lastError && (
              <p className="text-xs text-snappeal-muted break-all font-mono bg-snappeal-bg/60 rounded-lg px-3 py-2">
                {lastError}
              </p>
            )}
            <p className="text-xs text-snappeal-muted">
              Your draft is still saved. We&apos;ll retry automatically; you can also submit by email from the ticket page if the portal stays down.
            </p>
            <button
              type="button"
              onClick={() => router.push("/app/tickets")}
              className="self-start inline-flex items-center gap-1.5 rounded-2xl bg-snappeal-navy text-white font-semibold text-sm px-4 py-2.5"
            >
              Back to my tickets
              <ArrowRight className="size-4" strokeWidth={2} />
            </button>
          </section>
        )}
      </div>

      <style jsx global>{`
        @keyframes snappeal-fade {
          from { opacity: 0; transform: scale(1.01); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </>
  );
}
