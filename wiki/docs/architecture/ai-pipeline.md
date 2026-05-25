# AI pipeline

All AI reasoning in ParkingRabbit pipes through the headless **Claude Code CLI** (`claude -p`) — not directly through the Anthropic SDK or AI Gateway. This keeps every prompt, model, tool surface, and cost path consistent between the simple structured calls (extract a PCN, classify an inbound email) and the agentic calls (Playwright MCP portal submission).

## Why Claude CLI and not the SDK?

Three reasons:

1. **One mental model for one-shot and agentic.** `runStructured()` and `runAgentic()` in `lib/server/claude-cli.ts` share the same spawn / JWT-style flow / temp-dir / image-handling / cleanup code. We don't maintain two parallel integration paths.
2. **Native MCP and structured output.** `claude -p --json-schema '{...}'` returns a schema-validated `structured_output` field; `claude -p --mcp-config ./mcp.json --allowedTools 'mcp__playwright__*'` boots Playwright MCP and exposes its tools to the agent — both without us writing the protocol plumbing.
3. **Same model + cache.** Vision + extract + classify + submission agent all run against the same Claude Sonnet 4.6 model, so the system-prompt cache stays warm across kinds of work; a follow-up call typically reads from cache for pennies.

The trade-off is that the runtime needs the `claude` binary on PATH (or `CLAUDE_BIN` set). Locally that's done by `winget install Anthropic.ClaudeCode` (Windows) / `brew install anthropic/tap/claude` (mac) / the npm package. In production we run inside a Vercel Sandbox with the binary baked into the image, or use a dedicated worker container.

## At-a-glance

