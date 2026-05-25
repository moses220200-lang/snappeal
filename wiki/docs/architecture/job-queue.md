# Job queue

ParkingRabbit uses a **Postgres-backed work queue** for everything that's either expensive (Claude CLI subprocess), long-running (Playwright MCP submission, multi-minute), or that must survive a server restart. No Redis, no SQS, no external broker — just one `jobs` table and `FOR UPDATE SKIP LOCKED`. As of v0.3.1 the worker also calls `prewarmMcp()` on boot so the first portal-automation or pcn-lookup job doesn't pay a 30–60 s `@playwright/mcp` + Chromium cold start.

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
  kind            text not null          // 'submit_appeal' | 'pcn_lookup'
                                          // — see CONCURRENCY in worker.ts (2 / 3)
                                          // — average wall-clock seconds:
                                          //     submit_appeal 150s, pcn_lookup 60s
                                          //   (used by SSE queue-ETA calc)
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
  progress        jsonb not null default '[]'      // append-only event log surfaced to /api/jobs/[id]/progress (SSE)
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
  pcn_lookup:    3,    // read-only portal lookups — cheaper, safer to fan out
};
```

A reserved `generate_draft` slot is scaffolded but currently unused — when async generation actually lands, add the slot count at the same time as the handler.

**v0.3.1 worker boot order:**

```ts
recoverZombies()   // re-queue any `running` rows older than 5 min (crashed worker)
→ cleanupStaleScreenshots()  // sweep public/submissions/<jobId>/ stale PNGs
→ prewarmMcp()     // spawn @playwright/mcp + Chromium once so customer #1 doesn't
                    // pay the 30–60 s cold-start tax (lib/server/submission/mcp-warm.ts)
