-- 0017_tickets_normalisation.sql
--
-- v0.3.12 — extract `tickets` as a first-class entity so the council
-- portal lookup (~$0.30 / ~60s of Claude+Playwright) runs once per
-- physical PCN, not once per (appeal × user).
--
-- Identity: (council_slug, normalised_pcn_ref). Normalisation rule:
-- `upper(regexp_replace(pcn_ref, '\s+', '', 'g'))`. Both the
-- application layer (`lib/server/tickets.ts:normalisePcnRef`) AND the
-- DB unique index apply this — defence in depth so an unnormalised
-- INSERT from any future code path can't slip a duplicate through.
--
-- This is an ADDITIVE migration:
--   - Creates `tickets`
--   - Creates `ticket_normalisation_audit`
--   - Adds nullable `appeals.ticket_id` FK column + index
--   - Does NOT drop `appeals.ticket` or `appeals.portal_lookup` jsonb
--     (those go in a follow-up cleanup migration once dual-write +
--     cutover are verified in prod).
--
-- The backfill that populates `tickets` + sets `appeals.ticket_id` is
-- in `apps/web/scripts/migrate-extract-tickets.ts` (run AFTER this
-- migration applies). The cache READ branch in `enqueueLookup` only
-- fires when `appeals.ticket_id IS NOT NULL`, so until the backfill
-- runs, behaviour is unchanged.

CREATE TABLE IF NOT EXISTS tickets (
  id                            text PRIMARY KEY,                          -- `t_` + 16-char nanoid
  council_slug                  text NOT NULL REFERENCES councils(slug),
  -- Normalised before write — `upper(regexp_replace(pcn_ref, '\s+', '', 'g'))`.
  -- The functional unique index below enforces it at the DB layer too.
  pcn_ref                       text NOT NULL,
  -- Normalised before write — `upper(regexp_replace(vehicle_reg, '\s+', '', 'g'))`.
  vehicle_reg                   text NOT NULL,
  -- Council-record fields, backfilled from `appeals.ticket` on first
  -- create. Overwritten only when the portal lookup returns
  -- authoritative metadata.
  issuer                        text,
  contravention_code            text,
  contravention_description     text,
  issued_at                     timestamptz,
  location                      text,
  amount_pence                  integer,
  -- Shared TicketPortalSnapshot (subset of PortalLookupSnapshot — no
  -- per-user status/jobId). See lib/server/db/schema.ts.
  portal_snapshot               jsonb,
  portal_snapshot_at            timestamptz,
  -- 'deterministic' (council recipe ran ok) | 'cli' (Claude MCP fallback)
  portal_snapshot_source        text,
  -- Denormalised cost summary for "$ saved by cache" reporting. Full
  -- per-call audit lives in `ai_calls`.
  portal_snapshot_cost_usd      numeric(10, 4),
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now()
);

-- Functional unique index — enforces identity on (council, normalised
-- pcn_ref) regardless of whether the application pre-normalised. If
-- two concurrent INSERTs race for the same PCN they collide here and
-- the application's `ON CONFLICT DO UPDATE SET updated_at = now()
-- RETURNING id` upsert resolves both to the same ticket id.
CREATE UNIQUE INDEX IF NOT EXISTS tickets_council_pcn_unique_idx
  ON tickets (council_slug, upper(regexp_replace(pcn_ref, '\s+', '', 'g')));

CREATE INDEX IF NOT EXISTS tickets_vehicle_reg_idx ON tickets (vehicle_reg);
CREATE INDEX IF NOT EXISTS tickets_council_idx ON tickets (council_slug);
CREATE INDEX IF NOT EXISTS tickets_portal_snapshot_at_idx
  ON tickets (portal_snapshot_at DESC NULLS LAST);

-- Audit log. Two main purposes:
--   1. Migration proof — every backfill collision discard is logged
--      ('created_collision_loser') so we can hand-audit before prod.
--   2. Cost-savings reporting — every cache hit logs 'cache_hit',
--      joinable with `ai_calls` to compute $ avoided.
-- Also captures Step 2.5 shadow-validation 'snapshot_drift' events.
CREATE TABLE IF NOT EXISTS ticket_normalisation_audit (
  id           text PRIMARY KEY,
  event        text NOT NULL,
  -- ON DELETE SET NULL so audit survives ticket cleanup (we never
  -- delete tickets today but defensive against future GC).
  ticket_id    text REFERENCES tickets(id) ON DELETE SET NULL,
  -- No FK — appeals get merged-and-deleted by
  -- mergeDuplicateDraftIfAny. The audit row should survive that so
  -- cost-savings totals stay correct.
  appeal_id    text,
  details      jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ticket_norm_audit_event_idx
  ON ticket_normalisation_audit (event, created_at DESC);
CREATE INDEX IF NOT EXISTS ticket_norm_audit_ticket_idx
  ON ticket_normalisation_audit (ticket_id);
CREATE INDEX IF NOT EXISTS ticket_norm_audit_created_idx
  ON ticket_normalisation_audit (created_at DESC);

-- FK on appeals. Nullable — legacy rows pre-backfill (and brand-new
-- appeals still in the "no pcnRef yet" phase) leave it null. Reads
-- LEFT JOIN tickets and tolerate null.
ALTER TABLE appeals
  ADD COLUMN IF NOT EXISTS ticket_id text REFERENCES tickets(id);

CREATE INDEX IF NOT EXISTS appeals_ticket_id_idx ON appeals (ticket_id);
