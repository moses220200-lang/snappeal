---
hide:
  - navigation
  - toc
---

# ParkingRabbit

**Pay or challenge London parking tickets in minutes.**

This wiki is the source of truth for the ParkingRabbit project — what we're building, why, how, and for whom. **Last refreshed 2026-05-27 (v0.3.10).** Read [handoff.md](handoff.md) first if you're picking this up cold. Launch strategy: [business/launch-strategy.md](business/launch-strategy.md). Why pay-on-behalf is "Coming soon": [business/payment-strategy.md](business/payment-strategy.md). End-to-end UX flow: [product/user-flow.md](product/user-flow.md).

<div class="appeal-hero" markdown>

[**Business**<br><span>Mission, vision, business plan, market, pricing, roadmap.</span>](business/index.md)

[**Product**<br><span>The single-card user flow, features, design principles.</span>](product/index.md)

[**Architecture**<br><span>System overview, data model, AI pipeline, submission engine, state machine, grounds registry, deterministic recipes.</span>](architecture/index.md)

[**Councils**<br><span>All 33 London boroughs plus TfL — portal URLs, addresses, automation status.</span>](councils/index.md)

[**Legal**<br><span>Statutory grounds, contravention codes, the appeal stages, the 75-card grounds catalog.</span>](legal/index.md)

[**Admin**<br><span>Operator runbook — councils, users, subscriptions, monitoring.</span>](admin/index.md)

</div>

## What ParkingRabbit does

A Londoner snaps a photo of their Penalty Charge Notice (PCN). The smart card shows up on `/app/tickets` within ~2 s. OCR runs in two passes — a fast pre-pass locks the council logo while the full extract reads the rest in one combined Claude vision call (ticket fields + per-field confidence + photo-quality verdict, all in one round-trip). The user confirms the details (**Confirm & validate with council**) — and only then do we burn the ~$0.30 council-portal lookup. After validation completes, the customer picks one of three tiles: **Pay yourself** (free deep-link to the council site, no AI cost), **Apple/Google Pay** (Coming soon), or **Appeal £2.99**. Picking Appeal opens a conversational Build-appeal quiz with the council's verified record as the source of truth. Claude drafts the formal representation letter framed against a private knowledge base of past wins + per-code statutory briefs + per-council quirks + the new per-council **grounds-translation registry** (canonical slug → the exact radio-button text the council's portal uses). The strength score (0–100) warns the user before they pay if the appeal is weak. After payment, a headless Claude + Playwright MCP agent files the letter through the council's portal end-to-end with live transparency — or runs a deterministic Playwright recipe at ~$0 cost when one exists for the council (Lambeth today). Email submission is the fallback for non-automated councils.

## What ParkingRabbit doesn't do

ParkingRabbit is not a solicitor. We draft representations and submit them on your behalf — we don't represent you at a tribunal hearing, and we don't guarantee an outcome. The strongest appeal is grounded in honest facts; we'll never invent evidence. The 0–100 appeal-strength score is calibrated to the evidence base — when no photos are attached and notes are < 50 chars, the score is server-side capped at 45 with a transparent "we capped this because no evidence was attached" rationale.

## Where the project is right now (v0.3.10)

