# Architecture

How ParkingRabbit is built — services, data, models, infrastructure.

- [System overview](system-overview.md) — the canonical diagram + the runtime configuration anchor.
- [Data model](data-model.md) — 11 tables, 14 migrations, embedded jsonb shapes.
- [AI pipeline](ai-pipeline.md) — Claude Sonnet 4.6 via the headless `claude` CLI for extract, draft, classify, plus the v0.3.1 SSE delivery story.
- [Knowledge base](knowledge-base.md) — markdown corpus at `apps/web/knowledge/*` + the deterministic ranker that splices it into the drafter prompt.
- [Submission engine](submission-engine.md) — Claude + Playwright MCP for portal councils; transactional email fallback; the three live MCP paths (submit / lookup / dry-run).
- [Status checker](status-checker.md) — connector layer for "is this PCN still appealable?" verdicts.
- [Job queue](job-queue.md) — Postgres-backed work queue (`FOR UPDATE SKIP LOCKED`), 2 + 3 slot pool, MCP prewarm on worker boot, Cloudflare-grade SSE delivery.
- [Appeal state machine](appeal-state-machine.md) — `appeal.status` enum × the 11-state `CardKind` the smart `<TicketCard>` renders from.
- [Auth](auth.md) — guest sessions + pbkdf2-sha256 email/password + HS256 JWT; OAuth providers staged in.
- [Admin backend](admin.md) — the 14-page `/admin/*` surface + runtime toggles.
- [Infrastructure](infra.md) — Docker + Neon Postgres + Vercel Blob; web tier vs worker tier.
- [Notifications](notifications.md) — haptics, confetti, Web Push, transactional email.
- [Deployment](deployment.md) — the production runbook (web tier on Vercel, worker on Fly/Sandbox).
- [Archive](../archive.md) — historical prototype + mockup audit content (no longer load-bearing).
