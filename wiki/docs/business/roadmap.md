# Roadmap

Last refreshed **2026-05-27 (v0.3.10)**.

Three phases, eight quarters, one product. The session-by-session blow-by-blow for any specific release is in [`../handoff.md`](../handoff.md) (current) or [`../archive.md`](../archive.md) (older).

## Phase A — Foundation *(2026 Q2)*

**Goal:** A public wiki containing the business plan, product spec, architecture, council knowledge base, and legal/user guides.

- ✅ MkDocs Material wiki in Docker
- ✅ Mission, vision, values, business plan, market figures
- ✅ Pricing rationale + unit economics
- ✅ Competitive landscape (DoNotPay context, UK letter shops)
- ✅ Go-to-market plan + risks register
- ✅ Council pages — 33 boroughs + TfL listed; verified subset (Westminster, K&C, Camden, Lambeth, Islington, TfL, City of London) filled in with portal URLs + automation status
- ✅ Legal guides — TMA 2004 statutory grounds, common London contravention codes, four-stage appeal process
- ✅ Architecture docs — system overview + 16 sub-pages (incl. the v0.3.10-new grounds-registry, deterministic-recipes, date-handling, drift-baseline-audit pages)

**Done.**

## Phase B — Admin backend *(2026 Q3, shipped)*

**Goal:** A private admin service running in the same Docker compose, with login, user management, and the council knowledge-base editor.

- ✅ `/admin/*` Next.js 16 RSC surface, admin-role gated
- ✅ Email + password auth + JWT cookie
- ✅ User CRUD with roles (`user` / `admin`)
- ✅ Council CRUD + per-council MCP automation editor with dry-run + reset-to-canonical
- ✅ Postgres-backed job queue with admin retry/cancel
- ✅ Settings page with mode-aware toggles + env inventory
- ✅ Notifications audit log + test push dispatcher (v0.3.9)
- ✅ Per-stage cost dashboards on appeal detail (v0.3.9)
- ✅ Per-user prefs editor (v0.3.9)

**Done.**

## Phase C — Customer-facing app

**Goal:** Ship the app users actually use.

### v0.1 → v0.3 — public-beta-ready *(2026 Q4 → 2027 Q1)*

**Current state (v0.3.10, 2026-05-27):** real backend live end-to-end. Everything originally scoped as v0.2 + v0.3 has shipped through the v0.3.0–v0.3.10 series. Long-form changelog at [`../archive.md`](../archive.md); current state in [`../handoff.md`](../handoff.md).

**Shipped in v0.3.x (newest first)**

