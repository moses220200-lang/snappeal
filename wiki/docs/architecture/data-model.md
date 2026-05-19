# Data model

> :material-pencil-outline: **Stub.** Filled in Phase B when the Postgres schema is committed.

## Tables (planned)

- `users` — admin and end-user accounts (Clerk handles auth; we mirror the user id).
- `sessions` — anonymous session ids for pre-auth appeals; merged into a `user_id` on first sign-in.
- `appeals` — one row per appeal: `ticket` JSON, `status`, `paid_at`, `submitted_at`, `outcome`, foreign key to `councils.slug`.
- `appeal_photos` — Blob URLs + thumbnails, FK to `appeals.id`.
- `councils`, `contraventions`, `grounds` — the [knowledge base](knowledge-base.md).
- `payments` — Stripe PaymentIntent records; FK to `appeals.id`.
- `submissions` — submission attempts; `method` (`manual` / `automated`), `status`, council reference once captured.
- `wiki_pages` — admin-edited markdown content (used by the Phase B wiki editor, written through to `wiki/docs/**.md`).
- `audit_log` — admin-action audit trail.

Drizzle ORM. Migrations under `db/migrations/`.

**TODO**: full DDL once Phase B work starts.
