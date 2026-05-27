# Submission engine

Last refreshed **2026-05-27 (v0.3.10)**.

The submission engine routes an appeal through the right send path — deterministic Playwright recipe, Claude MCP portal automation, email fallback, or mock — and persists the outcome on `appeals.portalLookup` + `submissions`. There are two flows: **lookup** (read-only PCN check, fires after the customer confirms ticket details) and **submission** (after payment, files the actual representation letter).

## Files

```
apps/web/lib/server/submission/
├── index.ts            # decision tree + runSubmission entry
├── enqueueLookup.ts    # POST /api/appeals/[id]/lookup helper
├── lookup.ts           # runPortalLookup: recipe-first → Claude MCP fallback
├── portal.ts           # Claude+Playwright MCP submission
├── email.ts            # email fallback
├── automation.ts       # per-council MCP prompts loader + dry-run
├── mcp-warm.ts         # prewarmMcp() at worker boot
├── _progress.ts        # SSE event helpers
├── recipes/            # deterministic Playwright walks (Phase 9)
│   ├── types.ts        # CouncilRecipe + RecipeSuccess | RecipeDrift | RecipeError
│   ├── index.ts        # registry + runDeterministicLookup
│   └── lambeth.ts      # Lambeth recipe
├── grounds/            # P11 canonical-slug → portal-label registry (v0.3.10)
│   ├── types.ts
│   ├── registry.ts
│   └── lambeth.ts
└── prompts/            # per-council Claude prompts
    ├── lambeth.ts
    ├── lambeth_lookup.ts
    ├── westminster.ts
    └── westminster_lookup.ts
```

## Lookup flow (validate-first)

`POST /api/appeals/[id]/lookup` is the customer-initiated trigger. The validate-first design (v0.3.9) requires the customer to tap "Confirm & validate with council" before any MCP token is spent — `step=ticket_confirmed` is the dam. `agreeTicket` in `TicketCard.tsx` POSTs to this route after stamping the step.

The route delegates to `enqueueLookupIfAutomated(appealId)` in `submission/enqueueLookup.ts`. That helper is the single source of truth for "should we kick a lookup?".

### Two-layer idempotency

The user's natural flow has two POST opportunities (`agreeTicket` then `useAutoValidate` backstop), and previously `startAppeal` POSTed a third (removed in v0.3.10). Without dedup, every one of those would enqueue a fresh job once the first hit `done`. Layer 1 only catches **currently in-flight** siblings; layer 2 catches **already-settled** verdicts:

```ts
// Layer 1 — any queued/running pcn_lookup for this appeal?
const existing = await db
  .select({ id: schema.jobs.id })
  .from(schema.jobs)
  .where(
    and(
      eq(schema.jobs.kind, "pcn_lookup"),
      eq(schema.jobs.appealId, appealId),
      inArray(schema.jobs.status, ["queued", "running"]),
    ),
  )
  .limit(1);
if (existing[0]) return { outcome: "in_flight", jobId: existing[0].id };

// Layer 2 — settled snapshot with a non-error status?
const settled = appeal.portalLookup;
if (settled && settled.status !== "error" && settled.jobId) {
  if (settled.status !== "pending") {
    return { outcome: "in_flight", jobId: settled.jobId };
  }
  // Layer 2 stale-jobId guard — pending snapshot might point at a
  // jobs row that's been deleted. Verify before returning in_flight.
  const liveJob = await db
    .select({ id: schema.jobs.id })
    .from(schema.jobs)
    .where(eq(schema.jobs.id, settled.jobId))
    .limit(1);
  if (liveJob[0]) return { outcome: "in_flight", jobId: settled.jobId };
  // Stale: fall through and enqueue fresh.
}
```

Only `status='error'` lookups roll the dice again. Pending / verified / invalid / skipped / overridden all hold their jobId. The stale-jobId guard catches the case where a worker crash purged the job row but left the `pending` snapshot behind.

### Recipe-first lookup path (Phase 9)

The worker pulls the queued `pcn_lookup` job and calls `runPortalLookup(appeal, jobId)` in `submission/lookup.ts`:

1. **Try `runDeterministicLookup(slug, input)`** from `recipes/index.ts`. If a recipe is registered for the council (Lambeth today), it runs a pure Playwright walk in an isolated Chromium context, ~10–20 s @ $0. Returns `RecipeSuccess | RecipeDrift | RecipeError`.
2. **On `RecipeSuccess`**, the worker records `ai_calls.mode = 'deterministic'` + `costUsd = 0`. `persistPortalLookup({ snapshot })` writes the verdict + metadata + photo URLs.
3. **On `RecipeDrift` or `RecipeError`**, fall through to the Claude MCP path.
4. **Claude MCP path**: `runAgentic` with the council's `_lookup.ts` prompt (Lambeth: `LAMBETH_LOOKUP_PROMPT`, Westminster: `WESTMINSTER_LOOKUP_PROMPT`, fallback: generic). The agent navigates the portal, fills the lookup form, scrapes the verdict + warden photos. ~60–120 s @ ~$0.30.

See [`deterministic-recipes.md`](deterministic-recipes.md) for the recipe pattern in detail.

### Snapshot persistence

`persistPortalLookup({ appealId, snapshot })` in `lib/server/appeals.ts`:

1. **Normalise dates** — `normalisePortalSnapshotDates` walks every key in `PORTAL_METADATA_DATE_KEYS` (`issuedAt`, `dueDateAt`, `discountUntil`, `fullChargeFrom`, `paidAt`) and coerces via `parseUkDateToIso`. dd/mm/yyyy → ISO at the single write boundary.
2. **Preserve `status='overridden'`** — if the existing snapshot has been customer-overridden (tapped "I disagree — let me appeal anyway"), the new write keeps `status='overridden'` regardless of what the worker passed.
3. **Backfill `appeal.ticket` from `metadata`** — fill-only, never overwrites user-typed values. Empty / null / "" / 0 in the existing ticket gets replaced by the council's value. Non-empty values stay; the discrepancy detector flags them separately (see `getTicketDiscrepancies`).

The customer's smart card flips from `validating` to `needs_decision` the moment the worker writes the verdict — the per-card poll (2.5 s while in `validating`) catches the `portalLookup.status` flip out of `pending`, and the status-snapshot fetch (now reactive to `portalLookup?.status` in its dep array) refreshes the derived `statusSnapshot` so `deriveCardState` doesn't keep returning `validating` because of a stale `stage: "status_check_pending"`. **v0.3.10 status-bridge fix** — see [`appeal-state-machine.md`](appeal-state-machine.md).

## Submission flow

After the £2.99 PaymentIntent succeeds, `/api/submit` enqueues a `submit_appeal` job. The worker pulls it and calls `runSubmission({ appeal, jobId, method })` in `submission/index.ts`. The decision tree (in branch order):

1. **No council/letter** → mock submission. Returns success without doing anything; for the dev fixture path.
2. **`PARKINGRABBIT_SUBMISSION_LIVE=0`** → mock. The escape hatch for iterating on the UI without burning Claude tokens.
3. **`method='email'` AND council has `appealEmail`** → `sendCouncilEmail()`. Renders the letter + customer contact info into a postable email, sends via the configured provider, records the message-id.
4. **Council `automationStatus ∈ {automated_beta, automated_ga}`** → `runPortalAutomation()` via Claude + Playwright MCP. On failure, the handler attempts the email fallback if `appealEmail` is set.
5. **Council has `appealEmail` but no automation** → `sendCouncilEmail()` direct.
6. **Otherwise** → mock.

### Portal automation guards

`runPortalAutomation` wraps `runAgentic` with:

- **10-minute wall-clock cap** + **30-step agent budget**.
- **`stopAtReview` safety brake**: when on (default in dev), the agent stops one click short of "Submit Challenge" and captures the review-page screenshot as the audit trail. The customer never sees this; admins inspect via `jobs.progress`.
- **Per-council prompt** loaded from `council_automation.agent_prompt` (DB-stored, seeded from the canonical `prompts/<slug>.ts` on first read). Edit + dry-run via `/admin/councils/<slug>/automation`.
- **`fieldHints`** — JSONB describing the portal's form labels + button text. Helps the agent disambiguate "Next" from "Pay now" decoys.

### Per-council prompts

`prompts/lambeth.ts` is the canonical example. The Lambeth challenge portal is a 4-step wizard (Grounds → Details → Contact → Complete). The prompt:

- Names the portal URL and the forbidden hosts (`lambethparking.paypcn.com` is the PAYMENT portal — never navigate there during a challenge).
- Walks the wizard step-by-step with verification waypoints + screenshots.
- Embeds the grounds-translation table via `renderTranslationRule(LAMBETH_GROUNDS)` at module load — single source of truth (P11, v0.3.10).
- Embeds the portal audit list via `renderPortalGroundsList(LAMBETH_GROUNDS)` so the agent verifies it's on the right page before clicking.
- Spells out the contact form fields, the two mandatory checkboxes, and the decoy buttons to skip.