→ for each slot: spawn loop()
```

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
| `/api/appeals/[id]/lookup` | `pcn_lookup` | 3 |

The `pcn_lookup` handler (`lib/server/submission/lookup.ts → runPortalLookup`) is the read-only sibling of `runPortalAutomation`. It walks the council portal to fetch warden photos + a validity verdict + portal-confirmed ticket metadata, persists everything via `persistPortalLookup()` (which also patches `appeals.ticket` with portal-confirmed fields so the downstream letter draft uses the council's record), and returns `{ verdict, status, appealId, photoCount }` as the SSE `done` payload. The smart `<TicketCard>` subscribes to this SSE via `useAppealLiveState` and morphs its status pill inline.

`/api/generate` (and `/api/generate-stream`) do **not** go through the queue — drafting stays synchronous (so the smart card's `drafting` state matches the user's wait) but is wrapped in an in-process `Semaphore` (`lib/server/concurrency.ts`, default 4 slots). Excess requests queue in-process and run FIFO. The semaphore protects the host without sacrificing the immediate-feedback UX the user expects from "I just paid £2.99". The wait is an inline "Drafting your appeal" status row inside the card body; the legacy full-screen `<GeneratingOverlay>` was deleted in v0.2.13.

## Cloudflare-grade SSE delivery (v0.3.1)

`/api/jobs/[id]/progress` is the long-lived SSE stream the smart card subscribes to for every live job (`submit_appeal` AND `pcn_lookup`). Cloudflare buffers small SSE chunks until a 4 KB threshold, which made live agent thoughts arrive in clumps every 8–20 s instead of as-they-happened. The v0.3.1 fix:

- **Every event is padded to 4 KB** with a trailing comment payload.
- Response headers force the proxy out of buffering mode: `cache-control: no-store, no-transform`, `content-encoding: identity`, `x-accel-buffering: no`.
- Poll cadence dropped from 1 s → **150 ms**; keep-alive comments fire every **3 s**.
- `useAppealLiveState` (`hooks/useAppealLiveState.ts`) projects the `status`-kind frames onto `latestStep` so the smart card's inline status rows ("Reading PCN details / Checking issuer portal / Generating recommendation") tick in real time.
- **Hide/Show decouple**: subscription gating depends on the `showMcpLiveView` runtime flag only (default ON; OFF only when `NEXT_PUBLIC_SNAPPEAL_SHOW_MCP_LIVE_VIEW === "0"`). `watchLiveOpen` is purely a render concern — collapsing the Watch-live disclosure no longer unmounts the consumer and reboots the MCP agent.

The legacy `/api/submissions/[id]/progress` forwarder is deleted; all live UIs consume `/api/jobs/[id]/progress` directly.

## Polling — the frontend story

The smart card on `/app/tickets` calls `/api/submit`, gets back `{ status: 'queued', submissionId }`, opens the inline `<MCPLiveStrip>` disclosure (auto-expanded on a fresh job via `autoOpenedForJobRef`), and subscribes to `/api/jobs/[id]/progress` SSE for the live agent thought / step / screenshot stream. It also polls `/api/appeals/[id]` every 2 s as a belt-and-braces check for status transitions. Three terminal states:

| Appeal status flips to | UI shows |
|---|---|
| `submitted` / `under_review` | "Submitted to the council" success state on the card with council reference |
| `ready` (after >5 s) | Engine bounced back to ready → submission failed → inline "Try again" CTA |
| Timeout (>5 min) | "Submission is taking longer than expected. Check back shortly." |

We also expose `/api/jobs/[id]` for direct job inspection, useful for admin tooling.

## Operational notes

- **The worker is in-process by default.** For Vercel deployment we'd move it to a dedicated function with `SNAPPEAL_DISABLE_WORKER=1` set in the web instance, and `npm run worker` (TBD entry script) running on a small box. The queue itself doesn't care where the workers live.
- **Zombie recovery** runs on every `startWorker()` boot — any `running` row older than the cutoff is re-queued. Belt-and-braces with the stale-lock condition in `claimNext`.
- **MCP prewarm on boot** (v0.3.1) — `prewarmMcp()` from `lib/server/submission/mcp-warm.ts` spawns `@playwright/mcp` + Chromium once after boot so the first real job doesn't eat the 30–60 s cold start.
- **Idempotency** is the handler's responsibility. `submit_appeal` is *not* perfectly idempotent today — running it twice could result in two portal submissions. The mitigation is the FOR-UPDATE-SKIP-LOCKED claim (no double-handoff) plus the bounded retry budget. A truly idempotent submission requires the council to expose a request-deduplication token, which most don't.

## Open work

- A `cron`-style scheduled-job kind for retry of stuck appeals + DSAR-style data deletion.
- A real worker entry script (`node scripts/worker.js`) for production deploys that need the worker off-process.
- Per-job structured logs shipped to an observability backend (Sentry, Axiom, etc.).

## Files

```
lib/server/jobs/
├── queue.ts     # enqueue, claimNext, getJob, markDone, markFailed, recoverZombies
├── progress.ts  # appendProgress (also emits to event-bus), readProgress,
│                # queuePosition (counts queued-ahead + running same-kind),
│                # watchScreenshots, cleanupStaleScreenshots
├── event-bus.ts # in-process EventEmitter per-jobId — fallback path for SSE
│                # delivery when worker + SSE handler share a process.
│                # Production hot path uses DB polling (150 ms running /
│                # 2 s idle) — see /api/jobs/[id]/progress.
└── worker.ts    # startWorker(), loop(), runHandler() dispatch — also
                 # calls recoverZombies + cleanupStaleScreenshots + prewarmMcp on boot.
lib/server/submission/mcp-warm.ts                  # prewarmMcp() — v0.3.1 cold-start killer
instrumentation.ts                                 # boots the worker on Node server start
app/api/jobs/[id]/route.ts                         # GET status for polling (ownership-gated, strips payload + lockedBy)
app/api/jobs/[id]/progress/route.ts                # SSE stream of progress events (v0.3.1: 4 KB padding + identity encoding + 150 ms poll + 3 s keep-alive)
app/api/submit/route.ts                            # current enqueuer (kind = 'submit_appeal')
app/api/appeals/[id]/lookup/route.ts               # enqueuer for kind = 'pcn_lookup'
```
