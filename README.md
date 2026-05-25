# ParkingRabbit

> Pay or challenge London parking tickets in minutes. **`apps/web` v0.3.0**.

This repository hosts the **ParkingRabbit** project — a London PCN management app (pay, challenge, track) targeting the canonical domain `parkingrabbit.com`. *Local Docker stack still uses the legacy `snappeal-*` container + volume names from the pre-rebrand era; those are stateful identifiers and intentionally left alone.*

**Source of truth for "what's shipped vs in-flight":** [`wiki/docs/handoff.md`](./wiki/docs/handoff.md). Read that first if you're picking this up cold.

- **`wiki/`** — MkDocs Material documentation. Business plan, product spec, architecture, council KB, legal/user guides.
- **`apps/web/`** — Next.js 16 + Tailwind v4 PWA with the **full real backend**: Postgres + Drizzle (11 tables, 14 migrations), email/password auth + JWT, Postgres-backed job queue, Claude+Playwright MCP portal-submission engine, inbound mail webhook, Stripe-ready pay-a-ticket + auto-submit-appeal payment flows, **markdown knowledge base** (`apps/web/knowledge/`) feeding the AI drafter with past wins + code briefs + council quirks (v0.3.0), **AI appeal-strength scoring** with weak-appeal warnings, **75-card inline grounds quiz** + voice dictation (Whisper-compatible endpoint, e.g. OpenAI or Groq), and a 13-page admin backend. (Earlier versions of this README framed it as a mock-data prototype — that hasn't been true since mid-May 2026.)
- **`fixtures/mock-data.json`** — kept around for typed fixture parity in tests; the live app reads from Postgres.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) running on your machine.
- Node 20+ for the Next.js prototype (the dev server runs on the host, not in Docker).

## Quick start

```bash
# Docker stack — Postgres + wiki + Cloudflare tunnel, all under the
# legacy "snappeal" project group in Docker Desktop (kept as-is to
# preserve the local Postgres volume across the v0.2.0 rebrand).
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

`apps/web` exposes 25+ API routes (`/api/auth/*`, `/api/oauth/*`, `/api/generate`, `/api/submit`, `/api/submissions/[id]/progress`, `/api/inbound`, `/api/stripe/webhook`, `/api/admin/*`, plus more). See [`apps/web/.env.example`](./apps/web/.env.example) for the canonical annotated list of every env var the code reads, and [`wiki/docs/architecture/auth.md`](./wiki/docs/architecture/auth.md) + [`wiki/docs/architecture/submission-engine.md`](./wiki/docs/architecture/submission-engine.md) for the wiring details.

Minimum to boot in real mode: `AUTH_SECRET` (32+ chars), `DATABASE_URL`, `ANTHROPIC_API_KEY`. Stripe + Resend + VAPID + OAuth are optional — the UI degrades gracefully ("Stripe not configured" / "OAuth coming soon") when keys are absent.

The Claude CLI is the live path for all AI reasoning (extract + draft + inbound classify + portal automation). `AI_GATEWAY_API_KEY` is kept as a fallback for the streaming letter path; the AI Gateway is not on the critical path.

Then:

- **Landing + app** — <http://localhost:3001> (and `/app` for the in-app screens).
- **Wiki** — accessible via the central Caddy at `http://snappeal.theailab.dev/wiki/` (when DNS is in place), or directly on the docker network via `snappeal-wiki:8000`. *(Caddy host alias still says `snappeal` — it'll be re-pointed at `parkingrabbit.com` when production DNS is provisioned.)*
- **Public URL** — `docker logs snappeal-tunnel | grep trycloudflare.com` prints the current Cloudflare Quick Tunnel URL pointing at the prototype.

## Ports & services

| Service | Port | Notes |
|---|---|---|
| Next.js dev | host `:3001` | `theoddstracker-app` owns `127.0.0.1:3000`, so we use `:3001` |
| Wiki (container `snappeal-wiki`) | `:8800` host → `:8000` container | Served by main Caddy on `snappeal.theailab.dev/wiki/*` |
| Tunnel (container `snappeal-tunnel`) | n/a (egress only) | `cloudflare/cloudflared` proxying `host.docker.internal:3001` |
| Main Caddy (host machine) | `:80`, `:443` | Pre-existing, at `~/Desktop/Caddy/Caddyfile` |

The Compose project name is **`snappeal`** (set via `name: snappeal` in `docker-compose.yml`) — Docker Desktop groups all containers under that legacy name. The brand pivoted to ParkingRabbit on 2026-05-21 but the Docker project + Postgres volume names are intentionally left alone so the local dev DB survives the rebrand.

## Project layout

```
parkingappeal/                    # working dir (rename to snappeal/ — see below)
├── apps/
│   └── web/                      # Next.js 16 PWA — landing + /app + /admin
│       ├── app/
│       │   ├── page.tsx          # public landing
│       │   ├── app/              # customer in-app shell (Home, Tickets, Capture,
│       │   │                     #   Notes, Paywall, Letter, Submitting, Watch,
│       │   │                     #   Inbox, Profile + 6 sub-pages, Tips)
│       │   ├── admin/            # 13-page admin backend (Appeals, Councils
│       │   │                     #   + MCP automation editor, Submissions,
│       │   │                     #   Inbound, Jobs, Users, Health, Wiki)
│       │   ├── api/              # 25+ route handlers
│       │   ├── sign-in/, sign-up/, privacy/, terms/
│       │   └── icon.svg, apple-icon.tsx, opengraph-image.tsx, twitter-image.tsx
│       ├── components/           # client components (TicketCard, TicketCardBody,
│       │                         #   GroundsQuizInline, DictationPanel, VoiceNoteButton,
│       │                         #   PaymentSheet, EvidenceCarousel, …)
│       ├── knowledge/            # v0.3.0 markdown KB — precedents/, codes/, councils/
│       ├── drizzle/              # 14 migrations (0000–0013); 0010–0013 hand-applied
│       └── lib/server/           # auth, ai, appeals, jobs, submission, viewer, …
├── fixtures/
│   └── mock-data.json            # typed fixture parity for tests
├── wiki/                         # MkDocs Material documentation site
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── mkdocs.yml
│   └── docs/                     # business / product / architecture / councils / legal / users / admin / handoff.md
├── docker-compose.yml            # name: snappeal → db + wiki + tunnel
└── README.md
```

## Working directory naming

The host directory is `parkingappeal/` for historical reasons (predates both the Snappeal and ParkingRabbit names). The Compose project name `snappeal` is independent and intentionally kept so the local Postgres volume survives the v0.2.0 brand pivot. No rename is required — the working dir is a local convenience and doesn't affect deploy.

## Roadmap

- **Phase A** (now, in progress) — public wiki: business plan, product spec, architecture, council KB, legal guides.
- **Phase C v0.1 prototype** (now, in progress) — Next.js PWA wired to mock data; this is the v0.1 mockup for UX iteration.
- **Phase C v0.1 backend** (next) — Postgres + Stripe + AI Gateway + Playwright MCP submission.
- **Phase B** — admin backend (Next.js + Material UI) with login, user CRUD, council CRUD, wiki editor.
- **Phase C v0.3** — Capacitor native wrappers, App Store + Play Store submission.

Detailed scope in `wiki/docs/business/roadmap.md`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The wiki is the source of truth; code follows the wiki, not vice versa.
