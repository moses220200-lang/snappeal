# Architecture

How Snappeal is built — services, data, models, infrastructure.

- [System overview](system-overview.md) — the diagram everything else references.
- [Data model](data-model.md) — entities, schemas, relationships.
- [AI pipeline](ai-pipeline.md) — Vercel AI Gateway → Claude Sonnet 4.6 (vision).
- [Submission engine](submission-engine.md) — Playwright MCP + Vercel Sandbox.
- [Knowledge base](knowledge-base.md) — council records the admin CRUD edits.
- [Auth](auth.md) — sessions, passwords, magic links, passkeys.
- [Infrastructure](infra.md) — Docker now, Vercel + Neon + Blob later.
