# Prototype state

What actually exists in the repo right now, file-by-file, so a new contributor (or a fresh Claude conversation) can pick up without re-reading the whole git log.

Last refreshed: **2026-05-19**. Commit at time of writing: `e2bb34d` (web CI: ✅ green).

---

## Where things live

```
parkingappeal/                            # working dir (rename to snappeal/ — see README)
├── docker-compose.yml                    # name: snappeal → wiki + cloudflared tunnel
├── Caddyfile                             # local proxy (we now use the central host Caddy instead)
├── README.md                             # quick-start + deploy + ports + dir rename guide
├── CONTRIBUTING.md                       # sync policy: wiki is source of truth
├── LICENSE                               # proprietary
├── .github/workflows/
│   ├── wiki.yml                          # mkdocs build on push (anchor / link checks)
│   └── web.yml                           # apps/web — lint → tsc → build → e2e
├── fixtures/
│   └── mock-data.json                    # canonical contract (single source of truth)
├── wiki/                                 # MkDocs Material site (this wiki)
│   └── docs/                             # business / product / architecture / councils / legal / users / admin
└── apps/
    └── web/                              # Next.js 16 PWA — landing + /app routes
        ├── app/                          # App Router
        │   ├── page.tsx                  #  /                landing
        │   ├── privacy/page.tsx          #  /privacy         draft policy
        │   ├── terms/page.tsx            #  /terms           draft ToS
        │   ├── app/                      #  /app/*           in-app routes (mobile-first)
        │   │   ├── layout.tsx            #    shared shell: safe-top + max-w-md + BottomNav
        │   │   ├── page.tsx              #    Home (Hello + Start an Appeal + capture + Latest ticket + How it works + Tips)
        │   │   ├── capture/page.tsx      #    Step 1 — Photos (viewfinder hero + 3-method capture)
        │   │   ├── notes/page.tsx        #    Step 2 — Notes
        │   │   ├── paywall/page.tsx      #    Step 3 — £2.99 Stripe Payment Element
        │   │   ├── letter/[id]/page.tsx  #    Step 4 — drafted letter + Copy/Share/Track
        │   │   ├── tickets/page.tsx      #    Tickets list
        │   │   ├── tickets/[id]/page.tsx #    Ticket detail (timeline + submission)
        │   │   ├── tips/page.tsx         #    Tips library
        │   │   └── profile/page.tsx      #    Profile/Settings (no auth in v0.1)
        │   └── api/                      #  /api/*           server-side routes
        │       ├── health/route.ts       #    GET → config status
        │       ├── checkout/route.ts     #    POST → Stripe PaymentIntent
        │       ├── generate/route.ts     #    POST → Claude vision + draft (zod-typed)
        │       ├── submit/route.ts       #    POST → v0.1 mock confirmation
        │       └── stripe/webhook/route.ts  # POST → signature-verified webhook
        ├── components/                   # 11 components — see "Components" below
        ├── lib/
        │   ├── mock-data.ts              # typed fixtures mirroring fixtures/mock-data.json
        │   ├── stripe-client.ts          # singleton loadStripe() for the Payment Element
        │   └── server/
        │       ├── env.ts                # requireEnv() + hasDatabase()
        │       ├── contracts.ts          # zod schemas for ALL API routes
        │       ├── stripe.ts             # lazy Stripe SDK + PRICE_PENCE
        │       ├── ai.ts                 # generateDraft() — single Claude call
        │       └── db/
        │           ├── schema.ts         # Drizzle schema (councils, appeals, ...)
        │           └── client.ts         # lazy Postgres / null in mock mode
        ├── scripts/
        │   └── seed-councils.ts          # `npm run db:seed`
        ├── drizzle/
        │   └── 0000_faithful_slapstick.sql # generated initial migration
        ├── tests/                        # Playwright E2E suite (19 tests passing)
        │   ├── _fixtures.ts              # pre-seeds sessionStorage for splash/banner
        │   ├── landing.spec.ts           # 4 tests
        │   ├── app.spec.ts               # 7 tests
        │   ├── api.spec.ts               # 5 tests
        │   └── legal.spec.ts             # 3 tests
        ├── public/
        │   ├── logo.svg                  # System Blue shield with "S"
        │   └── manifest.webmanifest      # PWA manifest
        ├── playwright.config.ts          # serial, chromium, 1280×800, reuse dev server
        ├── drizzle.config.ts             # points at lib/server/db/schema.ts
        ├── vercel.json                   # framework: nextjs, region: lhr1, fn timeouts
        ├── .env.example                  # every required env var documented
        ├── tsconfig.json
        └── package.json                  # scripts: dev / build / lint / db:* / test:e2e
```

