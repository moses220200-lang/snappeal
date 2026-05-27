# Data model

Last refreshed **2026-05-27 (v0.3.10)**.

Postgres + Drizzle ORM. Schema lives in `apps/web/lib/server/db/schema.ts`. 17 migrations applied (`0000`–`0016`). Local dev: `docker compose up -d db` exposes Postgres 16 at `127.0.0.1:5544` (role + db + password literally `snappeal` because the role table was created under the codename — see [`../handoff.md`](../handoff.md) "Strand A"). Production: Postgres via Vercel Marketplace.

## Tables (15 total)

### `users`
The signed-in account. `id` (text PK, `u_*`), `email` (unique citext), `passwordHash` (`saltHex:hashHex` pbkdf2-sha256 210_000), `displayName`, `phone`, `addressLine1` / `addressLine2` / `addressCity` / `addressPostcode`, `role` (`user` | `admin`), `serviceTier` (`buy_time` | `grounds` | `care_plan`), `notificationPrefs` (jsonb — six channel toggles + asked-at sentinels + push subscription), `emailVerifiedAt`, `createdAt`, `lastSignInAt`. OAuth providers planned but not wired.

### `appeals`
The single row per PCN. `id` (`ap_*`), `sessionId` (guest-session id; preserved on sign-in claim), `userId` (nullable; null for guests), `replyEmail` (`<id>@appeals.parkingrabbit.com`), `status` (`draft` | `ready` | `submitting` | `submitted` | `under_review` | `decision_pending` | `cancelled` | `rejected`), `step` (workflow sentinel — `photos` | `ticket_confirmed` | `evidence_gathered` | `generation_failed` | …), `ticket` (jsonb — pcnRef, vehicleReg, councilSlug, issuer, contraventionCode, contraventionDescription, location, issuedAt, amountPence), `councilSlug` (text FK to `councils.slug`, hoisted from ticket jsonb), `pcnImageUrl` (Blob), `processing` (jsonb — per-stage status: `{ocr: {status,completedAt}, draft: {status,error,completedAt}, …}`), `portalLookup` (jsonb — `PortalLookupSnapshot`), `grounds` (text[] — `CanonicalGroundId[]`), `notes`, `letterSubject`, `letterBody`, `letterWordCount`, `letterAddressedTo`, `strengthScore` (0–100), `strengthRationale`, `strengthImprovements` (jsonb), `knowledgePackUsed` (jsonb — `{usedIds, tokens}` audit), `preferredMethod` (`portal` | `email` | null), `serviceTier`, `timeline` (jsonb), `createdAt`, `updatedAt`.

**v0.3.9–v0.3.10 deletions**: `model_used` (text) and `cost_pence_millis` (numeric) were dropped. Per-call attribution lives in `ai_calls` now — sum `ai_calls.cost_usd WHERE appeal_id = ?` for total cost, or read `mode` per stage for model attribution.

### `councils`
Per-issuer config. `slug` (PK), `name`, `type` (`borough` | `tfl` | `corporation` | `other`), `appealPortalUrl`, `paymentPortalUrl` (separate from challenge portal — Lambeth uses this), `appealEmail`, `postalAddress`, `discountWindowDays` (default 14), `automationStatus` (`manual` | `automated_beta` | `automated_ga`), `submissionMethods` (jsonb), `logoUrl`, `logoBg`, `identifierHints` (jsonb — keywords the vision model uses to recognise this issuer), `createdAt`, `updatedAt`.

### `council_automation`
Per-council MCP recipe storage. `councilSlug` (PK + FK), `agentPrompt` (the submission prompt loaded by `runPortalAutomation`), `lookupAgentPrompt` (the lookup prompt for the Claude MCP path), `fieldHints` (jsonb — portal form labels + button text), `lastDryRun` (jsonb — event log + final result from `/admin/councils/<slug>/automation` dry-run), `lastDryRunOk` (`true` | `false` | null), `updatedAt`, `updatedBy`.

