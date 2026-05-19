/**
 * Next.js instrumentation hook — runs once at server boot. We use it to
 * fire up the in-process job worker so submit_appeal jobs start draining
 * as soon as the API surface is live.
 *
 * Disable with SNAPPEAL_DISABLE_WORKER=1 when running the worker out-of-
 * process (e.g. on a dedicated Vercel Function with longer timeouts).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.SNAPPEAL_DISABLE_WORKER === "1") return;
  if (!process.env.DATABASE_URL) return;
  const { startWorker } = await import("@/lib/server/jobs/worker");
  startWorker();
}
