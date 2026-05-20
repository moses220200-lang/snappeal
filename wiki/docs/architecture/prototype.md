# Prototype state

What actually exists in the repo right now, file-by-file, so a new contributor (or a fresh Claude conversation) can pick up without re-reading the whole git log.

Last refreshed: **2026-05-20**. The prototype has graduated from "frontend + mock fixtures" into a real SaaS: live email auth, real Postgres persistence, Claude CLI for all reasoning, Playwright MCP submission engine, a Postgres job queue, and a three-tier pricing model.

---

## Where things live

```
parkingappeal/                                    # working dir (rename to snappeal/ — see README)
├── docker-compose.yml                            # name: snappeal → db + wiki + cloudflared tunnel
├── Caddyfile                                     # local proxy (we now use the central host Caddy instead)
├── README.md                                     # quick-start + deploy + ports + dir rename guide
├── CONTRIBUTING.md                               # sync policy: wiki is source of truth
├── LICENSE                                       # proprietary
├── .github/workflows/
│   ├── wiki.yml                                  # mkdocs build on push (anchor / link checks)
│   └── web.yml                                   # apps/web — lint → tsc → build → e2e
├── fixtures/
│   └── mock-data.json                            # canonical contract (kept only for landing + tests)
├── wiki/                                         # MkDocs Material site (this wiki)
│   └── docs/                                     # business / product / architecture / councils / legal / users / admin
└── apps/
    └── web/                                      # Next.js 16 PWA — landing + /app routes
        ├── instrumentation.ts                    #   boots the in-process job worker on server start
        ├── next.config.ts                        #   allowedDevOrigins for HMR over 127.0.0.1 / cloudflared
        ├── app/                                  # App Router
        │   ├── layout.tsx                        #     root layout — Splash + InstallBanner (landing-only) + no-zoom viewport
        │   ├── page.tsx                          #     /                landing
        │   ├── privacy/page.tsx                  #     /privacy         draft policy
        │   ├── terms/page.tsx                    #     /terms           draft ToS
        │   ├── sign-in/page.tsx                  #     /sign-in         email/password sign-in
        │   ├── sign-up/page.tsx                  #     /sign-up         email/password sign-up
        │   ├── app/                              #     /app/*           in-app routes (mobile-first)
        │   │   ├── layout.tsx                    #       shell: safe-top + max-w-md + BottomNav + WizardOnboarding
        │   │   ├── page.tsx                      #       Home (header + Start hero + PricingTiers + capture shortcuts + latest ticket + how it works + tips)
        │   │   ├── capture/page.tsx              #       Step 1 — Photos: rear-camera/upload PCN + auto-extract+confirm metadata + 6-slot evidence grid
        │   │   ├── notes/page.tsx                #       Step 2 — Notes (tier-aware CTA: free vs £2.99)
        │   │   ├── paywall/page.tsx              #       Step 3 — Pay (Buy Time = free button; Grounds = fake-pay row or real Stripe)
        │   │   ├── letter/[id]/page.tsx          #       Step 4 — drafted letter, real /api/appeals/[id], submit-then-poll
        │   │   ├── tickets/page.tsx              #       Tickets list (filter tabs: All / In Progress / Awaiting / Won / Lost + Most Recent badge)
        │   │   ├── tickets/[id]/page.tsx         #       Ticket detail (timeline + summary + linked letter)
        │   │   ├── inbox/page.tsx                #       Chat-style sent + received thread per appeal
        │   │   ├── tips/page.tsx                 #       Tips library
        │   │   └── profile/page.tsx              #       Profile (signed-in or guest), Sign in/Create/Sign out
        │   └── api/                              #     /api/*           server-side routes
        │       ├── health/route.ts               #       GET  → integrations + capabilities (Claude CLI / DB / Stripe / submission mode)
        │       ├── auth/sign-up/route.ts         #       POST → create user, set JWT cookie, claim guest appeals
        │       ├── auth/sign-in/route.ts         #       POST → verify password, set JWT cookie, claim guest appeals
        │       ├── auth/sign-out/route.ts        #       POST → clear JWT cookie
        │       ├── auth/me/route.ts              #       GET  → current viewer
        │       ├── appeals/route.ts              #       POST → create draft appeal · GET → list for viewer
        │       ├── appeals/[id]/route.ts         #       GET / PATCH single appeal
        │       ├── extract/route.ts              #       POST → fast pre-payment OCR pass for the capture page
        │       ├── generate/route.ts             #       POST → Claude CLI pipe, schema-validated draft, persists to DB
        │       ├── submit/route.ts               #       POST → enqueues submit_appeal job, returns immediately
        │       ├── inbox/route.ts                #       GET  → chat threads aggregating outbound + submissions + inbound
        │       ├── inbound/route.ts              #       POST → mail webhook (Postmark/Resend/SES envelope), classifies via Claude
        │       ├── jobs/[id]/route.ts            #       GET  → job status polling
        │       ├── checkout/route.ts             #       POST → Stripe PaymentIntent (£2.99) — real Stripe path
        │       └── stripe/webhook/route.ts       #       POST → signature-verified webhook
        ├── components/                           # 16 components — see "Components" below
        ├── lib/
        │   ├── client/session.ts                 # localStorage/sessionStorage helpers (sessionId, photos, notes, tier, ticket)
        │   ├── id.ts                             # nanoid-style id generator
        │   ├── mock-data.ts                      # typed fixtures — kept only for landing page demo
        │   ├── stripe-client.ts                  # singleton loadStripe() for the Payment Element
        │   └── server/
        │       ├── env.ts                        # requireEnv() + hasDatabase()
        │       ├── auth.ts                       # pbkdf2 password hashing + HS256 JWT + cookie helpers + user CRUD
        │       ├── viewer.ts                     # getViewer() → SessionUser from JWT cookie
        │       ├── claude-cli.ts                 # spawn(`claude -p ...`) wrapper — structured + agentic modes
        │       ├── ai.ts                         # generateDraft() + extractTicket() — single source of AI prompts
        │       ├── appeals.ts                    # create/get/list/attachDraft/recordSubmission + claim helpers
        │       ├── inbound.ts                    # parse + classify inbound council mail via Claude
        │       ├── concurrency.ts                # in-process Semaphore (caps concurrent Claude CLI subprocesses)
        │       ├── contracts.ts                  # zod schemas for every API route
        │       ├── stripe.ts                     # lazy Stripe SDK + PRICE_PENCE
        │       ├── jobs/queue.ts                 # Postgres queue: enqueue / claimNext (SKIP LOCKED) / markDone / markFailed
        │       ├── jobs/worker.ts                # in-process worker pool, boots from instrumentation.ts
        │       ├── submission/index.ts           # decide portal vs email per council; live or mock
        │       ├── submission/portal.ts          # Claude + Playwright MCP agent for council portals
        │       ├── submission/email.ts           # transactional email (stub or Resend)
        │       └── db/
        │           ├── schema.ts                 # Drizzle schema — users, councils, appeals, photos, payments, submissions, inbound_messages, jobs
        │           └── client.ts                 # lazy Postgres / null in mock mode
        ├── scripts/
        │   ├── seed-councils.ts                  # `npm run db:seed`
        │   ├── test-claude-cli.ts                # `npm run test:claude` — smoke test the Claude CLI wrapper
        │   └── test-e2e-backend.ts               # `npm run test:e2e:backend` — full backend audit (create → generate → submit)
        ├── drizzle/
        │   ├── 0000_faithful_slapstick.sql       # initial schema
        │   ├── 0001_spotty_invisible_woman.sql   # nullable ticket + userId + replyEmail + inbound_messages
        │   ├── 0002_whole_junta.sql              # users table
        │   └── 0003_motionless_thor_girl.sql     # jobs table
        ├── tests/                                # Playwright E2E suite — being rewritten for the real API path
        │   ├── _fixtures.ts
        │   ├── landing.spec.ts
        │   ├── app.spec.ts
        │   ├── api.spec.ts
        │   └── legal.spec.ts
        ├── public/
        │   ├── logo.svg                          # System Blue shield with "S"
        │   └── manifest.webmanifest               # PWA manifest
        ├── playwright.config.ts                  # serial, chromium, 1280×800, reuse dev server
        ├── drizzle.config.ts                     # auto-loads .env.local
        ├── vercel.json                           # framework: nextjs, region: lhr1, fn timeouts
        ├── .env.example                          # every required env var documented
        ├── tsconfig.json
        └── package.json                          # scripts: dev / build / lint / db:* / test:claude / test:e2e:backend / test:e2e
```

