# Context handoff

**Read this first if you're picking up ParkingRabbit cold.** Last refreshed **2026-05-28 (v0.3.13)**.

A web app + PWA that helps Londoners challenge a Penalty Charge Notice in a few taps. The customer scans the ticket; the AI reads it + the council portal; for £2.99 a paid appeal is drafted and submitted end-to-end with live transparency. This page is the consolidated current-state snapshot. Long-form session-by-session entries from v0.2.x → v0.3.7 live in [`archive.md`](archive.md). For the story behind a specific decision, `git log -- wiki/docs/handoff.md`.

## Stack at a glance

- **App**: Next.js 16 App Router + TypeScript, deployed at `apps/web/`. Dev server on `:3001`.
- **DB**: Postgres (Drizzle ORM). Local dev: `docker compose` → `127.0.0.1:5544`. Schema at `apps/web/lib/server/db/schema.ts`. 19 migrations applied (`0000`–`0018`).
- **Object storage**: Vercel Blob in prod (`BLOB_READ_WRITE_TOKEN`). Dev fallback writes to `apps/web/public/dev-blobs/`.
- **Auth**: HS256 JWT, hand-rolled (no dep), in an httpOnly cookie `parkingrabbit.token`. pbkdf2-sha256 (210,000 iters), 30-day TTL. Guest sessions identified by `x-parkingrabbit-session` header from `sessionStorage`. Sign-in claims guest sessionId onto userId.
- **AI**: Claude Code CLI in headless mode (`-p --output-format json|stream-json`). NO Anthropic SDK — the CLI uses the developer's OAuth login (or `ANTHROPIC_API_KEY` + `--bare`). Wrapper at `apps/web/lib/server/claude-cli.ts` exposes `runStructured` (Zod-validated one-shot) and `runAgentic` (with MCP tools). Default model: **`claude-sonnet-4-6`** — override via `CLAUDE_MODEL`.
- **Browser automation**: `@playwright/mcp` via `npx`, driven by Claude. Each council lookup or submission gets its own ephemeral workDir + Chrome profile.
- **Job queue**: Postgres-backed (`jobs` table) with `FOR UPDATE SKIP LOCKED`. Worker boots in-process via Next.js `instrumentation.ts` → `startWorker()`. Slots: 2 × `submit_appeal`, 3 × `pcn_lookup`, 1 × `generate_draft`. Stale-lock recovery on 5 min cutoff. Backoff: 30 s, 2 min, 5 min. `jobs.appeal_id` deliberately has **no FK** — jobs can outlive deleted appeals (the merge sweep handles that explicitly).
- **Notifications**: web-push dispatcher (`lib/server/push.ts`) with 410-Gone cleanup. `dispatchAppealEvent` per-event orchestrator + COPY registry. Every dispatch attempt — including no-ops (toggle off / no subscription / send failed) — writes one row to `notification_dispatches` (migration 0016) so admins can answer "why wasn't user X notified?".
- **Cost telemetry**: `ai_calls` table (migration 0015) — one row per Claude invocation with stage (`pcn_identify` / `pcn_extract` / `photo_check` / `lookup` / `draft` / `strength` / `submit` / `strengthen_notes`; legacy strings `council_id` / `ocr` / `coach` survive in historic rows), model, mode (`cli` / `sdk` / `deterministic`), input/output/cache tokens, costUsd, durationMs, ok, errorKind. Legacy `appeals.model_used` + `appeals.cost_pence_millis` columns dropped — read from `ai_calls` instead. `GET /api/stats/avg-durations` (added v0.3.13) returns rolling-14-day avg `duration_ms` per stage; the smart card's validating / drafting / submitting bubbles surface this as "We'll notify you when it's done. Usually takes ~Xs."
- **Payments**: Stripe PaymentIntent for the £2.99 appeal. Care Plan (£9.99/mo) subscription scaffold present but in waitlist mode — webhook wiring pending, not yet billable.

## Current product flow

1. **Scan** → `/app/scan` shows three buttons (Camera / Upload / Input manually). Tap one → `uploadPcn()` creates an appeal row, PATCHes the photo, fires `/api/extract`, redirects to `/app/tickets?expand=<id>`.
2. **OCR runs in TWO passes + a parallel coach** (`/api/extract`):
   - **Pass 1** (`identifyCouncil()`) — ~7 s on Sonnet. Returns `{issuer, councilSlug, pcnRef, vehicleReg, confidence}`. PATCHed onto the appeal mid-request so the `IssuerLogoReel` lands on the correct council logo while the full extract is still running. **v0.3.13**: also returns `pcnRef + vehicleReg` so a canonical-ticket lookup can short-circuit Pass 2 entirely when a fresh row already exists for the PCN.
   - **Canonical short-circuit (v0.3.13)** — after Pass 1, `findCanonicalTicket(councilSlug, pcnRef)` is consulted. If a canonical row exists AND its portal snapshot is still fresh, Pass 2 + coach are SKIPPED. Saves ~$0.10 + ~20 s per duplicate upload. If the canonical row belongs to ANOTHER user/session, `dedupAsCrossUserViewer()` instead links the current user as a viewer of the owner's appeal + DELETES the just-created appeals row — see "Appeals consolidation" below.
   - **Pass 2** (`extractTicket()`) — ~19 s on Sonnet (down from 52 s pre-v0.3.13). Schema trimmed to just `Ticket` (no per-field confidence, no contraventionDescription) so output tokens dropped ~10×. EXTRACT_PROMPT compressed from ~1500 to ~400 tokens. **Haiku 4.5 was tried + reverted** — it misread digits (LJ39952021 → LJ30052021, PN65LBU → PN85LBU); Sonnet's depth matters for pixel-level digit disambiguation.
   - **Coach** (`coachPhoto()`) — ~19 s on Sonnet, runs IN PARALLEL with Pass 2 via `Promise.all`. Wall-clock = max(extract, coach), not sum. Stage name in `ai_calls`: `photo_check` (renamed from `coach` v0.3.13).
   - Total `/api/extract` wall-clock: **~26 s fresh** / **~7 s on canonical-fresh dup** (was ~59 s pre-v0.3.13).
   - **Post-OCR same-user dedup**: `mergeDuplicateDraftIfAny(appealId)` runs when the user re-uploads the same PCN. Folds into the older draft in one transaction (FK sweep for `jobs`, `payments`, `notification_dispatches`; the rest cascade). The response surfaces `mergedInto` and the client repoints `currentAppealId`.
   - **`/api/extract` race guard (v0.3.x)**: each call generates a `runId` via `startOcrRun`; partial + final writes go through `applyOcrPartialIfFresh` / `applyOcrFinalIfFresh` which re-read the row and bail when a newer run has taken over. A late failure response can never overwrite a fresh success. Ticket writes use "fill empty only" merge — once a field has a value (user-edit, manual entry, prior pass), OCR cannot clobber it. Explicit retries via `retryOcrWithPhoto()` clear the OCR-extracted fields inside `startOcrRun` so a new photo can correct a previous wrong read.
