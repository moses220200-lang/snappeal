# Admin backend

The admin UI lives at `/admin`. It's gated by `users.role = 'admin'` and is invisible to regular users — a guest hitting `/admin` is redirected to `/sign-in?next=/admin`, and a signed-in non-admin is bounced to `/app?notAdmin=1`.

## Pages (13)

| Route | Purpose |
|---|---|
| `/admin` | Live counts dashboard — users, appeals, submitted, cancelled, councils, inbound messages, jobs queued / failed, plus a "today" row |
| `/admin/appeals` | 100 most recent appeals (status pill, council, PCN ref, tier, created) → click into detail |
| `/admin/appeals/[id]` | Full appeal: ticket jsonb, letter, timeline, submissions, inbound messages, jobs |
| `/admin/councils` | Council list with **Add Council** button + per-row Edit / MCP automation links |
| `/admin/councils/new` | Create a new council (full form: name, slug, type, portal URL, email, address, automation status, identifier hints) |
| `/admin/councils/[slug]` | Edit existing council |
| `/admin/councils/[slug]/automation` | **MCP automation editor + dry-run + reset-to-canonical** — full prompt + field-hints textarea, "Dry-run against live portal" button, "Reset to canonical" button, persisted last-dry-run trace |
| `/admin/submissions` | Joined-on-appeal submissions table — status, method, council, ref, **per-row appeal-context dry-run button** |
| `/admin/inbound` | 100 most recent inbound council messages + the **InboundClassifierSandbox** for trying the classifier on arbitrary text |
| `/admin/jobs` | Job queue inspector with **retry/cancel** actions and **per-row appeal-context dry-run** for `submit_appeal` rows |
| `/admin/users` | All users (email, name, role, tier, last sign-in) |
| `/admin/health` | Integration check — DB / Claude CLI / API key / Stripe / Stripe webhook / AUTH_SECRET / submission engine mode / worker / fake-payment **+ Safety mode (stop-at-review) toggle + MCP browser visibility (headless / headed) toggle** |
| `/admin/wiki` | The MkDocs build embedded via iframe so admins can read the full wiki without leaving the admin shell |

## How to make yourself admin

```bash
cd apps/web
npm run admin:promote -- you@example.com
```

The script (in `scripts/admin-promote.ts`) is idempotent — re-running on the same email is a no-op. It prints the updated row when done.

If the user doesn't exist yet, create the account via `/sign-up` first, then run the script.

## Architecture

- **Layout** at `app/admin/layout.tsx` — async server component that calls `requireAdminPage()` from `lib/server/admin.ts`. The check happens server-side before any HTML renders.
- **API gates** use `requireAdminApi()` which returns either `{ ok: true, user }` or `{ ok: false, response }` — the route handler can `return response` immediately on auth failure.
- **Mostly read-only, with targeted write endpoints.** Every page is a server component that reads via Drizzle. Writes happen via narrow API routes:
  - `POST/PATCH/DELETE /api/admin/councils[/:slug]` — council CRUD
  - `GET/PUT /api/admin/council-automation/[slug]` + `POST {action}` — save prompt, dry-run, reset-to-canonical
  - `POST /api/admin/jobs/[id]` — retry / cancel
  - `GET/PUT /api/admin/settings/mcp` — runtime MCP toggles (headed + stop-at-review)
  - `POST /api/admin/inbound/classify` — sandbox classifier
- **Layout padding**: outer wrapper adds `px-5 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-[1400px]` content gutters so every page reads consistently against the sidebar.

## Open work

- Manual submission re-queue from an appeal detail page (the dry-run button covers the read path; an explicit "re-enqueue" action is still missing).
- Per-council audit log (who changed what when on `council_automation` rows).
- Inbound message hand-classification override (when Claude got it wrong).
- Refund flow for payments.
- Bulk export of all appeals as CSV / JSON for DSAR responses.
- Audit log (who-did-what) on admin actions.
