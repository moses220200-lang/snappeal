# Job queue

Last refreshed **2026-05-27 (v0.3.10)**.

ParkingRabbit uses a **Postgres-backed work queue** for everything that's either expensive (Claude CLI subprocess), long-running (Playwright MCP submission), or that must survive a server restart. No Redis, no SQS, no external broker — just one `jobs` table and `FOR UPDATE SKIP LOCKED`. The worker also calls `prewarmMcp()` on boot so the first portal-automation or pcn-lookup job doesn't pay a 30–60 s `@playwright/mcp` + Chromium cold start.

## Why a queue and not inline?

The submission engine's portal path runs a Playwright browser inside a Claude CLI agent. Each run takes **30 seconds to several minutes**. If `/api/submit` ran that inline, three things would break:

1. **Multi-user fairness.** N concurrent submissions would spawn N Playwright browsers. Memory + CPU on the host would melt.
2. **Latency.** The user's "Submit" tap would block on the council's portal — terrible UX.
3. **Durability.** A server crash mid-submission would leave the appeal in a half-submitted state with no recovery path.

The queue solves all three: `/api/submit` enqueues in <100 ms and returns; a worker pool of bounded size drains the queue; jobs that crash mid-flight are reclaimable.

## Schema

```ts
jobs {
  id              text primary key       // "job_<kind>_<base36>_<hex>"
  kind            text not null          // 'submit_appeal' | 'pcn_lookup' | 'generate_draft'
  appeal_id       text                   // soft reference — NO FK constraint
                                          // (intentional: jobs may outlive deleted appeals;
                                          //  mergeDuplicateDraftIfAny deletes them explicitly)
  payload         jsonb not null         // per-kind shape, validated by handler
  status          text not null default 'queued'   // queued | running | done | failed
  attempts        int  not null default 0
  max_attempts    int  not null default 3
  run_after       timestamptz default now()        // for backoff retries
  locked_at       timestamptz                       // when the worker claimed it
  locked_by       text                              // workerId-kind-slot
  last_error      text
  result          jsonb
  progress        jsonb not null default '[]'      // append-only event log surfaced via /api/jobs/[id]/progress (SSE)
  created_at      timestamptz default now()
  updated_at      timestamptz default now()
}
-- index: (status, run_after)  for the claim query
-- index: (appeal_id)          for "give me all jobs for this appeal"
```

