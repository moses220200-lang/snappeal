# Admin backend

Last refreshed **2026-05-27 (v0.3.10)**.

The admin UI lives at `/admin`. It's gated by `users.role = 'admin'` — a guest hitting `/admin` is redirected to `/sign-in?next=/admin`, and a signed-in non-admin is bounced to `/app?notAdmin=1`. The v0.3.9 consolidation expanded the surface from 14 to 16 pages and rebuilt the appeals + notifications views around the new `ai_calls` + `notification_dispatches` audit tables.

## Pages (16)

| Route | Purpose |
|---|---|
| `/admin` | Live counts dashboard — users, appeals, submitted, cancelled, councils, inbound messages, jobs queued / failed, plus a "today" row |
| `/admin/appeals` | **Appeal Tickets** — paginated list with status pill, council, PCN ref, tier, created, **per-stage cost columns (OCR / Validation / Draft / Submit / Total)** sourced from `ai_calls`, "Details →" button |
| `/admin/appeals/[id]` | **14 themed cards** covering EVERY field: identity, owner, council, AI calls (per-call breakdown), OCR, portal_lookup, letter, strength, grounds, knowledge pack, processing, timeline, submissions, inbound, jobs, push dispatches, raw JSON |
| `/admin/councils` | Council list with **Add Council** button + per-row Edit / MCP automation links + automation-status pill (manual / automated_beta / automated_ga) |
| `/admin/councils/new` | Create a council (name, slug, type, portal URL, payment URL, email, address, automation status, identifier hints) |
| `/admin/councils/[slug]` | Edit existing council |
| `/admin/councils/[slug]/automation` | **MCP automation editor + dry-run + reset-to-canonical**. Line-numbered code editor, per-run screenshot toggle, **drift counter** vs canonical, "Inspect canonical" button, persisted last-dry-run trace |
| `/admin/submissions` | Joined-on-appeal submissions table — method, channel, council, ref, status, retries, **per-row appeal-context dry-run** for `submit_appeal` rows |
| `/admin/inbound` | 100 most recent inbound council messages + the **InboundClassifierSandbox** for re-running the classifier on arbitrary text |
| `/admin/jobs` | Job queue inspector with **retry/cancel** actions and **per-row appeal-context dry-run** for `submit_appeal` rows |
| `/admin/users` | All users (email, name, role, tier, last sign-in). `passwordHash` is NOT in the RSC payload. |
| `/admin/users/[id]` | User detail with **`<UserPrefsEditor>`** — admin can flip any notification toggle on user's behalf, reset asked-at sentinels, clear push subscription, change role / tier |
| `/admin/notifications` | **Notification audit log** (the `notification_dispatches` table). Filter by event / result / 7-day window. Per-user / per-appeal drilldowns. 7-day stats card. |
| `/admin/notifications/test` | **Test push dispatcher** — fire any of the 5 events against any appeal / any user to verify the COPY registry + VAPID config + service worker |
| `/admin/settings` | **Combined** settings + health (v0.3.9 merged the old `/admin/health` page into here). Three-layer toggles (override → env → mode-default), mode-aware default pills, per-toggle dev/prod/both applicability badges, full env-var inventory (54+ vars, grouped, status + sensitivity pills). Secret values are NEVER displayed. |
| `/admin/wiki` | MkDocs build embedded via iframe so admins can read the wiki without leaving the admin shell. Reads `NEXT_PUBLIC_WIKI_URL` (default `http://127.0.0.1:8800/`). |

## How to make yourself admin

```bash
cd apps/web
npm run admin:promote -- you@example.com
```

The script (in `scripts/admin-promote.ts`) is idempotent — re-running on the same email is a no-op. If the user doesn't exist yet, create the account via `/sign-up` first.

## Architecture

- **Layout** at `app/admin/layout.tsx` — async server component that calls `requireAdminPage()` from `lib/server/admin.ts`. Auth check happens server-side before any HTML renders.
- **API gates** use `requireAdminApi()` which returns either `{ ok: true, user }` or `{ ok: false, response }` — the route handler can `return response` immediately on auth failure.
- **Mostly read-only, with targeted write endpoints.** Every page is a server component that reads via Drizzle. Writes happen via narrow API routes:
  - `POST/PATCH/DELETE /api/admin/councils[/:slug]` — council CRUD
  - `GET/PUT /api/admin/council-automation/[slug]` + `POST {action}` — save prompt, dry-run, reset-to-canonical
  - `POST /api/admin/jobs/[id]` — retry / cancel
  - `GET/PUT /api/admin/settings/mcp` — legacy MCP toggles (kept for backward compat)
  - `GET /api/admin/settings` → `{ settings, envStatus }`. `PATCH /api/admin/settings` body `{key, value}` — flips a single runtime override.
  - `POST /api/admin/inbound/classify` — sandbox classifier
  - `POST /api/admin/notifications/test` — fire a test dispatch
