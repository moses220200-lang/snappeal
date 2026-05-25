# Appeal state machine

How an appeal moves from a draft photo to a closed council outcome, and how that domain status maps onto what the user actually sees on the smart `<TicketCard>`.

## Three layers, kept separate

1. **`appeals.status`** — the persisted enum on the `appeals` row. Eight values, enforced as a Postgres enum.
2. **`appeals.portal_lookup.status`** — independent jsonb-nested lifecycle of the council-portal lookup. Six values.
3. **`CardKind`** — UI-only discriminated union the smart card branches on. 11 values, derived live by `lib/deriveCardState.ts` from `(appeal, statusSnapshot, liveProgress)`.

The first two are persisted truth. `CardKind` is computed on every render so the card can morph through 11 states without 11 stored flags.

## Layer 1 — `appeals.status` (Postgres enum)

```
draft  →  ready  →  submitting  →  submitted
       →  under_review  →  decision_pending  →  cancelled | rejected
```

| Status | Set by | What it means |
|---|---|---|
| `draft` | `createAppeal()` on first `POST /api/appeals` | Row exists; PCN photo may or may not be uploaded yet. |
| `ready` | `attachDraftToAppeal()` after `/api/generate(-stream)` succeeds | Letter body + grounds persisted; awaiting customer Submit. |
| `submitting` | `recordSubmission()` when the worker claims the `submit_appeal` job | MCP agent is driving the council portal **right now**. |
| `submitted` | `recordSubmission()` when the agent reports back with a council reference | Representation lodged; awaiting council decision. |
| `under_review` | (reserved) | Council has acknowledged receipt but not decided. |
| `decision_pending` | (reserved) | Council has indicated a decision is imminent. |
| `cancelled` | `processInboundMessage()` when the classifier returns `cancelled` | Council cancelled the PCN — customer won. |
| `rejected` | `processInboundMessage()` when the classifier returns `rejected` | Council upheld the PCN — customer lost. |

The free-form `appeals.step` column captures sub-states the enum doesn't — the most important is `"generation_failed"` (v0.3.1 fix), stamped by `markAppealFailed()` when `generateDraft` throws so the card flips to a visible failure state with a Retry CTA. `attachDraftToAppeal()` resets `step` back to `"ready"` on the next successful generate, so the marker self-clears. v0.2.16 added `EVIDENCE_DONE_STEP = "evidence_gathered"` (exported from `lib/deriveCardState.ts`), stamped atomically with the grounds PATCH so the card can branch between "user tapped Appeal, still gathering inputs" and "all inputs in, drafting can run".

## Layer 2 — `appeals.portal_lookup.status` (jsonb)

Independent of `appeal.status`. Tracks the lifecycle of the **read-only** council-portal lookup that runs between PCN intake and the recommendation surface.

| Value | Meaning |
|---|---|
| `pending` | `pcn_lookup` job enqueued, agent hasn't returned yet. |
| `verified` | Lookup succeeded; verdict says the PCN is appealable (`open` / `expired` / `unknown`). |
| `invalid` | Lookup succeeded; verdict is `paid` / `closed` / `not_found`. Card flips to `terminal` with an inline "I disagree — let me appeal anyway" override. |
| `overridden` | User tapped the override; treat verdict as a warning, allow draft. (Server gate: `/api/submit` returns `409 PCN_NOT_APPEALABLE` while `invalid` and lifts on `overridden`.) |
| `skipped` | Council not on `automated_beta`/`automated_ga`; lookup never ran; no banner shown. |
| `error` | Agent threw / returned unparseable reply / wall-clock timeout; card surfaces a "couldn't verify" amber state. |

Verdict + verdictReason + warden photo URLs + portal-confirmed ticket metadata all sit alongside on the same `portal_lookup` jsonb. See `lib/server/db/schema.ts → PortalLookupSnapshot` for the full shape.

## Layer 3 — `CardKind` (UI discriminated union)

`lib/deriveCardState.ts → deriveCardState(appeal, statusSnapshot, liveProgress)` returns one of **16 kinds** (v0.3.3 — was 11 in v0.3.2):

```ts
type CardKind =
  // ─── happy-path lifecycle (11) ───
  | "scanning"            // photo upload in flight (rare; client-only)
  | "processing"          // appeal row exists; OCR/portal-lookup/analysis still running
  | "pending_review"      // OCR done; 3 editable rows + "I agree to T&Cs" button
  | "validating"          // pcn_lookup job running; live agent thought streaming
  | "needs_decision"      // verdict landed; recommendation surface (Appeal / Pay yourself / Coming soon)
  | "gathering_evidence"  // user picked "Appeal"; 3-step StepBlock ladder (grounds → details → review)
  | "drafting"            // /api/generate-stream in flight; letter streams word-by-word
  | "letter_ready"        // letter persisted; strength badge + Pay £2.99 CTA
  | "submitting"          // submit_appeal job running; Watch-live disclosure auto-expanded
  | "submitted"           // council reference returned; success state
  | "terminal"            // cancelled | rejected | portal-lookup invalid (no-override)
  // ─── v0.3.3 failure kinds (5) — surfaced when the pipeline can't progress
  //     without user input. All five are recoverable. ───
  | "image_issue"             // OCR ran but the photo doesn't look like a PCN
  | "image_unclear"           // OCR ran but the read was low-confidence
  | "info_needed"             // some required fields are missing after OCR
  | "extraction_failed"       // OCR errored or timed out
  | "council_lookup_failed";  // pcn_lookup portal check errored or timed out
```

