# Roadmap

Three phases, eight quarters, one product.

## Phase A — Foundation *(now, 2026 Q2)*

**Goal:** A public wiki containing the business plan, product spec, architecture, council knowledge base, and legal/user guides — running in Docker.

- ✅ MkDocs Material wiki in Docker
- ✅ Mission, vision, values
- ✅ Business plan with researched market figures
- ✅ Pricing rationale + unit economics
- ✅ Competitive landscape (DoNotPay context, UK letter shops)
- ✅ Go-to-market plan
- ✅ Risks register
- 🟡 Council pages — 33 boroughs + TfL listed; top 5 (Westminster, K&C, Camden, Lambeth, Islington) filled with portal URLs and contact details
- 🟡 Legal guides — TMA 2004 statutory grounds, common London contravention codes
- 🟡 Architecture docs — system overview filled, the rest stubbed

**Done when:** `docker compose up wiki` boots and a reader can understand the business case end-to-end in 20 minutes.

## Phase B — Admin backend *(2026 Q3)*

**Goal:** A private admin service (Next.js + Material UI) running in the same Docker compose, with login, user management, and the council knowledge-base editor.

- Next.js 16 + MUI app, brand tokens shared with the wiki
- Email + password auth (bcrypt + sessions); magic-link optional
- User CRUD with roles (`superadmin`, `editor`, `viewer`)
- Council CRUD — full editing of the KB
- Wiki content editor — write back to `wiki/docs/*.md`, MkDocs auto-reloads, auto-commit to git
- Postgres 16 service in docker-compose
- Caddy reverse proxy: `/` → wiki, `/admin/*` → admin
- Appeals dashboard placeholder (lights up in v0.1)

**Done when:** a non-engineer ops user can add a new council, edit a wiki page, and create another admin user — all via the admin UI.

## Phase C — Customer-facing app

**Goal:** Ship the app users actually use.

### v0.1 — public beta *(2026 Q4)*

**Status as of 2026-05-23 (v0.3.1)**: real backend live end-to-end. Everything that was scoped as v0.2 (accounts, response tracking, queue) **pulled forward into v0.1**. v0.3.0 + v0.3.1 layered on the deep grounds quiz, voice dictation, knowledge base, appeal-strength score, drafting-hang fix, Cloudflare-grade SSE, and MCP prewarm — see the canonical [handoff.md](../handoff.md) for the per-version log. For historical file-by-file inventory see the [archive](../archive.md).

**Shipped — frontend**

- ✅ Next.js 16 PWA at `apps/web/`, mobile-first, responsive, no-zoom viewport
- ✅ Landing page (hero + trust strip + how-it-works + download)
- ✅ All in-app screens (Home, Capture extract+confirm + evidence grid, Notes, Paywall, Letter, Tickets list + detail, Inbox, Tips, Profile + 6 sub-pages)
- ✅ 5-tab bottom nav (Home / Tickets / Camera-centered / Inbox / Profile)
- ✅ AppHeader with shield + ParkingRabbit wordmark + UK pill
- ✅ Red action CTA + iOS-blue navigation palette
- ⛔ Wizard onboarding **removed in v0.2.9** — users land straight on the app home (the three `ActionHero` tiles). The component file `components/WizardOnboarding.tsx` is deleted; `<WizardSheet>` remains for in-flow coaching (photo coach, strengthen-my-notes). First-launch friction was net-negative once the flow shrank to four screens.
- ✅ Branded 3-second splash animation
- ✅ Install banner (landing-scope only)

**Shipped — backend**

