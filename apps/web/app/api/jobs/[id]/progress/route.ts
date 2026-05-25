/**
 * GET /api/jobs/[id]/progress (path param is the job id)
 *
 * Server-Sent-Events stream of an in-flight job's progress. Works for
 * both `submit_appeal` (live council-portal submission) and `pcn_lookup`
 * (read-only verification) — they share the wire format.
 *
 * Delivery model (v0.2.8):
 *   - Tight DB poll on a single cursor — every 300ms while running,
 *     2s while queued or after settled. Polling is what works
 *     reliably across Next.js dev's process boundaries; the in-process
 *     event bus (`event-bus.ts`) is fired by the worker on each
 *     `appendProgress`, but Next.js dev sometimes evaluates the SSE
 *     route handler in a different worker than the in-process job
 *     worker, so the listener never sees the emit. Polling closes
 *     that gap.
 *   - Keep-alive comment every 15s so proxies don't kill idle streams.
 *   - Settle conditions: `done`/`failed` triggers the terminal event
 *     and closes the stream.
 *
 * Wire format:
 *   event: queue    — { position: number, kind: <job.kind>, etaSeconds }
 *   event: progress — { ts, kind, message?, url?, step?, caption?, field?, value? }
 *   event: status   — { status: "queued"|"running"|"done"|"failed", lastError? }
 *   event: done     — { result: unknown }
 *   event: error    — { message }
 */
import { readProgress, queuePosition } from "@/lib/server/jobs/progress";
import { getJob } from "@/lib/server/jobs/queue";
import { getAppealById } from "@/lib/server/appeals";
import {
  canViewAppeal,
  getRequestSessionId,
  getViewer,
} from "@/lib/server/viewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 360;

// Poll the jobs table every 150ms while a job is running so step + thought
// + screenshot events surface to the SSE consumer within ~one frame of
// being persisted. The query is a single indexed lookup and the worker
// emits on the order of 30 events per job, so this is well within budget.
const POLL_RUNNING_MS = 150;
const POLL_IDLE_MS = 2_000;
// Tightened from 5s to 3s so any in-flight buffer (carrier proxies, mobile
// Safari, dev-server intermediaries) gets a flush hint at least every
// 3 seconds. The bandwidth cost (a `: ka` comment) is trivial against the
// base64 screenshots and step-text frames that follow.
const KEEP_ALIVE_MS = 3_000;
const STREAM_MAX_MS = 5 * 60_000;

/**
 * Average wall-clock duration (seconds) per job kind. Used to compute
 * the customer-facing ETA on the queue card. Tweak with worker concurrency.
 */
const AVG_SECONDS: Record<string, number> = {
  submit_appeal: 150,
  pcn_lookup: 60,
  generate_draft: 30,
};
const CONCURRENCY: Record<string, number> = {
  submit_appeal: 2,
  pcn_lookup: 3,
  generate_draft: 4,
};

function estimateWaitSeconds(kind: string, position: number): number {
  const avg = AVG_SECONDS[kind] ?? 60;
  const conc = CONCURRENCY[kind] ?? 2;
  return Math.max(5, Math.ceil(((position + 1) / conc) * avg));
}

