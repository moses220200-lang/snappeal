# Snappeal — apps/web

The Snappeal Next.js 16 app: landing site + customer PWA + admin backend.

**Source of truth for project state:** [`wiki/docs/handoff.md`](../../wiki/docs/handoff.md). This README is intentionally short — anything beyond the dev quickstart belongs in the wiki.

## Quickstart

```bash
docker compose up -d            # Postgres (127.0.0.1:5544), wiki, tunnel
npm install
cp .env.example .env.local      # then fill in AUTH_SECRET + ANTHROPIC_API_KEY at minimum
npm run db:migrate              # apply all 9 Drizzle migrations
npm run db:seed                 # seed 7 councils
npm run dev                     # http://localhost:3001
```

`AGENTS.md` is the prompt Claude Code loads automatically — it reminds you that this is Next.js **16** and the APIs differ from earlier versions. Read `node_modules/next/dist/docs/` before writing anything that touches Next APIs.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on `:3001` (Next.js + in-process worker) |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | Typecheck |
| `npm run db:migrate` | Apply Drizzle migrations |
| `npm run db:seed` | Seed 7 councils + idempotent rerun |
| `npm run admin:promote -- you@example.com` | Promote a user to `role=admin` |
| `npm run test:claude` | ~9 s Claude CLI ping |
| `npm run test:e2e:backend` | ~30 s backend audit |
| `npm run test:e2e` | Playwright UI suite |

## Env

See [`.env.example`](./.env.example) for the full annotated list (Auth / DB / Claude+AI / Stripe / Submission / Inbound / Push / OAuth / Wiki / Address). Minimum to boot real-mode: `AUTH_SECRET`, `DATABASE_URL`, `ANTHROPIC_API_KEY`.

## Admin

Sign up via `/sign-up`, then run `npm run admin:promote -- you@example.com`. Sign back in and you'll auto-redirect to `/admin`. 13 admin pages live — see [`wiki/docs/architecture/admin.md`](../../wiki/docs/architecture/admin.md).

## Layout cheat sheet

```
app/                       # Next.js App Router
├── page.tsx               # Landing
├── app/                   # Customer PWA (the in-app shell)
├── admin/                 # Admin backend (gated by role:'admin')
├── api/                   # Route handlers (auth, generate, submit, oauth, …)
├── icon.svg, apple-icon.tsx, opengraph-image.tsx, twitter-image.tsx
components/                # Shared client components (Logo, headers, dialogs)
lib/
├── client/                # Browser helpers (haptics, session id)
├── server/                # Server-only (auth, ai, appeals, jobs, submission, …)
└── grounds-catalog.ts     # Customer-facing PCN appeal grounds
drizzle/                   # 9 migrations + meta
scripts/                   # Seed + promote + smoke tests
tests/                     # Playwright UI + API specs
```
