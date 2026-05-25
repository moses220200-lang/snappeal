/**
 * In-process job worker.
 *
 * On first import the worker boots a small pool of async tasks that loop
 * `claimNext` → run-handler → `markDone`/`markFailed`. Concurrency caps
 * keep heavy work (Claude CLI, Playwright MCP) from drowning the host.
 *
 * For prod scale this can be lifted into a separate process by importing
 * `runWorker()` from a dedicated entry script (e.g. `node worker.js`) and
 * disabling the auto-boot via `SNAPPEAL_DISABLE_WORKER=1`.
 */
import { hostname } from "node:os";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { Job, claimNext, markDone, markFailed, recoverZombies } from "./queue";
import { cleanupStaleScreenshots } from "./progress";
import { runSubmission } from "../submission";
import { runPortalLookup } from "../submission/lookup";
import { prewarmMcp } from "../submission/mcp-warm";
import { getAppealById, persistPortalLookup, recordSubmission } from "../appeals";
import { getDb, schema } from "../db/client";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1_000;

const WORKER_ID = `${hostname()}-${randomBytes(3).toString("hex")}`;
const POLL_INTERVAL_MS = 1500;

/** Per-kind concurrency budget. Add a kind here once it has a real handler
 *  in `runHandler`. Reserving budget for an un-handled kind only causes
 *  attempt-burning + failed rows. */
const CONCURRENCY: Record<string, number> = {
  submit_appeal: 2,
  // Read-only — cheaper than a full submission, safe to fan out wider.
  pcn_lookup: 3,
};

/** Per-kind job-level timeout. The inner MCP call has its own 5-minute
 *  wall-clock cap, but a hung post-MCP step (screenshot copy, Postgres
 *  write, JSON parse) would otherwise leave the job in `running` until
 *  the 5-minute stale-lock recovery fires on the next worker boot.
 *  Wrapping the whole handler in a deadline guarantees the worker can
 *  move on and the appeal flips out of "submitting" within the budget,
 *  even when the underlying handler hangs forever. */
const JOB_TIMEOUT_MS: Record<string, number> = {
  // 10 minutes: the MCP cap is 5 min, plus generous headroom for the
  // pre-MCP setup (workdir, screenshot watcher) + post-MCP teardown
  // (writing the screenshot to /public, recordSubmission to Postgres).
  submit_appeal: 10 * 60_000,
  pcn_lookup: 6 * 60_000,
};
const DEFAULT_JOB_TIMEOUT_MS = 10 * 60_000;

let booted = false;

/** Detect serverless runtime environments where the in-process worker
 *  cannot reliably run. The worker is a long-lived loop; on Vercel /
 *  AWS Lambda / similar, the function instance is torn down between
 *  requests, so the worker disappears after each invocation and any
 *  job in-flight is orphaned. The proper deployment is a separate
 *  long-lived worker process; see the SNAPPEAL_DISABLE_WORKER comment
 *  block below. */
function detectServerlessHost(): string | null {
  if (process.env.VERCEL === "1" || process.env.VERCEL_ENV) return "vercel";
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) return "aws-lambda";
  if (process.env.NETLIFY === "true") return "netlify";
  return null;
}

export function startWorker() {
  if (booted) return;
  booted = true;
  // SNAPPEAL_DISABLE_WORKER=1 → skip the in-process loop entirely.
  // Set this on serverless deploys (Vercel / Lambda / Netlify) and run
  // the worker out-of-band — see scripts/worker.ts (TBD) or any
  // long-lived Node process that imports `startWorker()` directly with
  // this env var unset. Without this guard, every cold-start of the
  // serverless function spawns a worker that gets killed mid-job when
  // the instance recycles, leaving Postgres rows stuck in `running`
  // until the 5-minute stale-lock recovery fires on the next boot.
  if (process.env.SNAPPEAL_DISABLE_WORKER === "1") {
    console.info("[worker] SNAPPEAL_DISABLE_WORKER=1 — in-process worker NOT started");
    return;
  }
  const serverless = detectServerlessHost();
  if (serverless) {
    console.warn(
      `[worker] running on serverless host (${serverless}). The in-process ` +
        `worker is unreliable here: the function instance dies between ` +
        `requests, leaving jobs orphaned. Set SNAPPEAL_DISABLE_WORKER=1 ` +
        `and run a long-lived worker out-of-band.`,
    );
  }
  void recoverZombies().catch((e) => console.error("[worker] recoverZombies failed:", e));
  // Garbage-collect `public/submissions/<jobId>/` folders older than 7
  // days. Runs once on boot; cheap (a few stats); safe to forget about
  // because a long-lived dev process otherwise grows /public forever.
  void cleanupStaleScreenshots({
    publicRoot: join(process.cwd(), "public"),
    olderThanMs: SEVEN_DAYS_MS,
  }).catch((e) => console.error("[worker] cleanupStaleScreenshots failed:", e));
  // Pre-warm @playwright/mcp + Chromium so the first real customer
  // doesn't pay the 30–60s npx+Chromium cold-start tax. Best-effort —
  // a slow network here only delays the warm-up benefit, not the
  // worker itself.
  void prewarmMcp().catch((e) => console.error("[worker] prewarmMcp failed:", e));
  // Spawn one loop per worker-slot per kind. Each loop independently claims.
  for (const [kind, budget] of Object.entries(CONCURRENCY)) {
    for (let i = 0; i < budget; i++) {
      void loop(`${WORKER_ID}-${kind}-${i}`).catch((e) =>
        console.error("[worker] loop crashed:", e),
      );
    }
  }
  console.info(`[worker] booted as ${WORKER_ID}`);
}

