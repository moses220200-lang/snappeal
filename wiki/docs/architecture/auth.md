# Auth

Last refreshed **2026-05-27 (v0.3.10)**.

ParkingRabbit supports anonymous **guest** sessions and signed-in **users** side-by-side. The same flow works either way; signing in just adds cross-device sync, inbox parsing of council replies, and ownership claims on previously-anonymous appeals.

## Status — what's actually live

| Capability | Status |
|---|---|
| Guest sessions (anonymous `sessionId` in sessionStorage) | ✅ |
| Email / password sign-up + sign-in | ✅ (`/sign-up`, `/sign-in`) |
| Session as **HS256 JWT** in an httpOnly Secure cookie (`parkingrabbit.token`) | ✅ |
| Hand-rolled JWT — no external library | ✅ (~150 lines in `lib/server/auth.ts`) |
| Sign-out (clears the cookie) | ✅ |
| Guest → user appeal claim on sign-in/up | ✅ (`claimGuestAppealsForUser` updates rows where `sessionId` matches and `userId IS NULL`) |
| Apple OAuth | 🟡 buttons live, return 503 until Apple Developer Program clears |
| Google OAuth | 🟡 buttons live, return 503 until Google Cloud project + OAuth client land |
| Magic-link / passkeys | ⛔ deferred |
| Admin role gate (`role: 'admin'`) | ✅ on the user record; `/admin/*` requires it |

## v0.3.10 rename notes

The auth cookie was renamed in v0.3.10 from `snappeal.token` → `parkingrabbit.token`. The session header was renamed from `x-snappeal-session` → `x-parkingrabbit-session`. Existing browser-stored cookies with the old name will not be honoured — users are signed out once on first pull and re-sign-in normally. JWT signing material (`AUTH_SECRET`) is unchanged.

## Data model

```ts
users {
  id                 text primary key         // "u_<hex>"
  email              text unique not null
  password_hash      text                     // "<saltHex>:<hashHex>" — null for OAuth-only users
  display_name       text
  role               text default 'user'      // 'user' | 'admin'
  service_tier       text default 'grounds'   // 'buy_time' | 'grounds' | 'care_plan'
  address_line1      text
  address_line2      text
  address_city       text
  address_postcode   text
  phone              text
  notification_prefs jsonb                    // 6 channel toggles + asked-at sentinels + push subscription
  email_verified_at  timestamptz
  created_at         timestamptz default now()
  last_sign_in_at    timestamptz
}
```

Appeals carry both:

```ts
appeals {
  session_id  text not null    // guest session (always set)
  user_id     text nullable    // claimed on sign-in
  ...
}
```

When a guest signs in or signs up, every appeal whose `session_id` matches the request's `sessionId` and whose `user_id IS NULL` is updated to point at the new userId. The `sessionId` is preserved so guest history isn't orphaned across sign-ins.

## Password hashing

`lib/server/auth.ts` uses **pbkdf2-sha256** via Node's built-in `crypto.pbkdf2Sync`:

- 210,000 iterations (OWASP 2023 minimum for SHA-256)
- 16-byte random salt
- 32-byte derived key
- Stored as `<saltHex>:<hashHex>`
- Constant-time compare on verify

No external dependency. Easy to swap for `argon2id` later by changing the encoding prefix.

## JWT format

Hand-rolled HS256 (no external lib) signed with `AUTH_SECRET`:

```
header   = base64url('{"alg":"HS256","typ":"JWT"}')
payload  = base64url(JSON.stringify({
  id: user.id,
  email: user.email,
  displayName: user.displayName,
  role: user.role,
  iat: <unix-ts>,
  exp: <unix-ts + 30 days>
}))
sig      = base64url(HMAC-SHA256(secret, header + "." + payload))
token    = header + "." + payload + "." + sig
```

- TTL: **30 days**
- Stored in the `parkingrabbit.token` cookie: `httpOnly; secure (prod); sameSite=lax; path=/`
- `exp` checked on every verify
- Constant-time signature compare

`AUTH_SECRET` must be at least 32 chars. The dev secret in `.env.example` is a placeholder — **rotate before going live**.

## API surface

