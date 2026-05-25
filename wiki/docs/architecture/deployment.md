# Deployment

Production deploy plan. Live deploy hasn't shipped yet — this is the runbook the next operator follows.

## Pre-flight checklist

- [ ] Domain `parkingrabbit.com` registered (see [todo.md](../todo.md)).
- [ ] DNS managed in Cloudflare / Vercel — depending on which provider wins.
- [ ] Neon Postgres provisioned via Vercel Marketplace, EU region.
- [ ] Stripe UK account verified, Care Plan product + price created.
- [ ] Postmark / Resend account live, `appeals.parkingrabbit.com` MX + DKIM verified.
- [ ] Apple Developer Program enrolment complete (for Apple Wallet pass + Apple OAuth).
- [ ] Google Cloud project + OAuth client created.
- [ ] VAPID key pair generated (`npx web-push generate-vapid-keys`).

## Step 1 — Vercel web tier

```bash
cd apps/web
vercel link
```

Set every env var from `.env.example` in the Vercel dashboard. Critical ones:

| Var | Value | Notes |
|---|---|---|
| `DATABASE_URL` | `postgres://...?sslmode=require` from Neon | Prod database |
| `AUTH_SECRET` | 32+ random chars | Sign JWTs |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Required when worker runs on Vercel Sandbox |
| `STRIPE_SECRET_KEY` | `sk_live_...` | Live mode |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | From the Stripe webhook endpoint |
| `STRIPE_CARE_PLAN_PRICE_ID` | `price_...` | The £9.99/mo Stripe Price object |
| `RESEND_API_KEY` | `re_...` | Outbound email |
| `INBOUND_WEBHOOK_SECRET` | random 32 chars | Header gate on `/api/inbound` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | from `web-push` | Browser subscribe |
| `VAPID_PRIVATE_KEY` | from `web-push` | Worker side, send |
| `NEXT_PUBLIC_APP_URL` | `https://parkingrabbit.com` | Used in Stripe success_url etc. |
| `SNAPPEAL_DISABLE_WORKER` | `1` | The worker runs on a separate box |
| `NEXT_PUBLIC_SNAPPEAL_FAKE_PAYMENT` | unset / `0` | Real Stripe takes over |
| `SNAPPEAL_SKIP_PAYMENT_CHECK` | unset / `0` | Production must verify |
| `SNAPPEAL_SUBMISSION_LIVE` | `1` | Real Playwright MCP submission |

```bash
vercel --prod
```

## Step 2 — Database migration + admin promote

From a local terminal with the production `DATABASE_URL` exported:

```bash
cd apps/web
DATABASE_URL="<neon-url>" npm run db:migrate
DATABASE_URL="<neon-url>" npm run db:seed
DATABASE_URL="<neon-url>" npm run admin:promote -- founder@parkingrabbit.com
```

## Step 3 — Worker tier (Fly.io recommended)

The web tier won't run `claude` CLI or Playwright. Provision a small Fly machine:

```bash
cd apps/web
fly launch --no-deploy   # creates fly.toml
```

Edit `fly.toml`:

```toml
app = "snappeal-worker"
primary_region = "lhr"

[build]
  dockerfile = "Dockerfile.worker"

[env]
  SNAPPEAL_DISABLE_WORKER = "0"
  # Set DATABASE_URL, ANTHROPIC_API_KEY, RESEND_API_KEY,
  # SNAPPEAL_SUBMISSION_LIVE=1, VAPID_PRIVATE_KEY via `fly secrets`.

[processes]
  worker = "node scripts/worker.js"  # TBD entry script — see below
```

The worker entry needs writing. Two-line stub (`apps/web/scripts/worker.ts`):

```ts
import { startWorker } from "../lib/server/jobs/worker";
startWorker();
// Keep the process alive forever.
setInterval(() => {}, 60_000);
```

A minimal `Dockerfile.worker` installs the Claude CLI binary + Playwright Chromium + the npm package:

```dockerfile
FROM node:24-bookworm
RUN curl -fsSL https://claude.ai/install.sh | bash
WORKDIR /app
COPY apps/web/package*.json ./
RUN npm ci
RUN npx playwright install --with-deps chromium
COPY apps/web ./
RUN npm run build
CMD ["node", "scripts/worker.js"]
```

Then:

```bash
fly secrets set DATABASE_URL=... ANTHROPIC_API_KEY=... RESEND_API_KEY=... VAPID_PRIVATE_KEY=...
fly deploy
fly scale count worker=1
```

One worker handles dozens of jobs/hour. Scale up as volume grows.

## Step 4 — Inbound mail (Postmark example)

1. Create a Postmark **Inbound Stream** for `appeals.parkingrabbit.com`.
2. Set the webhook URL: `https://parkingrabbit.com/api/inbound`.
3. Add the `INBOUND_WEBHOOK_SECRET` as a custom header in the Postmark UI (the route validates `X-ParkingRabbit-Webhook-Secret`).
4. DNS:
   - `MX 10 inbound.postmarkapp.com.` on `appeals.parkingrabbit.com`
   - SPF + DKIM as Postmark prescribes
5. Send a test email to `ap_test@appeals.parkingrabbit.com` — check `/admin/inbound` for the row.

## Step 5 — Stripe webhook + Care Plan

1. Stripe → Webhooks → Add endpoint `https://parkingrabbit.com/api/stripe/webhook`. Subscribe to `payment_intent.succeeded`, `customer.subscription.*`.
2. Copy the signing secret → `STRIPE_WEBHOOK_SECRET`.
3. Stripe → Products → Create "ParkingRabbit Care Plan", recurring £9.99/mo GBP. Copy the Price id → `STRIPE_CARE_PLAN_PRICE_ID`.

## Step 6 — Smoke tests

```bash
# Health
curl https://parkingrabbit.com/api/health | jq

# Auth
curl -X POST https://parkingrabbit.com/api/auth/sign-up -H 'content-type: application/json' \
  -d '{"email":"smoke@parkingrabbit.com","password":"long-enough-password","sessionId":"smoke"}'

# Backend E2E (point the script at the prod URL — guard against firing in CI)
SNAPPEAL_BASE=https://parkingrabbit.com npm run test:e2e:backend
```

## Rollback

- **Web tier**: `vercel rollback` to the previous successful deployment.
- **Worker tier**: `fly releases` + `fly deploy --image registry.fly.io/snappeal-worker:<previous>`.
- **DB schema**: every migration is committed; `git revert <migration-commit>` + a fresh forward migration. No `down` scripts.

## v0.3.1 deployment gotchas

- **MCP prewarm.** The worker tier calls `prewarmMcp()` (`lib/server/submission/mcp-warm.ts`) on boot — make sure the Dockerfile installs `@playwright/mcp` + Chromium so the prewarm doesn't fail silently.
- **Cloudflare SSE.** The `/api/jobs/[id]/progress` route relies on `cache-control: no-store, no-transform`, `content-encoding: identity`, `x-accel-buffering: no` plus 4 KB per-event padding. If you front the web tier with anything else (Fastly, Akamai, custom Nginx), verify the same headers reach the client and increase padding if the buffer threshold differs.
- **Knowledge base bundle.** `next.config.ts` sets `outputFileTracingIncludes` for `/api/generate-stream` and `/api/generate` so the `apps/web/knowledge/*` markdown corpus ships inside the Vercel function bundles. **Verify with `vercel build` locally** before any prod deploy — without this, runtime reads ENOENT on the precedents.

## What's deliberately NOT yet automated

- **No CI/CD on push.** Deploys are manual `vercel --prod` and `fly deploy`. We add GitHub Actions once the deploy story stabilises.
- **No blue/green.** Vercel handles preview→prod naturally; Fly does rolling deploys with health checks.
- **No staging Postgres.** Neon branching makes this cheap to add later — clone the prod branch for QA, drop it after.