## Routes (38 total — all build green)

### Customer / marketing

| Route | Static / Dynamic | Notes |
|---|---|---|
| `/` | static | Landing — hero with yellow PARKING TICKET SVG, store badges, trust strip, how-it-works, dark download tile |
| `/privacy` | static | Draft privacy policy |
| `/terms` | static | Draft terms of service |
| `/sign-in` | static | Email/password sign-in |
| `/sign-up` | static | Email/password sign-up |
| `/icon.svg` | static | Favicon (white tile + blue shield) |
| `/apple-icon` | dynamic | 180×180 ImageResponse for iOS home-screen |
| `/opengraph-image` | dynamic | 1200×630 social-share card |
| `/twitter-image` | dynamic | Same image, twitter-card meta |

### In-app (mobile-first, bottom-nav shell)

| Route | Notes |
|---|---|
| `/app` | Home — hero + pricing tiers + capture + latest ticket + tips |
| `/app/capture` | **Unified Step 1.** Either PCN photo OR manual-entry data triggers the field grid + 6-slot evidence upload. Banner shown when arriving from manual flow. |
| `/app/manual-entry` | Council → PCN → reg → review → routes back to `/app/capture?from=manual` |
| `/app/notes` | **Step 2** — card-quiz of UK PCN appeal grounds (6 categories × ~25 cards from `lib/grounds-catalog.ts`) + optional collapsible notes textarea |
| `/app/paywall` | **Step 3** — free for `buy_time`; £2.99 fake-pay or Stripe for `grounds` |
| `/app/letter/[id]` | **Step 4** — drafted letter; Submit redirects to `/app/submitting/[jobId]` |
| `/app/submitting/[id]` | Live gamified view — slideshow of agent screenshots, milestone ladder, activity log, queue position, terminal "Submission complete" badge |
| `/app/watch/[appealId]` | Server-side redirect to the latest job's `/app/submitting/[id]` |
| `/app/tickets` | Filter tabs + cards with persistent **"Snappeal AI — Watch the AI submission"** CTA strip |
| `/app/tickets/[id]` | Detail + timeline + same AI CTA |
| `/app/inbox` | Chat-style sent + received per appeal |
| `/app/tips` | Tips library (now with `BackHeader`) |
| `/app/profile` | Signed-in/guest cards + 6 sub-pages (care-plan, help, notifications, payment-methods, personal-details, vehicles); Sign-in/up moved to top |
| `/app/profile/care-plan` | Care Plan upsell + waitlist signup |
| `/app/profile/help` | Help & support |
| `/app/profile/notifications` | Notification prefs |
| `/app/profile/payment-methods` | Saved cards (Stripe-stub) |
| `/app/profile/personal-details` | Name + email **(postal address columns exist in DB but not yet captured here)** |
| `/app/profile/vehicles` | Saved vehicles |

