/**
 * GET /api/submissions/[id]/progress
 *
 * Server-Sent-Events stream of a `submit_appeal` job's live progress. The
 * customer's waiting page subscribes via `EventSource` and renders each
 * arriving event — step descriptions, agent thoughts, and screenshots of the
 * council portal as the automation drives it.
 *
 * The endpoint polls the job row every ~750ms (LISTEN/NOTIFY would be nicer
 * but is overkill at this volume) and emits any newly-appended progress
 * events. It also fires a periodic `queue` event reporting position-in-line
 * until the job leaves the `queued` state. Closes when status is terminal.
 *
 * Wire format:
 *   event: queue    — { position: number, kind: "submit_appeal" }
 *   event: progress — { ts, kind, message?, url?, step?, caption? }
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

const POLL_INTERVAL_MS = 750;
const STREAM_MAX_MS = 5 * 60_000;

function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  // Ownership gate — the SSE stream re-broadcasts agent step text, "thoughts",
  // and screenshot URLs that quote letter content, so it absolutely cannot be
  // open. Resolve the job → appeal → viewer chain before we open the stream.
  //
  // Why HTTP 200 on errors: EventSource silently discards the response body
  // on any non-2xx status, so a 404/403 with a `data:` payload never reaches
  // the client's `error` listener. We return 200 + a one-shot stream that
  // emits the error frame and closes, which DOES reach the listener and
  // lets the page surface a "submission not found" card.
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

  let interval: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(sseFrame(event, data)));
        } catch {
          /* controller already closed */
        }
      };

      let cursor = 0;
      let lastStatus: string | null = null;
      let busy = false;

      const tick = async (): Promise<boolean> => {
        const snap = await readProgress(id);
        if (!snap) {
          send("error", { message: `Job ${id} not found` });
          return true; // close
        }

        // Emit any new progress entries since last tick.
        const events = snap.progress ?? [];
        for (let i = cursor; i < events.length; i++) {
          send("progress", events[i]);
        }
        cursor = events.length;

        // Status transitions.
        if (snap.status !== lastStatus) {
          send("status", { status: snap.status, lastError: snap.lastError });
          lastStatus = snap.status;
        }

        // Queue position while still queued.
        if (snap.status === "queued") {
          const pos = await queuePosition(id);
          if (pos !== null) send("queue", { position: pos, kind: "submit_appeal" });
        }

        if (snap.status === "done" || snap.status === "failed") {
          send(snap.status === "done" ? "done" : "error", {
            result: snap.result,
            message: snap.lastError,
          });
          return true;
        }
        return false;
      };

      // Initial tick.
      const earlyClose = await tick();
      if (earlyClose) {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
        return;
      }

      interval = setInterval(async () => {
        if (busy) return; // skip if the previous tick is still in-flight
        busy = true;
        try {
          const done = await tick();
          if (done || Date.now() - startedAt > STREAM_MAX_MS) {
            if (interval) clearInterval(interval);
            interval = null;
            try {
              controller.close();
            } catch {
              /* already closed */
            }
          }
        } catch (err) {
          send("error", { message: err instanceof Error ? err.message : "poll failed" });
          if (interval) clearInterval(interval);
          interval = null;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        } finally {
          busy = false;
        }
      }, POLL_INTERVAL_MS);
    },
    cancel() {
      // Client disconnected — stop polling.
      if (interval) clearInterval(interval);
      interval = null;
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
      connection: "keep-alive",
    },
  });
}