function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  // v0.2.13 — `?screenshots=0` strips screenshot frames from the stream.
  // Default is to include them (mirrors the legacy MCPLiveView behavior).
  // The smart ticket card subscribes with screenshots=0 until the user
  // opens the "Watch live" disclosure; this saves ~1MB/min of base64
  // traffic per idle card.
  const url = new URL(req.url);
  const includeScreenshots = url.searchParams.get("screenshots") !== "0";

  // Ownership-gate every job to its appeal owner (or admin) — the SSE
  // stream re-broadcasts agent step text, "thoughts", and portal
  // screenshots and absolutely cannot be open. Return 200 + a one-shot
  // `error` frame so EventSource surfaces it (EventSource discards
  // non-2xx response bodies).
  const sseError = (message: string) =>
    new Response(`event: error\ndata: ${JSON.stringify({ message })}\n\n`, {
      status: 200,
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        "x-accel-buffering": "no",
      },
    });

  const job = await getJob(id);
  if (!job) return sseError(`Job ${id} not found`);
  if (job.appealId) {
    const appeal = await getAppealById(job.appealId);
    const viewer = await getViewer();
    const sessionId = getRequestSessionId(req);
    if (!appeal || !canViewAppeal(viewer, appeal, sessionId)) {
      return sseError("Forbidden");
    }
  } else {
    const viewer = await getViewer();
    if (viewer.role !== "admin") return sseError("Forbidden");
  }

  const encoder = new TextEncoder();
  const startedAt = Date.now();

  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let keepAliveInterval: ReturnType<typeof setInterval> | null = null;

  // Cloudflare (and other reverse-proxy CDNs) buffer text/event-stream
  // responses until ~4 KB of payload has accumulated before flushing to
  // the client — even with x-accel-buffering: no on the origin. The
  // workaround is to make every event larger than that threshold by
  // padding with a long ignored SSE comment.
  // We precompute a 4 KB block of dot characters so each send/keep-alive
  // is cheap (no per-call allocation) and reliably above the buffer cap.
  const FLUSH_PAD = ":".padEnd(4096, ".");

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          // Frame + a trailing 4 KB flush comment in one write. The
          // comment is ignored by the SSE parser but pushes the frame
          // past Cloudflare's buffer cap on the spot. Without this,
          // events sit in the edge buffer until the connection closes
          // and the customer sees nothing until the job is done.
          controller.enqueue(
            encoder.encode(`${sseFrame(event, data)}${FLUSH_PAD}\n\n`),
          );
        } catch {
          closed = true;
        }
      };
      const sendComment = (text: string) => {
        if (closed) return;
        try {
          // Keep-alive comments also pad to 4 KB so each beat flushes
          // through Cloudflare regardless of what fired it.
          controller.enqueue(
            encoder.encode(`: ${text} ${FLUSH_PAD}\n\n`),
          );
        } catch {
          closed = true;
        }
      };

      const cleanup = () => {
        if (pollTimer) clearTimeout(pollTimer);
        if (keepAliveInterval) clearInterval(keepAliveInterval);
        pollTimer = null;
        keepAliveInterval = null;
        if (!closed) {
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
        closed = true;
      };

      const logTag = `[sse:${id.slice(-8)}]`;
      let cursor = 0;             // # progress events already sent
      let lastStatus: string | null = null;
      let busy = false;
      let sentTotal = 0;

      const tick = async (): Promise<"keep" | "done"> => {
        const snap = await readProgress(id);
        if (!snap) {
          send("error", { message: `Job ${id} not found` });
          return "done";
        }

        // Emit any new progress entries since last tick. Screenshots are
        // gated by the `?screenshots=0|1` query so cards that aren't
        // showing the live view don't pay the base64 cost.
        const events = snap.progress ?? [];
        if (events.length > cursor) {
          for (let i = cursor; i < events.length; i++) {
            const ev = events[i];
            if (!includeScreenshots && ev.kind === "screenshot") continue;
            send("progress", ev);
            sentTotal += 1;
          }
          cursor = events.length;
          if (sentTotal % 25 === 0) console.info(`${logTag} sent ${sentTotal}`);
        }

        // Status transitions + queue position.
        if (snap.status !== lastStatus) {
          send("status", { status: snap.status, lastError: snap.lastError });
          lastStatus = snap.status;
        }
        if (snap.status === "queued") {
          const pos = await queuePosition(id);
          if (pos !== null)
            send("queue", {
              position: pos,
              kind: job.kind,
              etaSeconds: estimateWaitSeconds(job.kind, pos),
            });
        }
        if (snap.status === "done" || snap.status === "failed") {
          send(snap.status === "done" ? "done" : "error", {
            result: snap.result,
            message: snap.lastError,
          });
          return "done";
        }
        return "keep";
      };

      const schedule = () => {
        if (closed) return;
        const interval =
          lastStatus === "running" ? POLL_RUNNING_MS : POLL_IDLE_MS;
        pollTimer = setTimeout(async () => {
          if (busy) {
            schedule();
            return;
          }
          if (Date.now() - startedAt > STREAM_MAX_MS) {
            cleanup();
            return;
          }
          busy = true;
          try {
            const res = await tick();
            if (res === "done") {
              cleanup();
              return;
            }
            schedule();
          } catch (err) {
            send("error", {
              message: err instanceof Error ? err.message : "poll failed",
            });
            cleanup();
          } finally {
            busy = false;
          }
        }, interval);
      };

      // Open-connection flush: ship the 4 KB padding comment as the
      // first chunk so Cloudflare's edge buffer fills immediately and
      // the EventSource's `open` event fires on the client side
      // straight away. Same trick is repeated after every subsequent
      // event via the `send` helper above.
      sendComment("padding");

      // Initial tick — replays everything stored so a mid-stream reload
      // catches up before the slow poll kicks in.
      const initial = await tick();
      if (initial === "done") {
        cleanup();
        return;
      }
      console.info(`${logTag} attached (cursor=${cursor}, status=${lastStatus})`);
      schedule();

      // Keep-alive comment — tightened from 15s to 5s so iOS Safari
      // (which buffers SSE traffic aggressively in the background and
      // sometimes when the screen is on too) flushes incremental events
      // promptly. The bandwidth cost is trivial (~14 bytes per beat).
      keepAliveInterval = setInterval(() => sendComment("ka"), KEEP_ALIVE_MS);
    },
    cancel() {
      if (pollTimer) clearTimeout(pollTimer);
      if (keepAliveInterval) clearInterval(keepAliveInterval);
      pollTimer = null;
      keepAliveInterval = null;
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      // `no-store` is the strongest signal to Cloudflare not to cache
      // OR collapse the response; `no-transform` blocks gzip
      // re-encoding. Both are required for SSE to flow through CF.
      "cache-control": "no-store, no-transform",
      // Disable proxy buffering. `x-accel-buffering: no` is nginx /
      // Vercel honoured. `content-encoding: identity` defensively
      // blocks gzip on an SSE stream — gzip needs a buffer to fill
      // before flushing, so a slow job would otherwise look frozen.
      "x-accel-buffering": "no",
      "content-encoding": "identity",
      connection: "keep-alive",
    },
  });
}