- **Layout padding**: outer wrapper adds `px-5 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-[1400px]` content gutters so every page reads consistently against the sidebar.

## Settings system (v0.3.9 refactor)

`getMode()` resolves `dev` vs `production` from `PARKINGRABBIT_MODE` (explicit) or `NODE_ENV` (fallback). Every toggle has a mode-aware default; admin overrides + env pins layer on top.

**Three-layer resolution** (in `lib/server/settings.ts → getSettings()`):

1. **Admin override** (in-memory on `/admin/settings`, NULL = follow default).
2. **Env-var pin** (e.g. `PARKINGRABBIT_MCP_HEADED=1`).
3. **Mode default**.

**Mode-aware defaults:**

| Setting | Dev | Prod | Why |
|---|---|---|---|
| `mcpHeaded` | false | false | Headed Chromium is opt-in for debugging |
| `stopAtReview` | true | false | Dev: never click Finish; Prod: actually file |
| `submissionLive` | true | true | Live submission everywhere except explicit opt-out |
| `workerDisabled` | false | false | In-process worker by default; prod overrides on serverless |
| `fakePayment` | true | false | Dev uses fake Apple/Google/Card buttons; prod uses real Stripe |
| `skipPaymentCheck` | true | false | Dev bypasses paymentIntent verification |
| `mcpCaptureScreenshots` | false | false | Off by default; admin opt-in for debugging |
| `claudeMode` | 'cli' | 'sdk' | Dev uses CLI subscription; prod will switch to SDK once full migration done |

`logStartupSanityChecks()` warns on dangerous prod combos (prod + stopAtReview / fakePayment / skipPaymentCheck). Logs to stderr on boot.

`/admin/health` was merged into `/admin/settings` (v0.3.9) — the health surface is now a card at the top of the settings page.

## v0.3.9 surface highlights

- **Per-stage cost columns** on `/admin/appeals` — `OCR | Validation | Draft | Submit | Total`. Reads from `getCostBreakdowns(appealIds[])` in `lib/server/aiCalls.ts`.
- **AI calls card** on `/admin/appeals/[id]` — full per-call breakdown: stage, model, mode (cli/sdk/deterministic), tokens (input + output + cache read + cache write), costUsd, durationMs, ok, errorKind.
- **Notification audit log** at `/admin/notifications` — every dispatch attempt with result + reason. 7-day stats card. Filter by event / result.
- **User-prefs editor** at `/admin/users/[id]` — flip any toggle on a user's behalf without their input.
- **MCP automation editor** at `/admin/councils/[slug]/automation` — line-numbered code editor, per-run screenshot toggle, drift counter vs canonical, "Inspect canonical" button. Edit + dry-run loop is single-page.
- **Mode-aware settings** at `/admin/settings` — every toggle shows its mode-aware default + the applicability badge (dev / prod / both).

## Open work

- Manual submission re-queue from an appeal detail page (the dry-run button covers the read path; an explicit "re-enqueue this exact submission" is missing).
- Per-council audit log (who changed what when on `council_automation`).
- Inbound message hand-classification override.
- Refund flow for payments.
- Bulk export of all appeals as CSV / JSON for DSAR responses.
- Audit log on admin actions (who edited which council / toggle).
- **Drift-baseline audit tool** at `/admin/councils/[slug]/audit` (P9 follow-up) — see [`drift-baseline-audit.md`](drift-baseline-audit.md).
- **Admin grounds-mapping CRUD** at `/admin/councils/[slug]/grounds` (P11 follow-up, deferred until 3+ councils mapped — see [`grounds-registry.md`](grounds-registry.md)).

## Cross-refs

- Cost telemetry reads: [`ai-pipeline.md`](ai-pipeline.md), [`data-model.md`](data-model.md) → `ai_calls`.
- Notification audit table: [`notifications.md`](notifications.md), [`data-model.md`](data-model.md) → `notification_dispatches`.
- The MCP automation editor's payload: [`submission-engine.md`](submission-engine.md), [`deterministic-recipes.md`](deterministic-recipes.md).
- The grounds-registry CRUD that's planned: [`grounds-registry.md`](grounds-registry.md).
- Admin runbook (less internal-architecture, more day-to-day ops): [`../admin/index.md`](../admin/index.md).
