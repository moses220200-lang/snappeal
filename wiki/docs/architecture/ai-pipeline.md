# AI pipeline

Last refreshed **2026-05-27 (v0.3.10)**.

Every Claude call goes through one wrapper — `apps/web/lib/server/claude-cli.ts` — which spawns the headless `claude` binary in pipe mode. No Anthropic SDK in this codebase. Two modes:

- `runStructured(prompt, schema, imageDataUrls, timeoutMs)` — one-shot, Zod-validated JSON output. Used by every AI route except portal automation.
- `runAgentic(prompt, mcpServers, timeoutMs)` — multi-turn with tool use. Used by portal-lookup + submission agents that drive Playwright MCP.

Default model: **`claude-sonnet-4-6`**. Override via `CLAUDE_MODEL` env. Per-call attribution lands in `ai_calls.model` so a future model split per stage is a config change.

## Entry points

`apps/web/lib/server/ai.ts` exports the typed callers. Each returns the model + cost so `recordAiCall` can log it.

### `identifyCouncil({ pcnPhotoDataUrl })` — pre-pass

Fast vision call (~1–3 s). Returns just `{ issuer, councilSlug, confidence }`. The `/api/extract` route runs this BEFORE the full extract so the `<IssuerLogoReel>` on the card can lock onto the right council logo within 2–3 seconds of upload while the heavier OCR is still running.

