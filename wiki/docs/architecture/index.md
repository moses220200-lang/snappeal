# Architecture

Last refreshed **2026-05-27 (v0.3.10)**.

How ParkingRabbit is built — services, data, models, infrastructure.

## Core architecture

- [System overview](system-overview.md) — the canonical diagram + the runtime configuration anchor.
- [Appeal state machine](appeal-state-machine.md) — `appeal.status` × `portalLookup.status` × the 17-state `CardKind` the smart `<TicketCard>` renders from.
- [Data model](data-model.md) — 15 tables, 17 migrations, embedded jsonb shapes (`PortalLookupSnapshot`, `ProcessingStatus`, `KnowledgePackAudit`, `JobProgressEvent[]`).

## AI + automation

- [AI pipeline](ai-pipeline.md) — Claude Sonnet 4.6 via the headless `claude` CLI. Combined OCR + photo-coach single call (v0.3.10). Per-call cost telemetry via `ai_calls`.
- [Knowledge base](knowledge-base.md) — markdown corpus at `apps/web/knowledge/*` + the deterministic ranker that splices it into the drafter prompt.
- [Submission engine](submission-engine.md) — three-tier path: deterministic recipe → Claude MCP → email fallback. Two-layer lookup idempotency. Transactional duplicate-draft merge.
- [Deterministic recipes](deterministic-recipes.md) — Phase 9: per-council Playwright walks at $0 cost. Lambeth shipped; drift detection falls back to Claude MCP automatically.
- [Grounds-translation registry](grounds-registry.md) — P11: per-council canonical-slug → portal-radio-label mapping. Lambeth shipped; pattern for onboarding the next council.
- [Status checker](status-checker.md) — connector layer for "is this PCN still appealable?" verdicts. `fromPortalLookup` → `fromOcr` → `mock` resolution order.
- [Date handling](date-handling.md) — `parseUkDate` + `formatShortDate`. UK-first regex, `Date.UTC()` build, normalisation at the `persistPortalLookup` write boundary.

## Plumbing

- [Job queue](job-queue.md) — Postgres-backed work queue (`FOR UPDATE SKIP LOCKED`), per-kind pools, MCP prewarm on boot, Cloudflare-grade SSE delivery.
- [Auth](auth.md) — guest sessions + pbkdf2-sha256 email/password + hand-rolled HS256 JWT (`parkingrabbit.token` cookie + `x-parkingrabbit-session` header).
- [Notifications](notifications.md) — haptics, confetti, in-app store, Web Push dispatcher, `notification_dispatches` audit log.
- [Admin backend](admin.md) — the 16-page `/admin/*` surface + mode-aware settings + cost dashboards.

## Ops

- [Infrastructure](infra.md) — Docker + Postgres + Vercel Blob; web tier vs worker tier.
- [Deployment](deployment.md) — production runbook (web tier on Vercel, worker on Fly/Sandbox).

## Planned

- [Drift-baseline audit](drift-baseline-audit.md) — placeholder for the P9 follow-up admin tool that re-baselines deterministic recipes after a council portal redeploys.

## Historical

- [Archive](../archive.md) — long-form pre-v0.3.8 handoff content, mockup-audit decisions, prototype map.
