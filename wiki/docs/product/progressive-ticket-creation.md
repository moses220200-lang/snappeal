# Progressive ticket creation

Last refreshed **2026-05-27 (v0.3.10)**.

**Status:** Shipped through v0.3.10. The model: never block the customer behind a static loader after upload. Each backend step (OCR pre-pass → OCR full → lookup → draft → submit) progresses inline on a single smart card; each step can succeed, fail, or be retried independently.

## Why progressive

The pre-v0.2.15 flow rendered a full-screen "Reading your PCN" overlay between upload and the in-page confirmation form. It made the app feel fragile when OCR or downstream steps took >5 s. The progressive model replaces that with:

- An appeal row created instantly (POST `/api/appeals`).
- A photo PATCHed onto the row (PATCH `/api/appeals/[id]` with `pcnImageUrl`).
- The card mounted on `/app/tickets` immediately, in the `processing` state.
- Backend steps reported via the `processing` jsonb column + a polling loop on the card.

The customer can refresh, leave, come back, share the URL — the state stays consistent because everything is persisted to the appeal row.

## The pipeline

```
Upload (uploadPcn.ts) → POST /api/appeals → PATCH pcnImageUrl
                          ↓
                       /api/extract (fire-and-forget)
                          ├── identifyCouncil (~2s) → PATCH ticket partial
                          ↓                          ↳ reel locks early
                          └── extractTicket (~10–15s, combined extract+coach)
                                → PATCH ticket full
                                → mergeDuplicateDraftIfAny (txn, FK sweep)
                                → response body { ticket, coach }
```

The card polls `/api/appeals/[id]` every 2 s while `processing.ocr.status !== "done"` and stops the moment ticket fields land.

## OCR two-pass (v0.3.10 combined extract+coach)

Inside `/api/extract`, two sequential Claude calls:

1. **`identifyCouncil(pcnPhotoDataUrl)`** — `lib/server/ai.ts`. Minimal prompt that returns only `{issuer, councilSlug, confidence}`. ~1–3 s in practice because the schema is tiny and the prompt is short.
2. **`extractTicket(pcnPhotoDataUrl)`** — `lib/server/ai.ts`. Full prompt that returns `{ ticket, confidence, coach, modelUsed, costUsd }` — the entire ticket (PCN ref, vehicle reg, contravention, location, issuedAt, amountPence) plus the inline photo-coach `{quality, advice}` block in the SAME Claude vision call. v0.3.10 merged the previously-separate `coachPhoto()` call here, halving per-upload Claude cost (~$0.13 → ~$0.075). The coach key is wrapped with `.catch({...}).default({quality: "good", advice: ""})` for leniency.

Between the two passes the appeal row's `ticket` jsonb holds ONLY `{councilSlug, issuer}` (the partial). The smart card's poll picks this up; `deriveCardState` keeps the kind at `processing` because `pcnRef` + `vehicleReg` aren't there yet, but the `IssuerLogoReel`'s `scanning` prop reads `appeal.councilSlug` directly and flips off the moment the partial lands — the reel locks onto the right council ~2 s after upload while the full extract continues.

When pass 2 returns, the second PATCH replaces the ticket wholesale with the complete object. `mergeDuplicateDraftIfAny(appealId, userId)` then runs in a transaction: if the customer already has an older draft for the same `(pcnRef, vehicleReg)` on this account, the new appeal is collapsed into the older one with an explicit FK sweep across `jobs`, `payments`, and `notification_dispatches`. The smart card then transitions out of `processing` into `pending_review`.

If pass 2 fails (Claude timeout, network blip), the outer catch in `/api/extract` calls `setProcessingStep("ocr", "failed", message)`. The smart card transitions to `extraction_failed` and surfaces a Retry / Edit-manually action. The Edit-manually path lands on `/app/manual-entry?appealId=<id>` — a single-page form (v0.3.10) prefilled with OCR's partial reads so the user doesn't retype what came back fine.

The coach `advice` text is forwarded back in the `/api/extract` response body and stored in the client's session-storage `OcrHandoff` so the smart card's `<PendingReviewCard>` can render an amber "Photo looks rough — try X" pill when quality < "good".

## The smart card's polling lifecycle

`apps/web/components/TicketCard.tsx` runs a single `useEffect` polling loop with kind-tuned cadence:

| Card kind | Cadence | Max polls | Stop condition |
|---|---|---|---|
| `processing` | 2 s | 60 (2 min) | `ticket.pcnRef && ticket.vehicleReg` (OCR landed) OR `processing.ocr.status === "failed"` |
| `validating` (legacy) | 2.5 s | 120 (5 min) | `portalLookup.status !== "pending"` |
| `gathering_evidence` + `portalLookup.status === "pending"` | 2.5 s | 120 | `portalLookup.status !== "pending"` (chip transitions to verified or error) |
| `drafting` + `step === EVIDENCE_DONE_STEP` + `portalLookup.status === "pending"` | 2.5 s | 120 | letterBody lands OR `step === "generation_failed"` |
| `drafting` (Claude streaming) | 3 s | 60 | `letterBody` OR `step === "generation_failed"` |

