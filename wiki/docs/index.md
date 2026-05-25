---
hide:
  - navigation
  - toc
---

# ParkingRabbit

**Pay or challenge London parking tickets in minutes.**

This wiki is the source of truth for the ParkingRabbit project — what we're building, why, how, and for whom. **Last refreshed 2026-05-25 (v0.3.3 — dedicated `/app/scan` landing page (Camera / Upload picture / Input manually trio) reached by tapping the BottomNav centre FAB, `<ScanningOverlay>` minimal animated veil replaces the full-page `<UploadingOverlay>` and mounts inside the image preview during OCR, `<TicketLifecycleTimeline>` replaces `<TicketJourney>` as the smart card's primary state surface — single vertical journey with inline children per step + tint/warn/danger + failed status, 5 new failure CardKinds (`image_issue` / `image_unclear` / `info_needed` / `extraction_failed` / `council_lookup_failed`) surfacing recoverable error states on the card.)** Read [handoff.md](handoff.md) first if you're picking this up cold. Launch strategy: [business/launch-strategy.md](business/launch-strategy.md). Why pay-on-behalf is "Coming soon": [business/payment-strategy.md](business/payment-strategy.md). Portal lookup architecture: [architecture/status-checker.md](architecture/status-checker.md).

<div class="appeal-hero" markdown>

[**Business**<br><span>Mission, vision, business plan, market, pricing, roadmap.</span>](business/index.md)

[**Product**<br><span>The single-card user flow, features, design principles.</span>](product/index.md)

[**Architecture**<br><span>System overview, data model, AI pipeline, submission engine, knowledge base.</span>](architecture/index.md)

[**Councils**<br><span>All 33 London boroughs plus TfL — portal URLs, addresses, methods.</span>](councils/index.md)

[**Legal**<br><span>Statutory grounds, contravention codes, the appeal stages.</span>](legal/index.md)

[**Users**<br><span>How to appeal, what good evidence looks like, FAQ.</span>](users/index.md)

</div>

## What ParkingRabbit does

