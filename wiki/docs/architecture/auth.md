# Auth

> :material-pencil-outline: **Stub.** Filled in Phase B (admin) and v0.2 (customer accounts).

## Plan

**Phase A (now)**
No auth. Wiki is fully public.

**Phase B — admin backend**
Email + password with bcrypt; HTTP-only session cookies; CSRF tokens. Roles: `superadmin`, `editor`, `viewer`. Magic-link as an optional sign-in method. Admin password reset is in-admin-only (no public reset endpoint).

**Phase C v0.1 — customer-facing app**
Anonymous use. State persists in IndexedDB. No account required to appeal a ticket.

**Phase C v0.2 onward**
Accounts via **Clerk** (Vercel Marketplace integration): email magic link + passkeys + social (Apple / Google). On first sign-in, any local appeals stored in IndexedDB merge into the user's account in Postgres. Clerk's `admin` org role gates `/admin/*`.

**TODO**: detailed session shape, CSRF strategy, photo URL signing strategy.
