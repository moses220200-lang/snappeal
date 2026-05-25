/**
 * In-process event bus for live job progress.
 *
 * The worker and the SSE route (/api/jobs/[id]/progress) run in the same
 * Node process — see architecture/job-queue.md. That lets us bypass the
 * "watcher writes to DB → SSE polls DB" hot-path entirely: when a worker
 * emits a progress event via `appendProgress()`, we also push it onto an
 * in-memory channel keyed by jobId. SSE subscribers get it sub-millisecond
 * later instead of waiting up to 750ms for the next poll.
 *
 * Durability still comes from the DB write (the channel is best-effort,
 * in-memory only). Late subscribers — e.g. a customer reloading
 * `/app/tickets/[id]` mid-run — replay missed events via `readProgress()`
 * on connect, then attach to the live channel from the next event onward.
 *
 * If we move the worker out-of-process (separate Fly/Railway box), this
 * file is the seam to swap for Postgres LISTEN/NOTIFY or Redis pub/sub.
 * The public API (`emit`, `subscribe`) stays.
 */
import { EventEmitter } from "node:events";
import type { JobProgressEvent } from "../db/schema";

// One emitter per job-id. We don't preallocate — emitters are created on
// the first `emit` or `subscribe` for a given job and dropped when the
// last listener leaves.
const emitters = new Map<string, EventEmitter>();

function getOrCreate(jobId: string): EventEmitter {
  let bus = emitters.get(jobId);
  if (!bus) {
    bus = new EventEmitter();
    // SSE clients can stack up if the user opens multiple tabs on the
    // same job. Default 10 triggers a noisy warning around 11+ tabs;
    // 0 disables the limit.
    bus.setMaxListeners(0);
    emitters.set(jobId, bus);
  }
  return bus;
}

function maybeCleanup(jobId: string) {
  const bus = emitters.get(jobId);
  if (bus && bus.listenerCount("event") === 0) emitters.delete(jobId);
}

/**
 * Push a progress event to every live subscriber for this job. Safe to
 * call when there are no subscribers — emit returns false and we move on.
 */
export function emitProgress(jobId: string, event: JobProgressEvent): void {
  const bus = emitters.get(jobId);
  if (!bus) return;
  bus.emit("event", event);
}

/**
 * Attach a listener for a job's progress events. Returns an unsubscribe
 * function the caller MUST invoke when the SSE stream closes — otherwise
 * we leak listeners + the emitter sticks around forever.
 */
export function subscribeProgress(
  jobId: string,
  listener: (event: JobProgressEvent) => void,
): () => void {
  const bus = getOrCreate(jobId);
  bus.on("event", listener);
  return () => {
    bus.off("event", listener);
    maybeCleanup(jobId);
  };
}
