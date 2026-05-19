# Snappeal

> Snappeal a London parking ticket in under five taps.

This repository hosts the **Snappeal** project — a London PCN appeal app at `snappeal.ai`.

- **Phase A** — the documentation wiki under `wiki/`. Business plan, product spec, architecture, council KB, legal/user guides.
- **Phase C v0.1 prototype** — the customer-facing PWA under `apps/web/`. Next.js 16 + Tailwind v4, mock-data driven (fixtures in `fixtures/mock-data.json`).
- **Phase B** — admin backend, scaffolded later (Next.js + Material UI).

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) running on your machine.
- Node 20+ for the Next.js prototype (the dev server runs on the host, not in Docker).

## Quick start

```bash
# Docker stack — wiki + Cloudflare tunnel, all under the "snappeal"
# project group in Docker Desktop.
docker compose up -d

# Next.js prototype on http://localhost:3001
cd apps/web
npm install
cp .env.example .env.local   # then fill in keys — see "Backend env" below
npm run dev
```

## Deploying to Vercel

The Next.js app lives at `apps/web/`. To deploy:

```bash
cd apps/web
vercel link                      # connect to the Vercel project
vercel env pull                  # pull env vars into .env.local
vercel deploy                    # preview deploy
vercel deploy --prod             # promote to production
```

**Required env vars** (`vercel env add` for each, or use the dashboard):

| Var | Scope | Notes |
|---|---|---|
| `STRIPE_SECRET_KEY` | preview + production | `sk_test_` for preview, `sk_live_` for prod |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | preview + production | matching `pk_test_` / `pk_live_` |
| `STRIPE_WEBHOOK_SECRET` | preview + production | from Stripe webhook config |
| `AI_GATEWAY_API_KEY` | preview + production | Vercel AI Gateway dashboard |
| `DATABASE_URL` | preview + production | Neon Postgres via Marketplace (optional in v0.1) |

**Vercel config**: `apps/web/vercel.json` pins Next.js framework, sets London region (`lhr1`), and bumps `/api/generate` + `/api/submit` to 60s function timeouts (vision OCR + per-council automation both need it).

**First-time setup**:

1. Install Vercel CLI: `npm i -g vercel`.
2. From `apps/web/`, `vercel link` and create a new project (or link to an existing one).
3. Install Marketplace integrations from the Vercel dashboard:
   - **Stripe** (test mode is fine pre-launch)
   - **AI Gateway** (provides `AI_GATEWAY_API_KEY` automatically)
   - **Neon** (provides `DATABASE_URL` automatically) — optional in v0.1
4. After integrations install, `vercel env pull` locally to get the keys into `.env.local`.
5. `vercel deploy` triggers a preview build.

## Backend env

The Next.js app exposes four API routes:

- **`POST /api/checkout`** — Stripe PaymentIntent (£2.99 GBP). Returns `clientSecret` for the Payment Element. Anonymous — no Stripe Customer record in v0.1.
- **`POST /api/generate`** — single Claude vision call via Vercel AI Gateway. Takes PCN photo + evidence photos + notes, returns extracted ticket fields + grounds + drafted letter (zod-typed).
- **`POST /api/submit`** — v0.1 stub returning a mock confirmation. v0.2 enqueues a Vercel Workflow that runs Playwright MCP in a Vercel Sandbox.
- **`POST /api/stripe/webhook`** — Stripe webhook receiver; verifies the signature and dispatches `payment_intent.succeeded` / `payment_failed` / `charge.refunded`.

Required env (set in `apps/web/.env.local`):

| Var | Used by | Get it from |
|---|---|---|
| `STRIPE_SECRET_KEY` | `/api/checkout`, webhook | Stripe Dashboard → test mode |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | client (Payment Element) | same |
| `STRIPE_WEBHOOK_SECRET` | `/api/stripe/webhook` | `stripe listen --forward-to localhost:3001/api/stripe/webhook` |
| `AI_GATEWAY_API_KEY` | `/api/generate` | Vercel AI Gateway dashboard |
| `DATABASE_URL` *(optional)* | Drizzle / Postgres | Neon (via Vercel Marketplace). Unset = mock-data mode. |

