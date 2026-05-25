"use client";

/**
 * useAppealLiveState — owns the SSE subscription for one ticket card.
 *
 * Responsibilities:
 *   1. Open `EventSource('/api/jobs/<jobId>/progress')` when `activeJobId`
 *      is set AND the card is in-viewport (IntersectionObserver). When
 *      `rootRef` is not provided (e.g. detail mode), subscription is
 *      always-on while `activeJobId` is set.
 *   2. Close on `done`, `error`, manual unsubscribe (offscreen-for-10s),
 *      or unmount. The list page can therefore safely render dozens of
 *      cards — only the ones in-viewport with an active job hold a
 *      connection.
 *   3. Translate the stream's events into a stable {LiveProgress, events,
 *      extracted} object so the consumer can drive the card visuals
 *      cheaply without storing the raw event list when they don't need
 *      it. `events` only accumulates when `keepEvents` is true (detail
 *      mode / Watch-live disclosure open).
 *   4. Fire `onSettled` on `done` / `error` so the consumer can refetch
 *      the appeal record (the SSE only knows about the JOB; the appeal
 *      row's `letterBody`, `portalLookup.status`, `appeal.status`, etc.
 *      live in a different table).
 *
 * Wire format mirrors components/MCPLiveView.tsx (which we're replacing):
 *   event: queue    — { position, kind, etaSeconds }
 *   event: progress — { ts, kind: status|step|thought|screenshot|metadata, ... }
 *   event: status   — { status: queued|running|done|failed, lastError? }
 *   event: done     — { result }
 *   event: error    — { message }
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { getOrCreateSessionId } from "@/lib/client/session";
import type { JobKindLive, LiveProgress } from "@/lib/deriveCardState";

export type ProgressEvent =
  | { ts: string; kind: "status"; message: string }
  | { ts: string; kind: "step"; message: string }
  | { ts: string; kind: "thought"; message: string }
  | { ts: string; kind: "screenshot"; step: number; url: string; caption?: string }
  | { ts: string; kind: "metadata"; field: string; value: string };

interface UseAppealLiveStateOptions {
  /** Job id currently active for this appeal, or null. Hook is dormant
   *  when null. */
  activeJobId: string | null;
  /** Kind of active job — drives milestone math + state derivation. */
  activeJobKind: JobKindLive | null;
  /** Optional ref to the card root element. When provided, IntersectionObserver
   *  gates the SSE connection on viewport visibility (rootMargin 200px,
   *  10s grace period when scrolling offscreen). */
  rootRef?: React.RefObject<HTMLElement | null>;
  /** Default false — SSE strips screenshot payloads (`?screenshots=0`). Set
   *  true when the user opens the "Watch live" disclosure. */
  subscribeScreenshots?: boolean;
  /** Default false — append progress events to a buffer. Detail mode and
   *  Watch-live mode both want this; list-mode cards generally don't. */
  keepEvents?: boolean;
  /** Fires on settle (`done` or `failed`) so the consumer can refetch the
   *  appeal record. SSE only carries job state; the parent appeal needs
   *  a one-shot row refresh to pick up `letterBody`, `portalLookup`, etc. */
  onSettled?: (result: { ok: boolean; data: unknown; error?: string }) => void;
}

interface UseAppealLiveStateResult {
  live: LiveProgress | null;
  /** Position+ETA when status === queued. */
  queue: { position: number; etaSeconds: number } | null;
  /** Buffered events (empty unless keepEvents=true). */
  events: ProgressEvent[];
  /** Last error message (failed job, forbidden, not found). */
  lastError: string | null;
  /** Council-confirmed metadata accumulated from `metadata` events. */
  extracted: Record<string, string>;
}

const OFFSCREEN_GRACE_MS = 10_000;

const TOTAL_MILESTONES: Record<JobKindLive, number> = {
  pcn_lookup: 5,
  generate_draft: 4,
  submit_appeal: 6,
};