A Londoner snaps a photo of their Penalty Charge Notice (PCN). ParkingRabbit OCRs the ticket on the spot, looks the PCN up directly on the council portal in parallel to confirm it's still appealable, walks the user through a deep 75-card grounds quiz with voice dictation for the details, drafts a formal representation letter — citing the correct statutory ground and contravention code, addressed to the right council, framed using a private knowledge base of past wins + per-code statutory briefs + per-council quirks — scores the appeal's strength 0–100 (and warns the user before they pay if it's weak), then on £2.99 payment auto-submits the letter through the council's online portal via a headless Claude + Playwright MCP agent. Email submission is the fallback channel when a council's portal isn't automated yet. The pay-the-ticket path (£PCN amount + service fee) lives at `/app/pay` and is currently in build-out.

## What ParkingRabbit doesn't do

ParkingRabbit is not a solicitor. We draft representations and submit them on your behalf — we don't represent you at a tribunal hearing, and we don't guarantee an outcome. The strongest appeal is grounded in honest facts; we'll never invent evidence. The 0–100 appeal-strength score is calibrated to the evidence base — when no photos are attached and notes are < 50 chars, the score is server-side capped at 45 with a "we capped this because no evidence was attached" rationale.

## Where the project is right now (v0.3.3)

- **One smart card, one page.** Every appeal state (processing → pending_review → validating → needs_decision → gathering_evidence → drafting → letter_ready → submitting → submitted, plus the 5 new failure states) renders on the same `<TicketCard>` on `/app/tickets`. The card's primary state surface is the v0.3.3 `<TicketLifecycleTimeline>` — a single vertical journey from upload → resolution where each step can host inline children (image preview, grounds quiz, Pay/appeal choice tiles, letter preview), supports `tint: "warn" | "danger"` for deadlines + failures, and the new `failed` status (amber warning triangle). Replaces the legacy `<TicketJourney>` 3-step stepper + `ProcessingCard` inline rows + bottom-of-card timeline trio.
- **Dedicated `/app/scan` landing page** (v0.3.3). The BottomNav centre FAB is now a plain `<Link href="/app/scan">` — no more inline file-picker on tap. `/app/scan` shows an animated scanner preview frame at the top + three explicit buttons: **Camera** (primary, fires `<input capture="environment">`), **Upload picture** (library `<input>`), **Input manually** (`<Link href="/app/manual-entry">`). Camera + Upload both feed `uploadPcn(dataUrl)` and route to `/app/tickets?expand=<appealId>`.
- **`<ScanningOverlay>` minimal animated veil** (v0.3.3). Replaces the full-page `<UploadingOverlay>` (now dead code). Mounted **inside** the uploaded PCN image preview during OCR — soft blue veil + vertical sweep scan-line + four white corner brackets + "Scanning PCN…" pill with a pulsing primary dot. No full-page chrome, no caption ticker — just a tasteful "we're reading this right now" signal.
- **5 new failure `CardKind`s** (v0.3.3). The `CardKind` enum in `lib/deriveCardState.ts` is now **16 kinds** (was 11). New: `image_issue` (photo doesn't look like a PCN), `image_unclear` (low-confidence OCR), `info_needed` (required fields missing), `extraction_failed` (OCR errored/timed out), `council_lookup_failed` (portal check errored). All five are **recoverable** — retake, edit, retry, or proceed anyway — surfaced via `<TicketLifecycleTimeline>` `failed`-status steps with `tint: "warn"`.
- **Background notification system** (v0.3.2, unchanged). `<NotificationWatcher>` (mounted in `app/app/layout.tsx`) polls `/api/appeals` 5 s in foreground / 30 s when the tab is hidden, fingerprints each appeal, and fires both an in-app notification + a native browser `Notification` on three deltas: portal-lookup verdict landing, draft letter ready (or failing), submission settling. Three `NotificationKind`s drive the bottom-nav Tickets-tab badge counter. Permission asked context-sensitively at the moment of value via `<NotificationPermissionSheet>` (sessionStorage "Not now" — re-asks once per session, never silently suppressed forever).
- **Bottom nav** (v0.3.2 → v0.3.3): **Home · Tickets (counter badge) · [Scan FAB → /app/scan] · Support · Profile**. The Inbox tab remains retired. Support page is a chat-style scaffold with `mailto:support@parkingrabbit.com` and a reserved provider-mount point for future live chat.
- **Deep grounds quiz + voice dictation.** 75 specific cards across 12 categories (signs, suspensions, permits, Blue Badge, active use, necessity, identity, settled, amount, CCTV, procedural, traffic order) in a fullscreen `<GroundsQuizSheet>` with collapsible categories, fuzzy search, and per-code "Suggested for code N" pills. Voice dictation via `<DictationPanel>` + `<VoiceNoteButton mode="append">` with mm:ss timer, pause/resume, and guidance chips derived from picked cards.
- **Knowledge base wired into the drafter.** `apps/web/knowledge/{precedents,codes,councils}` — 4 anonymised precedents, 12 contravention-code briefs (01, 02, 12, 16, 21, 22, 23, 27, 30, 40, 47, 99), 6 council briefs (Westminster, Camden, Kensington & Chelsea, Lambeth, Islington, TfL). Deterministic ranker in `lib/server/knowledge.ts` (score + 2500-token cap) embeds the pack into the drafter system prompt. Audit trail on `appeals.knowledgePackUsed`.
- **Appeal-strength score** (0–100) returned with every draft. Surfaces as a green/amber/red badge above the Pay £2.99 button; sub-50 scores render a red `<aside>` with rationale + up to 3 evidence-improvement asks and rebrand the button to "Submit anyway for £2.99".
- **Cloudflare-grade SSE delivery** (v0.3.1). Every SSE event on `/api/jobs/[id]/progress` is padded to 4 KB so Cloudflare doesn't buffer; headers force `no-store, no-transform`, `content-encoding: identity`, `x-accel-buffering: no`; 150 ms poll + 3 s keep-alive. **Live SSE** for in-flight progress; **new GET `/api/appeals/[id]/submit-progress`** (v0.3.2) returns the persisted event log for the latest submit_appeal job so the Watch-live gallery survives a page reload.
- **MCP prewarm on worker boot** (v0.3.1). `prewarmMcp()` spawns `@playwright/mcp` + Chromium once at startup so customer #1 of a fresh deploy gets the same latency as customer #100 (no 30–60 s cold-start tax).
- **Backend live.** Postgres + Drizzle schema (11 tables, 14 migrations `0000`–`0013`), JWT cookie + sessionId-header auth (email/password pbkdf2-sha256 + OAuth), Postgres-backed job queue with `FOR UPDATE SKIP LOCKED` (2 slots for `submit_appeal`, 3 for `pcn_lookup`, zombie recovery, prewarm on boot), Claude CLI piped headlessly in two modes (`runStructured` + `runAgentic`), Westminster + Camden + K&C + TfL portal automations via Playwright MCP, inbound mail webhook, Stripe £2.99 PaymentIntent.
- **Admin backend live.** 14 admin pages — dashboard, appeals, councils + per-council MCP automation editor (with dry-run + canonical-reset), submissions, inbound classifier, jobs queue (retry/cancel), users, health, settings toggles (`mcpHeaded`, `stopAtReview`, `submissionLive`, `workerDisabled`, `fakePayment`, `skipPaymentCheck`, `showMcpLiveView`), wiki embed.
- **Deferred until production keys.** Live Stripe keys, live Apple/Google OAuth credentials, inbound DNS+MX records on `@appeals.parkingrabbit.com`, Vercel deployment. Tracked in [todo.md](todo.md).

See [handoff.md](handoff.md) for the canonical "what's shipped vs in-flight" log, and [business/roadmap.md](business/roadmap.md) for the longer-form plan.
