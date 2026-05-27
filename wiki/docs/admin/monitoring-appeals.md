# Monitoring appeals

Last refreshed **2026-05-27 (v0.3.10)**.

The operator's nine surfaces for keeping ParkingRabbit running in production.

## Dashboard

`/admin` — the live counts page. Pulls from Postgres on each request:

- Users · Appeals total · Submitted · Cancelled · Councils · Inbound messages
- Jobs queued · Jobs failed
- A "today" row with the same shape for the last 24 hours

Use it as the first-glance health check; anything anomalous (jobs failed > 0, queued growing without running) is a cue to drill into the relevant page.

## Appeals

| Route | Purpose |
|---|---|
| `/admin/appeals` | The 100 most-recent appeals with status pill, council badge, PCN ref, service tier, created-at. Click a row → detail page. |
| `/admin/appeals/[id]` | Full appeal detail: the `ticket` jsonb, `portalLookup` snapshot, letter body, `strengthScore` + rationale + improvements, `knowledgePackUsed` audit trail, timeline, all `submissions` rows, all `inbound_messages` for this appeal, every job ever enqueued against this appeal, **per-stage cost breakdown** from `ai_calls` (`council_id` / `ocr` / `lookup` / `draft` / `submit` with model + USD + latency + status). |

## Jobs queue

`/admin/jobs` is the queue inspector. Each row shows:

- `kind` (`submit_appeal` / `pcn_lookup` / `generate_draft` — the last is scaffolded but unused), `status`, `attempts`/`maxAttempts`, `lockedBy`, `runAfter`, `lastError`, `createdAt`.
- **Retry** — re-enqueues the job (resets `status='queued'`, clears `lockedAt`/`lockedBy`).
- **Cancel** — marks the job `failed` so it stops being claimable.
- **Dry-run** (per-row, for `submit_appeal` rows) — runs the same prompt against the same appeal in `stopAtReview` mode so you can debug a real failed submission without a second portal hit.

The worker pool is `submit_appeal: 2` + `pcn_lookup: 3` slots (`lib/server/jobs/worker.ts → CONCURRENCY`). `prewarmMcp()` runs at worker boot (v0.3.1) so the first job doesn't pay the 30–60 s Chromium cold start.

## Submissions

`/admin/submissions` — the audit log of submission attempts (joined to the appeal for context).

- Each row: method (`portal` / `email` / `manual`), council, status, council reference, retries, last error.
- **Per-row appeal-context dry-run button** — same as the Jobs page version, scoped to this appeal.

## Inbound mail

`/admin/inbound` — the 100 most-recent inbound messages (from `/api/inbound` — Brevo / SendGrid / Postmark webhook).

- Each row: from, subject, classification (`cancelled` / `rejected` / `acknowledged` / `request` / `unknown`), received-at.
- `<InboundClassifierSandbox>` — try the LLM classifier on arbitrary text (paste a council reply, see how the classifier labels it). Useful when adding new council reply templates to the canonical set.
- Classification flips the linked `appeals.status` to `cancelled` / `rejected` automatically when the verdict is conclusive.

## Settings

`/admin/settings` — full env-var inventory (37 vars grouped by category, status + sensitivity pills) + the **seven runtime override toggles**:

| Toggle | Effect |
|---|---|
| **`mcpHeaded`** | Show the Playwright Chromium window on the dev server. Useful for watching the agent click through; never enable in prod. |
| **`stopAtReview`** | Hard brake — the submission agent stops before clicking the final Submit button. Used for dry-runs + when investigating a flaky council. |
| **`submissionLive`** | Master switch for live submissions. OFF → all submissions return a deterministic `MOCK-XXXXXX` reference (good for dev). |
| **`workerDisabled`** | OFF → the in-process worker drains the queue. ON → only this process's worker stops; other processes (or a dedicated worker box) keep running. |
| **`fakePayment`** | Surface fake Apple/Google/Card payment buttons in the customer UI (driven by `NEXT_PUBLIC_PARKINGRABBIT_FAKE_PAYMENT`). Lets the full flow exercise without a Stripe key. |
| **`skipPaymentCheck`** | `/api/submit` skips PaymentIntent verification against Stripe. Ops bypass when a webhook is late. |
| **`showMcpLiveView`** (v0.3.1) | Global kill-switch for the smart card's "Watch live" disclosure. Default ON; OFF only when `NEXT_PUBLIC_PARKINGRABBIT_SHOW_MCP_LIVE_VIEW === "0"`. Decoupled from the SSE subscription so toggling it does NOT reboot any running MCP agent. |

Secret env values are NEVER returned by `/api/admin/settings` — secrets stay in `.env.local` or the hosting provider's dashboard.

Runtime toggles live in memory in `lib/server/settings.ts`; they reset to the env defaults on process restart. That's deliberate — you can't accidentally leave production in mock mode after a deploy.

## Health

`/admin/health` — integration check at a glance:

- **DB**: connected, migrations applied count.
- **Claude CLI**: binary present on PATH, OAuth session valid.
- **Anthropic API key**: present (for prod's `--bare` mode).
- **Stripe**: secret key configured, webhook signing secret configured.
- **`AUTH_SECRET`**: present, length ≥ 32.
- **Submission engine mode**: `live` / `mock`.
- **Worker**: running / disabled.
- **Fake payment**: on / off.

Plus quick inline toggles for **Safety mode (stop-at-review)** and **MCP browser visibility (headless / headed)** — these mirror the corresponding settings on `/admin/settings`.

## Wiki

`/admin/wiki` — the MkDocs build of this wiki, iframed for in-app reading. Reads `NEXT_PUBLIC_WIKI_URL` (default `http://127.0.0.1:8800/`).

## Notifications (v0.3.9)

`/admin/notifications` — the Web Push dispatcher audit + test surface.

- **Dispatch log** — last 100 rows from `notification_dispatches`: `event` (`validation_settled` / `draft_ready` / `submission_settled` / `appeal_settled` / `appeal_reminder`), `result` (`sent` / `skipped_no_subscription` / `skipped_no_vapid` / `send_failed` / `unsupported_event` / `error`), `endpoint_host`, `latency_ms`, `created_at`. Filter by `result` to spot send_failed / no_subscription spikes.
- **Send test push** — pick a user + an event kind, immediately dispatches a real Web Push to their subscriptions. The `notification_dispatches` row records the outcome.
- **Per-user prefs** — `/admin/users/[id]/notifications` lets an admin flip a user's `notification_prefs` jsonb (e.g. disable Push on appeal-reminder).

See [architecture/notifications.md](../architecture/notifications.md) for the dispatcher + COPY registry shape.

## Service-failure refunds

When our system fails to deliver an appeal — generation crashes, payment taken but no letter produced, portal unreachable for an extended period — we issue an exceptional refund as a service-quality remedy (Consumer Rights Act 2015). **There's no automated workflow today**; ops case-by-case via the Stripe dashboard. The appeal's `submissions` row + the job's `lastError` are the evidence trail.

Service-failure refunds are distinct from outcome refunds, which we don't offer (see [business/pricing.md](../business/pricing.md)).

## Open work

- Per-council acceptance-rate dashboard (cancelled vs rejected ratio by council × contravention code).
- AI quality regression alert when the strength-score distribution shifts unexpectedly.
- Bulk export of all appeals as CSV / JSON for DSAR responses.
- Admin audit log (who-did-what when on council edits / settings toggles / job retries).
- Manual re-enqueue from the appeal-detail page (today's dry-run button covers the read path; an explicit re-enqueue action is still missing).