export function useAppealLiveState({
  activeJobId,
  activeJobKind,
  rootRef,
  subscribeScreenshots = false,
  keepEvents = false,
  onSettled,
}: UseAppealLiveStateOptions): UseAppealLiveStateResult {
  const [status, setStatus] = useState<LiveProgress["status"]>("queued");
  const [latestStep, setLatestStep] = useState<string | null>(null);
  const [latestThought, setLatestThought] = useState<string | null>(null);
  const [milestonesReached, setMilestonesReached] = useState(0);
  const [latestScreenshotUrl, setLatestScreenshotUrl] = useState<string | null>(null);
  const [queue, setQueue] = useState<{ position: number; etaSeconds: number } | null>(null);
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [extracted, setExtracted] = useState<Record<string, string>>({});
  const [lastError, setLastError] = useState<string | null>(null);
  const [visible, setVisible] = useState<boolean>(() => rootRef === undefined);

  // Latest `onSettled` ref so the SSE effect doesn't re-open when the
  // parent re-renders with a fresh closure.
  const onSettledRef = useRef(onSettled);
  useEffect(() => {
    onSettledRef.current = onSettled;
  }, [onSettled]);

  // IntersectionObserver — only when caller passed a rootRef. The 10s
  // grace prevents flap on quick scroll-by; the connection survives a
  // user briefly scrolling past, but closes if they leave the area.
  useEffect(() => {
    if (!rootRef?.current) return;
    if (typeof IntersectionObserver === "undefined") {
      // One-shot fallback on platforms without IntersectionObserver.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisible(true);
      return;
    }
    let graceTimer: ReturnType<typeof setTimeout> | null = null;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            if (graceTimer) {
              clearTimeout(graceTimer);
              graceTimer = null;
            }
            setVisible(true);
          } else {
            if (graceTimer) clearTimeout(graceTimer);
            graceTimer = setTimeout(() => {
              setVisible(false);
              graceTimer = null;
            }, OFFSCREEN_GRACE_MS);
          }
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(rootRef.current);
    return () => {
      observer.disconnect();
      if (graceTimer) clearTimeout(graceTimer);
    };
  }, [rootRef]);

  // The actual SSE subscription. Re-runs when:
  //   - activeJobId changes
  //   - visibility changes
  //   - subscribeScreenshots flips (we need to reopen with the right qs)
  useEffect(() => {
    if (!activeJobId || !visible) return;
    // Reset state on new job — guarantees no leakage between jobs. This
    // is the textbook case for setState-in-effect: we're synchronising
    // local state with an external resource (the new SSE subscription
    // keyed by activeJobId), and the reset must happen before the SSE
    // listener attaches.
    /* eslint-disable react-hooks/set-state-in-effect */
    setStatus("queued");
    setLatestStep(null);
    setLatestThought(null);
    setMilestonesReached(0);
    setLatestScreenshotUrl(null);
    setQueue(null);
    setLastError(null);
    setExtracted({});
    if (keepEvents) setEvents([]);
    /* eslint-enable react-hooks/set-state-in-effect */

    const qs = new URLSearchParams({
      session: getOrCreateSessionId(),
      screenshots: subscribeScreenshots ? "1" : "0",
    });
    const es = new EventSource(
      `/api/jobs/${encodeURIComponent(activeJobId)}/progress?${qs.toString()}`,
    );
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      try {
        es.close();
      } catch {
        /* already closed */
      }
    };

    es.addEventListener("progress", (e) => {
      try {
        const ev = JSON.parse((e as MessageEvent).data) as ProgressEvent;
        // Always buffer when keepEvents is true — even on `status` and
        // other kinds the visual switch doesn't otherwise project. The
        // activity log surfaces every frame.
        if (keepEvents) setEvents((prev) => [...prev, ev]);
        switch (ev.kind) {
          case "status":
            // Worker emits a `status` frame as the very first event
            // (e.g. "Looking up your PCN with Westminster City Council")
            // — before the agent even spawns. Project it onto
            // `latestStep` so the card caption ticks within milliseconds
            // of job start instead of waiting for the first `step` frame
            // 10–30s in. Without this the customer sat on the "Warming
            // up a secure browser" placeholder with no activity feedback.
            setLatestStep(ev.message);
            break;
          case "step":
            setLatestStep(ev.message);
            break;
          case "thought":
            setLatestThought(ev.message);
            break;
          case "screenshot":
            setMilestonesReached((m) => Math.max(m, ev.step));
            if (subscribeScreenshots) setLatestScreenshotUrl(ev.url);
            break;
          case "metadata":
            setExtracted((prev) =>
              prev[ev.field] === ev.value ? prev : { ...prev, [ev.field]: ev.value },
            );
            break;
        }
      } catch {
        /* ignore malformed frame */
      }
    });

    es.addEventListener("status", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as {
          status: LiveProgress["status"];
          lastError?: string | null;
        };
        setStatus(data.status);
        if (data.lastError) setLastError(data.lastError);
      } catch {
        /* ignore */
      }
    });

    es.addEventListener("queue", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as {
          position: number;
          etaSeconds?: number;
        };
        setQueue({
          position: data.position,
          etaSeconds: typeof data.etaSeconds === "number" ? data.etaSeconds : 60,
        });
      } catch {
        /* ignore */
      }
    });

    es.addEventListener("done", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as { result?: unknown };
        setStatus("done");
        close();
        onSettledRef.current?.({ ok: true, data: data.result ?? null });
      } catch {
        setStatus("done");
        close();
        onSettledRef.current?.({ ok: true, data: null });
      }
    });

    es.addEventListener("error", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as { message?: string };
        if (data?.message) {
          setLastError(data.message);
          setStatus("failed");
          close();
          onSettledRef.current?.({ ok: false, data: null, error: data.message });
          return;
        }
      } catch {
        /* fall through */
      }
      // Transport-level error without a payload. EventSource will retry
      // automatically; we only treat readyState=CLOSED as terminal.
      if (es.readyState === EventSource.CLOSED) {
        setStatus("failed");
        close();
        onSettledRef.current?.({
          ok: false,
          data: null,
          error: "Connection closed",
        });
      }
    });

    return () => close();
  }, [activeJobId, visible, subscribeScreenshots, keepEvents]);

  const live: LiveProgress | null = useMemo(() => {
    if (!activeJobId || !activeJobKind) return null;
    return {
      jobId: activeJobId,
      kind: activeJobKind,
      status,
      latestStep,
      latestThought,
      milestonesReached,
      latestScreenshotUrl,
    };
  }, [activeJobId, activeJobKind, status, latestStep, latestThought, milestonesReached, latestScreenshotUrl]);

  return {
    live,
    queue,
    events,
    lastError,
    extracted,
  };
}

// Re-export for convenience.
export { TOTAL_MILESTONES };
