# AI pipeline

All AI reasoning in Snappeal pipes through the headless **Claude Code CLI** (`claude -p`) — not directly through the Anthropic SDK or AI Gateway. This keeps every prompt, model, tool surface, and cost path consistent between the simple structured calls (extract a PCN, classify an inbound email) and the agentic calls (Playwright MCP portal submission).

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

A cheap OCR-only pass run from the capture screen via `/api/extract`. Single PCN photo in, structured `Ticket` shape out (issuer, councilSlug, pcnRef, vehicleReg, contraventionCode, location, issuedAt, amountPence). Used to populate the confirm-fields UI on `/app/capture` before the user pays.

### 2. Full appeal draft — `lib/server/ai.ts → generateDraft()`

The headline call. PCN photo + up to 6 evidence photos + the user's confirmed ticket fields + their notes go in; structured `{ ticket, groundIds[], letter }` comes back. Run from `/api/generate` after payment.

The system prompt is long and opinionated — see the file for the canonical version. It enforces:

- **No invented evidence.** If the photos and notes don't support a ground, do not cite that ground.
- **No placeholder strings in structured fields.** Empty string is the signal; never `"[NOT READABLE]"`.
- **250–500 word letter, plain English, no fake officer names.**
- **Ground IDs from a closed enumeration** (`contravention-did-not-occur`, `signage-unclear`, `valid-permit`, `blue-badge`, `loading-unloading`, `breakdown`, `medical-emergency`, `vehicle-not-mine`, `penalty-exceeds-amount`, `procedural-impropriety`, `traffic-order-invalid`).
- **councilSlug as kebab-case** matching the seeded `councils.slug` set.

When the AI returns a council slug we don't know, `attachDraftToAppeal()` keeps the slug on the ticket jsonb (for diagnostics) but resolves the FK column to `NULL`. No more FK constraint violations on unrecognised images.

### 3. Inbound mail classification — `lib/server/inbound.ts → processInboundMessage()`

Each council reply (received via `/api/inbound`) is classified into one of `cancelled | rejected | acknowledged | request | unknown` via a short Claude CLI call with a tiny `{ outcome, reasoning }` schema. When the outcome is `cancelled` or `rejected`, the appeal's status flips automatically and shows up in the Inbox + Tickets list.

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
- `/api/submissions/[id]/progress` (SSE) streams events to the client every ~750 ms. Closes on terminal status.
- `/app/submitting/[id]` renders the live UI — light glass header, milestone ladder (6 outlined-icon steps), latest screenshot pane with caption + URL chip, activity log.
- Ticket card shows a navy "Snappeal AI is filing your appeal" strip when `status=submitting`; tapping routes to `/app/watch/<appealId>` which redirects to the latest job's page.

## Headed-mode toggle

Admins can flip `@playwright/mcp` between headless and headed at `/admin/health` (gear toggle: **MCP browser visibility**). When ON, Chromium pops up on the dev server during every subsequent dry-run / live submission so you can watch the agent click through.

- In-memory store: `lib/server/settings.ts` (resets to the `SNAPPEAL_MCP_HEADED` env on restart).
- Spread into the MCP args by `mcpHeadlessFlag()` so the toggle takes effect on the next run.

## File map

```
lib/server/
├── claude-cli.ts     # runStructured() + runAgentic() — the wrapper
├── ai.ts             # generateDraft() + extractTicket() — the prompts live here
├── inbound.ts        # processInboundMessage() — classify council replies
├── concurrency.ts    # Semaphore for /api/generate
└── submission/portal.ts  # the agentic Playwright MCP runner
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