### `jobs`
The work queue. `id` (`job_<kind>_<sortkey>_<short>`), `kind` (`submit_appeal` | `pcn_lookup` | `generate_draft`), `appealId` (text — **NO FK constraint**, only a btree index — jobs can outlive deleted appeals), `payload` (jsonb), `status` (`queued` | `running` | `done` | `failed`), `attempts`, `maxAttempts` (default 3), `runAfter` (when to claim), `lockedAt`, `lockedBy` (worker id), `lastError`, `result` (jsonb), `progress` (jsonb — array of `JobProgressEvent`s the SSE stream serves), `createdAt`, `updatedAt`. Atomic claim: `SELECT … FROM jobs WHERE status='queued' AND runAfter < now() FOR UPDATE SKIP LOCKED LIMIT 1`. Stale-lock recovery: a `running` job with `locked_at < now() - 5 minutes` is reclaimable.

### `submissions`
Per-submit-attempt history. `id`, `appealId` (FK, cascade), `method` (`portal` | `email` | `mock`), `channel`, `councilReference`, `messageId` (email message-id when applicable), `screenshotUrl`, `status` (`submitted` | `failed`), `retries`, `costUsd`, `durationMs`, `createdAt`. Multiple rows per appeal allowed (retries are distinct).

### `inbound_messages`
Parsed inbound mail (council replies). `id`, `appealId` (FK, cascade), `messageId`, `subject`, `body`, `classification` (`cancelled` | `rejected` | `acknowledged` | `request_info` | `unknown`), `classificationRationale`, `classifiedModel`, `classifiedAt`, `receivedAt`.

### `appeal_photos`
PCN + evidence + warden photos. `id`, `appealId` (FK, cascade), `kind` (`pcn` | `evidence` | `warden`), `blobUrl`, `width`, `height`, `bytes`, `createdAt`.

### `payments`
Stripe PaymentIntent tracking. `id`, `appealId` (FK, `ON DELETE no action` — important for the merge sweep; see `mergeDuplicateDraftIfAny`), `userId` (nullable), `stripePaymentIntentId` (unique), `amountPence`, `currency` (`gbp`), `status` (`requires_payment_method` | `requires_confirmation` | `processing` | `succeeded` | `canceled` | `failed`), `lastError`, `createdAt`, `updatedAt`.

### `subscriptions`
Stripe Subscription scaffold for Care Plan. `id`, `userId` (FK, cascade), `stripeCustomerId`, `stripeSubscriptionId`, `priceId`, `status`, `currentPeriodEnd`, `cancelAtPeriodEnd`, `createdAt`, `updatedAt`. **Not yet billable** — webhook wiring pending.

### `care_plan_waitlist`
Pre-launch capture. `id`, `email`, `userId` (nullable), `source`, `createdAt`.

