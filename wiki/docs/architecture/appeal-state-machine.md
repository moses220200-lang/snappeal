# Appeal state machine

Last refreshed **2026-05-27 (v0.3.10)**.

> Canonical reference for the smart-card state machine. **Source of truth: `apps/web/lib/deriveCardState.ts`.** This page describes the function's behaviour; if the two ever disagree, the code wins.

`deriveCardState(appeal, statusSnapshot, liveProgress, timeouts) → CardState` is a pure function. Every visual decision on `<TicketCard>` flows from it. No other component branches on `appeal.portalLookup.status`, `appeal.letterBody`, `appeal.preferredMethod`, etc. — they collapse here into one discriminated union.

## CardKind (17)

| Kind | When |
|---|---|
| `scanning` | No statusSnapshot yet, no ticket fields — rare; immediately post-create. |
| `processing` | OCR running OR ticket fields incomplete (pre-lookup). |
| `pending_review` | OCR has populated PCN ref + vehicle reg, no `preferredMethod`, no `letterBody`, AND `step !== TICKET_CONFIRMED_STEP`. User sees editable fields + "Confirm & validate with council" button. |
| `validating` | After Confirm tap: `portalLookup.status === "pending"` OR active `pcn_lookup` job. With v0.3.10's status-bridge fix the card flips OUT of this the instant the worker writes a non-pending status. |
| `needs_decision` | Lookup settled with a non-bad verdict. Pay/Appeal tiles render here. Three flavors: `recommendation`, `escalated`, `expired`. |
| `gathering_evidence` | `preferredMethod === "portal"`, no `letterBody`, `step !== "generation_failed"`, `step !== EVIDENCE_DONE_STEP`. User picks a reason + dictates notes. |
| `drafting` | `preferredMethod === "portal"`, no `letterBody`. Includes both the "waiting on lookup" sub-state (`step === EVIDENCE_DONE_STEP && portalLookup.status === "pending"`) AND the "Claude streaming" sub-state. Also the `generation_failed` sub-state (the body renders `DraftingFailedRow` with the captured error + Retry). |
| `letter_ready` | `letterBody` present, status in `draft`/`ready`. PaidSubmitCta with £2.99 button + strength score. |
| `submitting` | `appeal.status === "submitting"` OR active `submit_appeal` job. |
| `submitted` | `appeal.status in (submitted, under_review, decision_pending)`. |
| `terminal` | `appeal.status in (cancelled, rejected)` OR `stage in (paid, closed)`. |
| `appeal_not_possible` | `preferredMethod === "portal"` AND `portalLookup.verdict in (paid, closed, not_found)` AND `status !== "overridden"`. Blocks the draft entirely — no AI tokens spent on a letter we can't file. Override link sets `status="overridden"` and falls through to drafting. |
| `image_issue` | OCR ran but ≤ 1 of the 4 critical fields came back (probably not a PCN photo). |
| `image_unclear` | OCR ran but the read was low-confidence. |
| `info_needed` | Required fields missing post-OCR. Same body as `pending_review`. |
| `extraction_failed` | OCR errored or timed out. Failure card shows Retake / Upload another / **Enter details manually** (v0.3.10 — links to `/app/manual-entry?appealId=<id>` so the single-page form prefills from whatever OCR did manage to read). |
| `council_lookup_failed` | Portal check errored or timed out (`portal.status === "error"`). |

## Sentinels

`appeal.step` carries three named sentinels that gate transitions:

- **`TICKET_CONFIRMED_STEP = "ticket_confirmed"`** — stamped by `agreeTicket()` when the user taps "Confirm & validate with council" on `pending_review`. Validate-first dam (v0.3.9): no MCP token is spent until this is stamped. Flips the card from `pending_review` → `validating` (because the same handler also POSTs `/lookup`).
- **`EVIDENCE_DONE_STEP = "evidence_gathered"`** — stamped by `confirmEvidenceAndDraft()` when the user finishes the Build-appeal quiz. Flips the card from `gathering_evidence` → `drafting`. A separate draft-kickoff `useEffect` in `TicketCard.tsx` watches for this AND the lookup-settled condition, then fires `/api/generate-stream` exactly once.
- **`GENERATION_FAILED_STEP = "generation_failed"`** — set by `markAppealFailed()` after a drafting error. The body renders `<DraftingFailedRow>` with the captured error + Retry button. `retryDraft()` PATCHes `step=evidence_gathered + processing.draft.status=pending` to re-fire the kickoff effect.