Westminster has a similar prompt + lookup variant; other councils don't have prompts yet.

### Post-submission

`recordSubmission({ appealId, method, channel, councilReference, status, costUsd, durationMs })` writes one row to `submissions`. The worker bumps `appeals.status` (`submitting` → `submitted` / `failed`) + dispatches the `submission_done` / `submission_failed` notification via `dispatchAppealEvent`.

## Post-OCR appeal merge (v0.3.10)

`mergeDuplicateDraftIfAny(appealId)` runs at the end of `/api/extract` (not in submission, but adjacent enough to belong here). When the same viewer already owns an older draft for the same `(pcnRef, normalised vehicleReg)`:

- **Eligibility gates** — fresh appeal is `status='draft'` and `step !== 'ticket_confirmed'`; has `pcnRef + vehicleReg`; older draft is also `status='draft'`; ownership matches (same userId OR same sessionId); fresh `createdAt > older createdAt` (strict older-only direction so concurrent uploads can't merge in opposite directions).
- **Atomic transaction**: `db().transaction(async (tx) => { ... })`. Inside: UPDATE older's ticket (field-level merge, fresh's values fill empty slots), hoist `councilSlug` onto the FK column if older lacked it, explicit DELETE of duplicate's child rows that don't cascade (`jobs` has NO FK at all, `payments` has `ON DELETE no action`, `notification_dispatches` has `ON DELETE SET NULL` but cleared anyway for tidiness), then DELETE the duplicate appeal row. The remaining child tables (`appeal_photos`, `submissions`, `inbound_messages`, `ai_calls`) cascade naturally.
- **Returns** `{ mergedInto: <olderId> }` so the client repoints `currentAppealId`. The `/api/extract` response surfaces `mergedInto`; `uploadPcn`'s `.then` calls `setCurrentAppealId(mergedInto)`. The `/app/tickets` expand-effect (v0.3.10) falls back to the newest in-flight card when the URL's `?expand=<id>` points at a now-deleted duplicate.

## Idempotency on submission

`findRecentSuccessfulSubmission(appealId)` is checked before re-submitting — prevents a second `submit_appeal` job from re-filing if the appeal already has `status='submitted'` with a councilReference. Less of a concern than the lookup-twice issue (submission requires £2.99 payment) but the guard is there.

## Email fallback

`sendCouncilEmail({ appeal, letterBody, council })` renders the letter + customer contact details into a postable email. Provider configured via `EMAIL_PROVIDER` (Resend / Postmark / Brevo / SES). Reply-to set to `<appealId>@appeals.parkingrabbit.com` so council replies route to `/api/inbound` for parsing.

`/api/inbound` is the inbound mail webhook. Parses the council's reply, classifies (cancelled / rejected / acknowledged / request-more-info), persists to `inbound_messages`, dispatches `council_replied` notification.

## Mock submission

Returns a synthetic `SubmissionOutcome` with `method: 'mock'`, a fake council reference, and `status: 'submitted'`. Used in dev, in CI, and as the final fallback when neither portal nor email is configured for a council. The customer-facing surface treats it like a real submission so the smart card lifecycle still terminates cleanly.

## Cost split

| Path | Wall-clock | Cost |
|---|---|---|
| Deterministic recipe (Lambeth) | 10–20 s | $0 |
| Claude MCP lookup | 60–120 s | ~$0.30 |
| Claude MCP submission | 90–180 s | ~$0.30–0.50 |
| Email submission | <2 s | ~$0 |
| Mock | <100 ms | $0 |

The recipe path saves ~$0.30/lookup at scale; multiplied by every council we onboard a recipe for, this matters more than the £2.99 per-appeal margin would suggest.

## Cross-refs

- The recipe pattern: [`deterministic-recipes.md`](deterministic-recipes.md).
- Per-council grounds mapping: [`grounds-registry.md`](grounds-registry.md).
- Date normalisation at the write boundary: [`date-handling.md`](date-handling.md).
- The job queue that pulls these handlers: [`job-queue.md`](job-queue.md).
- The state machine the submission outcomes feed: [`appeal-state-machine.md`](appeal-state-machine.md).
- The schema for `portalLookup` + `submissions`: [`data-model.md`](data-model.md).
- The knowledge pack the drafter consumes: [`knowledge-base.md`](knowledge-base.md).
- The admin MCP automation editor: [`admin.md`](admin.md).
