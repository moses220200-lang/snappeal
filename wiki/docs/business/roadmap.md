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

**Status as of 2026-05-19**: prototype frontend + backend foundation shipped. Full file-by-file inventory in [architecture/prototype.md](../architecture/prototype.md).

- ✅ Next.js 16 PWA at `apps/web/`, mobile-first, responsive
- ✅ Landing page (hero + trust strip + how-it-works + download section)
- ✅ All 9 in-app screens (Home, Capture, Notes, Paywall, Letter, Tickets list + detail, Tips, Profile)
- ✅ 5-tab bottom nav (Home / Tickets / Camera / Tips / Profile)
- ✅ Native PWA features: rear camera capture, photo library upload, Web Share, clipboard, install prompt, iOS safe areas
- ✅ Branded 3-second splash animation (Westminster PCN → camera shutter → AI scan → wordmark)
- ✅ Install banner (sticky landing footer, dismissible)
- ✅ Backend API routes: `/api/health`, `/api/checkout` (Stripe), `/api/generate` (Claude vision), `/api/submit` (mock), `/api/stripe/webhook` (signature-verified)
- ✅ Drizzle schema + initial migration + council seed script
- ✅ E2E test suite — 19 Playwright tests, CI green
- ✅ Vercel deploy config (London region, function timeouts)
- 🟡 Frontend ↔ `/api/generate` wired end-to-end (photo → AI draft → letter screen)
- 🟡 Per-council Playwright MCP submission recordings (Westminster first)

**Scope decisions locked 2026-05-19** (see [product/v0-1-mockup-audit.md](../product/v0-1-mockup-audit.md)):

- Next.js 16 PWA, mobile-first; canonical domain `snappeal.ai`
- Four-tab nav: Home / Cases / Camera / Profile (Profile = Settings/Help/Privacy/About — **no accounts in v0.1**)
- Photos step (PCN photo + 0–6 evidence photos)
- Notes step
- Stripe Payment Element (Apple Pay + Google Pay), £2.99 — one-off, non-refundable
- Single AI call: vision OCR + council identification + letter draft (Claude Sonnet 4.6 via Vercel AI Gateway)
- Letter step: editable, copy, share
- **Auto-submission in v0.1** — portal automation via LLM + Playwright MCP for the top 7 councils (Westminster, K&C, Camden, Lambeth, Islington, TfL, City of London), email fallback for all other London authorities, manual copy+portal as last-resort only
- Storage: anonymous, IndexedDB on device + Vercel Blob (photos) keyed by anonymous session
- Soft launch: TikTok founder-led + first 200 users/week cap

**Prototype-first build sequence** (decided 2026-05-19):

1. **Frontend with mock data** — build the entire UI against a JSON dummy-data fixture (no real backend). Validates the UX end-to-end without server dependencies.
2. **MCP deterministic flows** — script and test the per-council submission MCP flows against staging-like fixtures, deterministic and CI-runnable.
3. **UI/UX testing + iteration** — manual testing, accessibility audit, mobile-device coverage.
4. **Backend wire-up** — Postgres, Stripe live, AI Gateway, Vercel Blob, real council submission against the previously-tested MCP flows.
5. **Production cutover** — replace mock data with live backend behind a feature flag, roll forward.

### v0.2 — accounts + scale *(2027 Q1–Q2)*

- User accounts (Clerk via Vercel Marketplace) + migration of local IndexedDB appeals to the user's account
- Cross-device sync
- Response tracking — inbound mail handler parses council replies, updates appeal status
- Push + email notifications on council response
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