`appeal.step` also accepts free-form values: `"photos"` (default for fresh appeals), `"submitted"`, `"ready"`.

## Three layers, kept separate

1. **`appeals.status`** — the persisted Postgres enum on the row (`draft, ready, submitting, submitted, under_review, decision_pending, cancelled, rejected`).
2. **`appeal.portal_lookup.status`** — independent jsonb-nested lifecycle of the council lookup (`pending, verified, invalid, skipped, overridden, error`).
3. **`CardKind`** — UI-only discriminated union derived from both of the above plus `appeal.step`, `appeal.letterBody`, `appeal.preferredMethod`, the live-job progress, and a few client-side timeout flags.

The three never directly drive UI separately — they all flow into `deriveCardState` and out as a single `CardState`.

## Happy-path timeline (Appeal flow, validate-first)

```
[scanning / processing]
       ↓  OCR pre-pass writes councilSlug → IssuerLogoReel locks early
       ↓  Full extract writes pcnRef + vehicleReg (+ photo coach inline)
       ↓  mergeDuplicateDraftIfAny folds duplicate uploads onto older draft
[pending_review]
       ↓  User taps "Confirm & validate with council"
       ↓  PATCH step=ticket_confirmed + POST /lookup (single trigger)
[validating]  ← chip narrates lookup (live MCP thought OR recipe progress)
       ↓  worker writes portalLookup.status=verified
       ↓  per-card poll catches the flip; status-snapshot fetch re-runs
       ↓  deriveCardState transitions out of validating
[needs_decision]
       ↓  User taps Appeal £2.99 tile
       ↓  PATCH preferredMethod=portal (NO new /lookup POST — v0.3.10 removed that leftover)
[gathering_evidence]
       ↓  User picks a Common reason + dictates notes
       ↓  User taps "Build my appeal"
       ↓  PATCH step=evidence_gathered
[drafting]
       ↓  Claude streams the letter via /api/generate-stream
       ↓  letterBody persists, strengthScore lands
[letter_ready]
       ↓  User taps £2.99 Submit + Stripe
[submitting]
       ↓  Submission MCP / recipe fills the council portal
[submitted]
```

## Short-circuits and failure branches

- **`appeal_not_possible`** — fires the moment the lookup verdict lands as paid/closed/not_found. Drafting never starts. The user sees an explainer + Pay-yourself link + "I disagree — let me appeal anyway" override (sets `portalLookup.status = "overridden"`, falls through to drafting).
- **`council_lookup_failed`** — fires on `portal.status === "error"` or a client-side timeout flag. The lookup retry surface is the body's recovery affordance.
- **`extraction_failed`** / **`image_issue`** / **`image_unclear`** / **`info_needed`** — four OCR-failure CardKinds. Each surfaces its own recovery actions (retake photo, upload another, **enter details manually**). The manual-entry link forwards `?appealId=<id>` so the single-page form pre-fills from any fields OCR did manage to read.
- **`drafting` + `generation_failed`** — Claude CLI hung or errored. `markAppealFailed(id, message)` stashes the error into `processing.draft.error`; the body renders `<DraftingFailedRow>` with the message + a Try again button.

## Pre-pass council reveal (v0.3.6+)

The OCR runs as TWO sequential Claude calls inside a single `/api/extract` request:

1. `identifyCouncil()` — ~2 s, returns only `{issuer, councilSlug, confidence}`. PATCHes the appeal with `ticket: {councilSlug, issuer}` mid-request via `patchAppealDraft` (field-level merge — v0.3.10 fix).
2. `extractTicket()` — ~8–15 s, returns the full ticket + photo-coach verdict in a single combined call (v0.3.10 consolidation). PATCHes the complete ticket; the field-level merge skips empty values so pass 1's good values are preserved if pass 2 returns blanks.