## Routes (17 total — all return 200)

| Route | Static / Dynamic | Notes |
|---|---|---|
| `/` | static | Desktop landing (hero + trust strip + how-it-works + download) |
| `/privacy` | static | Draft privacy policy |
| `/terms` | static | Draft terms of service |
| `/app` | static | In-app Home (Hello, Latest ticket, Capture shortcuts, How it works, Tips) |
| `/app/capture` | static | Viewfinder + 3 capture methods (real file inputs) |
| `/app/notes` | static | Free-text notes |
| `/app/paywall` | static (client) | Stripe Payment Element (or placeholder w/o env) |
| `/app/letter/[id]` | dynamic | Drafted letter + Copy/Share/Track |
| `/app/tickets` | static | Cases list |
| `/app/tickets/[id]` | dynamic | Case detail with timeline |
| `/app/tips` | static | Tips library |
| `/app/profile` | static | Settings/Help/Privacy (anonymous mode v0.1) |
| `/api/health` | dynamic | Config status (no secrets leaked) |
| `/api/checkout` | dynamic | Stripe PaymentIntent (£2.99) |
| `/api/generate` | dynamic | Claude vision + draft, 60s timeout |
| `/api/submit` | dynamic | v0.1 mock; v0.2 → Playwright MCP via Vercel Workflow |
| `/api/stripe/webhook` | dynamic | Signature-verified |

## Components (11)

| Component | Where | What |
|---|---|---|
| `Logo` | landing nav + footer + splash | `ShieldLogo` + `Wordmark` |
| `PhoneMockup` | landing hero | In-app preview with timeline |
| `WindscreenBackdrop` | landing hero | CSS-only PCN-on-windscreen scene |
| `StoreBadges` | landing download section | App Store + Google Play with Coming Soon ribbon |
| `BottomNav` | /app shell | 5-tab nav: Home / Tickets / Camera● / Tips / Profile |
| `AppealCard` | /app/tickets list | Status pill + summary + step progress |
| `Timeline` | ticket detail | Vertical timeline (Apple-style dots) |
| `HorizontalTimeline` | /app home + ticket card | Horizontal 4-step with green completed + blue in-progress |
| `CaptureMethods` | /app/capture | Real `<input capture="environment">` for camera + library |
| `LetterActions` | /app/letter | navigator.clipboard.writeText + navigator.share + Track link |
| `StripePaymentForm` | /app/paywall | `<Elements>` + `<PaymentElement>` themed to brand |
| `SnappealSplash` | root layout | 3-second branded splash animation (gated by sessionStorage) |
| `InstallBanner` | root layout (landing) | Sticky bottom-banner, beforeinstallprompt + dismissible |

## Brand — iOS system palette

| Token | Hex | Role |
|---|---|---|
| `--snappeal-primary` | `#007AFF` | Trust + action (Apple System Blue) |
| `--snappeal-success` | `#34C759` | Completed steps, positive outcomes |
| `--snappeal-navy` | `#0A1929` | Typography baseline |
| `--snappeal-bg` | `#FAFAFA` | Off-white page surface |
| `--snappeal-border` | `#E5E5EA` | Apple system gray 5 (deference) |
| `--snappeal-danger` | `#FF3B30` | Errors |
| `--snappeal-warning` | `#FF9500` | Rare warnings |

Why iOS palette: trust + financial-services recognition. Detailed psychology in [brand.md](../product/brand.md). Replaced an earlier purple (luxury/subscription vibe — wrong for an appeal app).

## What's wired vs mocked