- ✅ Postgres 16 in docker-compose, fourteen Drizzle migrations applied (0000–0013)
- ✅ Claude CLI piped headlessly for all AI reasoning (extract + draft + inbound classify)
- ✅ Postgres-backed job queue (`FOR UPDATE SKIP LOCKED`, exponential backoff, stale-lock recovery)
- ✅ Worker pool boots via `instrumentation.ts`
- ✅ Real submission engine — Claude+Playwright MCP for portal councils, email fallback (Resend-compatible)
- ✅ Inbound mail webhook + LLM classification + auto status update
- ✅ Email/password auth (pbkdf2-sha256, HS256 JWT in httpOnly cookie)
- ✅ Free-to-draft pricing model: AI letter drafting is free and unlimited; £2.99 is charged only when the user auto-submits via the **AI Auto-Submit Agent** (renamed from "MCP portal agent" for customer copy in v0.2.0). Retires the legacy Buy Time / Full Appeal / Care Plan three-tier model — wizard tier picker removed 2026-05-20; the `appeals.serviceTier` column still exists but is no longer surfaced in the UI.
- ✅ **v0.2.0 ParkingRabbit pivot + v0.2.1 audit + v0.2.2 error guards & cloud-first drafts**: brand rename Snappeal → ParkingRabbit (logo, manifest, OG/Twitter cards, layout metadata, all customer copy, inbound-mail subdomain `appeals.parkingrabbit.com`, Stripe `appInfo`, every LLM system prompt). Product expanded from challenge-only to a parking-ticket management app. Home `/app` rebuilt as three navy `ActionHero` cards (`Deal with parking tickets` / `Challenge a ticket` / `Pay a ticket`) — pricing no longer shown on the cards; it surfaces in the paywall + `PaymentSheet`. Tickets list `/app/tickets` rebuilt to derive a `displayState` (`at_risk` / `due` / `appealed` / `resolved`) from `appeal.status` + the 14-day discount window; filter chips `All / To Pay / Challenging / Resolved` (Challenging covers both at_risk and appealed — reviewing options and being in flight are one customer journey); new purple `--color-snappeal-appealed-*` token scoped to ticket-list state semantics only. New `/app/pay` flow (PCN-details → review-and-authorise) with a Stripe-ready placeholder. Care Plan card removed from home (waitlist page retained). Branded `not-found.tsx` + global `error.tsx` boundaries; every `/app/*/[id]` page returns an actionable card instead of a spinner or stack trace. Draft persistence moved off `sessionStorage` — ticket fields, notes, grounds, and service tier now write straight to Postgres via `/api/appeals/[id]` PATCH (see `lib/client/draft.ts`); photo data URLs are the only remaining client-only payload, tracked as a deferred Blob-storage task.
- ✅ Test-mode payment scaffold (Apple/Google/Card buttons that fake Stripe in dev)
- ✅ In-process semaphore caps concurrent Claude subprocesses
- ✅ Backend smoke tests: `npm run test:claude`, `npm run test:e2e:backend`
- ✅ **v0.2.10 Scan → AI Review → Recommendation launch shape** — `<ReviewRecommendation>` card became the canonical post-scan surface with three actions: Appeal / Pay yourself / Pay instantly with Rabbit (Coming soon). Ticket-status connector architecture wired (`lib/server/connectors/`): `IssuerConnector` interface, mock connector with "Preview" UI pill, registry with fallback semantics, `/api/appeals/[id]/status` route, `<TicketStatusBadge>` component. Rollout roadmap for real connectors in [`architecture/status-checker.md`](../architecture/status-checker.md).
- ⏪ **v0.2.11 Free-email experiment — reverted in v0.2.12.** Briefly tried exposing free council-email submission as a customer-facing path; rolled back because it devalued the paid product.
- ✅ **v0.2.12 Paid AI appeal IS the product** — recommendation card collapsed to Appeal with Rabbit (PAID, primary) + Pay yourself (FREE deep-link) + Pay instantly with Rabbit (+£1.99 Coming soon). Free email path removed from UI + `/api/submit`. Connector taxonomy extended with `TicketStage` enum + `canAppeal`/`canPay`/`daysLeftToAppeal`/`paymentUrl` fields. Wiki rewritten — see [`business/launch-strategy.md`](launch-strategy.md) and [`business/payment-strategy.md`](payment-strategy.md).
- ✅ **v0.2.13 Smart ticket card consolidation** — the entire post-scan flow collapsed onto a single `<TicketCard>` on `/app/tickets`. Deleted: `/app/validating/[jobId]`, `/app/submitting/[id]`, `/api/submissions/[id]/progress`, `<MCPLiveView>`, `<GeneratingOverlay>`, `<VerdictReveal>`, `<PassiveStatusBanner>`, `<TicketActionPanel>`, `<ExtractedDataPanel>`. New primitives: `lib/deriveCardState.ts` (11-state pure function), `hooks/useAppealLiveState.ts` (per-card SSE + IntersectionObserver), `<MCPLiveStrip>` (slim inline live-MCP). The smart card carries every state inline. See [`product/progressive-ticket-creation.md`](../product/progressive-ticket-creation.md).
- ✅ **v0.2.14–v0.2.17 Smart-card polish** — pending-review surface with three editable fields (PCN ref + vehicle reg text inputs + council `<select>`) and the "I agree to T&Cs" confirm button. New `processing` state with inline OCR/portal/recommendation status rows (`<ProcessingCard>`), `pending_review` after OCR, `gathering_evidence` after Appeal-tap (compact 6-option grounds quiz). Migration `0012_processing_status.sql` added `appeals.processing` jsonb + `appeals.pcn_image_url`. Step labels removed throughout.
- ✅ **v0.2.18 `/app/capture` deleted; upload entry on `/app/tickets`** — the old 1480-LoC capture page (camera live-preview, in-page OCR review, manual entry) replaced with a 5-line server-side redirect. The smart tickets page now hosts hidden file inputs + visible Camera/Library buttons; the home "Scan PCN" hero deep-links to `/app/tickets?scan=1` and the page auto-clicks the picker on mount. `lib/client/uploadPcn.ts` is the canonical upload helper (always creates a fresh appeal — fixes the guest-upload 403). Sign-in gate before drafting (`/api/generate-stream`) — guests bounce to `/sign-up?next=...` with grounds saved. Every state on one card on `/app/tickets`.
- ✅ **v0.3.0 Deep grounds quiz + voice dictation + knowledge base + appeal-strength score; `/app/tickets/[id]` collapsed to redirect.** Grounds catalog rewritten end-to-end (75 cards / 12 categories / lucide outline icons / `mapsTo: CanonicalGroundId[]` so a card can argue multiple grounds / `promptHook` + `weight` + `relevantCodes`). New `<GroundsQuizSheet>` fullscreen sheet, new `<DictationPanel>` + upgraded `<VoiceNoteButton mode="append">` with mm:ss timer + pause/resume. Markdown knowledge corpus at `apps/web/knowledge/{precedents,codes,councils}` with deterministic ranker in `lib/server/knowledge.ts` (score + 2500-token cap), audit trail in `appeals.knowledge_pack_used`. Drafter returns a 0–100 strength score + rationale + up to 3 evidence improvements; server-side cap to 45 when no photos AND notes < 50 chars. SSE adds a `strength` event frame. Migration `0013_appeal_strength_and_kb.sql` adds 4 nullable `appeals` columns. `/app/tickets/[id]` becomes `redirect('/app/tickets?expand=<id>')`.
- ✅ **v0.3.1 Drafting hang fix + three-step gathering + Cloudflare-grade SSE + MCP prewarm.** `GenerateRequest.pcnPhoto` made optional; both `/api/generate` and `/api/generate-stream` fall back to `appealRow?.ticket`; `generateDraft()` fails fast; validation-stage failures call `markAppealFailed()`. `<GatheringEvidenceCard>` becomes a numbered three-step `<StepBlock>` ladder (grounds → details → review). Four UI extractions (`<TicketCardHeader>`, `<CouncilPickerSheet>`, `<LetterPreview>`, `lib/format.ts`). SSE delivery hardened for Cloudflare — every event padded to 4 KB + `cache-control: no-store, no-transform` + `content-encoding: identity` + `x-accel-buffering: no` + 150 ms poll + 3 s keep-alive + `status`-kind projection in `useAppealLiveState`. Watch-live disclosure decoupled from SSE subscription; `showMcpLiveView` runtime flag default ON. `prewarmMcp()` at worker boot. No schema change.