- **Binary**: `claude` (resolved by walking `PATH`; `.exe` / `.cmd` candidates on Windows).
- **Model**: `claude-sonnet-4-6` (overridable via `CLAUDE_MODEL`).
- **Auth**: OAuth subscription by default (the user's logged-in CLI session); `--bare` + `ANTHROPIC_API_KEY` in prod.
- **Structured-output mode**: `--output-format json` + `--json-schema '<jsonSchema>'`. Result lives on `structured_output`.
- **Agentic mode**: `--output-format stream-json` + `--verbose` (required combo with `-p`) + `--mcp-config <path>` + `--allowedTools '...'` + `--dangerously-skip-permissions`.

## Three callers

### 1. Pre-payment extract — `lib/server/ai.ts → extractTicket()`

A cheap OCR-only pass invoked via `/api/extract`. Single PCN photo in, structured `Ticket` shape out (issuer, councilSlug, pcnRef, vehicleReg, contraventionCode, location, issuedAt, amountPence). v0.2.15+ the call is fire-and-forget from the client: `lib/client/uploadPcn.ts` POSTs `/api/extract` with the appealId, and the route PATCHes the result onto `appeals.ticket` + flips `processing.ocr.status = "done"` when it settles. The smart `<TicketCard>` polls the appeal row at 2 s and fills in the three editable confirmation fields (PCN ref / vehicle reg / council picker) as soon as they land — no full-page "Reading your PCN" blocker, no `/app/capture` confirm form (v0.2.18 deleted that intermediate page).

### 2. Full appeal draft — `lib/server/ai.ts → generateDraft()`

The headline call. **As of v0.3.1** the input bundle is: PCN photo *(optional from v0.3.1 — see below)* + up to 6 evidence photos + the user's confirmed ticket fields + their notes + the **selected ground cards with their `promptHook`s** + the **council-portal-verified metadata** (when the lookup ran) + a **knowledge pack** (precedents + code briefs + council brief) — output is structured `{ ticket, groundIds[], letter, strength: { score, rationale, improvements } }`.

**v0.3.1 drafting-hang root-cause fix.** `GenerateRequest.pcnPhoto` is now **optional** in `lib/server/contracts.ts`. Both `/api/generate` and `/api/generate-stream` fall back to `appealRow?.ticket` for `confirmedTicket` when the client doesn't re-upload the photo — which it shouldn't have to once the ticket fields are patched on the row. `generateDraft()` itself throws fast (clear error message) when neither a photo nor a complete ticket is in scope, instead of silently looping. Validation-stage failures call `markAppealFailed(appealId)` so the smart card's `validating` pill transitions to a visible failure state with a Retry CTA, instead of spinning forever.

Two endpoints expose it:

- **`/api/generate-stream`** — Server-Sent Events. Emits `appeal` (with the new appealId) → `ticket` → `ground` (one per identified ground) → **`strength`** (v0.3.0 — `{score, rationale, improvements}`) → `chunk` events for an 80-char-at-a-time typing animation of the persisted letter → `done`. Consumed via `fetch().body` + the tiny SSE parser at `lib/client/sse.ts` (EventSource can't POST a JSON body with the PCN photo). `attachDraftToAppeal()` runs BEFORE any chunk events fire (and writes the strength columns + the `knowledge_pack_used` audit trail), so the letter is fully persisted by the time the chunks start. **The call to `generateDraft` MUST forward `body.confirmedTicket` and run under `generateSemaphore` exactly like `/api/generate` does** — dropping `confirmedTicket` (as the original streaming cutover did) forces Claude to re-OCR the PCN from scratch on every request, and real photos blow the 120 s CLI timeout. Skipping the semaphore lets a burst of concurrent SSE requests fork unbounded `claude` subprocesses. Both invariants are enforced by mirroring the `/api/generate` shape line-for-line. The smart card on `/app/tickets` polls `/api/appeals/<id>` every 2 s until `letterBody` lands or `step === "generation_failed"`. On `generateDraft` throw the route calls `markAppealFailed(appealId)` which sets `step = "generation_failed"`, surfacing an inline Retry CTA on the smart card; the marker self-clears on the next successful `attachDraftToAppeal`.
  - **Phase-ladder mapping** — `appeal` event keeps the ladder on "Reading your PCN photo"; `ticket` advances to "Identifying the strongest grounds"; `ground` advances to "Drafting your representation letter"; `strength` updates the strength badge live on the card; `chunk` events feed the live letter preview; `done` ends the ladder.
- **`/api/generate` (legacy synchronous path)** — same input, blocks for ~30 s, returns the structured payload (now including `strength`) as a single JSON response. No client uses this since v0.1.5; kept for backwards compat.

#### `generateDraft` input shape (v0.3.0)

```ts
generateDraft({
  pcnPhotoDataUrl,
  evidencePhotoDataUrls,
  notes,
  confirmedTicket,
  selectedCards: [{ id, label, promptHook?, weight? }],
  portalMetadata,   // PortalLookupSnapshot["metadata"]
  knowledgePack,    // from loadKnowledgePack(...)
})
```

Both `/api/generate-stream` and `/api/generate` re-read the latest appeal row before calling `generateDraft`, resolve the persisted `appeal.grounds` (card IDs) to rich `{id,label,promptHook,weight}` objects via `getCardById()`, and call `loadKnowledgePack({groundIds, contraventionCode, councilSlug})` — the contravention code prefers the portal-verified value and falls back to OCR. The rendered pack is spliced into the prompt as the final pre-instruction block, capped at ~2500 tokens (see [knowledge-base.md](./knowledge-base.md#markdown-knowledge-corpus-v030)).

#### System prompt (7 sections)

The system prompt is long and opinionated — see the file for the canonical version. Sections:

1. **EXTRACT** the structured ticket fields from the PCN photo.
2. **GATHER CONTEXT** from every piece of evidence the user has supplied (notes + photos).
3. **IDENTIFY** the strongest grounds (at most 3) from the closed 11-ground enumeration.
4. **DRAFT** a 250–500-word representation letter in plain English.
5. **ADDRESSED-TO** the formal council parking-services postal address.
6. **USE THE KNOWLEDGE PACK** (v0.3.0). Mirror precedent framings in your own words, pre-empt common council rebuttals named in the code brief, respect council quirks (e.g. 14-day discount window). The pack is INTERNAL context — never named, cited, or quoted in the letter body.
7. **SCORE THE APPEAL STRENGTH** (v0.3.0). Calibrated 0–100 reflecting the **evidence supplied**, not the abstract merit of the legal argument. Bands: 80–100 strong, 50–79 solid, 30–49 weak, 0–29 very weak. When < 50, write a one-sentence rationale and up to 3 actionable evidence improvements. Pinned with a worked example: a "signage-unclear" ground with zero evidence photos and a 5-word note scores 25–35, NOT 60.

Hard rules:

- **No invented evidence.** If the photos and notes don't support a ground, do not cite that ground.
- **No placeholder strings in structured fields.** Empty string is the signal; never `"[NOT READABLE]"`.
- **250–500 word letter, plain English, no fake officer names.**
- **Ground IDs from a closed enumeration** (`contravention-did-not-occur`, `signage-unclear`, `valid-permit`, `blue-badge`, `loading-unloading`, `breakdown`, `medical-emergency`, `vehicle-not-mine`, `penalty-exceeds-amount`, `procedural-impropriety`, `traffic-order-invalid`).
- **councilSlug as kebab-case** matching the seeded `councils.slug` set.
- **Knowledge pack is internal context** — never cite, name, or quote its entries in the letter body.
- **Strength score reflects evidence supplied**, not abstract merit.

#### Server-side strength cap (v0.3.0)

Claude tends to score generously even when the evidence base is thin. After the model returns, `generateDraft` applies a defensive cap: if `evidencePhotos.length === 0 && notes.length < 50`, `strength.score` is clipped to ≤ 45 and the rationale is prepended with "We capped this because no evidence was attached." This means a user who picks "signage-unclear" with no photo and one sentence of notes always sees the weak-appeal warning above the Pay £2.99 button.

When the AI returns a council slug we don't know, `attachDraftToAppeal()` keeps the slug on the ticket jsonb (for diagnostics) but resolves the FK column to `NULL`. No more FK constraint violations on unrecognised images.

### 3. Inbound mail classification — `lib/server/inbound.ts → processInboundMessage()`

Each council reply (received via `/api/inbound`) is classified into one of `cancelled | rejected | acknowledged | request | unknown` via a short Claude CLI call with a tiny `{ outcome, reasoning }` schema. When the outcome is `cancelled` or `rejected`, the appeal's status flips automatically and shows up in the Inbox + Tickets list.

### 4. Voice-note transcription — `/api/transcribe` (v0.3.0)

Speech-to-text isn't Claude's job — it's a reasoning model, not a transcription engine. The dictation panel records audio with MediaRecorder (webm/opus on Chromium + Firefox, mp4/aac on Safari) and POSTs the Blob to `/api/transcribe`, which forwards it to a **Whisper-compatible HTTP endpoint** — OpenAI by default (~$0.006/min), or any OpenAI-API-compatible provider (Groq's `whisper-large-v3`, LiteLLM, Together) via `TRANSCRIBE_BASE_URL` + `TRANSCRIBE_API_KEY`. No key configured? The route returns 503 with a clear message and the dictation panel still works — the user just types instead of dictating.

We briefly tried routing audio through the Claude CLI in pipe mode (an early v0.3.0 experiment) but Claude doesn't do verbatim speech-to-text well — Whisper is the right tool for that job. The Claude CLI wrapper's `audioDataUrls` plumbing (`writeDataUrl` extended from `image/*` to `image/* | audio/*`) is left in place for future use; it's just not the transcription path.

## Concurrency and cost

`/api/generate` is wrapped in an in-process FIFO **Semaphore** (`lib/server/concurrency.ts`, default 4 slots, overridable via `SNAPPEAL_GENERATE_CONCURRENCY`). A burst of 50 simultaneous users serialises into batches of 4 × ~30s each — predictable load, no host meltdown.

Submission agentic runs go through the [job queue](./job-queue.md) instead, with a tighter cap (2 concurrent Playwright browsers).

Observed cost on a real PCN photo with cache-warm system prompt: **~$0.04 / draft**, 26–31 seconds wall-clock.
Observed cost on a Westminster portal dry-run (real PCN ref, 11 navigation steps, 5 screenshots): **~$0.33–0.42**, 90–180 s wall-clock.

## Live submission UX

Every `submit_appeal` job streams its progress to the customer in real time:

- `lib/server/jobs/progress.ts` — `appendProgress`, `watchScreenshots`, `queuePosition`.
- `runPortalAutomation({jobId, …})` translates each MCP `tool_use` into a customer-friendly step (`Opening the council portal`, `Typing into Vehicle reg`, `Capturing what you'd see`), appends to `jobs.progress` jsonb.
- A directory watcher polls both the agent's workDir AND `process.cwd()` (because `@playwright/mcp` ignores `--output-dir` on Windows) and forwards new PNGs to `public/submissions/<jobId>/`, emitting `screenshot` events.
- **`/api/jobs/[id]/progress`** is the SSE stream consumed by the smart card. **v0.3.1 hardened the delivery for Cloudflare:** every event is padded to **4 KB** with a trailing comment payload so Cloudflare doesn't buffer; headers force `cache-control: no-store, no-transform`, `content-encoding: identity`, `x-accel-buffering: no`. Poll cadence is **150 ms**; keep-alive comments fire every **3 s**. `useAppealLiveState` (`hooks/useAppealLiveState.ts`) projects the `status`-kind frames onto `latestStep`, so the smart card's inline status rows tick in real time instead of clumping every 8–20 s.
- The legacy `/api/submissions/[id]/progress` forwarder was deleted in v0.2.13. The full-page `/app/submitting/[id]` route was deleted in v0.2.13.
- The live MCP UI now lives in `<MCPLiveStrip>` (`components/MCPLiveStrip.tsx`) — a slim panel mounted behind a "Watch live →" `<details>` disclosure inside the expanded smart card on `/app/tickets`. **v0.3.1 Hide/Show decouple:** subscription gating depends on the `showMcpLiveView` runtime flag (default ON) — `watchLiveOpen` is purely a render concern, so collapsing the disclosure no longer unmounts the SSE consumer and reboots the MCP agent. Auto-expand on a fresh `submit_appeal` job via `autoOpenedForJobRef`.
- The smart card's status pill morphs to **Submitting** when `appeal.status=submitting`; `useAppealLiveState` subscribes to the active submit job's SSE so the agent caption streams inline on the card. `/app/watch/<appealId>` is a thin redirect to `/app/tickets?expand=<appealId>`.

## Headed-mode toggle + Watch-live flag

Admins can flip `@playwright/mcp` between headless and headed at `/admin/health` (or `/admin/settings`, gear toggle: **MCP browser visibility**). When ON, Chromium pops up on the dev server during every subsequent dry-run / live submission so you can watch the agent click through.

- In-memory store: `lib/server/settings.ts` (resets to the `SNAPPEAL_MCP_HEADED` env on restart).
- Spread into the MCP args by `mcpHeadlessFlag()` so the toggle takes effect on the next run.

The v0.3.1 **`showMcpLiveView`** runtime flag (default ON; OFF only when `NEXT_PUBLIC_SNAPPEAL_SHOW_MCP_LIVE_VIEW === "0"`) lets ops globally hide the "Watch live" disclosure on customer smart cards without a deploy. The decision flows through `useFlags()` (`lib/client/flags.ts`).

## File map

```
lib/server/
├── claude-cli.ts                 # runStructured() + runAgentic() — the wrapper
├── ai.ts                         # generateDraft() + extractTicket() + coachPhoto() + strengthenNotes()
├── knowledge.ts                  # loadKnowledgePack() — deterministic ranker over apps/web/knowledge/*
├── inbound.ts                    # processInboundMessage() — classify council replies
├── concurrency.ts                # Semaphore for /api/generate
├── settings.ts                   # mcpHeaded · stopAtReview · submissionLive · workerDisabled ·
│                                 # fakePayment · skipPaymentCheck · showMcpLiveView
├── submission/portal.ts          # agentic Playwright MCP submit runner
├── submission/lookup.ts          # agentic Playwright MCP read-only PCN lookup
├── submission/mcp-warm.ts        # prewarmMcp() — called by the worker at boot
└── submission/_progress.ts       # emitToolStep / extractJsonObject helpers

apps/web/knowledge/
├── precedents/*.md               # anonymised past wins (frontmatter: groundIds, codes, councilSlugs, outcome, date)
├── codes/*.md                    # one brief per common contravention code
├── councils/*.md                 # one brief per top London authority
└── README.md                     # contribution format

app/api/
├── jobs/[id]/progress/route.ts   # SSE with v0.3.1 4 KB padding + identity encoding + no-store
└── generate-stream/route.ts      # SSE drafter; emits ticket → ground → strength → chunk → done
```

## Failure modes (and what we do)

| Failure | Behaviour |
|---|---|
| `claude` binary missing | `/api/health` reports `claudeCli: missing`. All AI routes 500 with a clear error. |
| User not authed to Claude | Hits the API but returns `Not logged in · Please run /login`. We treat this as an AI error and surface the message. |
| Schema validation fails | `runStructured` throws `ClaudeCliError` with the failing payload tail (last 2 KB) for diagnostics. |
| Image unreadable | Claude returns empty-string fields (per the prompt). We persist what's there and the letter uses bracketed placeholders the user fills in. |
| Timeout (>120s structured / >180s agentic) | Child process killed with SIGTERM then SIGKILL; throws to the route handler. |
| Any non-zero CLI exit | `ClaudeCliError.message` includes the **stderr tail (600 chars) + stdout tail (300 chars)** baked in, so response bodies + logs surface the real cause instead of the opaque exit code. |

## Cost target

- < £0.08 per draft at v0.1 volumes (cache-cold worst case).
- < £0.04 once the system prompt cache is warm and the same session/region is reused.
- Inbound classification ≈ < £0.005 each.

## Open work

- Stream the letter body back to the client (`streamText`-style) for a faster perceived response.
- Golden-set regression: a fixture of ~30 hand-labelled PCN photos + expected ticket + valid grounds, run as part of CI.
- Per-council prompt overrides for the boroughs whose PCN template confuses the default reader.
- Move to `--bare` + `ANTHROPIC_API_KEY` in prod to shave the cache-creation overhead.
- 7-day cleanup cron for `public/submissions/<jobId>/` PNG accumulation.
- UA rotation for the headless browser — only if/when a portal trips Bot Manager. Westminster doesn't (verified 2026-05-20 with `WE66452241 / S99SNN`).