| Capability | Status | Notes |
|---|---|---|
| **Native camera capture** | ✅ wired | `<input capture="environment">` opens rear camera on iOS Safari + Android Chrome. Photo → sessionStorage. |
| **Native photo library** | ✅ wired | `<input type="file" accept="image/*">` opens library picker. |
| **Native share sheet** | ✅ wired | `navigator.share` on the letter screen; falls back to clipboard on Safari desktop. |
| **Clipboard** | ✅ wired | `navigator.clipboard.writeText` with "Copied!" affordance. |
| **PWA install** | ✅ wired | Captures `beforeinstallprompt`; install button triggers it. iOS Safari users get instructions text. |
| **iOS safe areas** | ✅ wired | `safe-top` + `safe-bottom` env() classes; standalone-mode supported via `apple-mobile-web-app-capable`. |
| **Stripe payment** | ✅ wired (test mode) | Real `<Elements>` + `<PaymentElement>` when env keys are set; placeholder otherwise. |
| **AI draft generation** | ✅ wired (server-side) | `generateObject` with Claude Sonnet 4.6 via Vercel AI Gateway. Letter UI consumes mock until you wire the upload → /api/generate flow. |
| **Council submission** | 🟡 mocked | `/api/submit` returns a fake confirmation. v0.2 wires Playwright MCP + Vercel Sandbox per council. |
| **Database persistence** | 🟡 schema only | Drizzle schema + initial migration in `apps/web/drizzle/`. `getDb()` returns null without `DATABASE_URL` → in-memory mock-data mode. |
| **User accounts** | ⛔ deferred to v0.2 | Locked decision (B4 in mockup audit). Profile tab is Settings/Help/Privacy only. |

## CI

Two GitHub Actions workflows:

- **`.github/workflows/wiki.yml`** — runs `mkdocs build` on every push touching `wiki/**`. Catches broken nav, missing pages.
- **`.github/workflows/web.yml`** — on every push touching `apps/web/**` or `fixtures/**`:
  1. `npm ci`
  2. `npm run lint`
  3. `npx tsc --noEmit`
  4. `npm run build`
  5. `npx playwright install --with-deps chromium`
  6. `npm run test:e2e` (19 tests)
  7. uploads `playwright-report/` on failure

Both green on `main`.

## Splash + Install banner

- **Splash** — `SnappealSplash` renders once per `sessionStorage` session. 3.05-second timeline:
  1. Westminster PCN flies in
  2. Camera shutter flash
  3. Viewfinder brackets bracket the ticket
  4. Blue AI scan line sweeps top→bottom
  5. Snappeal wordmark + shield + success tick fade in
  6. Whole thing fades out
  - Respects `prefers-reduced-motion: reduce` (collapses to a 0.5s fade).
- **Install banner** — `InstallBanner` (landing only). Sticky bottom card with curly "Install" CTA + App Store / Play Store placeholders. Captures `beforeinstallprompt`. Hidden in `display-mode: standalone`. Dismissed banner sleeps 7 days in `localStorage`.

## Open work — what's next

The wiki audit table (`product/v0-1-mockup-audit.md`) is the canonical list. Top of the queue:

1. **End-to-end happy-path wiring** — `/app/capture` → `/app/notes` → `/app/paywall` → `/api/checkout` → `/api/generate` (with the photo from sessionStorage) → `/app/letter` rendering the *real* drafted letter, not mock.
2. **Per-council Playwright MCP recording** — start with Westminster (highest London volume). Each recording is a deterministic CI fixture replayed by the v0.2 submission engine.
3. **More inner-screen visual polish** — notes / paywall / tickets list / profile still on default styling.
4. **Domain + Apple Developer + Google Play accounts** — see [todo.md](../todo.md).
5. **Architecture wiki stubs** — `auth.md`, `ai-pipeline.md`, `submission-engine.md` were stubs; some still need the post-build details now that the code exists.

## How to verify everything works locally

```bash
# Wiki
docker compose up -d
# → http://localhost:8800 (mkdocs) or via central caddy at snappeal.theailab.dev

# Prototype
cd apps/web
npm install
npm run dev
# → http://localhost:3001  (landing) and /app

# Health check
curl http://localhost:3001/api/health

# Full suite
npm run lint && npx tsc --noEmit && npm run build && npm run test:e2e
```

19 tests should pass. Build should map 17 routes. Lint should report 0 warnings.
