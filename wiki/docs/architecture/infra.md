# Infrastructure

How ParkingRabbit runs — locally today, on Vercel + a worker box in production.

## Local dev (today)

A single `docker-compose.yml` at the repo root brings up everything you need:

```yaml
services:
  db:      # Postgres 16, exposed on 127.0.0.1:5544
  wiki:    # MkDocs Material, behind central host Caddy
  tunnel:  # Cloudflared, points at host's Next.js dev server on :3001
```

The Next.js app runs natively on the host (not in Docker) so the Claude CLI can find your OAuth session in the keychain:

```bash
docker compose up -d
cd apps/web
npm install
npm run db:migrate   # apply all 14 Drizzle migrations (0000–0013)
npm run db:seed      # seed 7 councils
npm run dev          # http://localhost:3001
```

The worker boots automatically via `instrumentation.ts` when `DATABASE_URL` is set and `SNAPPEAL_DISABLE_WORKER` isn't.

### Required env (`.env.local`)

```env
DATABASE_URL=postgres://snappeal:snappeal@127.0.0.1:5544/snappeal
AUTH_SECRET=<32+ random chars>
CLAUDE_MODEL=claude-sonnet-4-6        # optional override
NEXT_PUBLIC_SNAPPEAL_FAKE_PAYMENT=1   # use the Apple/Google/Card stub buttons
SNAPPEAL_SKIP_PAYMENT_CHECK=1         # skip Stripe verification in dev
# SNAPPEAL_SUBMISSION_LIVE=0          # unset/anything-but-"0" = real Playwright MCP; "0" = mock
# ANTHROPIC_API_KEY=sk-ant-...        # if not using the CLI's OAuth session
# OPENAI_API_KEY=sk-...               # voice notes
# STRIPE_SECRET_KEY=sk_test_...       # real Stripe (test mode)
# STRIPE_CARE_PLAN_PRICE_ID=price_... # Care Plan subscription
# NEXT_PUBLIC_VAPID_PUBLIC_KEY=...    # Web Push subscribe
# VAPID_PRIVATE_KEY=...               # Web Push send (worker side)
```

The full list lives in `apps/web/.env.example`.

## Production (planned two-tier split)

```
┌───────────────────────┐
│ Vercel — Web tier     │
│ Next.js 16            │
│ All pages + API       │
│ SNAPPEAL_DISABLE_     │
│   WORKER=1            │
└──────────┬────────────┘
           │
┌──────────▼────────────┐    ┌─────────────────────────┐
│ Neon Postgres (EU)    │    │ Worker box              │
│ via Vercel Marketplace│◄───┤ Fly.io / Railway        │
│ 11 tables             │    │ Or Vercel Sandbox       │
└──────────┬────────────┘    │ - claude CLI binary     │
           │                 │ - Playwright + Chromium │
           │                 │ - instrumentation.ts    │
┌──────────▼────────────┐    │   boots worker          │
│ Vercel Blob           │    │ - prewarmMcp() on boot  │
│ private buckets       │    └──────────┬──────────────┘
│ 90-day TTL on photos  │◄──────────────┘
└───────────────────────┘
```

### Why two tiers?

The Claude CLI binary + Playwright + Chromium don't ship in Vercel function bundles. The web tier handles pages + auth + Stripe + reads/writes to Postgres. The worker tier owns:

- `/api/generate`, `/api/extract`, `/api/improve-notes` — Claude CLI calls
- `submit_appeal` jobs — Playwright MCP council submission
- `processInboundMessage` — Claude classification on inbound mail
- Future: scheduled jobs (retry sweeps, DSAR processors, win-rate aggregations)

The two tiers share Postgres + Blob. The web tier can call the worker tier's `/api/generate` directly (HTTP) when a user is mid-flow.

### Alternative: single-tier Vercel deploy

If you can live without portal automation and don't mind direct Anthropic SDK calls (rather than CLI piping), the AI paths can be rewritten to use `@anthropic-ai/sdk` directly. That gives you everything on Vercel functions at the cost of:

- Losing native MCP integration (have to orchestrate tool-use loops manually)
- Losing the agent-runs-as-Claude-Code-CLI behaviour for portal submission
- Two slightly diverged AI integration paths

For v0.1 launch this single-tier path is reasonable; for v0.2 onward the worker box is the right move.

## Deployment runbook (Vercel web tier)

```bash
cd apps/web
vercel link                # link to a Vercel project
vercel env add DATABASE_URL production
vercel env add AUTH_SECRET production
vercel env add STRIPE_SECRET_KEY production
vercel env add STRIPE_WEBHOOK_SECRET production
vercel env add STRIPE_CARE_PLAN_PRICE_ID production
vercel env add ANTHROPIC_API_KEY production       # for the worker
vercel env add NEXT_PUBLIC_VAPID_PUBLIC_KEY production
vercel env add VAPID_PRIVATE_KEY production       # worker side
vercel env add SNAPPEAL_DISABLE_WORKER production # set to "1"
vercel --prod
```

Then provision **Neon Postgres** via the Vercel Marketplace, run migrations:

```bash
DATABASE_URL=$NEON_URL npm run db:migrate
DATABASE_URL=$NEON_URL npm run db:seed
DATABASE_URL=$NEON_URL npm run admin:promote -- founder@parkingrabbit.com
```

## Deployment runbook (worker box, Fly.io example)

```bash
cd apps/web
fly launch --no-deploy
# fly.toml — set the start command to a worker entry script
```

```toml
# fly.toml (excerpt)
[processes]
  worker = "node dist/worker.js"

[env]
  SNAPPEAL_DISABLE_WORKER = "0"
  # everything else mirrored from the web tier
```

The worker entry script `scripts/worker.ts` (TBD — not committed yet) imports `lib/server/jobs/worker.ts` and calls `startWorker()` then sleeps indefinitely. The Claude binary + `@playwright/mcp` are installed in the Dockerfile.

## Domains

| Subdomain | Service |
|---|---|
| `parkingrabbit.com` | Web tier (landing + app) |
| `wiki.parkingrabbit.com` | Static MkDocs build (this wiki) |
| `appeals.parkingrabbit.com` | Inbound mail — MX → Postmark / Resend → `/api/inbound` webhook |
| `admin.parkingrabbit.com` *(optional)* | Direct subdomain to `/admin/*` for ops convenience |
| `api.parkingrabbit.com` *(optional)* | Worker tier's HTTP entry, if we want separate observability |

## CDN / WAF / DDoS

Vercel Firewall is on by default. Add:

- **BotID** rules on `/api/checkout`, `/api/generate`, `/api/submit` — these have real cost per request.
- **Rate limit** rule on `/api/auth/sign-in` — per-IP + per-email to prevent credential stuffing.
- **Geo allow-list** if we want to enforce UK-only on the web tier (probably not — easier to gate on payment country instead).

## Monitoring (TBD)

Open question. Candidates:

- **Sentry** for client + server errors (free tier OK for v0.1 volumes).
- **Axiom** for structured logs (Vercel native).
- **Prometheus + Grafana** if the worker tier is on Fly (Fly's `fly logs` is fine for v0.1).
- **PagerDuty** or **incident.io** for alerts when `/api/health` flips to `partial` for > 5 min.

## Backup + DR

- Neon takes automatic point-in-time backups (paid plan).
- Vercel Blob has per-object versioning.
- The wiki is in git; the app is in git; the AI prompts are in git. A full restore is `git clone + npm install + db restore + npm run db:migrate`.
