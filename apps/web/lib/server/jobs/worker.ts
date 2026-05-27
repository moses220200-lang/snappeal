/**
 * In-process job worker.
 *
 * On first import the worker boots a small pool of async tasks that loop
 * `claimNext` → run-handler → `markDone`/`markFailed`. Concurrency caps
 * keep heavy work (Claude CLI, Playwright MCP) from drowning the host.
 *
 * For prod scale this can be lifted into a separate process by importing
 * `runWorker()` from a dedicated entry script (e.g. `node worker.js`) and
 * disabling the auto-boot via `PARKINGRABBIT_DISABLE_WORKER=1`.
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
import { recordAiCall, classifyAiError } from "../aiCalls";
import { dispatchAppealEvent } from "../notifications/dispatchAppealEvent";

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
 *  long-lived worker process; see the PARKINGRABBIT_DISABLE_WORKER comment
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
  // workerDisabled (settings layer) → skip the in-process loop.
  // Set PARKINGRABBIT_DISABLE_WORKER=1 on serverless deploys (Vercel /
  // Lambda / Netlify) and run the worker out-of-band — see
  // scripts/worker.ts or any long-lived Node process that imports
  // `startWorker()` directly with the flag unset. Without this guard,
  // every cold-start of the serverless function spawns a worker that
  // gets killed mid-job when the instance recycles, leaving Postgres
  // rows stuck in `running` until the 5-minute stale-lock recovery
  // fires on the next boot. The boolean is read through `getSettings()`
  // so the env→mode-default→admin-override layering stays
  // authoritative.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getSettings } = require("../settings") as typeof import("../settings");
  if (getSettings().workerDisabled) {
    console.info("[worker] workerDisabled=true — in-process worker NOT started");
    return;
  }
  const serverless = detectServerlessHost();
  if (serverless) {
    console.warn(
      `[worker] running on serverless host (${serverless}). The in-process ` +
        `worker is unreliable here: the function instance dies between ` +
        `requests, leaving jobs orphaned. Set PARKINGRABBIT_DISABLE_WORKER=1 ` +
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
      const submitStart = Date.now();
      let outcome;
      try {
        outcome = await runSubmission({ appeal, jobId: job.id });
        void recordAiCall({
          appealId,
          jobId: job.id,
          stage: "submit",
          model: "claude-cli",
          // SubmissionOutcome now plumbs costUsd/durationMs from
          // runPortalAutomation; the row captures the actual Claude spend
          // for the submission attempt (NULL for email-only fallback).
          //
          // Important: this cost is REPRESENTATIVE of a real submission
          // even when stopAtReview=true. The brake stops the agent one
          // click short of Finish — the extra inference round-trip for
          // that final click is negligible (<1¢) relative to the
          // multi-turn navigation + form-fill cost we just paid. So
          // production cost estimation based on dev-mode submissions
          // is sound.
          costUsd: outcome.costUsd,
          durationMs: outcome.durationMs ?? (Date.now() - submitStart),
          ok: outcome.status === "submitted",
          errorKind: outcome.status === "submitted" ? null : "mcp",
          errorMessage: outcome.lastError ?? null,
        });
      } catch (err) {
        void recordAiCall({
          appealId,
          jobId: job.id,
          stage: "submit",
          model: "claude-cli",
          costUsd: null,
          durationMs: Date.now() - submitStart,
          ok: false,
          errorKind: classifyAiError(err),
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
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
      // Dispatch push notification — best-effort, never blocks the
      // submission outcome. Success vs failure picks a different
      // copy entry so the customer sees the right message.
      void dispatchAppealEvent({
        appealId,
        event:
          outcome.status === "submitted"
            ? "submission_done"
            : "submission_failed",
        councilReference: outcome.councilReference,
      }).catch((err) =>
        console.warn(
          `[worker] dispatch submission push failed for ${appealId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );
      return outcome;
    }
    case "pcn_lookup": {
      const appealId = String(job.payload.appealId);
      // v0.3.12 — Step 2.5: shadow jobs run the real lookup but
      // skip every write that would disturb the appeal whose cache
      // hit triggered them. The verdict still flows through
      // cacheSnapshot (which triggers drift detection in
      // lib/server/tickets.ts), but persistPortalLookup,
      // dispatchAppealEvent, and onVerdictConfirmed all no-op.
      const isShadow = job.payload.shadow === true;
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

      const lookupStart = Date.now();
      let lookup;
      try {
        lookup = await runPortalLookup({
          appeal,
          council,
          jobId: job.id,
          // Persist the verdict the moment the council confirms it so the
          // customer advances to Pay/appeal immediately. The agent keeps
          // capturing warden photos in the background; the final persist
          // below overwrites this with the full snapshot (incl. photos).
          // Shadow runs skip this — the cache-hit consumer already saw
          // the cached verdict and we don't want to flicker their card.
          onVerdictConfirmed: isShadow
            ? undefined
            : async (snapshot) => {
                await persistPortalLookup({ appealId, snapshot }).catch(() => null);
              },
        });
        // Mode telemetry: the deterministic-recipe path costs $0 and
        // skips the Claude CLI entirely. We detect it by costUsd===0
        // (Claude responses always have a non-zero cost). Lets the
        // admin Appeal Tickets list spot fast-path vs fallback rows
        // and watch the success/drift ratio across deploys.
        const wasDeterministic =
          lookup.success && lookup.costUsd === 0;
        void recordAiCall({
          appealId,
          jobId: job.id,
          stage: "lookup",
          model: wasDeterministic ? "playwright-recipe" : "claude-cli",
          mode: wasDeterministic ? "deterministic" : undefined,
          costUsd: lookup.costUsd,
          durationMs: lookup.durationMs,
          ok: lookup.success,
          errorKind: lookup.success ? null : "mcp",
          errorMessage: lookup.error ?? null,
        });
      } catch (err) {
        const errMessage = err instanceof Error ? err.message : String(err);
        void recordAiCall({
          appealId,
          jobId: job.id,
          stage: "lookup",
          model: "claude-cli",
          costUsd: null,
          durationMs: Date.now() - lookupStart,
          ok: false,
          errorKind: classifyAiError(err),
          errorMessage: errMessage,
        });
        // CRITICAL: persist an error snapshot so the card recovers
        // from the validating gate. Without this the appeal sits in
        // `portal_lookup.status=pending` forever (since we stamped
        // 'pending' at enqueue time) and the customer's card never
        // exits the validating gate.
        await persistPortalLookup({
          appealId,
          snapshot: {
            jobId: job.id,
            status: "error",
            photoUrls: [],
            fetchedAt: new Date().toISOString(),
            verdictReason: `lookup threw: ${errMessage.slice(0, 200)}`,
          },
        }).catch((persistErr) =>
          console.warn(
            `[worker] couldn't persist error snapshot for ${appealId}: ${
              persistErr instanceof Error
                ? persistErr.message
                : String(persistErr)
            }`,
          ),
        );
        throw err;
      }
      if (isShadow) {
        // Shadow path: skip both the per-appeal write (would flicker
        // the user's already-fast-forwarded card) AND the push
        // dispatch (user already saw the cache-hit notification, if
        // any). Push the result through cacheSnapshot directly to
        // refresh the shared cache + fire drift detection in
        // lib/server/tickets.ts:cacheSnapshot.
        if (lookup.success && appeal.ticket?.pcnRef) {
          const { cacheSnapshot } = await import("../tickets");
          const sourceKind: "deterministic" | "cli" =
            lookup.costUsd === 0 ? "deterministic" : "cli";
          await cacheSnapshot(
            { councilSlug: appeal.councilSlug, pcnRef: appeal.ticket.pcnRef },
            lookup.snapshot,
            sourceKind,
            lookup.costUsd ?? null,
          ).catch(() => null);
        }
      } else {
        await persistPortalLookup({ appealId, snapshot: lookup.snapshot });
        // Dispatch push notification when the verdict lands. The copy
        // entry pulls amount + days-left from the snapshot/appeal so
        // the customer sees the actual figures (not generic copy).
        void dispatchAppealEvent({
          appealId,
          event: lookup.success ? "validation_done" : "validation_failed",
          amountPence: lookup.snapshot.metadata?.amountPence ?? null,
          daysLeftToAppeal: daysUntil(lookup.snapshot.metadata?.dueDateAt ?? null),
        }).catch((err) =>
          console.warn(
            `[worker] dispatch validation push failed for ${appealId}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          ),
        );
      }
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

/** ISO date string → days from now (rounded floor). NULL when the
 *  input isn't parseable. Used for push-notification copy so the
 *  customer sees "32 days left" instead of a raw ISO string. */
function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((t - Date.now()) / 86_400_000));
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
