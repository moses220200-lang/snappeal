# Context handoff

**Read this first if you're picking up Snappeal cold.** Last refreshed **2026-05-20**.

This page exists so a new collaborator (human or Claude) can get to "I know what's shipped and what's next" in 5 minutes. Everything below is current as of the latest commit on `main`.

## TL;DR

Snappeal is a London-only PCN appeal app. The v0.1 prototype frontend + backend are **live end-to-end** in dev:

- **Real Postgres persistence** (Docker locally, Neon planned for prod).
- **All AI piped through the headless Claude CLI** (`lib/server/claude-cli.ts`).
- **Postgres-backed job queue** + in-process worker for portal submission.
- **Email/password auth** with HS256 JWT cookies; admin role gate.
- **Three-tier pricing UI**: Buy Time (free), Full Appeal (£2.99), Care Plan (£9.99/mo unlimited).
- **Full admin UI** at `/admin` — appeals, councils (with **per-council Playwright MCP automation editor + dry-run**), submissions, inbound mail (with **classifier sandbox**), jobs (retry / cancel), users, health.
- **Westminster portal automation** scaffolded — prompt lives in `council_automation` table, edited via `/admin/councils/westminster/automation`, dry-run-able from the same page.

Not deployed anywhere yet. Architecture is "Vercel for web tier + dedicated worker box" — see `architecture/deployment.md`.

## Where everything lives

| Need this? | Read this |
|---|---|
| File-by-file inventory of the codebase | [architecture/prototype.md](architecture/prototype.md) |
| Schema + ER diagram + migration log | [architecture/data-model.md](architecture/data-model.md) |
| Auth — JWT, sessions, sign-up flow | [architecture/auth.md](architecture/auth.md) |
| How AI is wired (Claude CLI, all three callers, cost) | [architecture/ai-pipeline.md](architecture/ai-pipeline.md) |
| Submission engine (portal + email + per-council prompts) | [architecture/submission-engine.md](architecture/submission-engine.md) |
| Job queue mechanics | [architecture/job-queue.md](architecture/job-queue.md) |
| Admin UI in detail | [architecture/admin.md](architecture/admin.md) |
| Notification layers (haptics / confetti / Web Push) | [architecture/notifications.md](architecture/notifications.md) |
| Production deployment runbook | [architecture/deployment.md](architecture/deployment.md) |
| Pricing model (Free / £2.99 / £9.99) | [business/pricing.md](business/pricing.md) |
| Roadmap + v0.1 status | [business/roadmap.md](business/roadmap.md) |
| Competitor landscape (Resolvo, QuickAppeal, etc.) | [business/competitive-landscape.md](business/competitive-landscape.md) |
| Gamification design (win-rate ring, confetti) | [product/gamification.md](product/gamification.md) |

## What's shipped vs in-flight vs blocked

### ✅ Shipped + working end-to-end

- **Backend**: Postgres schema (11 tables), 6 migrations applied. Email/password auth with JWT. Claude CLI piped headlessly. Job queue with FOR UPDATE SKIP LOCKED + retries. Submission engine (portal + email fallback). Inbound mail webhook + Claude classifier. Care Plan subscription scaffold (with dev stub when Stripe price not set).
- **Frontend**: All app pages (Home, Tickets, Inbox, Profile + 6 sub-pages, Capture, Notes, Paywall, Letter, manual-entry wizard). Sticky glass headers. 5-tab bottom nav with centered camera. WizardOnboarding + WizardSheet reusable patterns. Pricing tier strip on Home. Real Stripe + fake-pay dev buttons.
- **Admin**: 12 admin pages — Overview, Appeals (list + detail), Councils (list, **create**, edit, **MCP automation editor + dry-run**), Submissions, Inbound (with classifier sandbox), Jobs (with retry/cancel), Users, Health. Mobile nav drawer.
- **Westminster MCP automation**: canonical prompt seeded, editable from admin, dry-run-able against the live portal (stops at review, screenshots it).
- **AI features**: Per-field confidence dots on capture, photo coach (sheet on poor photos), Strengthen-my-notes one-tap rewrite (sheet with preview), AI inbox triage (one-line summary per thread), streaming letter SSE endpoint, voice notes (Whisper-compatible transcription endpoint).
- **PWA features**: Web Push service worker (`public/sw.js`), VAPID-ready subscribe button, haptic feedback (Vibration API), confetti on cancelled status, no-zoom viewport, iOS safe-area insets.
- **Docs**: 12 architecture + product + business pages refreshed for the current state.
- **Tests**: `tests/api.spec.ts` + `tests/app.spec.ts` rewritten for the real surface. `scripts/test-e2e-backend.ts` runs full backend audit in ~30 s.

### 🟡 In-flight (scaffolded but not fully wired)

- **Care Plan real Stripe subscription** — UI live + endpoint live + dev stub returns success. Real path needs `STRIPE_CARE_PLAN_PRICE_ID` + the Stripe Subscription product created in the dashboard.
- **Web Push delivery** — service worker + subscribe endpoint live. The sending side (worker reads inbound classification, fires `web-push.send` to stored subscriptions) is not yet wired. Needs `web-push` npm package + `VAPID_PRIVATE_KEY`.
- **Inbound mail DNS/MX** — `/api/inbound` webhook handler is ready. DNS/MX for `appeals.snappeal.ai` + Postmark/Resend pick is open.
- **Streaming letter UI** — `/api/generate-stream` SSE endpoint exists. The Letter page still consumes the non-streaming `/api/generate`. Switching is a 1-hour task.