### `ai_calls` (added v0.3.9, migration 0015)
Per-Claude-call cost telemetry. `id`, `appealId` (FK, cascade), `jobId` (FK to jobs, `ON DELETE SET NULL`), `stage` (text — `council_id` | `ocr` | `lookup` | `draft` | `strength` | `submit` | `strengthen_notes` | `coach` legacy), `model`, `mode` (`cli` | `sdk` | `deterministic`), `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `costUsd` (numeric(10,6)), `durationMs`, `ok` (bool), `errorKind` (`timeout` | `rate_limit` | `parse` | `mcp` | `other`), `errorMessage`, `createdAt`. Indexes on `(appealId, createdAt)`, `(stage, createdAt)`, `(jobId)`. Reads: `getCostBreakdowns(appealIds[])` in `lib/server/aiCalls.ts` powers the admin Appeal Tickets cost columns.

### `notification_dispatches` (added v0.3.9, migration 0016)
Push dispatch audit. `id`, `userId` (FK, `ON DELETE cascade`), `appealId` (text — FK with `ON DELETE SET NULL` so audit survives appeal deletion), `event` (`validation_done` | `validation_failed` | `submission_done` | `submission_failed` | `council_replied`), `payload` (jsonb — full PushPayload), `result` (`sent` | `toggle_off` | `no_subscription` | `send_gone` | `send_failed` | `no_owner` | `no_vapid` | `no_appeal`), `reason`, `createdAt`. **One row per dispatch attempt including no-ops** — ops grep this table to answer "why wasn't user X notified?".

## Migration history

| # | File | Summary |
|---|---|---|
| 0000 | `0000_faithful_slapstick.sql` | Initial: users, appeals, councils, council_automation, payments, subscriptions, care_plan_waitlist |
| 0001–0006 | misc. | Various early v0.1–v0.2 changes |
| 0007–0009 | council seed + logos | `councils.logo_url` + `logo_bg`; Wikipedia thumb seeding |
| 0010–0013 | various | Submission methods, evidence schemas, KB audit, strength score |
| 0014 | knowledge_pack_used | `appeals.knowledge_pack_used` jsonb (KB audit trail) |
| 0015 | reset_and_ai_calls | **Created `ai_calls` table; dropped `appeals.model_used` + `appeals.cost_pence_millis`** |
| 0016 | notification_dispatches | **Created `notification_dispatches` table** |

Run history is in `apps/web/drizzle/meta/_journal.json`. Down migrations are not maintained — Drizzle's design is forward-only.

## Key FK realities

| Relation | Behaviour | Why |
|---|---|---|
| `appeals.councilSlug → councils.slug` | nullable, no cascade | OCR may not identify a council; appeals can move between councils via admin edit |
| `appeal_photos.appealId → appeals.id` | `ON DELETE cascade` | Photos always belong to one appeal |
| `submissions.appealId → appeals.id` | `ON DELETE cascade` | Per-attempt history dies with the appeal |
| `inbound_messages.appealId → appeals.id` | `ON DELETE cascade` | Same |
| `payments.appealId → appeals.id` | `ON DELETE no action` | Payment history survives appeal deletion for audit; the merge sweep clears these explicitly inside the transaction |
| `notification_dispatches.appealId → appeals.id` | `ON DELETE SET NULL` | Audit log survives so "why wasn't user X notified for THIS appeal" remains greppable |
| `notification_dispatches.userId → users.id` | `ON DELETE cascade` | User-deletion clears their notification history |
| `ai_calls.appealId → appeals.id` | `ON DELETE cascade` | Cost rows die with the appeal |
| `ai_calls.jobId → jobs.id` | `ON DELETE SET NULL` | Cost rows survive job purge for cost analysis |
| `jobs.appealId` | **NO FK at all** | Jobs may outlive deleted appeals. `mergeDuplicateDraftIfAny` deletes job rows explicitly to prevent orphans |
| `subscriptions.userId → users.id` | `ON DELETE cascade` | Stripe object survives in their dashboard; our row dies |

## JSONB shapes worth knowing

### `PortalLookupSnapshot` (`appeals.portal_lookup`)

```ts
{
  jobId: string | null,
  status: "pending" | "verified" | "invalid" | "skipped" | "overridden" | "error",
  verdict?: "open" | "paid" | "closed" | "not_found" | "expired" | "unknown",
  verdictReason?: string,
  photoUrls: string[],           // Blob URLs of warden photos
  metadata?: {
    pcnRef?: string,
    vehicleReg?: string,
    contraventionCode?: string,
    location?: string,
    issuedAt?: string,           // ISO 8601 (normalised at write boundary)
    amountPence?: number,
    discountUntil?: string,      // ISO 8601
    fullChargeFrom?: string,     // ISO 8601
    dueDateAt?: string,          // ISO 8601
    paidAt?: string,             // ISO 8601 (added to normaliser in v0.3.10)
    currentDuePence?: number,
    issuer?: string,
  },
  fetchedAt: string,             // ISO 8601
}
```

### `ProcessingStatus` (`appeals.processing`)

```ts
{
  ocr?: { status: "running" | "done" | "failed", completedAt?, error? },
  draft?: { status: "running" | "done" | "failed", completedAt?, error? },
  identifyCouncil?: { status: "running" | "done", completedAt? },
}
```

### `KnowledgePackAudit` (`appeals.knowledge_pack_used`)

```ts
{
  usedIds: string[],            // precedent IDs + code-brief IDs + council slug
  tokens: number,
}
```

### `JobProgressEvent[]` (`jobs.progress`)

```ts
Array<
  | { ts: string, kind: "status", message: string }
  | { ts: string, kind: "step", message: string }
  | { ts: string, kind: "thought", message: string }
  | { ts: string, kind: "screenshot", step: number, url: string, caption?: string }
  | { ts: string, kind: "metadata", field: string, value: string }
