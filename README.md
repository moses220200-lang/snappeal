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
npm run dev
```

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