`jobs.appeal_id` has **NO foreign-key constraint** — only a btree index. This is deliberate: jobs may outlive deleted appeals, and `mergeDuplicateDraftIfAny` deletes job rows for the duplicate appeal explicitly inside its transaction (since FK cascade can't be relied on). The trade-off: a manual `DELETE FROM appeals WHERE id=…` outside the merge helper leaves orphan job rows that the worker would later try to process. Use the helper, not raw SQL, in code paths that delete appeals.

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
- **Stale-lock recovery is in the same query.** A `running` row whose `locked_at` is older than the **5-minute cutoff** is re-claimable — covers the worker-crashed-mid-job case without a separate sweeper.
- **`run_after` is honoured.** Backoff retries simply set `run_after` to the future; the query won't return them until the deadline has passed.

## Worker

`lib/server/jobs/worker.ts → startWorker()` boots once per Node process from `instrumentation.ts`. It spawns one loop per slot per kind:

```ts
const CONCURRENCY = {
  submit_appeal:  2,   // 2 concurrent Playwright browsers max
  pcn_lookup:     3,   // read-only portal lookups — cheaper, safer to fan out
  generate_draft: 1,   // currently unused; placeholder for async generation
};
```

Per-kind timeouts (wall-clock ceiling before the worker bails and marks failed):

| Kind | Timeout | Cost (Claude path) | Cost (deterministic recipe) |
|---|---|---|---|
| `submit_appeal` | 10 min | ~$0.30–0.50 | (recipes for submission planned, not shipped) |
| `pcn_lookup` | 6 min | ~$0.30 | $0 (Lambeth has a recipe) |
| `generate_draft` | 4 min | ~$0.20–0.30 | n/a |

**Boot order** (`recoverZombies → cleanupStaleScreenshots → prewarmMcp → spawn loops`):

```ts
recoverZombies()              // re-queue any `running` rows older than 5 min
cleanupStaleScreenshots()     // sweep public/submissions/<jobId>/ stale PNGs
prewarmMcp()                  // spawn @playwright/mcp + Chromium once
                              //   (lib/server/submission/mcp-warm.ts)
for each slot: spawn loop()
```

Each loop:

1. Calls `claimNext(slotId)`.
2. If no job available, sleeps 1.5 s and tries again.
3. Otherwise dispatches to `runHandler(job)` based on `job.kind`.
4. On success, `markDone(job.id, result)`.
5. On failure, `markFailed(job.id, err)` — decides between retry-with-backoff or final `failed`.

Backoff schedule for retries: **30 s, 2 min, 5 min** (then `failed`).

## Where it's used now

| Caller | Job kind | Concurrency cap |
|---|---|---|
| `/api/submit` | `submit_appeal` | 2 |
| `/api/appeals/[id]/lookup` | `pcn_lookup` | 3 |
| `/api/generate-stream` | (inline, NOT queued) | semaphore: `PARKINGRABBIT_GENERATE_CONCURRENCY=4` |

The `pcn_lookup` handler (`lib/server/submission/lookup.ts → runPortalLookup`) tries a deterministic recipe first (Phase 9, Lambeth shipped) and falls back to Claude MCP on `drift` or `error`. The handler walks the council portal to fetch warden photos + verdict + portal-confirmed ticket metadata, persists everything via `persistPortalLookup()` (which also fill-only backfills `appeals.ticket` with portal-confirmed fields).

The `submit_appeal` handler runs Claude + Playwright MCP against the council's challenge form. v0.3.9 wired the dispatchAppealEvent hook on success/failure to fire push notifications via `notification_dispatches`.

`/api/generate` and `/api/generate-stream` do **not** go through the queue — drafting stays synchronous (so the smart card's `drafting` state matches the user's wait) but is wrapped in an in-process semaphore. Excess requests queue in-process and run FIFO.

## SSE delivery (Cloudflare-grade)

`/api/jobs/[id]/progress` is the long-lived SSE stream the smart card subscribes to via `useAppealLiveState` (`hooks/useAppealLiveState.ts`). Cloudflare buffers small SSE chunks until a 4 KB threshold, which used to make live agent thoughts arrive in clumps. The fix:

- **Every event is padded to 4 KB** with a trailing comment payload.
- Response headers force the proxy out of buffering mode: `cache-control: no-store, no-transform`, `content-encoding: identity`, `x-accel-buffering: no`.
- Poll cadence 150 ms (while running) / 2 s (idle); keep-alive comments every 3 s.
- `useAppealLiveState` projects `status`-kind frames onto `latestStep` so the smart card's inline status rows tick in real time.

The persisted replay endpoint `/api/appeals/[id]/submit-progress` returns the same event-shape for the most-recent `submit_appeal` job — survives page reload (the in-memory SSE stream doesn't).

## Operational notes

- **In-process worker by default.** For prod deploys set `PARKINGRABBIT_DISABLE_WORKER=1` on the web tier and run the worker on a dedicated box. The queue itself doesn't care where the workers live.
- **Serverless warning.** `instrumentation.ts` detects Vercel / Lambda / Netlify and warns when running there without `PARKINGRABBIT_DISABLE_WORKER=1` — the in-process worker dies between requests on serverless.
- **Zombie recovery** runs on every `startWorker()` boot. Belt-and-braces with the stale-lock condition in `claimNext`.
- **MCP prewarm** spawns `@playwright/mcp` + Chromium once after boot so the first real job doesn't eat the 30–60 s cold start.
- **Idempotency** is the handler's responsibility. Lookup handler is idempotent (read-only, two-layer idempotency in `enqueueLookupIfAutomated` prevents duplicate enqueue). Submission handler is *not* perfectly idempotent — `findRecentSuccessfulSubmission` prevents the re-fire case, but a network-level retry of a half-completed submission could still result in two portal entries. The bounded retry budget + FOR-UPDATE-SKIP-LOCKED claim are the main mitigations.

## Two-layer lookup idempotency (recapped here for cross-reference)

Lives in `lib/server/submission/enqueueLookup.ts`, called by `POST /api/appeals/[id]/lookup`:

- **Layer 1**: any queued/running `pcn_lookup` for this appeal → return that jobId without enqueueing.
- **Layer 2**: settled snapshot with non-error status + jobId → return that jobId. Pending-snapshot stale-jobId guard verifies the jobs row still exists; if it's gone (worker purge), fall through and enqueue fresh.

See [`submission-engine.md`](submission-engine.md) for the full mechanic.

## Files

```
lib/server/jobs/
├── queue.ts     # enqueue, claimNext, getJob, markDone, markFailed, recoverZombies
├── progress.ts  # appendProgress (also emits to event-bus), readProgress,
│                # queuePosition, watchScreenshots, cleanupStaleScreenshots
├── event-bus.ts # in-process EventEmitter per-jobId — fallback path for SSE
│                # delivery when worker + SSE handler share a process
└── worker.ts    # startWorker(), loop(), runHandler() dispatch — also
                 # calls recoverZombies + cleanupStaleScreenshots + prewarmMcp on boot.
lib/server/submission/mcp-warm.ts        # prewarmMcp()
instrumentation.ts                       # boots the worker on Node server start
app/api/jobs/[id]/route.ts               # GET status for polling
app/api/jobs/[id]/progress/route.ts      # SSE stream (4 KB padding + 150 ms poll + 3 s keep-alive)
app/api/submit/route.ts                  # enqueuer (kind = 'submit_appeal')
app/api/appeals/[id]/lookup/route.ts     # enqueuer (kind = 'pcn_lookup')
```

## Open work

- A `cron`-style scheduled-job kind for retry of stuck appeals + DSAR-style data deletion.
- A real worker entry script (`node scripts/worker.js`) for production deploys that need the worker off-process.
- Per-job structured logs shipped to an observability backend (Sentry / Axiom / Datadog).
- Per-user rate limiting on `/api/generate-stream` (today the semaphore is global).

## Cross-refs

- The submission engine the handlers belong to: [`submission-engine.md`](submission-engine.md).
- Deterministic recipes the lookup tries first: [`deterministic-recipes.md`](deterministic-recipes.md).
- The schema for `jobs` + progress events: [`data-model.md`](data-model.md).
- The notifications fired by worker hooks: [`notifications.md`](notifications.md).
- Cost telemetry written per Claude call: [`ai-pipeline.md`](ai-pipeline.md).