### API

| Route | Notes |
|---|---|
| `/api/health` | Reports claudeCli / db / stripe / submissionEngine / aiModel |
| `/api/auth/{sign-up,sign-in,sign-out,me}` | pbkdf2 + HS256 JWT |
| `/api/appeals` + `/api/appeals/[id]` | CRUD |
| `/api/extract` | Pre-payment OCR (Claude CLI) |
| `/api/generate` | Full draft (semaphore-capped) — accepts `preferredGroundCardIds[]` from the step-2 quiz |
| `/api/generate-stream` | SSE variant of /api/generate (scaffolded — Letter page still uses /api/generate) |
| `/api/submit` | Enqueues `submit_appeal` job |
| `/api/submissions/[id]/progress` | SSE — streams `progress` events from the job row (queue position, agent steps, screenshots) |
| `/api/inbox` | Thread aggregator |
| `/api/inbound` | Mail webhook → classify + store |
| `/api/jobs/[id]` | Job status polling + retry/cancel actions |
| `/api/improve-notes` | "Strengthen my notes" rewrite |
| `/api/transcribe` | Voice note → text (Whisper-compatible) |
| `/api/checkout` | Stripe PaymentIntent (real path, when enabled) |
| `/api/stripe/webhook` | Signature-verified |
| `/api/care-plan/waitlist` | Care plan signup |
| `/api/subscriptions/care-plan` | Care plan checkout endpoint |
| `/api/admin/councils` + `/[slug]` | Council CRUD |
| `/api/admin/council-automation/[slug]` | GET/PUT prompt; POST `{action: "dry-run" \| "reset-to-canonical"}` |
| `/api/admin/jobs/[id]` | POST `{action: "retry" \| "cancel"}` |
| `/api/admin/settings/mcp` | GET/PUT `{mcpHeaded, stopAtReview}` runtime toggles |
| `/api/admin/inbound/classify` | Sandbox classifier |