async function loop(slotId: string) {
  while (true) {
    let job: Job | null = null;
    try {
      job = await claimNext(slotId);
    } catch (err) {
      logStructured("error", "claim_failed", { slotId, error: stringifyError(err) });
    }
    if (!job) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }
    const startedAt = Date.now();
    logStructured("info", "job_started", {
      slotId,
      jobId: job.id,
      kind: job.kind,
      appealId: job.appealId,
      attempt: job.attempts,
      maxAttempts: job.maxAttempts,
    });
    try {
      const result = await runWithTimeout(job);
      await markDone(job.id, result);
      logStructured("info", "job_done", {
        slotId,
        jobId: job.id,
        kind: job.kind,
        appealId: job.appealId,
        durationMs: Date.now() - startedAt,
      });
    } catch (err) {
      const isTerminal = job.attempts >= job.maxAttempts;
      logStructured(isTerminal ? "error" : "warn", "job_failed", {
        slotId,
        jobId: job.id,
        kind: job.kind,
        appealId: job.appealId,
        attempt: job.attempts,
        maxAttempts: job.maxAttempts,
        terminal: isTerminal,
        durationMs: Date.now() - startedAt,
        ...stringifyErrorWithStack(err),
      });
      // Terminal-failure recovery for submit_appeal: markFailed alone
      // only touches the `jobs` table, so a submit job that exhausts
      // its retries leaves `appeals.status="submitting"` until manual
      // intervention. Record a submission row with status="failed" so
      // recordSubmission bounces the appeal back to "ready" and the
      // card surfaces a retry CTA. We do this BEFORE markFailed so
      // the bounce lands even if markFailed itself throws.
      if (isTerminal && job.kind === "submit_appeal" && job.appealId) {
        try {
          await recordSubmission({
            appealId: job.appealId,
            method: "portal",
            channel: "portal",
            status: "failed",
            lastError: err instanceof Error ? err.message : String(err),
          });
        } catch (recordErr) {
          logStructured("error", "appeal_bounce_failed", {
            slotId,
            jobId: job.id,
            appealId: job.appealId,
            ...stringifyErrorWithStack(recordErr),
          });
        }
      }
      await markFailed(job.id, err);
    }
  }
}

/** Wrap the handler in a deadline so a hung post-MCP step (Postgres write,
 *  file I/O, JSON parse) can't leave the job in `running` forever. On
 *  timeout the rejected race propagates to markFailed; the underlying
 *  handler promise keeps running detached, but the worker frees the slot
 *  and the appeal flips back to `ready` so the customer sees a retry
 *  surface instead of an indefinite "submitting" spinner. */
async function runWithTimeout(job: Job): Promise<unknown> {
  const timeoutMs = JOB_TIMEOUT_MS[job.kind] ?? DEFAULT_JOB_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new Error(
          `Job ${job.id} (${job.kind}) exceeded ${Math.round(timeoutMs / 1000)}s wall-clock timeout`,
        ),
      );
    }, timeoutMs);
  });
  try {
    return await Promise.race([runHandler(job), timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function runHandler(job: Job): Promise<unknown> {
  switch (job.kind) {
    case "submit_appeal": {
      const appealId = String(job.payload.appealId);
      const appeal = await getAppealById(appealId);
      if (!appeal) throw new Error(`Appeal ${appealId} not found`);
      const outcome = await runSubmission({ appeal, jobId: job.id });
      await recordSubmission({
        appealId: appeal.id,
        method: outcome.method,
        channel: outcome.channel,
        status: outcome.status,
        councilReference: outcome.councilReference,
        messageId: outcome.messageId,
        screenshotUrl: outcome.screenshotUrl,
        lastError: outcome.lastError,
        submittedAt: outcome.submittedAt,
      });
      return outcome;
    }
    case "pcn_lookup": {
      const appealId = String(job.payload.appealId);
      const appeal = await getAppealById(appealId);
      if (!appeal) throw new Error(`Appeal ${appealId} not found`);
      if (!appeal.councilSlug) {
        throw new Error(`Appeal ${appealId} has no council — cannot look up`);
      }
      const db = getDb();
      if (!db) throw new Error("DATABASE_URL not set");
      const councilRows = await db
        .select()
        .from(schema.councils)
        .where(eq(schema.councils.slug, appeal.councilSlug));
      const council = councilRows[0];
      if (!council) throw new Error(`Unknown council slug: ${appeal.councilSlug}`);

      const lookup = await runPortalLookup({ appeal, council, jobId: job.id });
      await persistPortalLookup({ appealId, snapshot: lookup.snapshot });
      // Surface the verdict to the SSE consumer so the validating page
      // can pick its redirect target without an extra round-trip.
      return {
        verdict: lookup.snapshot.verdict ?? "unknown",
        status: lookup.snapshot.status,
        appealId,
        photoCount: lookup.snapshot.photoUrls.length,
      };
    }
    default:
      throw new Error(`Unknown job kind: ${(job as { kind: string }).kind}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ─────────────────────── structured logging ─────────────────────── */

type LogLevel = "info" | "warn" | "error";

/** Single-line JSON log lines so the worker's output is grep-able + ingest-able
 *  by any log shipper (Vercel, Datadog, Sentry transport) without a logger
 *  dependency. The shape is stable: { level, msg, ts, source, ...ctx }. */
function logStructured(
  level: LogLevel,
  msg: string,
  ctx: Record<string, unknown>,
): void {
  const line = JSON.stringify({
    level,
    msg,
    ts: new Date().toISOString(),
    source: "worker",
    ...ctx,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

function stringifyError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function stringifyErrorWithStack(err: unknown): {
  error: string;
  stack?: string;
} {
  if (err instanceof Error) {
    return { error: err.message, stack: err.stack };
  }
  return { error: String(err) };
}