| Route | Method | Purpose |
|---|---|---|
| `/api/auth/sign-up` | POST | `{email, password, displayName?, phone?, addressLine1?, addressLine2?, addressCity?, addressPostcode?, sessionId?}` → creates user, sets cookie, claims guest appeals. The `sessionId` body field is only honoured when it matches the **`x-parkingrabbit-session` request header** (defends against hostile signup trying to inherit a guessed session's history). |
| `/api/auth/sign-in` | POST | `{email, password, sessionId?}` → verifies + sets cookie + claims (same header-match defence). |
| `/api/auth/sign-out` | POST | Clears cookie |
| `/api/auth/me` | GET / PATCH | Returns `{ user }` from cookie; PATCH updates displayName + address fields |
| `/api/auth/oauth/[provider]` | GET | Apple + Google entry. Returns 503 with "configure these env vars" until OAuth credentials land. |

All return JSON. Errors come back as `{ error: { code, message } }`.

## Viewer resolution on the server

```ts
import { getViewer } from "@/lib/server/viewer";

export async function POST(request: Request) {
  const viewer = await getViewer();
  // viewer.userId  → null for guests
  // viewer.role    → 'user' | 'admin' | null
  // viewer.isSignedIn
}
```

`getViewer()` reads the JWT cookie, verifies it, and returns a typed shape. Failure returns the guest shape (`{ userId: null, isSignedIn: false, role: null }`) — there's no thrown error on a bad/expired token.

## Ownership gates

Appeal-scoped routes (`/api/appeals/[id]`, `/api/submit`, `/api/jobs/[id]`, `/api/jobs/[id]/progress`, `/api/appeals/[id]/lookup`) use the helpers in `lib/server/viewer.ts` (`canViewAppeal`, `getRequestSessionId`) to gate access:

- Signed-in users prove identity via the `parkingrabbit.token` JWT cookie.
- Guests prove ownership of their anonymous session via the `x-parkingrabbit-session` request header (or a `?session=` query param on the SSE endpoint, since EventSource can't send custom headers).
- Admins always pass.

**v0.3.10 fix — guest lookup 403**: `agreeTicket` in `TicketCard.tsx` and the backstop hook `useAutoValidate` previously POSTed `/api/appeals/[id]/lookup` without the session header, so guest customers hit a silent 403 and their lookup was never enqueued. Both now forward `x-parkingrabbit-session: getOrCreateSessionId()`. `useAutoValidate` additionally clears its in-memory `FIRED_SESSION` dedup on 403 so a refreshed session can retry — previously a single 403 trapped the user permanently.

## OAuth plug-in path

The viewer abstraction doesn't care how the JWT got minted. To wire Apple or Google:

1. Set the provider env vars (`APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_CLIENT_SECRET`; `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`). Until they're set, `/api/auth/oauth/<provider>` returns 503 with "missing X, Y, Z".
2. Implement the authorize-redirect inside `app/api/auth/oauth/[provider]/route.ts` and a corresponding `/api/auth/oauth/[provider]/callback` route that exchanges the code for IdP user info.
3. `upsert` into `users` keyed by email (no `password_hash`; OAuth-only). Mirror the sign-up flow's guest-appeal claim when the session header matches.
4. Call `signJwt({ id, email, displayName, role: 'user' })` from `lib/server/auth.ts`, then `setSessionCookie(token)` and redirect to `/app`.

The wizard's Apple / Google buttons (`components/OAuthButtons.tsx`) already wire `window.location.href = "/api/auth/oauth/<provider>?next=…"` — once the env vars are set and the handler implemented, no UI changes are needed.

## CSRF + same-site

JWT is in an httpOnly + SameSite=Lax cookie, which blocks cross-site request forgery for the dominant attack pattern. State-changing routes reachable from a different origin (`/api/inbound` webhook in particular) gate on a shared secret header instead (`X-ParkingRabbit-Webhook-Secret`, REQUIRED in `NODE_ENV=production`).

## Open work

- Apple / Google OAuth providers (gated on Developer accounts — see [`../todo.md`](../todo.md)).
- Magic-link (passwordless email sign-in).
- Passkeys — WebAuthn registration + login flow.
- Email verification gate before submission (anti-abuse).
- Rate limiting on `/api/auth/sign-in` (per-IP + per-email).
- Multi-session JWT revocation — today rotating `AUTH_SECRET` invalidates every session at once; a planned `auth_sessions` table would carry `(jti, revoked)` for per-token revocation.
- Admin UI for user role assignment is live; bulk-promote is open work.

## Cross-refs

- The notifications layer that reads `users.notification_prefs`: [`notifications.md`](notifications.md).
- The viewer helpers + ownership rules: `apps/web/lib/server/viewer.ts`.
- The cookie store + JWT crypto: `apps/web/lib/server/auth.ts`.
- The client session: `apps/web/lib/client/session.ts`.
- The 403 fix in `useAutoValidate`: `apps/web/hooks/useAutoValidate.ts`.
