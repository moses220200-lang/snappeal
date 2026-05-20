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
import { Job, claimNext, markDone, markFailed, recoverZombies } from "./queue";
import { runSubmission } from "../submission";
import { getAppealById, recordSubmission } from "../appeals";

const WORKER_ID = `${hostname()}-${randomBytes(3).toString("hex")}`;
const POLL_INTERVAL_MS = 1500;

/** Per-kind concurrency budget. Add a kind here once it has a real handler
 *  in `runHandler`. Reserving budget for an un-handled kind only causes
 *  attempt-burning + failed rows. */
const CONCURRENCY: Record<string, number> = {
  submit_appeal: 2,
};

let booted = false;

export function startWorker() {
  if (booted) return;
  booted = true;
  void recoverZombies().catch((e) => console.error("[worker] recoverZombies failed:", e));
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
      console.error(`[worker:${slotId}] claim error:`, err);
    }
    if (!job) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }
    console.info(`[worker:${slotId}] running ${job.kind} ${job.id} (attempt ${job.attempts})`);
    try {
      const result = await runHandler(job);
      await markDone(job.id, result);
      console.info(`[worker:${slotId}] done ${job.id}`);
    } catch (err) {
      console.error(`[worker:${slotId}] failed ${job.id}:`, err);
      await markFailed(job.id, err);
    }
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
    default:
      throw new Error(`Unknown job kind: ${(job as { kind: string }).kind}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
