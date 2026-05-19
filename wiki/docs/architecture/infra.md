# Infrastructure

> :material-pencil-outline: **Stub.** Filled as each phase ships.

## Phase A — now

- **Docker** on the developer's machine.
- One service: `wiki` (MkDocs Material). Live-reload via mounted volume.
- No DB, no auth, no external dependencies.

```bash
docker compose up wiki
```

## Phase B — admin backend

Three additional services in the same `docker-compose.yml`:

- `admin` — Next.js 16 + Material UI dev server (`:3000`).
- `db` — Postgres 16.
- `proxy` — Caddy reverse proxy routing `/` → wiki and `/admin/*` → admin.

Volumes shared between `wiki` and `admin` so the wiki content editor can write back into `wiki/docs/**/*.md`.

## Phase C — customer-facing app

- **Hosting**: Vercel (Next.js 16, Fluid Compute, Node.js 24 LTS default).
- **DB**: Neon Postgres via Vercel Marketplace, EU region.
- **Object storage**: Vercel Blob (private), 90-day TTL on appeal photos.
- **AI**: Vercel AI Gateway → Claude Sonnet 4.6.
- **Payments**: Stripe (UK).
- **Workflows / Sandbox** (v0.2): Vercel Workflow DevKit + Vercel Sandbox.
- **Auth**: Clerk via Vercel Marketplace.
- **CDN / DDoS / WAF**: Vercel Firewall (automatic) + BotID on payment + generation endpoints.
- **Domains**: `snappeal.ai` (canonical), with `wiki.snappeal.ai` and `admin.snappeal.ai` subdomains.

**TODO**: deployment runbook, environment variable inventory, monitoring/alerting setup.