**Scope decisions locked** (the original v0.1 mockup audit is folded into the [archive](../archive.md)):

- Next.js 16 PWA, mobile-first; canonical domain `parkingrabbit.com`
- 5-tab nav (revised from the original 4) — Inbox added once council reply tracking went live in v0.1
- Photos step (PCN photo + auto-extract+confirm metadata + 0–6 evidence photos)
- Notes step (tier-aware CTA: Free vs £2.99)
- Stripe Payment Element ready; fake-pay buttons in dev under `NEXT_PUBLIC_SNAPPEAL_FAKE_PAYMENT=1`
- Three AI calls: pre-payment extract, full draft after payment, inbound classify after council reply — all via Claude CLI
- Auto-submission for the top 7 councils via Playwright MCP — **LIVE by default**; set `SNAPPEAL_SUBMISSION_LIVE=0` to opt into the deterministic mock. Email fallback fires on both throw AND `success: false`.
- Storage: Postgres (canonical) + localStorage/sessionStorage (client cache); Vercel Blob for photos deferred
- Soft launch: TikTok founder-led + first 200 users/week cap

**Still 🟡 / ⛔ in v0.1**

- 🟡 Apple / Google OAuth — branded buttons live on `/sign-up`, `/sign-in`, and the wizard; `/api/auth/oauth/[provider]` returns 503 + "configure these env vars" until Apple Developer Program + Google Cloud project clear
- 🟡 Care Plan Stripe Subscription — UI live, waitlist captures, Subscription product + webhook pending
- 🟡 Inbound mail DNS/MX wiring — Postmark Inbound is the front-runner. `INBOUND_WEBHOOK_SECRET` is now REQUIRED in production.
- ✅ Admin backend UI — 13 admin pages shipped (`/admin/appeals`, `/admin/councils` + create + per-council MCP automation editor + dry-run, `/admin/submissions`, `/admin/inbound`, `/admin/jobs`, `/admin/users`, `/admin/health`, `/admin/wiki`)
- ⛔ Vercel deployment — local dev only so far