The smart card's polling loop picks up the partial ticket between the two passes. The `IssuerLogoReel`'s `scanning` prop flips false the moment `appeal.councilSlug` is set (not when the whole OCR finishes), so the reel lands on the correct council early while the rest of OCR continues. Card kind stays `processing` until both passes complete.

## Validate-first lookup (v0.3.9, refined v0.3.10)

Pre-v0.3.5 every confirmed scan fired the council lookup unconditionally. Pre-v0.3.9 the lookup was lazy — only fired when the user tapped Appeal. v0.3.9 introduced the **Confirm gate**: the lookup ONLY fires after the user explicitly taps "Confirm & validate with council" on `pending_review`. Cost story: OCR ~$0.075 (combined) + council-id ~$0.04, MCP only when the customer has eyeballed the data and committed to validation.

`useAutoValidate` hook is the backstop for old tickets (`step === TICKET_CONFIRMED_STEP` already stamped but no `portalLookup` yet). v0.3.10 fix: both `agreeTicket` and `useAutoValidate` send `x-parkingrabbit-session` on their POSTs so guest customers don't hit silent 403s; on 403 the hook's `FIRED_SESSION` dedup is cleared so a refreshed session can retry.

## Status-snapshot bridge (v0.3.10 fix)

`deriveCardState` reads three sources for the lookup state:

- `portalLookup.status` (from `appeal.portal_lookup`) — the verdict written by the worker
- `liveProgress.status` (from the SSE) — the in-flight job state
- `statusSnapshot.stage` (from `/api/appeals/[id]/status`) — the derived connector view

Pre-v0.3.10 the status-snapshot `useEffect` had deps `[appeal.id, ticket.pcnRef, ticket.vehicleReg]` — none of which change when the worker writes the verdict. The stale `{stage: "status_check_pending"}` snapshot cached at mount kept `deriveCardState` returning `validating` until manual refresh. Fix: deps now include `appeal.portalLookup?.status` + `fetchedAt`, so the snapshot refetches the moment the verdict lands and the card transitions cleanly.

## Code references

- Enum + derive ladder: `apps/web/lib/deriveCardState.ts` (CardKind), sentinels, the derive function.
- UI per kind: `apps/web/components/TicketCardBody.tsx`'s switch on `state.kind`.
- Lifecycle rail: `apps/web/components/TicketLifecycleTimeline.tsx` + `buildLifecycleSteps()` in `apps/web/components/TicketCard.tsx`.
- Extracted sub-components: `apps/web/components/ticket/{StatusPill,DeleteTicketButton,Field,FailureActions,SubmissionStatusBits}.tsx`.
- Card state polling: `apps/web/components/TicketCard.tsx`'s polling `useEffect` (intervals tuned per kind: 2 s processing, 2.5 s validating / gathering-with-pending-lookup / drafting-with-pending-lookup, 3 s drafting).
- Status-snapshot fetch + bridge fix: `apps/web/components/TicketCard.tsx` (the `useEffect` keyed on `[appeal.id, pcnRef, vehicleReg, portalLookup?.status, portalLookup?.fetchedAt]`).
- Draft kickoff effect: `apps/web/components/TicketCard.tsx` (waits for both step + lookup-settled before firing `/api/generate-stream`; ref-guarded against double-fire).
- Retry handler: `apps/web/components/TicketCard.tsx`'s `retryDraft()` PATCHes `step=evidence_gathered + processing.draft.status=pending` to re-fire the kickoff effect.

## Cross-refs

- The AI calls that drive these transitions: [`ai-pipeline.md`](ai-pipeline.md).
- The submission engine that the `letter_ready` → `submitting` transition feeds: [`submission-engine.md`](submission-engine.md).
- The deterministic recipe path's effect on `validating`: [`deterministic-recipes.md`](deterministic-recipes.md).
- The fields the state machine reads: [`data-model.md`](data-model.md).
- The full customer-facing flow narrative: [`../product/user-flow.md`](../product/user-flow.md).
