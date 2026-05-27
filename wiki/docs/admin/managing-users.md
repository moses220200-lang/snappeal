# Managing users

Last refreshed **2026-05-27 (v0.3.10)**.

User directory lives at `/admin/users`. The page is read-mostly today; promoting an admin happens via a CLI script. Per-user notification prefs are editable at `/admin/users/[id]/notifications` (v0.3.9).

## Pages

| Route | Purpose |
|---|---|
| `/admin/users` | List view: email, display name, role, service tier, last sign-in. Top 100 (paginate when the count outgrows it). `password_hash` is **not** in the RSC payload — the page selects only the columns it renders. |

## Promoting an admin

There is no in-UI "make admin" button by design — admin status is granted out-of-band via a CLI script so an admin can't accidentally elevate someone with a single click.

```bash
cd apps/web
npm run admin:promote -- person@example.com
```

The script (`scripts/admin-promote.ts`) is **idempotent** — re-running on the same email is a no-op. It prints the updated row when done. If the user doesn't exist yet, ask them to create the account via `/sign-up` first, then run the script.

To verify, the promoted user should:
1. Sign in / refresh `/api/auth/me` — `role` should be `"admin"`.
2. Visit `/admin` — they should land on the dashboard. Non-admins bounce to `/app?notAdmin=1`.

## Auth model

| Field on `users` | Notes |
|---|---|
| `id` | ulid-style `u_<hex>` |
| `email` | unique |
| `password_hash` | pbkdf2-sha256 stored as `<saltHex>:<hashHex>`. NULL for OAuth-only users. |
| `display_name` | optional |
| `role` | `'user'` \| `'admin'` (the gate `requireAdminPage()` / `requireAdminApi()` checks) |
| `service_tier` | `'buy_time'` \| `'grounds'` \| `'care_plan'` — default pricing tier |
| `address_line1`, `address_line2`, `address_city`, `address_postcode`, `phone` | Captured at sign-up via `<AddressAutocomplete>`. **Read by the portal-automation agent** when a council form needs a registered-keeper address. If a user signs up without an address, ask them to fill it in at `/app/profile/personal-details` before submitting their first appeal. |
| `notification_prefs` | `jsonb` — `{ emailOnCouncilReply, emailOnSubmission, pushOnCouncilReply, push }` |
| `email_verified_at`, `last_sign_in_at`, `created_at` | timestamps |

Full schema in [architecture/data-model.md](../architecture/data-model.md). Auth flow + JWT format + viewer resolution in [architecture/auth.md](../architecture/auth.md).

## OAuth providers

Apple + Google OAuth buttons are wired in `<OAuthButtons>` on `/sign-up` and `/sign-in`. The route `/api/auth/oauth/[provider]` returns `503` with a "configure these env vars" message until the relevant credentials land:

- **Apple**: `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_CLIENT_SECRET` (gated on Apple Developer Program enrolment).
- **Google**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (gated on a Google Cloud project).

Once env vars are set + the handler is implemented, no UI changes are needed — the buttons already wire `window.location.href = "/api/auth/oauth/<provider>?next=…"`.

## Open work

- Bulk admin invitation flow (UI today is "promote from CLI, one at a time").
- Admin-initiated password reset for end users.
- 2FA / passkeys strategy.
- Audit log of admin actions (who promoted whom, who edited which council).
- User CRUD (delete account / DSAR removal) from the admin UI.

## Where this lives in code

- `app/admin/users/page.tsx` — the directory page.
- `scripts/admin-promote.ts` — the promotion CLI.
- `lib/server/admin.ts → requireAdminPage()` + `requireAdminApi()` — the gate.
- `lib/server/auth.ts` — pbkdf2 hashing, HS256 JWT minting + verifying, cookie helpers.
- `lib/server/viewer.ts → getViewer()` + `canViewAppeal()` — viewer resolution + appeal ownership checks.
