# Admin

Operational documentation for the live ParkingRabbit admin backend at `/admin/*`. Gated by `users.role = 'admin'` — guests are bounced to `/sign-in?next=/admin`, signed-in non-admins to `/app?notAdmin=1`. **14 pages live.** Full route inventory + API surface in [architecture/admin.md](../architecture/admin.md); this section is the operator-facing runbook.

- [Managing councils](managing-councils.md) — adding councils, editing the MCP automation prompt + field hints, running dry-runs against live portals, the reset-to-canonical fallback.
- [Managing users](managing-users.md) — promoting admins via the CLI script, the role gate, the captured postal address fields.
- [Monitoring appeals](monitoring-appeals.md) — the dashboard, the per-appeal detail page, the jobs queue (retry/cancel), submissions + inbound classifier, runtime settings toggles, the health page.

For the architectural shape of every admin route + API endpoint, see [architecture/admin.md](../architecture/admin.md). For the underlying schema the admin UI mutates, see [architecture/data-model.md](../architecture/data-model.md).