3. **Pending review** — card shows editable PCN ref + vehicle reg + council picker. If OCR returned `amountPence=0` or `issuedAt=""`, conditional inputs appear (gated by a `touched` ref so the council can backfill them quietly if the user never typed; but once typed, the input stays mounted regardless). The user hits **Confirm & validate with council** → step is stamped `ticket_confirmed` AND `/api/appeals/[id]/lookup` is POSTed (with `x-parkingrabbit-session` so guests aren't 403'd). Card flips to `validating`.
4. **Lookup** — `enqueueLookupIfAutomated()` enqueues a `pcn_lookup` job with two-layer idempotency:
   - **Layer 1**: any existing queued/running `pcn_lookup` for this appeal → return that jobId.
   - **Layer 2**: settled snapshot with non-error status + a jobId → return that jobId. Pending-snapshot stale-jobId guard: if `status='pending'` and `jobs.id` no longer exists, fall through and enqueue fresh (so a worker-purge or admin delete doesn't strand the appeal).
   - Worker tries `runDeterministicLookup(slug)` first. If a recipe is registered for the slug, the Playwright walk runs (Lambeth: ~10–20 s @ $0). On `drift: true` or error, falls back to `runPortalLookup` (Claude MCP, ~60–120 s @ ~$0.30).
   - `persistPortalLookup(snapshot)` writes the result. All `metadata` date fields go through `normalisePortalSnapshotDates` so dd/mm/yyyy strings land as ISO. Backfill into `appeals.ticket` is fill-only (never overwrites user-typed values).
5. **Card transitions** — the per-card poll (validating mode, 2.5s, max 120 ticks) refetches `/api/appeals/[id]` until `portal.status !== 'pending'`. As soon as the verdict lands, the status-snapshot fetch effect re-runs (its deps include `portalLookup?.status` + `fetchedAt`) and `deriveCardState` flips the kind to `needs_decision` — no manual refresh required.
6. **Pay/Appeal decision** (`needs_decision`) — three tiles: **Appeal £2.99** (primary), **Pay yourself** (free deep-link to the council payment URL), **Apple/Google Pay** (placeholder, "Coming soon"). "Edit details" pops back to the confirm view.
7. **Appeal tap** → `startAppeal()` just PATCHes `preferredMethod=portal` and re-derives. It used to POST a fresh `/lookup` — that's gone (the v0.3.5 leftover that caused the "lookup twice" issue; `agreeTicket` is the single trigger now).
8. **Build appeal** (`gathering_evidence`) — single composer ("What happened?") + Common-reason pills (clamped to 3 rows). The **CouncilCheckChip** at the top narrates the lookup state (pending → streams the live MCP agent thought; verified → green pill or diff card; error → amber "we'll try again").
9. **Lookup verdict gates the draft**:
   - `open` / `expired` → continue.
   - `paid` / `closed` / `not_found` → card transitions to `appeal_not_possible` with an explainer + override link. No letter drafted, £2.99 never reached.
10. **Start drafting** → `confirmEvidenceAndDraft()` stamps `step=evidence_gathered`. A separate draft-kickoff `useEffect` watches for both conditions (`step===evidence_gathered` AND lookup-settled, verdict-not-bad) and fires `/api/generate-stream` exactly once. The drafting body shows the **Council confirms** structured block (every populated field from `portalLookup.metadata`) above an inline status row.
11. **Letter ready** (`letter_ready`) — rendered letter + £2.99 Submit CTA + strength score (green ≥80, amber 50–79, red <50 with "Add more evidence" affordance that re-scores without redrafting).
12. **Submit** → `submitting` → `runSubmission()` (Playwright MCP fills the council portal OR email fallback) → `submitted`.

If drafting fails, `markAppealFailed(id, message)` stashes the error into `processing.draft.error`. The card surfaces a **DraftingFailedRow** with the message + **Try again** button — `retryDraft()` PATCHes `step=evidence_gathered` and clears the draft-kickoff ref so generate-stream re-fires.

## State machine (17 CardKinds)

`scanning`, `processing`, `pending_review`, `validating`, `needs_decision`, `gathering_evidence`, `drafting`, `letter_ready`, `submitting`, `submitted`, `terminal`, `appeal_not_possible`, plus 5 failure kinds: `image_issue`, `image_unclear`, `info_needed`, `extraction_failed`, `council_lookup_failed`.

Two sentinels on `appeal.step`: `EVIDENCE_DONE_STEP = "evidence_gathered"` (gate from gathering_evidence to drafting) and `TICKET_CONFIRMED_STEP = "ticket_confirmed"` (gate from pending_review to needs_decision). Failure sentinel: `GENERATION_FAILED_STEP = "generation_failed"` (drafting → retry).

Full enumeration + the derive ladder lives in `lib/deriveCardState.ts`. Per-kind UI lives in `components/TicketCardBody.tsx`. The smart card itself (`components/TicketCard.tsx`, ~1,900 lines after the v0.3.10 modularization) extracted its sub-components into `components/ticket/{StatusPill,DeleteTicketButton,Field,FailureActions,SubmissionStatusBits}.tsx`.

## Pricing (live + planned)

| Tile / SKU | Status | Price | Notes |
|---|---|---|---|
| **Appeal £2.99** | Live | £2.99 one-off | Stripe PaymentIntent. `PRICE_PENCE = 299` in `lib/server/stripe.ts`. |
| **Pay yourself** | Live | Free | Deep-link to council payment URL. No payment processed by us. |
| **Apple/Google Pay** | Coming soon | TBD | Inert tile in `<PayAppealTiles>`. |
| **Care Plan** | Waitlist (scaffolded) | £9.99/mo | Subscription product not yet billable. `subscriptions` + `care_plan_waitlist` tables exist; Stripe webhook pending. |

## Models

`claude-sonnet-4-6` is the default for every stage (council_id, ocr, lookup MCP, draft, strength, submission MCP, strengthen_notes). Override via `CLAUDE_MODEL`. All calls go through `lib/server/claude-cli.ts` — single entry point. Per-call attribution lands in `ai_calls.model` so a future model split per stage is a config change, not a code one.

## Recent milestones (newest first)

### v0.3.13 (2026-05-27 → 2026-05-28)

A very long iterative session covering speed, UX merges, the appeals-row consolidation, and the cross-user canonical reuse. Verified end-to-end via mobile MCP Playwright with the live Lambeth ticket. Branch: `feat/ticket-normalisation`. Uncommitted at end of session — handoff carries a `git status` + open-tasks pointer for the resumer.

#### Strand A — `/api/extract` rewritten for speed + correctness

OCR wall-clock dropped from **~59 s to ~26 s** (fresh upload) / **~7 s** (canonical-fresh duplicate), without a correctness regression.

- **Pass 1 (`identifyCouncil`) extended** to return `pcnRef + vehicleReg` alongside the council. Output schema grew by 2 string fields (~+1 s); enables the canonical short-circuit below.
- **Pass 2 (`extractTicket`) schema trimmed**: per-field `confidence` block dropped (no UI consumer remained after the form refactor); `contraventionDescription` dropped (long-form prose was the biggest single output field; portal lookup fills it in later). EXTRACT_PROMPT compressed from ~1500 to ~400 input tokens.
- **Photo-coach un-merged** into `coachPhoto()` (separate Claude call) and run IN PARALLEL with Pass 2 via `Promise.all`. Wall-clock = `max(extract, coach)` instead of sum. The v0.3.10 merge was undone deliberately: it dropped cost but bloated the combined schema to ~500 output tokens, serialising the work into one slow call.
- **Haiku 4.5 attempted + reverted** for Pass 2. It saved ~25 s but misread digits on a real Lambeth ticket (`LJ39952021 → LJ30052021`, `PN65LBU → PN85LBU` — the 9↔0 / 6↔8 confusion). Pixel-level digit disambiguation needs Sonnet's depth. The comment in `ai.ts:extractTicket` records the attempt + reason for the revert.
- **Canonical short-circuit when fresh**: after Pass 1, `findCanonicalTicket(council, pcnRef)` is consulted. If a fresh canonical row exists, Pass 2 + coach are skipped entirely and the canonical data is written via `applyOcrFinalIfFresh`. Saves ~$0.10 + ~20 s per duplicate upload.
- **Run-id race guard** added in v0.3.x and untouched here: `startOcrRun` stamps a unique `runId` on `processing.ocr`; every later write goes through `applyOcrPartialIfFresh` / `applyOcrFinalIfFresh` which re-read the row and bail when the runId has been superseded by a newer upload. Closes the "late failure overwrites success" class of bug.
- **`ai_calls.stage` rename**: `council_id` → `pcn_identify`, `ocr` → `pcn_extract`, `coach` → `photo_check`. The `AiCallStage` type union still includes the legacy strings so historic rows type-check; new writes use the new names.

#### Strand B — Appeals-row consolidation: one row per canonical PCN

The hypothesis the user pushed for: when User B uploads a PCN that User A already has an appeals row for, link B as a viewer of A's appeal instead of spawning a duplicate. Single record per `(council, pcnRef)`.

- **Migration 0018** creates `appeal_viewers (appeal_id, user_id, session_id, joined_at)` with PK `(appeal_id, session_id)`. Owner stays on `appeals.user_id` / `appeals.session_id`; the join table tracks SECONDARY viewers.
- **`linkAsViewer(appealId, userId, sessionId)`** (`lib/server/viewer.ts`) — idempotent INSERT … ON CONFLICT DO NOTHING.
- **`resolveAccess(viewer, appeal, sessionId)` → `"owner" | "shared" | "none"`** — async version of `canViewAppeal`. Admins always `"owner"`. Owner check is the same sync logic; falls through to a join-table query for shared access. `canViewAppeal` (sync) stays in place for code paths that only care about owner status (e.g. PATCH gate — shared viewers cannot mutate).
- **`dedupAsCrossUserViewer(newAppealId, canonicalTicketId)`** in `lib/server/appeals.ts` — finds the OLDEST OTHER appeals row for the canonical ticket, links the current user as a viewer, DELETES the just-created appeals row (the FK cascade drops `appeal_photos`/`jobs`/`ai_calls`/etc tied to it), returns `{mergedInto}`. Skips when the only existing row belongs to the same user/session — that's the case `mergeDuplicateDraftIfAny` already handles.
- **`/api/extract` wires the dedup** right after Pass 1's canonical-lookup. If `dedup` returns non-null, the response includes `mergedInto + crossUserDedup: true` and the client repoints its `currentAppealId`.
- **`listAppealsForViewer`** extended to OR-union shared appeals (via a join on `appeal_viewers`) with owned appeals. Per-row `isViewerOnly` is computed by checking whether the row's `id` was in the owned set.
- **`toRecord`** redacts owner-only fields when `isViewerOnly` (letter body / subject / word count / addressedTo, grounds, notes, active job ids, strength score + rationale + improvements, knowledge pack, reply email). The canonical ticket data (issuer, pcnRef, vehicleReg, contraventionCode, issuedAt, location, amountPence) and portal verdict stay visible — they're public facts about the PCN. Exported `redactAppealForViewer` for routes that already have an `AppealRecord` and want the same redaction without an extra DB round-trip.
- **`/api/appeals/[id]` GET** uses `resolveAccess`. Owner gets the full payload; shared viewer gets `redactAppealForViewer(appeal)`; none returns 403. PATCH stays owner-only via `canViewAppeal`.
- **`SharedViewerBody`** (`components/TicketCardBody.tsx`) — early-out at the top of the body switch when `appeal.isViewerOnly`. Renders a "Shared with you" banner + a read-only canonical-fields summary (council, PCN ref, registration, council verdict, status). No edit form, no Confirm button, no Pay/Appeal tiles.
- **`TicketCard`** gates the Delete button + lifecycle-step children (which carry Retake / Choose-another / Manual-entry buttons) on `!isViewerOnly`.
- **Verified end-to-end via MCP**: User A uploads → 1 appeal + 1 ticket. Session storage cleared (simulating User B as a different guest) → upload SAME ticket → DB has 1 appeal + 1 ticket + 1 viewer link. User B's UI shows the "Shared with you" banner + canonical fields, no controls. See `final-10-shared-viewer.png` / `final-11-shared-viewer-after-reload.png`.

#### Strand C — Phase 2 cross-user canonical reuse (the foundation)

Shipped before Strand B and is what made Strand B viable. The `tickets` canonical row already existed (v0.3.12, Step 1-4b — see prior commits on `feat/ticket-normalisation`); this strand added the consumer-side reuse:

- **`findCanonicalTicket(councilSlug, pcnRef)`** in `lib/server/tickets.ts` — returns the canonical OCR-derived fields + the cached portal snapshot + a freshness flag (verdict-aware TTL ladder, same as `getCachedSnapshot`). Returns null when no canonical row exists. The OCR fields are always returned regardless of snapshot freshness — they describe the physical PCN and don't go stale.
- **`/api/extract` overlay-on-Pass-2** (when not short-circuiting): canonical fields overlay onto Pass 2's output before `applyOcrFinalIfFresh` writes. Canonical wins WHERE canonical has a value; Pass 2 fills WHERE canonical is null. Audit log fires `cache_hit` with `event: extract_canonical_reuse`.
- **Reset script extended** (`scripts/reset-db-for-e2e.ts`) — now truncates `tickets` and `ticket_normalisation_audit` too (it pre-dated those tables).

#### Strand D — Duplicate-input collapse (one editable surface on the smart card)

User reported that "after OCR it asks me to edit/input details on 2 UIs — one on the ticket and the other comes after as a modal". The off-ticket modal was the `/app/manual-entry` page navigation from the failure card.

- **`/app/manual-entry/page.tsx`** is now a tiny back-compat redirect (`?appealId=…` → `/app/tickets?expand=<id>&inputManual=1`, else `/app/tickets`). The old 470-line wizard is gone.
- **`<TicketDetailsForm>`** (`components/ticket/TicketDetailsForm.tsx`) is the SINGLE editable surface: image preview + (optional) photo-coach badge + PCN ref input + Registration input + Confirm button. **Council picker dropped from the form** — handled by the header's badge tile. Per user directive: amount NOT asked (OCR detects), issue date NOT asked (portal returns).
- **Mounted in three places**: `PendingReviewCard` (happy path), `ReadingFailureActions` (expand-on-tap on the failure surface), `ReadingPCNActive` (slow-OCR "Taking longer than usual?" helper). The slow-OCR helper used to `router.push('/app/manual-entry')` — now expands the form inline on the same card.
- **Header de-dup**: `TicketCardHeader` takes `hideIdentityLine` and suppresses the `pcnRef · vehicleReg` line + location row during `pending_review`. Otherwise the user saw the same data in the header AND in the editable form below it (the "asks twice" symptom).
- **`/app/scan` "Input manually" tile** now creates a fresh draft via `ensureCurrentAppeal()` and routes to `/app/tickets?expand=<id>&inputManual=1`. The list page reads `inputManual=1` and pre-expands the inline form via the `autoExpandManualEntry` prop chain.

#### Strand E — State-machine race fix ("Couldn't read all details" panic after Confirm)

`deriveCardState`'s `pending_review` early-out excluded `step === TICKET_CONFIRMED_STEP`. The race: `agreeTicket` PATCHes step=confirmed (~50 ms) THEN POSTs `/lookup` (~500 ms+) which sets `portalLookup.status='pending'`. In that 500 ms window step was confirmed but portal was still null, so the state fell through pending_review's exclusion → into the `image_unclear` branch → user briefly saw "Couldn't read all details" on a perfectly valid ticket. Fix: explicit branch — `hasAllRequired && step === TICKET_CONFIRMED_STEP && !portal` → `validating` with caption "Starting council check…".

#### Strand F — Notification permission timing

Moved the notification permission prompt from the £2.99 Appeal-tap moment (in `startAppeal`) to the Confirm-validate tap (in `agreeTicket`). User opts into push notifications BEFORE the long council-portal wait, not after. Skip-once string `"appealTap"` preserved on the server so users already prompted aren't re-prompted.

#### Strand G — Avg AI-call duration ETAs on the bubbles

- **Server**: `getAvgStageDurationsMs()` in `lib/server/aiCalls.ts` — `SELECT stage, AVG(duration_ms) FROM ai_calls WHERE ok=true AND created_at >= now() - interval '14 days' GROUP BY stage`. Endpoint at `GET /api/stats/avg-durations` with 5-min in-memory cache + single-flight dedup.
- **Client**: module-level cache + `useAvgDurations()` hook + `formatEta(ms)` formatter (`12_400 → "~12s"`, `38_900 → "~40s"`, `65_000 → "~1 min"`).
- **UI**: validating / drafting / submitting bubbles render "We'll notify you when it's done. Usually takes ~Xs." when a positive average exists for the stage. Suppressed gracefully when no data.

#### Strand H — Letter SSE: real streaming, auto-collapse on done

The client used to fire `void fetch('/api/generate-stream')` and discard the response, relying on the 3 s poll loop to show the letter once persisted. Now the client consumes the SSE chunks via `consumeSSE` and accumulates them into a `streamingBody` state passed down to `<LetterPreview isStreaming>`. On the streaming → settled edge, the preview auto-collapses after 1.4 s so the blue Submit CTA below it is immediately visible. Server-side chunk pacing slowed from 80c/30ms to 24c/40ms (~600 c/s) so the writing reads as legible typing.

#### Strand I — Splash logo white silhouette

`ParkingRabbitSplash` uses an inline `<img>` with `filter: invert(1) contrast(2)` to convert the navy-shield-on-transparent PNG into a pure-white shield + black rabbit + transparent background, all in CSS. The shared `<ParkingRabbitMark>` still uses the canonical navy mark everywhere else.

#### Strand J — Admin appeal-detail redesign (closed 2026-05-28)

The three admin-side tasks opened during the v0.3.13 session landed as one redesign of `app/admin/appeals/[id]/page.tsx` (~185 → ~1,130 lines, server-only via native `<details>`). Verified by minting an admin JWT, fetching the page over HTTP, and screenshotting the rendered DOM (no error markers, 200 OK on both a Lambeth and a Westminster appeal).

1. ~~**MCP screenshots gallery**~~ — slotted into the new categorised gallery as the "MCP screenshots" section. Source: `jobs.progress` events with `kind='screenshot'`, grouped by `jobId`, sorted by `step`, each captioned with `step N · <caption>`.
2. ~~**Per-call activity/thinking log**~~ — every `ai_calls` row is now a `<details>`-expandable summary. Expanded view shows `errorKind`/`errorMessage` for failures, cache read/write tokens, the linked `jobId`, and for MCP calls the windowed slice of `jobs.progress` events (Status / Steps / Thinking / Metadata captured). One-shot calls (extract/draft) get an explicit empty-state — we don't persist a thinking transcript for those today. The window is `[ai_calls.createdAt − 500ms, +durationMs + 2000ms]`, which works for the typical 1-ai_call-per-job MCP pattern but would double-count if a job retried; tighten if retries become common.
3. ~~**Rich metadata + categorised image gallery**~~ — the chrome the other two slot into. Top-to-bottom: header (id / status / tier / step / method / owner email / timestamps), 5 KPI tiles (Claude spend, agent wall-clock, portal verdict, strength, image count), identity grid (canonical ticket panel reading from `tickets` row with `appeals.ticket` jsonb fallback; ownership panel listing owner + shared `appeal_viewers` joined to `users.email`, grounds, payments), council verdict panel, processing-state + letter row (with strength callout when score < 80), categorised gallery (PCN / Warden ∪ tickets.portalSnapshot / Evidence / MCP / Submission), expandable ai_calls table, jobs/submissions/inbound lists, and a "Raw" footer with collapsed `ticket` / `timeline` / `processing` / `knowledgePackUsed` JSON dumps.

Dev affordance shipped alongside: `scripts/fetch-admin-page.ts` mints a 1-hour admin JWT from `AUTH_SECRET`, fetches an admin page over HTTP (with `--screenshot` to save a full-page PNG via Playwright, with the splash overlay pre-skipped via sessionStorage). Useful for smoke-testing admin server components without a sign-in flow.

None of this blocks the consumer flow. Strand B's "Open product questions" from this milestone (viewer notification routing, opt-out, terminal-state behavior) remain open.

#### Open product question carried forward

`appeal_viewers` ships as v0.3.13's first cross-user-share primitive. The privacy boundary is "letter body + grounds + notes + scoring stay with the owner; canonical ticket fields + portal verdict are shared". Open questions for future product passes:
1. Should viewers ever be able to start their OWN appeal for the same PCN (opt-out of the shared model)?
2. If A's appeal is in a TERMINAL state (paid / submitted / closed), is B's view "tracking only" or do they get to start fresh?
3. Notification routing — do shared viewers get push notifications on the appeal's status changes, or only the owner?
4. Two strangers sharing a plate (cloned plates, fleet handovers) — accept the privacy collateral or expose an "I'm a different person" override?

These can be answered by usage data once a few cross-user dedups have fired in production.

### v0.3.10 (2026-05-26 → 2026-05-27)

A long session that landed two major strands plus a deep code-review pass that caught and fixed 15+ defects. Grouped by theme:

#### Strand A — Brand rename: Snappeal → ParkingRabbit

Full pass over the repo (273 modified files). Identifier rule: `Snappeal` → `ParkingRabbit`, `snappeal` → `parkingrabbit`, `SNAPPEAL` → `PARKINGRABBIT`. Env vars renamed (`PARKINGRABBIT_MODE`, `PARKINGRABBIT_DISABLE_WORKER`, `PARKINGRABBIT_SUBMISSION_LIVE`, `PARKINGRABBIT_SKIP_PAYMENT_CHECK`, `PARKINGRABBIT_MCP_HEADED`, `PARKINGRABBIT_ALLOW_REAL_SUBMIT`, `NEXT_PUBLIC_PARKINGRABBIT_FAKE_PAYMENT`, `NEXT_PUBLIC_PARKINGRABBIT_SHOW_MCP_LIVE_VIEW`, `PARKINGRABBIT_GENERATE_CONCURRENCY`, `PARKINGRABBIT_CLAUDE_MODE`). Wire-protocol renames: guest-session header `x-snappeal-session` → `x-parkingrabbit-session`; JWT cookie `snappeal.token` → `parkingrabbit.token`; CSS tokens `snappeal-*` → `parkingrabbit-*`; `globalThis.__snappeal*` cache keys → `__parkingrabbit_db_v2__` / `__parkingrabbit_sql_v2__` (the `_v2` suffix flushes a stale client cached during the rename window). Component rename `SnappealSplash.tsx` → `ParkingRabbitSplash.tsx`. LICENSE email `hello@parkingrabbit.com`.

**Intentionally preserved as `snappeal`** (with inline comments): Postgres role + db + password + volume identifier in `docker-compose.yml` + the matching `DATABASE_URL` credentials + `-U snappeal -d snappeal` in `scripts/reset-db.sql`. They tie to the running role table inside the existing `snappeal_snappeal_db` Docker volume — renaming would orphan dev data. Container names (`parkingrabbit-db`, `parkingrabbit-wiki`, `parkingrabbit-tunnel`) and the wiki container alias on `caddy_default` were rebranded.

Action on first pull: the auth cookie name changed, so users are signed out once. A dev-server restart picks up the new env var names + the renamed `globalThis` cache keys.

#### Strand B — Per-council grounds-translation registry (P11)

New `apps/web/lib/server/submission/grounds/` tree owns the canonical-slug ↔ council-portal-radio-label mapping. Pattern:

- `grounds/<slug>.ts` exports a `CouncilGroundsMapping` (council slug + display name + verbatim portal grounds list + canonical-slug → portal-label table + fallback row + `verifiedAgainst` provenance pointer).
- `grounds/registry.ts` is the central lookup: `getCouncilGroundsMapping(slug)`, `resolveCouncilGroundLabel(slug, canonicalGrounds)` (pre-resolves the chosen portal row from the appeal's grounds, fallback-aware), `renderTranslationRule(mapping)` (renders the table as a markdown bullet list for prompt embedding), `renderPortalGroundsList(mapping)` (numbered audit hint for the agent), `listRegisteredCouncils()`.
- `grounds/lambeth.ts` shipped first — verified against four real portal screenshots (step 1 grounds, step 2 details, step 3 contact, step 3 populated). The 10 portal rows + the 11-canonical-slug mapping are encoded here.

Lambeth's slug-table previously lived inline in `prompts/lambeth.ts` and used some stale slugs (`tmo-invalid`, `broke-down`, `already-paid`) that pre-dated the canonical taxonomy in `lib/grounds-catalog.ts`. The registry uses the **correct 11** `CanonicalGroundId` keys (`contravention-did-not-occur`, `signage-unclear`, `valid-permit`, `blue-badge`, `loading-unloading`, `breakdown`, `medical-emergency`, `vehicle-not-mine`, `penalty-exceeds-amount`, `procedural-impropriety`, `traffic-order-invalid`).

The Lambeth submission prompt now imports `renderTranslationRule(LAMBETH_GROUNDS)` and `renderPortalGroundsList(LAMBETH_GROUNDS)` and composes the TRANSLATION RULE / portal audit blocks at module load — single source of truth. `LAMBETH_FIELD_HINTS.groundsRadioOptions` references the registry's `portalGrounds` directly.

To onboard a new council (Westminster, Camden, RBKC, Islington, TfL, City of London): drop a `grounds/<slug>.ts` with verified portal rows + translate table and register it. See [`architecture/grounds-registry.md`](architecture/grounds-registry.md) for the full pattern.

#### Strand C — AI pipeline consolidation

- **Combined OCR + photo-coach** into one Claude vision call: `extractTicket()` now returns `{ ticket, confidence, coach, modelUsed, costUsd }` from a single round-trip. The separate `coachPhoto()` function + `COACH_PROMPT` are deleted. Per-upload cost drops from ~$0.129 to ~$0.075 (the embedded coach output costs ~$0.005 in extra tokens; the saved $0.060 was the duplicate vision pass).
- **PhotoCoach schema is now lenient**: `PhotoCoach.catch({...}).default({...})` substitutes a neutral "good / no advice" verdict when Claude returns a malformed coach block (quality outside enum, advice > 280 chars, etc.). This was the root cause of "Rabbit couldn't finish reading this PCN" — one off-shape coach field was failing the whole extract.

#### Strand D — Post-OCR appeal merge (dedup at the right boundary)

`mergeDuplicateDraftIfAny(appealId)` in `lib/server/appeals.ts`. Eligibility: fresh appeal is `status='draft'` and `step !== 'ticket_confirmed'`; has `pcnRef + vehicleReg`; an OLDER draft owned by the same viewer (signed-in userId OR guest sessionId) shares the same `(pcnRef, normalised vehicleReg)`. Strict older-only direction (`lt(createdAt, fresh.createdAt)`) so concurrent uploads can't merge in opposite directions.

Wrapped in `db().transaction(async (tx) => { ... })`. Explicit cleanup of child rows that DON'T cascade (the previous docstring claimed full cascade — it lied): `jobs` (NO FK at all → orphans the worker would later try to pick up), `payments` (`ON DELETE no action` → would throw FK 23503 and leave the older row already mutated), `notification_dispatches` (`ON DELETE SET NULL` → still cleared inside the txn for tidiness). Then `tx.delete(appeals)`. `appeal_photos`, `submissions`, `inbound_messages`, `ai_calls` cascade naturally.

The surviving row's top-level `councilSlug` FK column is hoisted from the merged ticket if the older row lacked it. The route surfaces `mergedInto: <olderId>` to the client; `uploadPcn`'s `.then` reassigns `currentAppealId` so follow-up PATCHes target the right row.

#### Strand E — Two-layer lookup idempotency + stale-jobId guard

`enqueueLookupIfAutomated()` previously only caught queued/running siblings (layer 1). Layer 2 added: a previous lookup that settled with any non-error status (`verified`/`invalid`/`skipped`/`overridden`/`pending`) AND has a `jobId` → return `in_flight` with that jobId without enqueueing fresh. The two flow triggers (`agreeTicket` then `startAppeal`) were both enqueueing a fresh job once the first hit `done` — that was the "lookup twice in a row" you saw in admin.

Pending-snapshot stale-jobId guard: if `status='pending'` and the referenced `jobs.id` no longer exists (admin purge, worker-crash cleanup), fall through to enqueue a fresh job rather than handing the client a dead jobId.

Plus: `startAppeal` no longer POSTs `/lookup` — the lookup fires from `agreeTicket` (the validate-first trigger). The leftover v0.3.5 POST is gone.

#### Strand F — UK-date normalisation at the write boundary

New utility `lib/parseUkDate.ts`: `parseUkDate(raw)` + `parseUkDateToIso(raw)`. **UK-format regex tried FIRST** (catches `dd/mm/yyyy`, `dd-mm-yyyy`, `dd.mm.yyyy` with optional `HH:MM[:ss]`), native `Date(...)` only when the regex doesn't match. Dates built via `Date.UTC(...)` so the same input always round-trips to the same ISO regardless of server TZ (no BST/UTC drift for date-only strings). V8 silently US-parses `12/05/2026` as Dec 5 — the previous native-first order would have shipped the wrong month for any day ≤ 12.

`formatShortDate` (in `lib/format.ts`) delegates to `parseUkDate`. `persistPortalLookup` normalises `metadata.{issuedAt, dueDateAt, discountUntil, fullChargeFrom, paidAt}` before write — single normalisation boundary, every reader sees ISO. `scripts/normalize-portal-dates.ts` is the one-shot backfill for legacy rows. See [`architecture/date-handling.md`](architecture/date-handling.md).

#### Strand G — Validate-first gate (carried from v0.3.9, reinforced)

Customer must tap "Confirm & validate with council" on `pending_review` before any MCP token is spent. `step=ticket_confirmed` is the dam. `useAutoValidate` hook is the backstop for old tickets, gated on `step === TICKET_CONFIRMED_STEP`. Cost story: OCR ~$0.075 (combined) + council-id ~$0.04, MCP only when the customer has eyeballed the data.

v0.3.10 fix: both `agreeTicket` AND `useAutoValidate` now send `x-parkingrabbit-session` on their `/lookup` POSTs. Previously guests hit a silent 403 — and `useAutoValidate` added the appealId to its `FIRED_SESSION` dedup set BEFORE the fetch, so a single 403 permanently disabled the backstop until tab close. Now: the dedup add stays sync (concurrent mount protection) but a 403 response calls `FIRED_SESSION.delete(appealId)` so a refreshed session can retry.

#### Strand H — UI polish + status-bridge fix

- **De-duped status pills**: the absolute `ActivityIndicator` in TicketCard's top-right was rendering on top of the £ amount + duplicating the inline status pill in the header. Removed; the header pill is now the single source of truth.
- **Filter row sized for 390 px**: All 4 pills (All / To Pay / Challenging / Resolved) fit at iPhone width.
- **Status-snapshot stale bridge**: `useEffect` deps now include `appeal.portalLookup?.status` + `fetchedAt`. Previously the validating-stub `{stage: "status_check_pending"}` cached at mount survived the verdict arriving, leaving the card on "Checking council" until a manual refresh — `deriveCardState` was still seeing the stale snapshot's stage. Fixed.
- **`needsAmount` / `needsDate` use userTouched refs**: input stays mounted while the user types AND auto-collapses if the council lookup fills the value before they touched it. Best of both worlds. Replaces the v0.3.10 first-pass latch which left the input mounted-but-empty if the council backfilled.
- **/app/tickets expand fallback**: when `?expand=<id>` lands on an appeal that got merged away (the duplicate), auto-expand the newest in-flight card instead of an empty slot. The reconciliation poll then picks up the merged row.
- **TicketCardBody amount-input bug**: the conditional render gated on `ticket.amountPence === 0` was unmounting the input on the first keystroke (parent received the value, conditional flipped, input gone). The prop-sync `useEffect` was ALSO overwriting in-progress typing because it had `amountPence` + `issuedAt` in its deps + a lossy pounds↔pence round trip. Both fixed.

#### Strand I — Single-page manual entry

`/app/manual-entry` collapsed from a 4-step wizard (council → pcn → vehicle → review) into one form. Five `<FieldShell>` rows: Issuing council · PCN reference · Vehicle reg · Issue date (optional) · Amount (optional). One Continue button. Reads `?appealId=<id>` from the URL — fetches that appeal, prefills any field OCR captured, stamps a green "Prefilled" chip next to each prefilled field. The failure card's "Enter details manually" link forwards `appealId={appeal.id}` so the customer lands on a form that already knows their council + whatever OCR could read.

#### Strand J — TicketCard modularization

Pulled 5 sub-components out of the 2,246-line TicketCard.tsx:
- `components/ticket/StatusPill.tsx` — `StatusPill` + `pillPaletteFor`.
- `components/ticket/DeleteTicketButton.tsx` — two-tap delete.
- `components/ticket/Field.tsx` — `<Field>` + `humanize` + `formatFieldValue`.
- `components/ticket/FailureActions.tsx` — `<ReadingFailureActions>`, `<CouncilFailureActions>`, `<ExtractedStream>`.
- `components/ticket/SubmissionStatusBits.tsx` — `<OutstandingDetail>`, `<StuckSubmittingNotice>`, `isSubmissionStuck`, `STUCK_THRESHOLD_MS`.

TicketCard.tsx drops to ~1,900 lines focused on orchestration.

#### Strand K — Hardening fixes from the deep code review

- **db/client.ts orphan-cleanup attaches `.catch`**: `closeOrphanClient()` helper attaches `.catch(() => {})` to postgres-js `end()` so a mid-query hot-reload doesn't emit an unhandled rejection (the synchronous try/catch only catches throws, not async rejections).
- **`PORTAL_METADATA_DATE_KEYS` includes `paidAt`**: previously omitted, so paid-PCN snapshots had a raw `dd/mm/yyyy` string in `metadata.paidAt` while every other date was ISO. Now uniform.
- **Scripts cleaned up**: `scripts/peek-latest-appeal.ts` no longer selects the dropped `model_used` column; `scripts/test-e2e-backend.ts` no longer reads `appeal.modelUsed`.
- **Falsy-zero `TODO` note**: the `current === 0` "is empty" heuristic in the ticket-merge backfill works today because amountPence is the only numeric field where 0 conventionally means "unknown". Inline comment warns the next numeric field needs an explicit allowlist.

### v0.3.9 (2026-05-26 evening) — major consolidation

Eight strands shipped: Lambeth automation (appeal/payment URL split, per-council prompts, 4-step wizard), validate-first flow with confirm gate, per-stage cost telemetry (`ai_calls` table + helpers), settings system refactor (dev/prod mode + per-toggle applicability), notification system (server: web-push + dispatcher + audit log; client: `NotificationPromptGate` two-moment prompt), backlog safety + deadline ribbon, slick MCP automation editor at `/admin/councils/[slug]/automation`, DB pool leak fix. Full detail in [`archive.md`](archive.md#v039).

### Phase 9 — Deterministic Playwright + drift detection

`lib/server/submission/recipes/` directory introduces a per-council Playwright runtime (NOT MCP). `CouncilRecipe` interface returning `RecipeSuccess | RecipeDrift | RecipeError`. Lambeth recipe ships first: drives challenge.php directly via Playwright, ~10–20 s @ **$0** vs ~60–120 s @ $0.30 for the Claude MCP path. DOM signature checks at each step return `{ drift: true }` on portal markup changes, falling back to Claude. `runDeterministicLookup` owns the Chromium lifecycle (fresh isolated context per call, 60 s ceiling). See [`architecture/deterministic-recipes.md`](architecture/deterministic-recipes.md).

### Earlier entries

- **v0.3.7** (2026-05-26) — Lookup refactor: DOM-first photo extraction via single `browser_evaluate`; 3 milestone PNGs as the audit trail. Drafting timeout bumped. [archive](archive.md#v037)
- **v0.3.6** (2026-05-26) — `Agree & continue` gate on the OCR review surface; conditional Amount + Issue-Date inputs; CouncilCheckChip absorbed the diff list; `persistPortalLookup` backfill-only merge; `getTicketDiscrepancies()` helper. [archive](archive.md#v036)
- **v0.3.5** (2026-05-26) — Lazy council lookup. Pay/Appeal tiles moved to `pending_review`; lookup only fires when the user picks Appeal; new `appeal_not_possible` CardKind for paid/closed/not_found verdicts. [archive](archive.md#v035)
- **v0.3.4** (2026-05-25) — Build-appeal redesigned as a dictation-first conversational flow; weak-appeal "Add more evidence" re-scores in place; OCR amount hardening; issuer-logo reel; `lib/ticketDisplay.ts` as single source of truth for the displayed amount. [archive](archive.md#v034)
- **v0.3.3** (2026-05-25) — Dedicated `/app/scan` landing page; `<ScanningOverlay>` replaces `<UploadingOverlay>`; `<TicketLifecycleTimeline>` replaces `<TicketJourney>`; 5 new failure CardKinds. [archive](archive.md#v033)
- **v0.3.2** (2026-05-24) — Background notification system; `<TicketJourney>` vertical stepper; `/app/support`; persisted submit-progress. [archive](archive.md#v032)
- **v0.3.1** (2026-05-23) — Drafting-hang fix; 3-step `<GatheringEvidenceCard>`; Cloudflare-grade SSE padding; MCP prewarm at worker boot. [archive](archive.md#v031)
- **v0.3.0** (2026-05-23) — Deep 75-card grounds quiz across 12 categories; voice dictation; markdown knowledge base; appeal-strength score (0–100). [archive](archive.md#v030)

Older entries (v0.2.x): [`archive.md`](archive.md).

## Where to look

- **System overview** → [`architecture/system-overview.md`](architecture/system-overview.md)
- **State machine** → [`architecture/appeal-state-machine.md`](architecture/appeal-state-machine.md)
- **AI pipeline** → [`architecture/ai-pipeline.md`](architecture/ai-pipeline.md)
- **Submission engine** → [`architecture/submission-engine.md`](architecture/submission-engine.md)
- **Grounds registry** (P11) → [`architecture/grounds-registry.md`](architecture/grounds-registry.md)
- **Deterministic recipes** (Phase 9) → [`architecture/deterministic-recipes.md`](architecture/deterministic-recipes.md)
- **Date handling** (`parseUkDate`) → [`architecture/date-handling.md`](architecture/date-handling.md)
- **Data model** → [`architecture/data-model.md`](architecture/data-model.md)
- **Customer UX flow** → [`product/user-flow.md`](product/user-flow.md)
- **Pricing + monetisation** → [`business/pricing.md`](business/pricing.md), [`business/payment-strategy.md`](business/payment-strategy.md)
- **Roadmap** → [`business/roadmap.md`](business/roadmap.md)
- **Council automation status** → [`councils/index.md`](councils/index.md) + live at `/admin/councils`
- **Admin surfaces** → [`admin/index.md`](admin/index.md)

## Not yet (open items)

### Pickup-here items (next session priorities)

- **Admin appeal-detail enhancements (3 tasks opened v0.3.13 — all admin-side, none block consumers)**:
  1. **MCP screenshots gallery** — the screenshots Playwright captured during council lookup + submit runs. Source: `jobs.progress` JSON + Vercel Blob URLs (per Strand E in v0.3.7). Surface as a thumbnail grid on `app/admin/appeals/[id]/page.tsx`.
  2. **Per-call activity/thinking log** — the streaming "thinking" output from each AI call. May need infrastructure changes if we don't currently capture the CLI streaming output.
  3. **Rich metadata + categorised image gallery** — uploaded PCN photo, warden photos (from `portalLookup.photoUrls`), evidence photos (from `appeal_photos`), MCP screenshots — grouped by category with clear labels.

  All three share `app/admin/appeals/[id]/page.tsx`; probably want to land as one batch. Start with #3 (the broadest — the metadata + gallery layout is the chrome the other two slot into).

- **P11 council onboardings (Westminster, Camden, RBKC, Islington, TfL, City of London)** — drop a `grounds/<slug>.ts` per council using `grounds/lambeth.ts` as the template. Awaiting user screenshots of each council's grounds page. The registry is structured to slot them in cleanly. See [`architecture/grounds-registry.md`](architecture/grounds-registry.md) for the onboarding checklist.
- **Grounds slug taxonomy refresh** — once 3+ councils are mapped, audit `CanonicalGroundId` coverage so every customer-friendly slug has a home on at least one council (with the council's "Other reasons" row as the fallback). Touches `lib/grounds-catalog.ts` + every registered `grounds/<slug>.ts`.
- **Admin grounds-mapping CRUD** — admin edits the slug ↔ council-radio map without redeploy. Needs schema (JSONB `councils.grounds_mapping` OR a new `council_grounds` table), admin UI at `/admin/councils/[slug]/grounds`. Defer until 3+ councils are mapped from screenshots.
- **Drift-baseline admin audit tool** (P9 follow-up) — UI at `/admin/councils/[slug]/audit` that runs the recipe against a known-good PCN + reg, captures DOM signatures, lets admin "promote" them as the new baseline when council markup changes. Placeholder doc at [`architecture/drift-baseline-audit.md`](architecture/drift-baseline-audit.md).
- **Westminster + other deterministic recipes** — only Lambeth has one. Add `recipes/westminster.ts` etc. following the `CouncilRecipe` pattern. Each council saved is ~$0.30 per lookup at scale.

### Standing items (pre-existing, lower priority)

- **Care Plan Stripe webhook wiring** — `subscriptions` table + `/api/subscriptions/care-plan` route exist but no payment is processed; waitlist captures only.
- **Apple/Google OAuth completion** — branded sign-in buttons live but return 503 without provider env vars configured.
- **Capacitor native wrapper** — PWA is live as `/app/*`; iOS/Android wrappers roadmapped but not built.
- **Apple/Google Pay tile** — placeholder; not wired to a real intent.

### Hardening epics (deferred)

- **AUTH_SECRET / VAPID rotation** — current setup has one secret per env; rotating requires re-issuing all sessions or all push subscriptions. Multi-secret verify chain + key-id on push subs would fix this.
- **Per-user rate limiting** — `generateSemaphore` caps `/api/generate` to 4 concurrent globally but there's no per-user cap. A bad actor could rotate sessionId and burn budget.
- **TE9 witness statement flow** — once a Lambeth/Westminster PCN escalates to Order for Recovery, the only appeal route is a TE9 witness statement at Northampton TEC. Today our lookup maps OfR → `expired`; the flow doesn't offer TE9 filing. Separate legal product.
- **Worker on serverless** — `instrumentation.ts` warns when running on Vercel/Lambda/Netlify because the in-process worker dies between requests. Production needs `PARKINGRABBIT_DISABLE_WORKER=1` + an external long-lived worker.
