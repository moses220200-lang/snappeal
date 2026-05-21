# Architecture

How ParkingRabbit is built — services, data, models, infrastructure.

- [System overview](system-overview.md) — the diagram everything else references.
- **[Prototype state](prototype.md)** — what actually exists in `apps/web/` right now, file by file. *Start here if you're picking up the project fresh.*
- [Data model](data-model.md) — entities, schemas, relationships.
- [AI pipeline](ai-pipeline.md) — Claude CLI piped headlessly for extract, draft, and inbound classification.
- [Submission engine](submission-engine.md) — Claude + Playwright MCP for portal councils; transactional email fallback.
- [Job queue](job-queue.md) — Postgres-backed work queue for long-running and bursty work.
- [Knowledge base](knowledge-base.md) — council records the admin CRUD edits.
- [Auth](auth.md) — guest sessions + email/password JWT; OAuth providers staged in.
- [Infrastructure](infra.md) — Docker now, Vercel + Neon + Blob later.
