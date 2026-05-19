# Auth

Snappeal supports anonymous **guest** sessions and signed-in **users** side-by-side. The same flow works either way; signing in just adds cross-device sync, inbox parsing of council replies, and ownership claims on previously-anonymous appeals.

## Status — what's actually live

| Capability | Status |
|---|---|
| Guest sessions (anonymous `sessionId` in localStorage) | ✅ |
| Email / password sign-up + sign-in | ✅ (`/sign-up`, `/sign-in`) |
| Session as **HS256 JWT** in an httpOnly Secure cookie | ✅ |
| Sign-out (clears the cookie) | ✅ |
| Guest → user appeal claim on sign-in/up | ✅ (`appeals.user_id` updated where `sessionId` matches and `user_id IS NULL`) |
| Apple OAuth | 🟡 wizard button + branded glyph; routes to email sign-up until Apple Developer Program clears |
| Google OAuth | 🟡 wizard button + branded glyph; routes to email sign-up until Google Cloud project + OAuth client land |
| Magic-link / passkeys | ⛔ deferred |
| Admin role gate (`role: 'admin'`) | ✅ on the user record; admin UI is the next deliverable |

## Data model

```ts
users {
  id              text primary key         // "u_<hex>"
  email           text unique not null
  password_hash   text                     // "<saltHex>:<hashHex>" — null for OAuth-only users
  display_name    text
  role            text default 'user'      // 'user' | 'admin'
  email_verified_at  timestamptz
  created_at      timestamptz default now()
  last_sign_in_at timestamptz
}
```

Appeals carry both:

```ts
appeals {
  session_id  text   not null    // anonymous client session (always set)
  user_id     text   nullable    // claimed on sign-in
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
- Stored in the `snappeal.token` cookie: `httpOnly; secure (prod); sameSite=lax; path=/`
- `exp` checked on every verify
- Constant-time signature compare

`AUTH_SECRET` must be at least 32 chars. The dev secret in `.env.example` is a placeholder — **rotate before going live**.

## API surface

| Route | Method | Purpose |
|---|---|---|
| `/api/auth/sign-up` | POST | `{email, password, displayName?, sessionId?}` → creates user, sets cookie, claims guest appeals |
| `/api/auth/sign-in` | POST | `{email, password, sessionId?}` → verifies + sets cookie + claims |
| `/api/auth/sign-out` | POST | Clears cookie |
| `/api/auth/me` | GET | Returns `{ user: SessionUser | null }` from the cookie |

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

## OAuth plug-in path

The viewer abstraction doesn't care how the JWT got minted. To wire Apple or Google:

1. Add `/api/auth/[provider]/callback` route that exchanges the auth code for the IdP user info.
2. `upsert` into `users` keyed by email (no `password_hash`; OAuth-only).
3. Call `signJwt({ id, email, displayName, role: 'user' })` from `lib/server/auth.ts`.
4. `setSessionCookie(token)` and redirect to `/app`.

The wizard's Apple / Google buttons are already in place with proper brand glyphs — they currently route to `/sign-up` so the user can still create an account by email. Swap that `onClick` to `window.location.href = '/api/auth/apple/start'` when ready.

## CSRF

JWT is in an httpOnly + SameSite=Lax cookie, which blocks cross-site request forgery for the dominant attack pattern. State-changing routes that are reachable from a different origin (`/api/inbound` webhook in particular) gate on a shared secret header instead (`X-Snappeal-Webhook-Secret`).

## Open work

- Apple / Google OAuth providers (gated on Developer accounts).
- Magic-link (passwordless email sign-in) — Resend transactional email, single-use token.
- Passkeys — WebAuthn registration + login flow.
- Email verification gate before submission (anti-abuse).
- Rate limiting on `/api/auth/sign-in` (per-IP + per-email).
- Admin UI for user CRUD + role assignment.
