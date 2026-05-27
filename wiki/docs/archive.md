# Archive

!!! warning "Historical — describes pre-current-state shapes of the product"
    Everything below describes earlier versions of ParkingRabbit (and its pre-v0.2 codename **Snappeal**) that no longer match the running product. Kept for institutional memory and so old wiki links still resolve. **Do not use as a reference for current behaviour** — see [system overview](architecture/system-overview.md), [data model](architecture/data-model.md), and the running [handoff.md](handoff.md) for v0.3.10 truth.

This page consolidates content from four previously-standalone pages that were either superseded or describe ancestor versions of the product, plus the long-form changelog entries demoted from `handoff.md` during the v0.3.10 wiki rewrite:

- `architecture/prototype.md` — file-by-file repo map from the v0.1 → v0.2.18 era.
- `product/mockups.md` — v0.1 designer mockup walkthrough.
- `product/v0-1-mockup-audit.md` — decision log capturing the gaps between the v0.1 wiki and the v0.1 designer mockups (incl. the Snappeal → ParkingRabbit rename on 2026-05-21 — note the *second* full rename happened on 2026-05-26 during the v0.3.10 codebase pass).
- `product/screens/homepage.md` — desktop landing-page spec keyed to the v0.1 mockup.
- **Pre-v0.3.8 handoff entries** — long-form changelog content for v0.3.0 through v0.3.7, demoted to one-liners on `handoff.md` during the v0.3.10 wiki rewrite.

For the actual git history of any of these pages, run `git log --follow -- wiki/docs/handoff.md` (or similar) — every revision is recoverable.

---

## Handoff long-form: v0.3.x changelog (demoted from handoff.md during v0.3.10 wiki rewrite)

### <a name="v039"></a>v0.3.9 (2026-05-26 evening) — major consolidation pass

Eight strands shipped:

1. **Lambeth automation** — appeal/payment URL split (`pcnevidence.lambeth.gov.uk/pcnonline/challenge.php` vs `lambethparking.paypcn.com/default.aspx`). Per-council Lambeth lookup + submission prompts (Imperial Civil Enforcement white-label of Westminster's stack). Submission prompt knows the 4-step wizard (Grounds radio → Details textarea → Contact form → Complete) and the 10 statutory grounds; closest-match translation rule from our internal slugs.
2. **Validate-first flow with confirm gate** — `pending_review` now requires the customer to eyeball OCR'd PCN ref + VRM and tap "Confirm & validate with council" BEFORE we burn ~$0.30 on a council-portal MCP lookup. `/api/extract` no longer auto-fires the lookup; the `agreeTicket` handler in `TicketCard` does that on user confirm. `useAutoValidate` hook is the backstop for old tickets, gated on `step === TICKET_CONFIRMED_STEP`. Cost story: OCR ~$0.05 + council-id ~$0.04, MCP only when the customer has eyeballed the data.
3. **Per-stage cost telemetry** — new `ai_calls` table (migration 0015): one row per Claude invocation with stage (`council_id` / `ocr` / `coach` (legacy; folded into ocr in v0.3.10) / `lookup` / `draft` / `strength` / `submit` / `strengthen_notes`), model, mode, costUsd, durationMs, ok, errorKind. Helpers in `lib/server/aiCalls.ts`: `recordAiCall`, `classifyAiError`, `getCostBreakdowns`, `formatCostUsd`, `ESTIMATED_FINISH_CLICK_USD`, `projectSubmissionCost`. Schema dropped legacy `appeals.cost_pence_millis` + `appeals.model_used`. Admin Appeal Tickets list shows per-stage cost columns (OCR / Validation / Draft / Submit / Total); appeal detail page has an "AI calls" card with full per-call breakdown.
4. **Settings system refactor (dev/prod)** — `getMode()` resolves dev/production from `PARKINGRABBIT_MODE` or `NODE_ENV`. Every toggle has a mode-aware default; `logStartupSanityChecks()` warns on dangerous combos (prod + stopAtReview / fakePayment / skipPaymentCheck). New `claudeMode: 'cli' | 'sdk' | 'deterministic'` segmented control. Dropped confusing "submission engine LIVE" toggle (stopAtReview is the real safety brake). Moved `showMcpLiveView` from admin → per-user `notification_prefs`. Merged `/admin/health` into `/admin/settings`. Per-toggle `dev` / `prod` / `both` applicability badges. Deduped 5 raw `process.env.PARKINGRABBIT_*` reads through `getSettings()` (instrumentation, worker, /api/submit, /api/generate, /api/health, PaymentSheet via `useFlags()`).
5. **Notification system (server)** — `notification_prefs` shape canonicalised in `lib/server/notifications/types.ts` with `mergePrefs`. `web-push` installed. `lib/server/push.ts` dispatcher with 410-Gone cleanup. `dispatchAppealEvent` orchestrator + per-event COPY registry. Five events: `validation_done`, `validation_failed`, `submission_done`, `submission_failed`, `council_replied`. Worker hooks fire pushes on `pcn_lookup` verdict + `submit_appeal` success/failure. New `notification_dispatches` table (migration 0016) — one row per dispatch attempt including no-ops (toggle_off / no_subscription / send_gone / send_failed) so admins can answer "why didn't user X get pinged?" by grepping the log.
6. **Notification system (client)** — `NotificationPromptGate` wrapper handles skip-once for two moments (`appealTap`, `submitDone`). Customer profile page rewired to server-backed prefs via `/api/users/me/notification-prefs` GET/PATCH + `/asked` skip-once. Six channel toggles incl. new "Watch live agent work" preference. `ActivityIndicator` component renders per-job-kind "agent at work" pill on every in-flight ticket card (removed from the card top-right in v0.3.10 because it duplicated the inline status pill).
7. **Backlog safety + deadline ribbon** — `lib/deriveDeadlineProximity.ts` helper uses portal_lookup → OCR fallback precedence. `DeadlineBadge` red/amber pill on card header when ≤7 days. Tickets list sorts urgent → open → settled (urgent by soonest deadline). Top banner above the list when any unsettled ticket has ≤7 days, taps to scroll the busiest card into view.
8. **Admin surfaces** — `/admin/appeals` rebranded "Appeal Tickets" with cost columns + Details button. Appeal detail page expanded to 14 themed cards covering EVERY field (identity, owner, council, AI calls, OCR, portal_lookup, letter, strength, grounds, knowledge pack, processing, timeline, submissions, inbound, jobs, push dispatches, raw JSON). `/admin/notifications` CRUD with dispatch log + filters + 7-day stats. `/admin/notifications/test` admin tool to fire test pushes. `/admin/users/[id]` user detail with `UserPrefsEditor` client component. Slick MCP editor at `/admin/councils/[slug]/automation`: line-numbered code editor, per-run screenshot toggle, drift counter vs canonical, "Inspect canonical" button. DB pool leak fix: `getDb()` stashes raw `postgres` connection on `globalThis` but re-wraps Drizzle per call.

### Phase 9 — Deterministic Playwright + drift detection (2026-05-26)

`lib/server/submission/recipes/` directory introduces a per-council Playwright runtime (NOT MCP). `CouncilRecipe` interface in `recipes/types.ts` returning `RecipeSuccess | RecipeDrift | RecipeError`. Lambeth recipe in `recipes/lambeth.ts` drives challenge.php directly: ~10–20 s wall-clock + **$0** vs ~60–120 s + ~$0.30 for the Claude MCP path. DOM signature checks at each step (input count, submit button presence, post-lookup metadata sanity) return `{ drift: true }` on portal markup changes, falling back to the Claude MCP path. `runDeterministicLookup` runner in `recipes/index.ts` owns the Chromium lifecycle (fresh isolated context per call, 60 s ceiling). `runPortalLookup` in `lib/server/submission/lookup.ts` tries the recipe first when a registered recipe exists; falls through to Claude on drift/error. Worker writes `mode='deterministic'` + `costUsd=0` on successful recipe runs.

### <a name="v037"></a>v0.3.7 (2026-05-26) — Lookup refactor

DOM-first photo extraction. The agent now harvests warden-photo URLs via one `browser_evaluate` and emits `[photoUrl]<url>` bracket-tags; `uploadPortalPhotosFromUrls()` in `lib/server/blob.ts` fetches each server-side and re-hosts to Blob. No per-photo screenshots — only 3 milestone PNGs (`01-portal-loaded`, `02-ticket-found`, `03-photos-summary`) persist as the audit trail (`jobs.progress`, MCPLiveStrip gated to `submit_appeal` only). Drafting timeout bumped to 200 s and `/api/generate-stream` `maxDuration` to 240 s; `spawnClaude` close handler now salvages the Windows `code:null` post-completion edge case when stdout is a valid JSON.

### <a name="v036"></a>v0.3.6 (2026-05-26) — Confirm gate

`Agree & continue` gate on the OCR review surface (step=`ticket_confirmed`); conditional Amount + Issue-Date inputs in `<PendingReviewCard>` when OCR returns empty; CouncilCheckChip grew to absorb the diff list (verified-with-diffs surface, live MCP thought streams in during `pending`); `CouncilConfirmedDetails` block in the drafting state; `DraftingFailedRow` + `retryDraft()` to surface real failures with a Retry button; `persistPortalLookup` backfill-only merge (no longer overwrites user-typed ticket values); `getTicketDiscrepancies()` helper for council-vs-user field comparison.

### <a name="v035"></a>v0.3.5 (2026-05-26) — Lazy council lookup

Pay/Appeal tiles moved up to render on `pending_review` itself; lookup ONLY fires when the user picks Appeal (cost-saving for customers who pay), and then runs in parallel with the Build-appeal conversation; new `appeal_not_possible` CardKind for paid/closed/not_found verdicts; draft kickoff deferred via a separate `useEffect` until both lookup-settled and step=`evidence_gathered`. (Reverted again in v0.3.9 — validate-first flow moves the lookup BACK to the confirm tap rather than the Appeal tile tap.)

### <a name="v034"></a>v0.3.4 (2026-05-25) — Dictation-first build-appeal

Build-appeal redesigned as a dictation-first conversational flow; weak-appeal "Add more evidence" re-scores in place (no letter redraft); council lookup advances the user the moment the verdict is confirmed (`onVerdictConfirmed` persists mid-job); OCR amount hardening; issuer-logo reel; `lib/ticketDisplay.ts` as the single source of truth for the displayed amount.

### <a name="v033"></a>v0.3.3 (2026-05-25) — Dedicated scan page

Dedicated `/app/scan` landing page; `<ScanningOverlay>` replaces `<UploadingOverlay>`; `<TicketLifecycleTimeline>` replaces `<TicketJourney>`; 5 new failure CardKinds (`image_issue`, `image_unclear`, `info_needed`, `extraction_failed`, `council_lookup_failed`).

### <a name="v032"></a>v0.3.2 (2026-05-24) — Background notifications

Background notification system (`<NotificationWatcher>` + client-side store + opt-in sheet at moment-of-value); `<TicketJourney>` vertical stepper; `/app/support` (chat-style placeholder); persisted submit-progress.

### <a name="v031"></a>v0.3.1 (2026-05-23) — Drafting-hang fix + SSE hardening

Drafting-hang root-cause fix (contract bug); 3-step `<GatheringEvidenceCard>`; Cloudflare-grade SSE (4 KB padding); MCP prewarm at worker boot.

### <a name="v030"></a>v0.3.0 (2026-05-23) — Deep grounds quiz + KB + strength score

Deep 75-card grounds quiz across 12 categories (`lib/grounds-catalog.ts`); voice dictation; markdown knowledge base (`apps/web/knowledge/`); appeal-strength score (0–100) with weak-appeal warning.

---

## Archived: `architecture/prototype.md` (v0.2.18 snapshot)

A file-by-file map of `apps/web/` as it stood in v0.2.18. It pre-dated the v0.3.0 deep-quiz / KB / strength-score work and the v0.3.1 drafting-hang fix. **Out of date in several material ways** — superseded by [system-overview.md](architecture/system-overview.md), [data-model.md](architecture/data-model.md), and [admin.md](architecture/admin.md) which now collectively cover the same ground for v0.3.10.

Useful context the snapshot captured that's worth knowing about as historical record:

- The pre-v0.3.0 route structure included `/app/validating/[jobId]`, `/app/submitting/[id]`, `/app/blocked/[appealId]`, `/app/paywall`, and `/app/capture` as a 1480-LoC live-camera page. **All of these are now deleted** (or are 5-line server-side redirects).
- Components since deleted: `MCPLiveView`, `GeneratingOverlay`, `VerdictReveal`, `PassiveStatusBanner`, `TicketActionPanel`, `ExtractedDataPanel`, the legacy live-camera auto-snap with Sobel edge detection, the v0.1 `<WizardOnboarding>`, and `<WizardSheet>` (the paywall-step UI).
- The pre-v0.3.0 grounds catalog had 6 hard-coded options inside `<GatheringEvidenceCard>`. **v0.3.0 replaced that with the 75-card 12-category catalog in `lib/grounds-catalog.ts`**, surfaced through `<GroundsQuizSheet>`.
- The pre-v0.3.0 drafter took the PCN photo as a required input. **v0.3.1 made `pcnPhoto` optional** in `GenerateRequest` — both `/api/generate` and `/api/generate-stream` now fall back to `appealRow?.ticket` for `confirmedTicket`. `generateDraft()` itself fails fast when neither photo nor complete ticket is available.
- The pre-v0.3.0 SSE delivery used a 1 s poll without padding — fine on Vercel direct, broken behind Cloudflare. **v0.3.1 added 4 KB per-event padding + `cache-control: no-store, no-transform` + `content-encoding: identity` + `x-accel-buffering: no` + 150 ms poll + 3 s keep-alive.**
- The pre-v0.3.0 worker boot order didn't prewarm MCP. **v0.3.1 added `prewarmMcp()` to the boot sequence** so customer #1 of a fresh deploy doesn't pay the 30–60 s `@playwright/mcp` + Chromium cold start.

---

## Archived: `product/mockups.md`

Walkthrough of two v0.1 designer mockups (delivered 2026-05-19):

1. **Marketing homepage** — desktop landing for `parkingrabbit.com`. Hero: phone-on-windscreen with a 4-step "Your Progress" timeline. Trust strip: Expert Appeal Writers · High Success Rate · No Win No Fee · Secure & Private. How-it-works: Upload Your Ticket → We Build Your Case → We Submit Your Appeal → We Fight. You Win.
2. **In-app home screen** — mobile. Greeting (`Hello, Alex 👋`), purple "appeal in progress" card, 4-step progress timeline, support card.

**Why archived.** The product moved well past the 2026-05-19 mockup. The marketing home still loosely follows the mockup's shape; the in-app home is now three navy `ActionHero` tiles (Scan PCN / Challenge it / Pay a ticket) on `/app`, and the appeal lifecycle renders inside one smart `<TicketCard>` on `/app/tickets` — not a separate "your progress" timeline. The shield-with-rabbit logo from the mockup was retained.

---

## Archived: `product/v0-1-mockup-audit.md`

Audit comparing the v0.1 wiki against the v0.1 mockup. 14 findings, 5 high-severity decisions closed on 2026-05-19. Key decisions that stuck:

| # | Question | Decision |
|---|---|---|
| A1 | Product name | **Snappeal** (initial codename) → renamed to **ParkingRabbit** in two passes: a 2026-05-21 brand pivot (logo + customer-facing strings) and a 2026-05-26 full codebase rename (env vars, cookie names, file names). |
| A2 | Geographic scope | **London-only** for v0.1 and v0.2. |
| B4 | Auth in v0.1 | Originally "scope down to Settings tab, no accounts" — **overturned in v0.1.5** when email/password + JWT cookie + OAuth scaffold landed. |
| C1 | Marketing voice | **"We draft"** — no "expert appeal writers" framing. |
| C2 | Auto-submit in v0.1 | **Yes** — portal automation + email fallback ship in v0.1. |

The audit's medium-severity colour and tagline findings drove the iOS System Blue / action red palette change (see commit `a7a9402 Repalette: purple → iOS System Blue + Apple-grade restraint`).

**Why archived.** All decisions are now reflected in code + the current wiki. The audit log itself is no longer load-bearing — it's just a record of how the decisions were made.

---

## Archived: `product/screens/homepage.md`

Desktop landing-page spec for `parkingrabbit.com/` keyed to mockup #1 above. Detailed the nav, hero, trust strip, how-it-works, app store badges, FAQ, and footer layout. Implementation lives at `apps/web/app/page.tsx` and has drifted from the v0.1 spec in several places (no Trustpilot strip; the "We Send to the Landowner" copy was corrected to "council"; the four "Expert Appeal Writers / High Success Rate / No Win No Fee / Secure" cards were trimmed to the ones supported by actual evidence).

**Why archived.** The page exists and works; the spec doc had drifted enough from reality that it was misleading. The canonical reference for the marketing site is the running page itself (`apps/web/app/page.tsx`) — not a wiki spec frozen at v0.1.

---

## Archived: handoff timeline (pre-v0.3 era)

These entries were lifted out of `handoff.md` during the 2026-05-26 wiki consolidation (v0.3.7). Each kept a one-line shape; the long-form prose is recoverable from the git history of `handoff.md` if a specific detail is ever needed: `git log -- wiki/docs/handoff.md`.

- **2026-05-23 (v0.2.18)** — "Add a ticket" page deleted. Everything moved onto `/app/tickets` itself: in-page file picker, list-page entry, smart card auto-expanded on the newest in-flight appeal. The 1480-LoC `/app/capture` page became a 5-line server-side redirect to `/app/tickets?scan=1`. Sign-in gate added before drafting (the AI-drafted letter is a customer record).
- **2026-05-23 (v0.2.17)** — Editable ticket fields on the smart card (PCN ref + Reg + council picker via `<EditableFieldRow>` + `<CouncilSelectRow>`); `patchThisAppeal()` helper to target the mounted appeal id rather than the session-current-draft pointer; step labels removed; `BackHeader` subtitle cleared.
- **2026-05-23 (v0.2.16)** — Full lifecycle on `/app/tickets`. New `gathering_evidence` CardKind, two-phase appeal handler (`startAppeal` PATCHes `preferredMethod`, `confirmEvidenceAndDraft` stamps grounds + step + fires generate-stream). Auto-expand on first paint via `isInFlight()`. Guest gate dropped (server-side `listAppealsForViewer` already scopes by sessionId).
- **2026-05-23 (v0.2.15)** — Progressive ticket creation. After upload the appeal row is created instantly, OCR fires fire-and-forget, the user is routed to the smart card immediately. New `processing` CardKind. `setProcessingStep` atomic merge into `processing` jsonb. The full-screen `<ReadingPcnOverlay>` was deleted (150 LoC).
- **2026-05-23 (v0.2.14)** — OCR review surface moved onto the smart card (`pending_review` state). Capture became a pure file-picker. sessionStorage `OcrHandoff` carries confidence + photo-coach across the route push.
- **2026-05-23 (v0.2.13)** — Smart ticket card is the single live surface. Five surfaces collapsed into one: `/app/validating/[jobId]`, `<VerdictReveal>`, `/app/tickets/[id]`, `<GeneratingOverlay>`, `<PassiveStatusBanner>`, `/app/submitting/[id]`. New primitives: `deriveCardState.ts`, `useAppealLiveState.ts`, `<TicketCard>`, `<TicketCardBody>`, `<MCPLiveStrip>`. Deleted: every live/submitting page, `<MCPLiveView>`, `<GeneratingOverlay>`, `<VerdictReveal>`, `<PassiveStatusBanner>`, `<TicketActionPanel>`, `<ExtractedDataPanel>`.
- **2026-05-23 (v0.2.12)** — Free email submission reverted. Paid £2.99 AI appeal is the product. Email submission survives internally as a portal-fallback for non-automated councils only.
- **2026-05-23 (v0.2.11)** — Brief free-email experiment (reverted in v0.2.12).
- **2026-05-23 (v0.2.10)** — Scan → Review → Recommendation launch shape; ticket-status connector architecture (`apps/web/lib/server/connectors/`); Rabbit Pay surfaced as "Coming Soon".
- **2026-05-23 (v0.2.9)** — Fewer screens, harder gates, popup-only verdicts. `/api/submit` refuses paid/closed/not_found verdicts (the gate that still ships).
- **2026-05-22 (v0.2.8)** — Tight MCP sessions + watertight queue + live data extraction. Real Westminster PCN test (`WE65333269` / `LB19 FWZ`) exposed three failure modes (browser-session lockout, race in the worker poll, screenshot-watcher missing some events) — all fixed.
- **2026-05-22 (v0.2.7)** — Event-bus streaming + premium MCP live view + guest gate. 3-layer SSE latency stack collapsed; localStorage-resurrect session-id bug fixed.
- **2026-05-22** — Portal-validated PCN intake. New `pcn_lookup` job kind firing between intake and the evidence/quiz page. Council's portal becomes the source of truth for ticket fields.
- **2026-05-22** — Audit pass + migration safety fix + wiki refresh (no feature work).
- **2026-05-22** — Live-camera auto-capture + inline manual entry + home simplification (auto-capture later retired in v0.3.3 when `/app/scan` shipped).
- **2026-05-21** — Home-card retitle + ticket-card dashboard redesign + bottom-nav polish.
- **2026-05-21** — Scan PCN polish + Tickets dashboard cleanup.
- **2026-05-21** — Error guards + cloud-first drafts.
- **2026-05-21** — System audit + brand cleanup.
- **2026-05-21** — **Brand pivot from `Snappeal` → `ParkingRabbit`** (customer-facing strings only — internal identifiers retained until the v0.3.10 codebase rename on 2026-05-26). Logo replaced (navy shield + rabbit). PWA manifest rewritten. New `/app/pay` flow scaffolded with a Stripe-ready placeholder. MCP-agent customer copy renamed to "AI Auto-Submit Agent". Doc-level version bumped to v0.2.0.
- **2026-05-21** — `/app` home rebuilt to a premium-fintech layout. Bottom-modal `PaymentSheet` for £2.99 auto-submit. Stripe `<PaymentElement>` (Apple Pay / Google Pay / card auto-detected) or `FakePaymentButtons` in dev.
- **2026-05-20** — Pricing simplified to free drafting + £2.99 per auto-submission. Council logos from Wikipedia thumbs stored in `councils.logo_url` / `logo_bg` (migration 0009). `<CouncilBadge>` component. Homepage "Covering these London authorities" logo strip.

Older sessions (April–mid-May 2026) covered the initial scaffold: monorepo bootstrap, Drizzle schema, first AI calls, the initial mockup audit, and the Snappeal-era visual design. Reconstructable from git history if needed.
