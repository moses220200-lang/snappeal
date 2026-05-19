# Managing users

> :material-pencil-outline: **Stub.** Filled when Phase B's admin UI ships.

The admin app uses email + password with bcrypt and HTTP-only session cookies, with magic-link as an optional sign-in method.

**Roles:**

- **`superadmin`** — full access including user CRUD and audit log.
- **`editor`** — KB and wiki content editing; cannot create users.
- **`viewer`** — read-only; for ops review and reporting.

**TODO**: invitation flow, password reset (admin-initiated only), 2FA strategy, audit-log retention.
