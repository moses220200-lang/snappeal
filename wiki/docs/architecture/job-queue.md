# Job queue

Snappeal uses a **Postgres-backed work queue** for everything that's either expensive (Claude CLI subprocess), long-running (Playwright MCP submission, multi-minute), or that must survive a server restart. No Redis, no SQS, no external broker — just one `jobs` table and `FOR UPDATE SKIP LOCKED`.

## Why a queue and not inline?

The submission engine's portal path runs a Playwright browser inside a Claude CLI agent. Each run takes **30 seconds to several minutes** depending on portal latency and how many form steps the council insists on. If `/api/submit` ran that inline, three things would break:

1. **Multi-user fairness.** N concurrent submissions would spawn N Playwright browsers. Memory + CPU on the host would melt.
2. **Latency.** The user's "Submit" tap would block on the council's portal — terrible UX for a flow that needs to feel snappy.
3. **Durability.** A server crash mid-submission would leave the appeal in a half-submitted state with no recovery path.

The queue solves all three: `/api/submit` enqueues in &lt;100 ms and returns; a worker pool of bounded size drains the queue; jobs that crash mid-flight are reclaimable.

## Schema

```ts
jobs {
  id              text primary key       // "job_submit-appeal_<base36>_<hex>"
  kind            text not null          // 'submit_appeal' (only handler today)
  appeal_id       text                   // soft FK to appeals(id) — no cascade
  payload         jsonb not null         // per-kind shape, validated by handler
  status          text not null default 'queued'   // queued | running | done | failed
  attempts        int  not null default 0
  max_attempts    int  not null default 3
  run_after       timestamptz default now()        // for backoff retries
  locked_at       timestamptz                       // when the worker claimed it
  locked_by       text                              // workerId-kind-slot
  last_error      text
  result          jsonb
  progress        jsonb not null default '[]'      // append-only event log surfaced to /api/submissions/[id]/progress (SSE)
  created_at      timestamptz default now()
  updated_at      timestamptz default now()
}
-- index: (status, run_after)  for the claim query
-- index: (appeal_id)          for "give me all jobs for this appeal"
```

## Claim — atomic, non-blocking

`lib/server/jobs/queue.ts → claimNext(workerId)` runs:

```sql
WITH next AS (
  SELECT id FROM jobs
  WHERE (status = 'queued' AND run_after <= now())
     OR (status = 'running' AND locked_at < $stale_cutoff)
  ORDER BY run_after ASC, created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
UPDATE jobs j
SET status = 'running', locked_at = now(), locked_by = $workerId,
    attempts = j.attempts + 1, updated_at = now()
FROM next WHERE j.id = next.id
RETURNING j.*;
```

Three crucial properties:

- **`FOR UPDATE SKIP LOCKED`** lets N workers all run this query without contending. Each worker grabs a different row; no row is ever returned to two workers.
- **Stale-lock recovery is in the same query.** A `running` row whose `locked_at` is older than the 5-minute cutoff is re-claimable — covers the worker-crashed-mid-job case without a separate sweeper.
- **`run_after` is honoured.** Backoff retries simply set `run_after` to the future; the query won't return them until the deadline has passed.

## Worker

`lib/server/jobs/worker.ts → startWorker()` boots once per Node process from `instrumentation.ts`. It spawns one loop per slot per kind:

```ts
const CONCURRENCY = {
  submit_appeal: 2,    // 2 concurrent Playwright browsers max
};
```

Removed in v0.1.5: a reserved `generate_draft: 4` slot whose handler threw `not yet implemented` — any accidental enqueue would burn its retries and die `failed`. When async generation actually lands, add the slot at the same time as the handler.

Each loop:

1. Calls `claimNext(slotId)`.
2. If no job available, sleeps 1.5 s and tries again.
3. Otherwise dispatches to `runHandler(job)` based on `job.kind`.
4. On success, `markDone(job.id, result)`.
5. On failure, `markFailed(job.id, err)` — which decides between retry-with-backoff or final `failed`.

Backoff schedule for retries: **30 s, 2 min, 5 min** (then `failed`).

## Where it's used now

| Caller | Job kind | Concurrency cap |
|---|---|---|
| `/api/submit` | `submit_appeal` | 2 |

`/api/generate` does **not** go through the queue — it stays synchronous (so the GeneratingOverlay UX matches the user's wait) but is wrapped in an in-process `Semaphore` (`lib/server/concurrency.ts`, default 4 slots). Excess requests queue in-process and run FIFO. The semaphore protects the host without sacrificing the immediate-feedback UX the user expects from "I just paid £2.99".

If we later want fully-async generation (e.g. to support extremely long letters), the `generate_draft` kind is already scaffolded — switch `/api/generate` to enqueue + return a job id, and have the letter page poll `/api/jobs/[id]` until `status === 'done'`.

## Polling — the frontend story

The letter page calls `/api/submit`, gets back `{ status: 'queued', submissionId }`, and then polls `/api/appeals/[id]` every 2 s for up to 5 minutes. Three terminal states:

| Appeal status flips to | UI shows |
|---|---|
| `submitted` / `under_review` | "Submitted to the council" success card |
| `ready` (after >5 s) | Engine bounced back to ready → submission failed → "Try again" |
| Timeout (>5 min) | "Submission is taking longer than expected. Check back shortly." |

We also expose `/api/jobs/[id]` for direct job inspection, useful for admin tooling.

## Operational notes

- **The worker is in-process by default.** For Vercel deployment we'd move it to a dedicated function with `SNAPPEAL_DISABLE_WORKER=1` set in the web instance, and `npm run worker` (TBD entry script) running on a small box. The queue itself doesn't care where the workers live.
- **Zombie recovery** runs on every `startWorker()` boot — any `running` row older than the cutoff is re-queued. Belt-and-braces with the stale-lock condition in `claimNext`.
- **Idempotency** is the handler's responsibility. `submit_appeal` is *not* perfectly idempotent today — running it twice could result in two portal submissions. The mitigation is the FOR-UPDATE-SKIP-LOCKED claim (no double-handoff) plus the bounded retry budget. A truly idempotent submission requires the council to expose a request-deduplication token, which most don't.

## Open work

- A `cron`-style scheduled-job kind for retry of stuck appeals + DSAR-style data deletion.
- A real worker entry script (`node scripts/worker.js`) for production deploys that need the worker off-process.
- Per-job structured logs shipped to an observability backend (Sentry, Axiom, etc.).

## Files

```
lib/server/jobs/
├── queue.ts    # enqueue, claimNext, getJob, markDone, markFailed, recoverZombies
├── progress.ts # appendProgress, readProgress, queuePosition, watchScreenshots
└── worker.ts   # startWorker(), loop(), runHandler() dispatch
instrumentation.ts                                 # boots the worker on Node server start
app/api/jobs/[id]/route.ts                         # GET status for polling (ownership-gated, strips payload + lockedBy)
app/api/submissions/[id]/progress/route.ts         # SSE stream of progress events (ownership-gated)
app/api/submit/route.ts                            # current enqueuer (kind = 'submit_appeal')
```