### ⛔ Blocked on external accounts

- **Apple OAuth** — Apple Developer Program enrolment (1–4 wk lead time).
- **Google OAuth** — Google Cloud OAuth client.
- **App Store submission** — Apple Developer + Capacitor wrapper (v0.3 scope).
- **Live Stripe** — UK business verification.
- **Live inbound mail** — Postmark / Resend account + DNS.

### ❌ Not started (next session candidates)

- **Defect-type scorecard** — second Claude call returning a 47-point defect check. Beats Parking Mate UK's marketing pitch.
- **POPLA / private parking** — the bigger TAM (~70% of UK appeal volume). Out of v0.1 scope per the locked decision.
- **Council win-rate dashboard** — per-council aggregate "appeals via Snappeal win X%" on the paywall.
- **Apple Wallet pass** for submitted appeals.

## How to run it locally

```bash
docker compose up -d                 # Postgres on 127.0.0.1:5544
cd apps/web
npm install
npm run db:migrate                   # all 6 Drizzle migrations
npm run db:seed                      # 7 seeded councils
npm run dev                          # http://localhost:3001
```

### Required env (`.env.local`)

```env
DATABASE_URL=postgres://snappeal:snappeal@127.0.0.1:5544/snappeal
AUTH_SECRET=32+ random chars
NEXT_PUBLIC_SNAPPEAL_FAKE_PAYMENT=1   # dev only — bypass Stripe
SNAPPEAL_SKIP_PAYMENT_CHECK=1         # dev only — skip Stripe verification
# SNAPPEAL_SUBMISSION_LIVE=1          # flip to use real Playwright MCP
# ANTHROPIC_API_KEY=sk-ant-...        # else uses CLI OAuth session
```

The full list is in `apps/web/.env.example`. See `architecture/infra.md` for prod env vars.

### Smoke tests

```bash
npm run test:claude              # CLI wrapper ping, ~9 s
npm run test:e2e:backend         # full backend audit, ~30 s
npm run lint && npx tsc --noEmit && npm run build  # CI parity
npm run test:e2e                 # Playwright UI suite
```

### Admin access

```bash
# Sign up via the UI (/sign-up), then:
npm run admin:promote -- your@email.com
# Sign back in — you'll auto-redirect to /admin
```

## The agentic MCP loop (Westminster)

This is the most differentiating thing in the codebase. Read it once.

1. `lib/server/submission/prompts/westminster.ts` — canonical Claude+Playwright MCP prompt.
2. Admin opens `/admin/councils/westminster/automation` — prompt auto-seeded into `council_automation` table on first visit.
3. Admin edits the prompt + field hints in the textarea → Save.
4. Admin clicks **Dry-run against live portal** → spawns `claude -p` with `@playwright/mcp` attached → agent navigates the real portal, stops at the review page (DOES NOT submit), screenshots it, returns JSON.
5. Trace + cost + screenshot path persist to `council_automation.last_dry_run`.
6. Iterate until dry-run is reliably green.
7. Flip `SNAPPEAL_SUBMISSION_LIVE=1` → real `/api/submit` calls now enqueue `submit_appeal` jobs → worker (booted from `instrumentation.ts`) claims them via `FOR UPDATE SKIP LOCKED` → calls `runPortalAutomation()` → **which now loads the per-council `agentPrompt` from `council_automation`** (the gap closed in the latest commit) → submission runs end-to-end → council reference + screenshot persisted to `submissions` table.

## Recent commits (last 5)

```
v0.1 backend live: Claude CLI, queue, auth, admin, gamification + docs refresh
Roadmap: v0.1 status checklist (shipped vs in-flight)
Splash + install banner + native features + 100% test green + wiki sync
Full QA pass: lint clean, E2E suite (19 passing), web CI workflow
Add /api/health endpoint — config status at a glance
```

The current uncommitted work (admin council CRUD, MCP automation editor, manual-entry wizard, per-council prompt loading) is staged for the next commit.

## Open questions / decisions waiting

- **Provider for transactional + inbound mail.** Postmark Inbound is the front-runner. Decision needed before live launch.
- **Worker hosting** — Fly.io vs Railway vs Vercel Sandbox. All work; Fly is cheapest for one always-on machine.
- **Streaming letter UX cutover** — flip Letter page to use `/api/generate-stream` when?
- **POPLA / private parking** — defer past v0.1, or pull forward to capture the bigger TAM?
- **OAuth — Clerk vs hand-rolled.** Hand-rolled is committed; Clerk would be a drop-in replacement and unlock Apple+Google instantly.

## How this doc stays accurate

- It's the **first** doc updated when something major lands.
- All other architecture docs are children of this one; they may go stale but `handoff.md` should not.
- A fresh session should `cat wiki/docs/handoff.md` before doing anything else.