>
```

Streamed verbatim through `/api/jobs/[id]/progress` (SSE) + persisted for replay via `/api/appeals/[id]/submit-progress`.

## Indexes

| Table | Index | Purpose |
|---|---|---|
| `users` | `(email)` unique | Sign-in lookup |
| `appeals` | `(sessionId, createdAt DESC)` | Guest list query |
| `appeals` | `(userId, createdAt DESC)` | Signed-in list query |
| `appeals` | `(updatedAt)` | Reconciliation `since=` poll |
| `jobs` | `(status, runAfter)` | Worker `claimNext` query |
| `jobs` | `(appealId)` | Idempotency layer 1 query |
| `submissions` | `(appealId, createdAt DESC)` | History per appeal |
| `inbound_messages` | `(appealId, createdAt DESC)` | Council reply history |
| `ai_calls` | `(appealId, createdAt)` | Per-appeal cost breakdown |
| `ai_calls` | `(stage, createdAt)` | Admin per-stage analytics |
| `ai_calls` | `(jobId)` | Per-job cost rollup |
| `notification_dispatches` | `(userId, createdAt DESC)` | User audit |
| `notification_dispatches` | `(appealId, createdAt DESC)` | Appeal audit |
| `notification_dispatches` | `(event, createdAt DESC)` | Event-rate dashboards |
| `notification_dispatches` | `(result, createdAt DESC)` | Failure-mode analysis |

## Dev workflow

- `npm run db:generate` — generate a new migration from schema changes
- `npm run db:migrate` — apply pending migrations
- `npm run db:seed` — seed councils from `scripts/seed-councils.ts`
- `npm run db:studio` — Drizzle Studio (web UI)
- `scripts/reset-db.sql` — wipes appeals + child rows, keeps councils + admin users (run via `docker exec -i parkingrabbit-db psql -U snappeal -d snappeal < scripts/reset-db.sql`)
- `scripts/normalize-portal-dates.ts` — one-shot backfill of legacy `portal_lookup` dates to ISO

## Cross-refs

- The connection client + cache-key bump: `apps/web/lib/server/db/client.ts`.
- Per-call cost telemetry helpers: `apps/web/lib/server/aiCalls.ts`.
- The appeal service that mutates these tables: `apps/web/lib/server/appeals.ts` (`createAppeal`, `patchAppealDraft`, `persistPortalLookup`, `mergeDuplicateDraftIfAny`, `claimGuestAppealsForUser`).
- The job queue: [`job-queue.md`](job-queue.md).
- The submission flow that writes `submissions` + bumps `appeals.status`: [`submission-engine.md`](submission-engine.md).
- Date normalisation at the write boundary: [`date-handling.md`](date-handling.md).
- Notifications + audit log mechanics: [`notifications.md`](notifications.md).
- The smart-card state derivation from these columns: [`appeal-state-machine.md`](appeal-state-machine.md).