Until the env is wired, the API routes return helpful 500s explaining exactly which key is missing — the Stripe Payment Element falls back to a "configure Stripe" placeholder. Nothing else breaks.

Then:

- **Mockup / landing + app** — <http://localhost:3001> (and `/app` for the in-app screens).
- **Wiki** — accessible via the central Caddy at `http://snappeal.theailab.dev/wiki/` (when DNS is in place), or directly on the docker network via `snappeal-wiki:8000`.
- **Public URL** — `docker logs snappeal-tunnel | grep trycloudflare.com` prints the current Cloudflare Quick Tunnel URL pointing at the prototype.

## Ports & services

| Service | Port | Notes |
|---|---|---|
| Snappeal Next.js dev | host `:3001` | `theoddstracker-app` owns `127.0.0.1:3000`, so we use `:3001` |
| Snappeal Wiki | `snappeal-wiki:8000` (in-network only) | Served by main Caddy on `snappeal.theailab.dev/wiki/*` |
| Snappeal Tunnel | n/a (egress only) | `cloudflare/cloudflared` proxying `host.docker.internal:3001` |
| Main Caddy (host machine) | `:80`, `:443` | Pre-existing, at `~/Desktop/Caddy/Caddyfile` |

The Compose project name is **`snappeal`** (set via `name: snappeal` in `docker-compose.yml`) — Docker Desktop groups all Snappeal containers under that name.

## Project layout

```
parkingappeal/                    # working dir (rename to snappeal/ — see below)
├── apps/
│   └── web/                      # Next.js 16 PWA — landing + /app routes
│       ├── app/
│       │   ├── page.tsx          # public landing
│       │   └── app/              # in-app routes (mobile-first)
│       │       ├── page.tsx          (Home)
│       │       ├── capture/page.tsx
│       │       ├── notes/page.tsx
│       │       ├── paywall/page.tsx
│       │       ├── letter/[id]/page.tsx
│       │       ├── cases/
│       │       │   ├── page.tsx
│       │       │   └── [id]/page.tsx
│       │       └── profile/page.tsx
│       ├── components/           # Logo, PhoneMockup, StoreBadges,
│       │                         # BottomNav, AppealCard, Timeline
│       └── lib/mock-data.ts      # typed fixture (mirrors fixtures/mock-data.json)
├── fixtures/
│   └── mock-data.json            # canonical mock-data contract (single source of truth)
├── wiki/                         # MkDocs Material documentation site
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── mkdocs.yml
│   └── docs/                     # business / product / architecture / councils / legal / users / admin
├── docker-compose.yml            # name: snappeal → wiki + tunnel
└── README.md
```

## Renaming the working directory to `snappeal/`

The Compose project name is already `snappeal` (so Docker Desktop groups everything correctly). The host directory is still `parkingappeal/` only because renaming requires closing all open handles. To rename:

1. Stop the Next.js dev server (`Ctrl-C` in its terminal).
2. `docker compose down`
3. Close all editor / terminal sessions with the working dir set to `parkingappeal/`.
4. In Explorer or PowerShell:
   ```powershell
   Rename-Item C:\Users\User\Desktop\ParkingAppeal C:\Users\User\Desktop\snappeal
   ```
5. Re-open in your editor at the new path.
6. `docker compose up -d` and `npm run dev` (in `apps/web/`) to bring it back.
7. The main Caddyfile + `git remote` are unaffected (no path-based config).

## Roadmap

- **Phase A** (now, in progress) — public wiki: business plan, product spec, architecture, council KB, legal guides.
- **Phase C v0.1 prototype** (now, in progress) — Next.js PWA wired to mock data; this is the v0.1 mockup for UX iteration.
- **Phase C v0.1 backend** (next) — Postgres + Stripe + AI Gateway + Playwright MCP submission.
- **Phase B** — admin backend (Next.js + Material UI) with login, user CRUD, council CRUD, wiki editor.
- **Phase C v0.3** — Capacitor native wrappers, App Store + Play Store submission.

Detailed scope in `wiki/docs/business/roadmap.md`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The wiki is the source of truth; code follows the wiki, not vice versa.