Deps: `[cardState.kind, appeal.step, appeal.letterBody]` (v0.3.7). The `appeal.step` dep was added to ensure the polling effect re-mounts when `retryDraft()` PATCHes the step back from `generation_failed` to `EVIDENCE_DONE_STEP` — without it the previous tick chain dies on the `generation_failed` stop condition and the card stalls forever.

## Draft kickoff (v0.3.5+)

Drafting is deferred via a separate `useEffect` that watches for both gates:

1. `appeal.step === EVIDENCE_DONE_STEP` (user finished Build appeal).
2. `appeal.portalLookup?.status !== "pending"` (lookup has settled — verified or error).
3. `appeal.portalLookup?.verdict not in (paid, closed, not_found)` (or `status === "overridden"`).
4. `!appeal.letterBody` (letter not already drafted).

When all four pass, the effect fires `/api/generate-stream` exactly once per appeal (ref-guarded). Server-side has a defence-in-depth in-flight guard: `processing.draft.status === "running"` + the row's `updatedAt` < 240 s → short-circuit a duplicate request. On success, `attachDraftToAppeal()` writes the letter; the route then calls `setProcessingStep("draft", "done")` to clear the running marker.

## Draft retry path (v0.3.6+)

If `/api/generate-stream` throws (Claude timeout, network), the catch:

1. Calls `markAppealFailed(appealId, errorMessage)`.
2. That helper sets `step = "generation_failed"` AND writes `processing.draft = {status: "failed", error: <message>, completedAt}`.
3. The smart card's `drafting` body branches on `step === "generation_failed"` and renders `<DraftingFailedRow>` with the error message + a **Try again** button.

`retryDraft()` (handler in `TicketCard.tsx`):

1. PATCHes `step = EVIDENCE_DONE_STEP` AND `processing.draft = {status: "pending"}`.
2. Clears the draft-kickoff ref so the effect re-fires.

The polling effect re-mounts (because `appeal.step` is in its deps), arms a fresh 3 s tick chain, and catches the new `letterBody` when it lands.

## Failure CardKinds the pipeline produces

| Kind | Trigger | Recovery action |
|---|---|---|
| `extraction_failed` | OCR full pass threw or timed out | Retry / Edit manually |
| `image_issue` | OCR ran but ≤ 1 of 4 critical fields came back (not a PCN photo) | Retake |
| `image_unclear` | OCR ran but confidence too low | Retake / Continue anyway |
| `info_needed` | Required fields missing after both OCR passes | Edit inline + Agree |
| `council_lookup_failed` | `pcn_lookup` job hit `portal.status === "error"` | Retry / Continue anyway / Edit fields |
| `appeal_not_possible` | Lookup verdict is paid / closed / not_found | Pay yourself / Mark resolved / Override |
| `drafting + step=generation_failed` | `/api/generate-stream` threw | Try again |

Every failure state preserves the rest of the journey — the user can edit, retry, or override without restarting from `/app/scan`.

## Code anchors

- `apps/web/lib/client/uploadPcn.ts` — the upload helper. Creates the row, PATCHes the photo, fires `/api/extract`.
- `apps/web/app/api/extract/route.ts` — the OCR endpoint. Two-pass sequence + processing-step writes + `mergeDuplicateDraftIfAny` handoff.
- `apps/web/lib/server/ai.ts` — `identifyCouncil()` (pre-pass) and `extractTicket()` (full ticket + inline coach + cost/model). `coachPhoto()` is gone.
- `apps/web/lib/server/appeals.ts` — `setProcessingStep()` (merges per-step status into the `processing` jsonb) and `mergeDuplicateDraftIfAny()` (transactional dedup with FK sweep).
- `apps/web/lib/server/aiCalls.ts` — `recordAiCall()` writes per-stage cost into `ai_calls` so admin can split the combined call's cost across `ocr` and `coach` rows.
- `apps/web/components/TicketCard.tsx` — polling loop + draft-kickoff effect + retry handler. v0.3.10 modularised into `components/ticket/*`.
- `apps/web/components/TicketCardBody.tsx` — per-state body rendering including the conditional Amount/Date inputs.
- `apps/web/lib/deriveCardState.ts` — the state derive ladder (17 CardKinds, `TICKET_CONFIRMED_STEP` + `EVIDENCE_DONE_STEP` + `GENERATION_FAILED_STEP` sentinels).
- `apps/web/app/app/manual-entry/page.tsx` — single-page manual entry with `?appealId=<id>` prefill from the failure card.