- **v0.3.10 (2026-05-26 → 2026-05-27)** — Brand rename Snappeal → ParkingRabbit (273 files, env vars + cookies + CSS tokens). P11 per-council grounds-translation registry (Lambeth verified; pattern for 6 more). AI consolidation: combined OCR + photo-coach into one Claude vision call (~$0.075/upload, down from ~$0.13). Post-OCR appeal merge with transactional FK sweep. Two-layer lookup idempotency + stale-jobId guard. UK-date normalisation at the `persistPortalLookup` boundary. Validate-first reinforcement (`agreeTicket` + `useAutoValidate` send session header so guests don't 403). Status-snapshot bridge fix (no manual refresh required to flip out of `validating`). TicketCard modularised into `components/ticket/*`. Single-page manual entry with `?appealId=<id>` prefill from the failure card. Deep code-review pass caught 15+ defects.
- **v0.3.9 (2026-05-26 evening)** — Lambeth automation (4-step wizard prompts, appeal/payment URL split). Validate-first gate (`step=ticket_confirmed` before MCP). Per-stage cost telemetry table `ai_calls`. Settings system refactor (3-layer mode-aware). Web Push dispatcher + `notification_dispatches` audit log. Backlog/deadline ribbon. Slick MCP automation editor.
- **Phase 9** — Deterministic Lambeth recipe via Playwright (no Claude MCP). ~10–20 s @ $0 vs ~60–120 s @ ~$0.30 for the Claude path. Drift detection falls back to Claude automatically.
- **v0.3.7 (2026-05-26)** — DOM-first photo extraction via single `browser_evaluate`. Three milestone PNGs as audit trail. Drafting timeout bumped.
- **v0.3.6 (2026-05-26)** — `Agree & continue` gate. Conditional Amount + Issue-Date inputs. CouncilCheckChip absorbed the diff list. `persistPortalLookup` backfill-only merge. `getTicketDiscrepancies()` helper.
- **v0.3.5 (2026-05-26)** — Lazy council lookup. Pay/Appeal tiles on `pending_review`. New `appeal_not_possible` CardKind for paid/closed/not_found verdicts.
- **v0.3.4 (2026-05-25)** — Dictation-first build-appeal redesign. Weak-appeal "Add more evidence" rescores in place. OCR amount hardening. `lib/ticketDisplay.ts` source-of-truth.
- **v0.3.3 (2026-05-25)** — Dedicated `/app/scan` landing page. `<TicketLifecycleTimeline>` replaces `<TicketJourney>`. 5 new failure CardKinds.
- **v0.3.2 (2026-05-24)** — Background `<NotificationWatcher>` + in-app store + opt-in sheet at moment-of-value. `<TicketJourney>` vertical stepper. `/app/support` scaffold. Persisted submit-progress replay endpoint.
- **v0.3.1 (2026-05-23)** — Drafting-hang fix (contract bug). 3-step `<GatheringEvidenceCard>`. Cloudflare-grade SSE delivery (4 KB padding, identity encoding, no-store, 150 ms poll, 3 s keep-alive). `prewarmMcp()` at worker boot.
- **v0.3.0 (2026-05-23)** — 75-card grounds quiz across 12 categories. Voice dictation with mm:ss timer. Markdown knowledge base under `apps/web/knowledge/` (precedents + codes + councils). Appeal-strength score (0–100) with server-side cap to 45 on no-evidence + thin-notes.

For the full v0.2.x and pre-v0.2 history: [`../archive.md`](../archive.md).

**Scope locks** (still hold):

- Next.js 16 PWA, mobile-first; canonical domain `parkingrabbit.com`
- Five-tab bottom nav: Home / Tickets / Camera-centered / Support / Profile
- Validate-first flow: customer must tap "Confirm & validate with council" before MCP tokens are spent
- £2.99 per appeal (Stripe PaymentIntent); free Pay-yourself deep-link; Apple/Google Pay placeholder
- Three Claude call paths via the CLI: combined OCR+coach, draft, lookup MCP / submission MCP (or deterministic recipe where one exists)
- London-only for v0.1

**Still 🟡 / ⛔ in v0.1**

- 🟡 Apple / Google OAuth — branded buttons live; routes return 503 until Apple Developer Program + Google Cloud OAuth client clear
- 🟡 Care Plan Stripe Subscription — UI live, waitlist captures, webhook + admin CRUD pending
- 🟡 Inbound mail DNS/MX wiring — Postmark Inbound is the front-runner. `INBOUND_WEBHOOK_SECRET` REQUIRED in `NODE_ENV=production`.
- ⛔ Vercel deployment — local dev only so far

### v0.2 — public beta launch *(2027 Q1)*

- Apple + Google OAuth providers (gated on Developer accounts)
- Vercel deployment with the worker on a dedicated box (Fly.io / Railway / Vercel Sandbox)
- Inbound mail provider chosen + DNS/MX wired for `appeals.parkingrabbit.com`
- Stripe Subscription product for Care Plan + webhook + admin CRUD
- **P11 council onboardings** — Westminster, Camden, RBKC, Islington, TfL, City of London grounds-registry entries (awaiting portal screenshots from ops)
- **Westminster deterministic recipe** to match Lambeth's $0-cost lookup path
- Drift-baseline admin audit tool at `/admin/councils/[slug]/audit` (P9 follow-up)
- Council acceptance-rate dashboard in admin
- Service-failure refund workflow (system didn't deliver — distinct from outcome refunds)
- UK GDPR: 90-day photo auto-delete, DSAR endpoint
- Vercel BotID on `/api/checkout`, `/api/generate`, `/api/submit`, `/api/extract`
- Apple Pay merchant domain verification + Stripe live keys
- Public launch + press push

### v0.3 — native + scale *(2027 Q3–Q4)*

- Capacitor iOS + Android wrappers; App Store + Play Store submission
- SMS notifications
- ULEZ + Congestion Charge appeals (different statutory regime)
- Council partnership pilots
- Per-council deterministic recipes for the remaining 5 verified-onboarded London authorities (each saves ~$0.30/lookup at scale)
- Admin grounds-mapping CRUD at `/admin/councils/[slug]/grounds` (no-redeploy edits)
- TE9 witness-statement flow (post-OfR escalation route) — separate legal product
- (Cross-jurisdiction UK expansion deferred — v0.1 scope is **London-only** per the locked decision)

## What we deliberately defer

- **Private parking operators (POPLA / IAS)** — different regime, different evidence requirements. Revisit post-v0.3 once core CPE flow is solid + CAPTCHA / auth-vault story is in place.
- **Speeding/criminal notices** — out of scope; requires solicitor regulation.
- **Cross-jurisdiction expansion (Scotland, NI)** — different legal frameworks. England first.
- **B2B fleet products** — high-value but long sales cycle; consumer first.

## Cross-refs

- Current state: [`../handoff.md`](../handoff.md).
- Per-version detail (pre-v0.3.8): [`../archive.md`](../archive.md).
- External action items (domains, app store accounts, trademark, FOI, etc.): [`../todo.md`](../todo.md).
- Launch strategy + payment-strategy detail: [`launch-strategy.md`](launch-strategy.md), [`payment-strategy.md`](payment-strategy.md).
