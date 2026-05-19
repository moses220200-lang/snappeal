# Admin backend

The admin UI lives at `/admin`. It's gated by `users.role = 'admin'` and is invisible to regular users — a guest hitting `/admin` is redirected to `/sign-in?next=/admin`, and a signed-in non-admin is bounced to `/app?notAdmin=1`.

## Pages (9)

| Route | Purpose |
|---|---|
| `/admin` | Live counts dashboard — users, appeals, submitted, cancelled, councils, inbound messages, jobs queued / failed, plus a "today" row |
| `/admin/appeals` | 100 most recent appeals (status pill, council, PCN ref, tier, created) → click into detail |
| `/admin/appeals/[id]` | Full appeal: ticket jsonb, letter, timeline, submissions, inbound messages, jobs |
| `/admin/councils` | Read-only list of the 7 seeded councils + automation status |
| `/admin/submissions` | 100 most recent submission rows with status, method, council reference, created |
| `/admin/inbound` | 100 most recent inbound council messages, classified |
| `/admin/jobs` | Job queue inspector — kind, status, attempts, last error |
| `/admin/users` | All users (email, name, role, tier, last sign-in) |
| `/admin/health` | Integration check — DB / Claude CLI / API key / Stripe / Stripe webhook / AUTH_SECRET / submission engine mode / worker / fake-payment |

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
- **Read-only by default.** Every admin page is a server component that reads via Drizzle and renders a table. Mutation endpoints will land alongside the operator features we need (council editor, job retry, submission re-queue) — see open work.

## Open work

- Council CRUD (currently the seed script is the source of truth).
- Job retry / cancel buttons on `/admin/jobs`.
- Manual submission re-queue from an appeal detail page.
- Inbound message hand-classification override (when Claude got it wrong).
- Refund flow for payments.
- Bulk export of all appeals as CSV / JSON for DSAR responses.
- Audit log (who-did-what) on admin actions.
