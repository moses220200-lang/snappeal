# Infrastructure

Last refreshed **2026-05-27 (v0.3.10)**.

How ParkingRabbit runs — locally today, on Vercel + a worker box in production.

## Local dev (today)

A single `docker-compose.yml` at the repo root brings up everything you need:

```yaml
services:
  db:      # Postgres 16, exposed on 127.0.0.1:5544
           # role + db + password are literally "snappeal" — the pre-rebrand
           # role table is inside the existing snappeal_snappeal_db volume.
           # Renaming would orphan dev data; documented inline in the compose file.
  wiki:    # MkDocs Material, behind central host Caddy
  tunnel:  # Cloudflared, points at host's Next.js dev server on :3001
```

The Next.js app runs natively on the host (not in Docker) so the Claude CLI can find your OAuth session in the keychain:

```bash
docker compose up -d
cd apps/web
npm install
npm run db:migrate   # apply all 17 Drizzle migrations (0000–0016)
npm run db:seed      # seed 7 councils
npm run dev          # http://localhost:3001
```

The worker boots automatically via `instrumentation.ts` when `DATABASE_URL` is set and `PARKINGRABBIT_DISABLE_WORKER` isn't.

### Required env (`.env.local`)

```env
# Postgres role + db kept as "snappeal" — see docker-compose.yml note.
# Brand rename is cosmetic here.
DATABASE_URL=postgres://snappeal:snappeal@127.0.0.1:5544/snappeal
AUTH_SECRET=<32+ random chars>
CLAUDE_MODEL=claude-sonnet-4-6                  # optional override
PARKINGRABBIT_MODE=dev                          # optional explicit (defaults from NODE_ENV)
NEXT_PUBLIC_PARKINGRABBIT_FAKE_PAYMENT=1        # use the Apple/Google/Card stub buttons
PARKINGRABBIT_SKIP_PAYMENT_CHECK=1              # skip Stripe verification in dev
# PARKINGRABBIT_SUBMISSION_LIVE=0               # 0 = mock; unset/anything-but-0 = real
# PARKINGRABBIT_MCP_HEADED=1                    # headed Chromium for debugging
# ANTHROPIC_API_KEY=sk-ant-...                  # if not using the CLI's OAuth session
# OPENAI_API_KEY=sk-...                         # voice notes
# STRIPE_SECRET_KEY=sk_test_...                 # real Stripe (test mode)
# STRIPE_CARE_PLAN_PRICE_ID=price_...           # Care Plan subscription
# NEXT_PUBLIC_VAPID_PUBLIC_KEY=...              # Web Push subscribe
# VAPID_PRIVATE_KEY=...                         # Web Push send (worker side)
# BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...      # photo storage (dev falls back to public/dev-blobs/)
```

The full list lives in `apps/web/.env.example`.

## Production (planned two-tier split)