### v0.2 — OAuth + admin + Vercel *(2027 Q1)*

> *Previously scoped as "accounts + scale" — accounts shipped in v0.1, so the focus narrows to deployment and operator-facing tooling.*

- Apple + Google OAuth providers (gated on Apple Developer Program + Google Cloud account)
- Admin backend UI at `/admin` (gated by `role: 'admin'`) — appeals search, councils CRUD, submissions log + retry, inbound messages viewer, payments / refunds
- Vercel deployment with the worker in a dedicated function + the web instances setting `SNAPPEAL_DISABLE_WORKER=1`
- Inbound mail provider chosen + DNS/MX wired for `appeals.parkingrabbit.com`
- Stripe Subscription product for Care Plan + webhook
- Per-council Playwright MCP recordings for the remaining 26 London authorities
- Portal automation for the remaining 26 London authorities
- Council acceptance-rate dashboard in admin
- Service-failure refund workflow (system didn't deliver — distinct from outcome refunds, which we don't offer)
- UK GDPR: 90-day photo auto-delete, DSAR endpoint
- Vercel BotID on `/api/checkout`, `/api/generate`, `/api/submit`
- Apple Pay merchant domain verification + Stripe live keys
- Public launch + press push

### v0.3 — native + scale *(2027 Q3–Q4)*

- Capacitor iOS + Android wrappers; App Store + Play Store submission
- SMS notifications
- ULEZ + Congestion Charge appeals (different statutory regime)
- Council partnership pilots
- (Cross-jurisdiction UK expansion deferred indefinitely — v0.1 scope is **London-only** per the locked decision)

## What we deliberately defer

- **Private parking operators (POPLA / IAS)** — different regime, different evidence requirements. Revisit post-v0.3 once core CPE flow is solid.
- **Speeding/criminal notices** — out of scope; requires solicitor regulation.
- **Cross-jurisdiction expansion (Scotland, NI)** — different legal frameworks. England first.
- **B2B fleet products** — high-value but long sales cycle; consumer first.