### Failure-kind recovery surfaces (v0.3.3)

Each failure kind surfaces via `<TicketLifecycleTimeline>` as a `failed`-status step (amber `<AlertTriangle>` rail dot, amber connector below, amber-900 title + supporting copy) with `tint: "warn"` wrapping the inline recovery children.

| Failure CardKind | Trigger | Recovery surface |
|---|---|---|
| **`image_issue`** | OCR ran but Claude vision classified the photo as not a PCN | "Looks like this isn't a PCN" + Retake / Upload a different photo |
| **`image_unclear`** | OCR ran but the per-field confidence scores are below threshold | "We couldn't read this clearly" + per-field uncertainty + Retake / Edit manually |
| **`info_needed`** | OCR succeeded but one of PCN ref / vehicle reg / council is missing | Inline editable rows for the missing fields + "Continue when ready" |
| **`extraction_failed`** | `/api/extract` errored or timed out (Claude CLI failure / 120 s timeout / image decode failure) | "Couldn't read the PCN" + Retry / Enter manually |
| **`council_lookup_failed`** | `pcn_lookup` job errored or timed out (portal down / captcha / 5-min wall-clock) | "Couldn't reach the council right now" + Retry / Continue without validation |

All five are **recoverable in-card** — the user never has to navigate away to fix a problem. The `tint: "warn"` panel makes failure visually distinct from in-flight states without feeling like a dead-end.

### How the card draws the CardKind — `<TicketLifecycleTimeline>` (v0.3.3)

The card's primary state surface is `<TicketLifecycleTimeline>` (`components/TicketLifecycleTimeline.tsx`) — v0.3.3's replacement for the legacy trio (the `<TicketJourney>` 3-step stepper + `<ProcessingCard>` inline rows + the bottom-of-card Progress Timeline). One vertical journey from upload → resolution, hosted inside the smart card.

Per-step contract:

- **Rail dot**: green check (done), pulsing primary dot with halo (active), hollow outline (upcoming), amber `<AlertTriangle>` (failed — v0.3.3). All `size-5` (was `size-6` in v0.3.2's `<TicketJourney>`).
- **Connector line** below the dot: green when this step is done, amber when failed, muted primary at 40% alpha when active, muted grey when upcoming.
- **Title** + optional **`supporting`** line + optional **`detail` ReactNode** (richer single-line content like a coloured due-by line) + optional **`busy`** spinner on the active step.
- **`children: ReactNode`** (new in v0.3.3) — mounted directly under the title when the step is active. Used to render the uploaded image preview (with `<ScanningOverlay>` mounted inside during OCR), the inline Pick-your-grounds quiz, the Pay / appeal choice tiles, the streaming letter preview, status / error messages.
- **`tint: "warn" | "danger"`** (new in v0.3.3) — wraps `children` in a soft `amber-50` / `red-50` rounded panel for deadline rows + failure rows. Unset → no card background (avoids the "card inside a card" look when the children are themselves a card).
- **`childrenFullBleed: boolean`** (new in v0.3.3) — when true, `children` escape the rail+gap indent (`-ml-9`) so action tiles render edge-to-edge inside the card (matching the footer's width). Used by the Pay / appeal choice surface.

The numbered step badges (1–N) from `<TicketJourney>` are gone — position in the list is the position, and the numbers were redundant once `children` made each row big. `components/TicketJourney.tsx` is dead code on disk; safe to delete in a follow-up cleanup. See `components/TicketLifecycleTimeline.tsx` for the `LifecycleStep` / `LifecycleStepStatus` interface.

`needs_decision` has three sub-flavors derived from `statusSnapshot.stage`:

| Flavor | Trigger | What's surfaced |
|---|---|---|
| `recommendation` | Normal `appeal_open` stage | Appeal £2.99 · Pay yourself · Rabbit Pay (Coming soon) |
| `escalated` | `charge_certificate_issued` / `order_for_recovery` / `enforcement` | Stage-aware banner + escalated copy; Appeal CTA hidden |
| `expired` | `appeal_expired` (28-day window elapsed) | "Appeal window has closed" banner + Pay-yourself only |

The card also returns `{ pillLabel, pillTone, caption, progress, inFlight, stage, canAppeal, isEscalated }` so the body knows what to render at a glance.

## Transition rules

```
appeal.status = draft
appeal.processing.ocr.status = pending|running    → CardKind = processing
                                                    pill: "Reading PCN"
appeal.ticket complete, no portal_lookup yet      → CardKind = processing
                                                    (next step is "I agree to T&Cs" tap)
appeal.ticket complete, T&Cs tapped               → enqueue pcn_lookup → CardKind = validating
portal_lookup.status = invalid (& not overridden) → CardKind = terminal (with override CTA)
portal_lookup.status = verified|overridden|skipped → CardKind = needs_decision
user picks "Appeal" → preferred_method = portal   → CardKind = gathering_evidence
3-step ladder complete → /api/generate-stream     → CardKind = drafting
SSE done → letterBody + strengthScore persisted   → CardKind = letter_ready
user pays → /api/submit → submit_appeal enqueued  → CardKind = submitting
agent done → council reference                    → CardKind = submitted
status = cancelled | rejected                     → CardKind = terminal
```

## Filter chips on `/app/tickets`

The filter row is a thin lens over the card-state model:

| Filter chip | Predicate |
|---|---|
| `All` | (no filter) |
| `To Pay` | `displayState === "due"` (draft/ready in last 4 days of 14-day discount window) |
| `Challenging` | card is in any of `pending_review` · `validating` · `needs_decision` · `gathering_evidence` · `drafting` · `letter_ready` · `submitting` · `submitted` (incl. all in-flight + just-submitted states) |
| `Resolved` | card is in `terminal` (cancelled or rejected) |

`displayState` for the at-risk vs due colour split on `Challenging`/`To Pay` is derived from `ticket.issuedAt` + the UK PCN 14-day discount window (purely time-based; flips at day 10). `now` is stamped once at mount via `useState(() => Date.now())` so a card can't flicker mid-session.

## Error UX

Three failure modes get distinct surfaces so the user is never staring at an eternal spinner or a stack trace:

| Failure | Where it surfaces | Trigger |
|---|---|---|
| **Resource not found / 403** (bad id / not your appeal) | Smart card on `/app/tickets` renders an inline "We couldn't find this ticket" amber card with `XCircle` + reason. `?expand=<bad-id>` is a no-op; the URL param strips itself. | `/api/appeals/[id]` returns 404/403. |
| **Mid-run agent failure** | `submitting` card surfaces "Agent halted" status; the run halts but the customer's letter is preserved. | Worker reports `status: "failed"` mid-stream after one or more progress events. |
| **Drafting hang / failure** (v0.3.1 fix) | `validating` or `drafting` card transitions to a visible failure pill via `markAppealFailed()` + `step = "generation_failed"`. Body shows a red retry banner. | `generateDraft()` throws (no photo AND no complete ticket; Claude CLI error). |
| **Unexpected render exception** | Top-level `app/error.tsx` boundary — branded "Something went wrong" card with `Try again` (calls `reset()`) + `Back to the app`. `error.digest` rendered as `Reference:` for support correlation. | Any uncaught JS error in any segment under `app/`. |
| **Unmatched route** | Top-level `app/not-found.tsx` — branded "Page not found". | Hitting a URL with no matching route. |

## Files

- `apps/web/lib/deriveCardState.ts` — `CardKind` enum, `deriveCardState()`, `EVIDENCE_DONE_STEP` sentinel, fallback captions, milestone counts.
- `apps/web/components/TicketCard.tsx` + `TicketCardBody.tsx` + `TicketCardHeader.tsx` — the smart card itself.
- `apps/web/components/TicketLifecycleTimeline.tsx` — **v0.3.3** single vertical journey replacing `<TicketJourney>`. Hosts inline children per step + tint warn/danger + failed status.
- `apps/web/components/ScanningOverlay.tsx` — **v0.3.3** minimal animated veil (scan-line + corner brackets + label pill) mounted inside the PCN image preview during OCR. Replaces the v0.3.2 full-page `<UploadingOverlay>` (still on disk, no longer imported — dead code).
- `apps/web/app/app/scan/page.tsx` — **v0.3.3** dedicated Scan landing page (Camera / Upload picture / Input manually). New BottomNav FAB destination.
- `apps/web/components/NotificationWatcher.tsx` — **v0.3.2** mounted in `app/app/layout.tsx`; polls `/api/appeals` for state transitions and emits notifications.
- `apps/web/components/NotificationPermissionSheet.tsx` — **v0.3.2** context-sensitive opt-in bottom-sheet.
- `apps/web/lib/client/notifications.ts` — **v0.3.2** in-app notification store + native browser notification firing.
- `apps/web/hooks/useAppealLiveState.ts` — SSE subscription that feeds `liveProgress` into `deriveCardState`.
- `apps/web/app/app/tickets/page.tsx` — list page + filter chips + `displayState` derivation for the at-risk/due colour split.
- `apps/web/app/app/layout.tsx` — mounts `<NotificationWatcher>` once for every `/app/*` route, plus `<BottomNav>`.
- `apps/web/lib/server/appeals.ts` — status transitions (`createAppeal`, `attachDraftToAppeal`, `recordSubmission`, `markAppealFailed`, `setProcessingStep`, `persistPortalLookup`).
- `apps/web/lib/server/inbound.ts` — `processInboundMessage()` flips status to `cancelled` / `rejected`.
- `apps/web/lib/server/db/schema.ts` — `appeals.status` enum + `step` column + `PortalLookupSnapshot` + `ProcessingStatus` types.
- `apps/web/app/not-found.tsx`, `apps/web/app/error.tsx` — global error surfaces.