```
┌───────────────────────┐
│ Vercel — Web tier     │
│ Next.js 16            │
│ All pages + API       │
│ PARKINGRABBIT_DISABLE_ │
│   WORKER=1            │
└──────────┬────────────┘
           │
┌──────────▼────────────┐    ┌─────────────────────────┐
│ Postgres (EU)         │    │ Worker box              │
│ via Vercel Marketplace│◄───┤ Fly.io / Railway        │
│ 15 tables             │    │ Or Vercel Sandbox       │
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

- `/api/generate`, `/api/extract`, `/api/improve-notes` — Claude CLI calls (extract is now a single combined call returning ticket + confidence + coach; see [`ai-pipeline.md`](ai-pipeline.md))
- `submit_appeal` jobs — Playwright + Claude MCP / deterministic recipe submission
- `pcn_lookup` jobs — deterministic recipe first (Lambeth: ~10–20 s @ $0), Claude MCP fallback
- `processInboundMessage` — Claude classification on inbound mail

The two tiers share Postgres + Blob. The web tier can call the worker tier's `/api/generate` directly (HTTP) when a user is mid-flow.

### Cost economics

Per-upload Claude cost at v0.3.10:

| Stage | Cost | Notes |
|---|---|---|
| `council_id` pre-pass | ~$0.04 | One Claude vision call |
| `ocr` (combined OCR + coach) | ~$0.075 | One Claude vision call. v0.3.10 consolidation halved this from ~$0.13 |
| `lookup` (Claude MCP path) | ~$0.30 | Playwright + Claude agentic loop |
| `lookup` (deterministic recipe) | $0 | Lambeth today; more councils planned |
| `draft` | ~$0.20–0.30 | Claude generation streaming |
| `submit` | ~$0.30–0.50 | Claude + Playwright MCP |

A Lambeth appeal that goes recipe-fast → Claude-draft → Claude-submit costs ~$0.65–0.85 in Claude tokens. A non-recipe council costs ~$0.95–1.15. Per-stage telemetry lives in `ai_calls`; admin sees breakdowns in the Appeal Tickets cost columns.

### Alternative: single-tier Vercel deploy

If you can live without portal automation and don't mind direct Anthropic SDK calls (rather than CLI piping), the AI paths can be rewritten to use `@anthropic-ai/sdk` directly. That gives you everything on Vercel functions at the cost of:

- Losing native MCP integration (have to orchestrate tool-use loops manually)
- Losing the agent-runs-as-Claude-Code-CLI behaviour for portal submission
- Two slightly diverged AI integration paths

For v0.1 launch this single-tier path is reasonable; for v0.2 onward the worker box is the right move.

## Deployment runbook

See [`deployment.md`](deployment.md) for the full runbook (env-var matrix, Step 1–6 commands, rollback). This page is the conceptual map; that page is the keystroke-level guide.

## Domains

| Subdomain | Service |
|---|---|
| `parkingrabbit.com` | Web tier (landing + app) |
| `wiki.parkingrabbit.com` | Static MkDocs build (this wiki) |
| `appeals.parkingrabbit.com` | Inbound mail — MX → Postmark / Resend / Brevo → `/api/inbound` webhook |
| `admin.parkingrabbit.com` *(optional)* | Direct subdomain to `/admin/*` for ops convenience |
| `api.parkingrabbit.com` *(optional)* | Worker tier's HTTP entry, if we want separate observability |

## CDN / WAF / DDoS

Vercel Firewall is on by default. Plan to add:

- **BotID** rules on `/api/checkout`, `/api/generate`, `/api/submit`, `/api/extract` — these have real cost per request.
- **Rate limit** rule on `/api/auth/sign-in` — per-IP + per-email to prevent credential stuffing.
- **Rate limit** rule on `/api/extract` per-session to prevent OCR-cost burning via session rotation.
- **Geo allow-list** if we want to enforce UK-only on the web tier (probably not — easier to gate on payment country instead).

## Monitoring (TBD)

Open question. Candidates:

- **Sentry** for client + server errors (free tier OK for v0.1 volumes).
- **Axiom** for structured logs (Vercel native).
- **Prometheus + Grafana** if the worker tier is on Fly (Fly's `fly logs` is fine for v0.1).
- **PagerDuty** or **incident.io** for alerts when `/api/health` flips to `partial` for > 5 min.

Internal observability today:

- `ai_calls` table is the per-stage cost ledger. Admin dashboards read from `getCostBreakdowns(appealIds[])`.
- `notification_dispatches` table is the per-dispatch outcome ledger. Admin filters by `result` to see send_failed / no_subscription / no_vapid spikes.
- `jobs.progress` is the per-job event log replayable via `/api/jobs/[id]/progress` (SSE) and `/api/appeals/[id]/submit-progress` (one-shot).

## Backup + DR

- Postgres provider takes automatic point-in-time backups (Neon paid plan).
- Vercel Blob has per-object versioning.
- The wiki is in git; the app is in git; the AI prompts are in git. A full restore is `git clone + npm install + db restore + npm run db:migrate`.

## Cross-refs

- The keystroke-level deploy guide: [`deployment.md`](deployment.md).
- The job queue the worker tier drains: [`job-queue.md`](job-queue.md).
- The submission engine the worker drives: [`submission-engine.md`](submission-engine.md).
- The deterministic recipes that cut cost: [`deterministic-recipes.md`](deterministic-recipes.md).
- Cost telemetry: [`ai-pipeline.md`](ai-pipeline.md), [`data-model.md`](data-model.md).