## Components (16)

| Component | Where | What |
|---|---|---|
| `AppHeader` | /app/*, top of each main tab | Shield + "Snappeal" wordmark + tagline + UK location pill |
| `Logo` | landing nav + footer + splash | `ShieldLogo` + `Wordmark` |
| `PhoneMockup` | landing hero | In-app preview with timeline |
| `WindscreenBackdrop` | landing hero | CSS-only PCN-on-windscreen scene |
| `StoreBadges` | landing download section | App Store + Google Play with Coming Soon ribbon |
| `BottomNav` | /app shell | 5-tab nav: Home / Tickets (Receipt) / Camera● / Inbox / Profile |
| `AppealCard` | (legacy — replaced by inline `TicketCard`) | Status pill + summary + step progress |
| `Timeline` | ticket detail | Vertical timeline (Apple-style dots) |
| `HorizontalTimeline` | /app home + tickets list | Horizontal stepper, green completed + blue in-progress |
| `CaptureMethods` | (subsumed into /app/capture) | Real `<input capture="environment">` for camera + library |
| `LetterActions` | /app/letter | navigator.clipboard.writeText + navigator.share + Track link |
| `StripePaymentForm` | /app/paywall | `<Elements>` + `<PaymentElement>` themed to brand |
| `FakePaymentButtons` | /app/paywall | Apple Pay / Google Pay / Card buttons — simulates Stripe in dev |
| `GeneratingOverlay` | /app/paywall (while drafting) | 30s phased progress card while Claude CLI runs |
| `SnappealSplash` | root layout | 3-second branded splash (sessionStorage-gated) |
| `WizardOnboarding` | /app shell | First-launch: welcome → service tier quiz → grounds quiz → permissions → OAuth/email upsell |
| `InstallBanner` | landing-only | Sticky bottom-banner, beforeinstallprompt + dismissible (scope-gated to `/`, `/privacy`, `/terms`) |

## Brand — iOS system palette + action red

| Token | Hex | Role |
|---|---|---|
| `--snappeal-primary` | `#007AFF` | Trust + secondary action (Apple System Blue) |
| `--snappeal-action` | `#F5454D` | **Primary CTA** ("Start an Appeal", "Generate appeal", "Create an account") |
| `--snappeal-success` | `#34C759` | Completed steps, "Won", positive outcomes |
| `--snappeal-navy` | `#0A1929` | Typography baseline + dark hero surfaces |
| `--snappeal-bg` | `#FAFAFA` | Off-white page surface |
| `--snappeal-border` | `#E5E5EA` | Apple system gray 5 (deference) |
| `--snappeal-danger` | `#FF3B30` | Errors |
| `--snappeal-warning` | `#FF9500` | Test-mode banner |

Action red was introduced to match the mockups — gives the primary CTA the visual weight financial-services patterns demand. iOS blue stays for navigational + secondary actions.

## Pricing tiers (the marketing mix)

| Tier | Price | What's included | Status |
|---|---|---|---|
| **Buy Time** | Free | Quick holding challenge to protect the 14-day discount window | ✅ live |
| **Full Appeal** | £2.99 one-off | AI-drafted grounds-based representation + tracked submission | ✅ live (test mode) |
| **Care Plan** | £9.99/mo | **Unlimited grounds-based appeals** + 90% appeal-rate guarantee + roadside invoice recovery + priority support | 🟡 coming soon (Stripe subscription scaffold pending) |

Tier selection happens in the wizard's Service step. Stored client-side at `localStorage["snappeal.serviceTier"]`. Paywall reads it and routes Free → no-payment confirm button, Grounds → Stripe (fake in dev) → /api/generate.

## What's wired vs mocked

| Capability | Status | Notes |
|---|---|---|
| **Native camera capture** | ✅ wired | `<input capture="environment">` on iOS Safari + Android Chrome. Stored to sessionStorage as data URL. |
| **Native photo library** | ✅ wired | Plain file picker, accepts up to 6 evidence photos (8 MB each). |
| **Native share sheet** | ✅ wired | `navigator.share` on the letter screen; clipboard fallback. |
| **Clipboard** | ✅ wired | `navigator.clipboard.writeText` with "Copied!" affordance. |
| **PWA install** | ✅ wired | Captures `beforeinstallprompt`; iOS Safari users get instructions text. |
| **iOS safe areas + no-zoom** | ✅ wired | `safe-top` + `safe-bottom`; `maximumScale: 1` + `touch-action: pan-x pan-y`. |
| **Stripe payment** | ✅ wired (test mode) | Real `<Elements>` + `<PaymentElement>` when env keys are set. `NEXT_PUBLIC_SNAPPEAL_FAKE_PAYMENT=1` flips to test buttons. |
| **AI extract (pre-payment OCR)** | ✅ wired | `/api/extract` pipes to Claude CLI, fills the capture-confirm UI. |
| **AI draft generation** | ✅ wired | `/api/generate` → `claude -p --json-schema` via `lib/server/claude-cli.ts`. Semaphore-capped (default 4 concurrent). |
| **Council submission** | ✅ wired | `/api/submit` enqueues a `submit_appeal` job. Worker drives Playwright MCP for portal councils, email fallback for others. `SNAPPEAL_SUBMISSION_LIVE=1` to fire real Playwright; default is deterministic mock for local dev. |
| **Database persistence** | ✅ wired | Postgres 16 in docker-compose. Four Drizzle migrations applied. All live pages read/write through the DB. |
| **Inbound mail** | ✅ wired (stub) | `/api/inbound` accepts Postmark/Resend/SES envelopes; Claude classifies into cancelled/rejected/acknowledged/request/unknown and auto-updates the appeal status. DNS + MX setup pending. |
| **Email/password auth (JWT)** | ✅ wired | pbkdf2-sha256 hashing, HS256 JWT in httpOnly cookie, /sign-in + /sign-up pages, sign-out button on Profile. Guest appeals claim onto the user on sign-in. |
| **OAuth (Apple / Google)** | 🟡 designed | Wizard auth step + branded buttons in place; routes redirect to email sign-up until Developer accounts clear and Clerk/our own provider is wired. |
| **Job queue + worker** | ✅ wired | `jobs` table, FOR UPDATE SKIP LOCKED claim, exponential backoff, stale-lock recovery. Worker boots from `instrumentation.ts`. |
| **Care Plan subscription** | 🟡 UI only | "Coming Soon" pill on the upsell cards. Needs Stripe Subscription product + webhook. |
| **Admin backend** | ⛔ not started | `role: 'admin'` is on the users table; UI is the next deliverable. |

## Backend architecture (in two paragraphs)

Every request lands in a Next.js App Router route handler. Auth-protected routes read the viewer via `lib/server/viewer.ts` (which verifies the HS256 JWT cookie). All AI reasoning — extraction during capture, the full appeal draft, inbound-mail classification — pipes through the headless `claude` CLI via `lib/server/claude-cli.ts`. The wrapper resolves the binary directly (no shell, avoids cmd.exe quote-mangling on Windows), passes `--json-schema` for structured output, and parses `structured_output` from the result. Vision is handled by saving images to a temp dir and `@`-mentioning them in the prompt with `--allowedTools Read`. Concurrency is capped by an in-process FIFO `Semaphore` so a burst can't fan out 50 subprocesses.

Long-running work — Playwright MCP council submissions — goes through the Postgres-backed queue in `lib/server/jobs/`. `/api/submit` enqueues a `submit_appeal` job and returns immediately; the worker (booted by `instrumentation.ts`) claims jobs with `FOR UPDATE SKIP LOCKED`, runs the per-council strategy (portal automation via Claude+Playwright MCP for `automation_status >= automated_beta`; transactional email otherwise), records the submission row, and the frontend polls `/api/appeals/[id]` for status changes. Failed jobs retry with exponential backoff (30s / 2m / 5m) up to `maxAttempts`. Zombie locks older than 5 minutes are reclaimable.

## CI

Two GitHub Actions workflows:

- **`.github/workflows/wiki.yml`** — runs `mkdocs build` on every push touching `wiki/**`.
- **`.github/workflows/web.yml`** — on every push touching `apps/web/**` or `fixtures/**`:
  1. `npm ci`
  2. `npm run lint`
  3. `npx tsc --noEmit`
  4. `npm run build`
  5. `npx playwright install --with-deps chromium`
  6. `npm run test:e2e`
  7. uploads `playwright-report/` on failure

The `test:e2e` suite is being rewritten for the real API surface (see [#8 in todo](../todo.md)).

## Open work — what's next

1. **Real Stripe Subscription** for the Care Plan tier (`£9.99/mo`). Product + price + webhook.
2. **OAuth providers** (Apple, Google) — gated on Apple Developer + Google Cloud accounts.
3. **Admin backend UI** — `role: 'admin'` users land on `/admin` with appeals search, councils CRUD, submissions log, inbound messages, payments/refunds.
4. **Wizard staging** — split the monolithic first-launch wizard into per-moment interventions (camera-tab first-press, grounds quiz inline on Notes, post-success upsell).
5. **Steve-Jobs polish** — win-rate ring, confetti on cancellation, streak badges, MCP a11y audit.
6. **Playwright E2E suite refresh** — current suite assumes mock-data; needs rewriting against the real API.
7. **Inbound mail DNS + MX** for `appeals.snappeal.ai` once a provider (Postmark / Resend / SES) is picked.

## How to verify everything works locally

```bash
# Postgres + wiki
docker compose up -d
# → db on 127.0.0.1:5544, wiki on snappeal.theailab.dev

# Prototype
cd apps/web
npm install
npm run db:migrate
npm run db:seed
npm run dev
# → http://localhost:3001 (landing) and /app

# Health check
curl http://localhost:3001/api/health
# claudeCli: ok, database: ok, drafting: true, submission: mock or live

# Smoke-test the Claude CLI wrapper (~9s, ~$0.04 with cache-warm)
npm run test:claude

# Full backend E2E (create → generate via Claude CLI → submit)
npm run test:e2e:backend

# Build + lint + typecheck
npm run lint && npx tsc --noEmit && npm run build
```

Build maps 30 routes. Lint reports 0 errors. Backend E2E should complete in ~30s (Claude CLI generation) and print `🎉 E2E backend audit passed`.