Cost: ~$0.04 per call. Confidence < 0.4 → result is dropped (we'd rather show the spinning reel than land on the wrong logo). The ticket is PATCHed mid-request so the polling card picks it up on its next tick.

### `extractTicket({ pcnPhotoDataUrl })` — combined OCR + photo coach (v0.3.10 consolidation)

The big vision call. Returns `{ ticket, confidence, coach, modelUsed, costUsd }` in a single round-trip:

- **`ticket`** — `pcnRef`, `vehicleReg`, `contraventionCode`, `contraventionDescription`, `location`, `issuedAt`, `amountPence`, `issuer`, `councilSlug`.
- **`confidence`** — per-field 0..1 reflecting how legible each field was.
- **`coach`** — `{ legible: boolean, quality: "good" | "ok" | "poor", issues: string[], advice: string }`. Surfaces the "Photo could be sharper" / "Photo looks rough" card on failure surfaces.

Before v0.3.10 this was two parallel Claude calls (one for `extractTicket` + one for `coachPhoto`). Same image, same model, ~2× the cost for marginal incremental value. v0.3.10 collapsed them: the extract prompt grew a "PHOTO COACH" appendix that asks Claude to score the photo while it's already analysing it for fields. Per-upload cost dropped ~$0.129 → ~$0.075.

**Coach is non-load-bearing.** The combined schema wraps `PhotoCoach` in `.catch({...}).default({...})` — a malformed coach block (Claude returning `quality: "fine"` instead of one of the three enum values, or `advice` > 280 chars) **does not fail the whole extract**. The ticket + confidence still flow through; the coach falls back to a neutral "good, no advice" verdict and the photo-coach card just doesn't render. This was the root cause of the "Rabbit couldn't finish reading this PCN" failures in v0.3.10 dev.

Cost: ~$0.075 per call. Wall-clock 8–15 s depending on photo size.

### `strengthenNotes({ rawNotes, ticket })`

Rewrites the user's free-text notes into a polished paragraph (80–160 words) the drafter can splice. Never invents facts — only restructures. Used by `/api/improve-notes` after the user dictates / types into the Build-appeal composer. Cost: ~$0.02. Stage: `strengthen_notes`.

### `scoreAppealStrength({ appealRow })`

Re-scores an existing appeal without redrafting. Reads `appeal.ticket`, `appeal.grounds`, `appeal.notes`, `appeal.letterBody`, evidence-photo URLs. Returns `{ score, rationale, improvements }`. Used by the "Add more evidence → rescore" affordance on a weak-appeal letter (red <50). Server-side cap: when no photos attached AND notes < 50 chars, score is capped at 45 with a transparent rationale. Stage: `strength`. Cost: ~$0.03–0.05.

### `generateDraft({ ... })`

The big one. Reads `ticket`, `grounds`, `notes`, `evidence-photo URLs`, and the knowledge pack. Returns `{ ticket, groundIds[], letter: { subject, body }, strength: { score, rationale, improvements } }`. The drafter is opinionated:

- Letter body 800–1400 words (Claude self-monitors). Body < 80 chars throws (defence-in-depth against the v0.2.x "empty letter rendered as blank submit button" bug).
- Mirrors precedent framings from the knowledge pack when they're a fit, never wholesale quotes them.
- Pre-empts council rebuttals via the per-code brief.
- Strength score is integral to the response, not a separate call.

Stage: `draft`. Wall-clock 25–35 s (cache-warm). Cost: ~$0.20–0.30 depending on KB pack size + evidence count.

`/api/generate-stream` is the SSE variant — same Claude call, but the wrapper opens an SSE stream that emits `ticket`, `grounds`, `letter`, `strength`, `done` frames as the model writes them so the smart card can render the letter as it streams in.

## The combined extract prompt (v0.3.10)

The Zod schema feeding the structured call:

```ts
const ExtractWithConfidenceAndCoach = z.object({
  ticket: Ticket,
  confidence: TicketConfidence,
  coach: PhotoCoach.catch({...}).default({...}),
});
```

The system prompt (excerpt — full at `apps/web/lib/server/ai.ts:EXTRACT_PROMPT`):

```
You are ParkingRabbit's PCN scanner. Extract the ticket fields from the
attached London Penalty Charge Notice photograph AND, in the same response,
judge the photo's legibility so we can advise the user whether to retake.

EXTRACTION RULES
================
For each ticket field, output what the photo actually shows. If a field is
not readable, return an empty string (or 0 for amountPence). Never invent
values; never return placeholders like "[NOT READABLE]" inside a field.
…

CONFIDENCE
==========
For each extracted field, return a confidence score in [0,1] reflecting
how legible that field was in the photo. This is your honest read, not
a calibration target — be willing to use 0.3 when you genuinely guessed.

PHOTO COACH
===========
Also score the photo as a whole and write one short piece of "retake or
proceed" advice. Surfaces under the failure card when quality is "ok"/"poor".

- quality: one of "good" | "ok" | "poor"
- legible: boolean — true unless quality === "poor" AND no fields could
  be extracted reliably
- issues: up to 5 short noun-phrase issues
- advice: ONE sentence the user sees — actionable, plain English, polite
```

The amount-reading section has a self-check rule: a UK PCN's reduced charge is ALWAYS exactly 50% of the full charge. If the model's reading breaks that relationship it's instructed to re-read both figures and return the consistent pair. Catches the most common digit-confusion error (6 vs 8, 0 vs 8).

## Post-OCR pipeline

The `/api/extract` route:

1. PATCHes `processing.ocr.status = "running"` (cheap write).
2. Calls `identifyCouncil` (fast pre-pass) — PATCHes `ticket.{councilSlug, issuer}` if confidence ≥ 0.4. The reel lands.
3. Calls `extractTicket` (combined OCR + coach) — PATCHes the full ticket via `patchAppealDraft`. **Field-level merge** (v0.3.10 fix): the patch merges field-by-field, skipping empty values, so pass 2's empty fields don't wipe pass 1's good values.
4. Runs `mergeDuplicateDraftIfAny(appealId)` — folds duplicate uploads of the same PCN into the older draft in one transaction. Returns `mergedInto: <olderId>` if a merge happened.
5. Records one `ai_calls` row per Claude call (council_id + ocr; no separate coach row since v0.3.10).

## The knowledge pack handoff

The drafter doesn't see the markdown corpus directly — it sees a pre-assembled "knowledge pack" rendered into the prompt:

- **Precedents** — up to 6 won-appeal framings scored against the user's grounds + contravention code + council. Anonymised body text only.
- **Code briefs** — primary contravention-code summary + 1 similar code (e.g. code 12 + code 16 for permit-related contraventions). Legal basis + common rebuttals + discount rules.
- **Council brief** — exact-slug match. Postal address + appeal email + evidence bar + portal quirks.

Capped at ~2500 tokens. The audit trail (`{usedIds, tokens}`) writes to `appeals.knowledge_pack_used` so a future code review can trace which KB content informed a specific letter. See [`knowledge-base.md`](knowledge-base.md).

## Grounds registry handoff (P11)

For councils with deterministic submission paths, the drafter's `groundIds` output (canonical slugs from `lib/grounds-catalog.ts`) is resolved into the council-specific portal-radio-label via `resolveCouncilGroundLabel(slug, canonicalGrounds)` from `lib/server/submission/grounds/registry.ts`. The submission prompt embeds the translation table via `renderTranslationRule(LAMBETH_GROUNDS)` for drift-tolerant LLM-side lookup. See [`grounds-registry.md`](grounds-registry.md).

## Date normalisation handoff

The drafter's `ticket.issuedAt` is always ISO 8601 by the time it lands in the prompt — `persistPortalLookup`'s `normalisePortalSnapshotDates` boundary takes care of council-portal dd/mm/yyyy strings before the draft prompt is even assembled. The drafter doesn't have to deal with UK-format parsing. See [`date-handling.md`](date-handling.md).

## Cost telemetry

`recordAiCall(input)` writes one row per Claude invocation to `ai_calls`:

```ts
{
  appealId, jobId, stage, model, mode,
  inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens,
  costUsd, durationMs, ok, errorKind, errorMessage,
}
```

Stages today: `council_id`, `ocr`, `lookup`, `draft`, `strength`, `submit`, `strengthen_notes`. `coach` is in the AiCallStage union for historical rows but no longer written (folded into `ocr` since v0.3.10).

Helpers in `aiCalls.ts`:

- `classifyAiError(err)` — maps a thrown error to one of `timeout`, `rate_limit`, `parse`, `mcp`, `other`.
- `getCostBreakdowns(appealIds[])` — returns `Map<appealId, AppealCostBreakdown>` with `totalUsd`, `byStage`, `callsByStage`. Drives the admin Appeal Tickets cost columns.
- `formatCostUsd(usd)` — display helper.
- `ESTIMATED_FINISH_CLICK_USD` — projection constant.
- `projectSubmissionCost(appeal)` — sums known + projected stages for the "Total" admin column.

## Concurrency + timeouts

| Route | Timeout | Concurrency cap |
|---|---|---|
| `/api/extract` | 90 s | unbounded |
| `/api/improve-notes` | 60 s | unbounded |
| `/api/generate` + `/api/generate-stream` | 240 s | `PARKINGRABBIT_GENERATE_CONCURRENCY=4` (global semaphore) |
| `/api/transcribe` | 60 s | unbounded |
| `pcn_lookup` job (worker) | 6 min | 3 slots |
| `submit_appeal` job (worker) | 10 min | 2 slots |

## Failure modes

| Failure | Behaviour |
|---|---|
| Claude CLI missing | 500 with `AI_ERROR`; `/api/health` reports `claudeCli: missing` |
| Claude returns malformed JSON | Zod parse fails; route returns 500 (AI_ERROR); `setProcessingStep(ocr, "failed", msg)` lets the smart card surface the failure |
| Coach block malformed by Claude | `.catch(...).default(...)` swallows; ticket + confidence still flow through |
| Photo too large (> 8 MB) | Rejected client-side before reaching `/api/extract` |
| Photo unreadable | `coach.quality = "poor"`; failure card shows retake/upload/manual-entry CTAs |
| identifyCouncil low-confidence | Slug dropped; reel keeps spinning until full extract returns |
| Timeout mid-call | Job/route marked failed; `setProcessingStep` records the message; user sees Try again |

## Cross-refs

- The knowledge corpus the drafter consumes: [`knowledge-base.md`](knowledge-base.md).
- The submission engine the draft feeds into: [`submission-engine.md`](submission-engine.md).
- Cost telemetry table: [`data-model.md`](data-model.md) → `ai_calls`.
- The grounds catalog the drafter chooses from: [`../legal/grounds-quiz-reference.md`](../legal/grounds-quiz-reference.md).
- Per-council mapping the submission prompt uses: [`grounds-registry.md`](grounds-registry.md).
- Date normalisation: [`date-handling.md`](date-handling.md).