- **Validate-first flow.** The expensive council MCP lookup ONLY fires after the user has tapped "Confirm & validate with council" on the OCR review surface — `step=ticket_confirmed` is the dam. Cost story: OCR ~$0.075 (single combined call) + council-id ~$0.04; MCP ~$0.30 only after the customer has eyeballed the data and committed to validation.
- **Per-council grounds-translation registry (P11).** `lib/server/submission/grounds/<slug>.ts` owns the mapping from our 11 canonical ground IDs to each council's specific portal-radio-label string. `lib/server/submission/grounds/registry.ts` is the central lookup. Lambeth shipped first, verified against four real portal screenshots. Submission prompts render the table from the registry at module load — single source of truth.
- **Deterministic Playwright recipes (Phase 9).** Per-council `recipes/<slug>.ts` files run a pure Playwright walk (NOT Claude MCP) for the lookup step. Lambeth: ~10–20 s @ **$0** vs ~60–120 s @ ~$0.30 for the Claude path. DOM signature checks return `{ drift: true }` on portal markup changes, falling back to Claude automatically.
- **Post-OCR appeal merge.** Two uploads of the same `(pcnRef, vehicleReg)` converge onto the older draft. Transactional with explicit FK sweep for `jobs`, `payments`, `notification_dispatches`.
- **Two-layer lookup idempotency.** `enqueueLookupIfAutomated` catches queued/running siblings (layer 1) AND already-settled snapshots with a non-error status + jobId (layer 2). The "lookup twice in a row" admin observation is gone. Stale-jobId guard: pending-snapshot jobIds are verified against the jobs table before being treated as in-flight.
- **UK-date normalisation.** All date strings from council portals (`dd/mm/yyyy [HH:MM]`) are normalised to ISO 8601 at the `persistPortalLookup` write boundary. `parseUkDate` tries the UK regex FIRST (V8 would otherwise US-parse `12/05/2026` as Dec 5) and builds dates via `Date.UTC(...)` to avoid BST/UTC drift.
- **Status-snapshot bridge fix.** The card flips from `validating` to `needs_decision` the moment the worker writes the verdict — no manual refresh. Previously a stale snapshot cached at mount kept the card on "Checking council".
- **17 CardKinds + 3 sentinels.** All UI state is derived from `lib/deriveCardState.ts`. Sentinels: `EVIDENCE_DONE_STEP`, `TICKET_CONFIRMED_STEP`, `GENERATION_FAILED_STEP`.
- **Pricing.** £2.99 per appeal (live), Pay yourself free deep-link (live), Apple/Google Pay (Coming soon), Care Plan £9.99/mo (waitlist — Stripe Subscription scaffolded, webhook + admin CRUD pending).
- **Models.** Claude Sonnet 4.6 via the Claude Code CLI in pipe mode (no SDK). One wrapper at `lib/server/claude-cli.ts` for both structured one-shot (extract-with-coach, identifyCouncil, strengthen, score, draft) and agentic+MCP (lookup, submission). `claude-sonnet-4-6` for everything, override via `CLAUDE_MODEL`. Per-call attribution lands in `ai_calls.model`.
- **Backend live.** Postgres + Drizzle (15 tables, 17 migrations 0000–0016 — added `ai_calls` and `notification_dispatches`; dropped `appeals.model_used` + `appeals.cost_pence_millis`). Hand-rolled HS256 JWT cookie auth (`parkingrabbit.token`) + sessionId-header guests (`x-parkingrabbit-session`). Postgres-backed job queue with `FOR UPDATE SKIP LOCKED` (2 submit + 3 lookup + 1 draft slots). MCP prewarm at worker boot. Cloudflare-grade SSE delivery. Westminster has lookup + submission prompts (Claude MCP); Lambeth has a deterministic recipe + grounds-registry entry; other 32 boroughs in DB + wiki but `manual` until per-council artifacts are authored.
- **Admin backend.** 16 pages under `/admin/*` — Appeal Tickets (with per-stage cost columns + 14 themed detail cards), councils + per-council MCP automation editor with dry-run, submissions, inbound classifier, jobs queue, users + per-user prefs editor, settings toggles, notifications CRUD + dispatch log + test push, wiki embed.
- **Open work.** Per-council grounds-registry onboardings (Westminster, Camden, RBKC, Islington, TfL, City of London) — awaiting portal screenshots; admin grounds-mapping CRUD (deferred until 3+ councils mapped); drift-baseline admin audit tool (placeholder doc); Care Plan webhook + admin CRUD; Apple/Google OAuth completion; non-Westminster deterministic recipes; Capacitor native wrappers.

See [handoff.md](handoff.md) for the canonical "what's shipped vs in-flight" log and [business/roadmap.md](business/roadmap.md) for the longer-form plan.
