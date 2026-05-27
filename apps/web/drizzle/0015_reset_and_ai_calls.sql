-- 0015_reset_and_ai_calls.sql
--
-- The consolidation pass: per-stage Claude cost telemetry.
--
-- The previous shape stored a single `appeals.cost_pence_millis` integer
-- written only by the draft generator. We now log every Claude invocation
-- as a row in `ai_calls` (OCR / council_id / lookup / draft / strength /
-- submit / coach), so admins can see exactly where each ticket's spend
-- went — and split it by stage on the Appeal Tickets list.
--
-- Reset note: we wipe all working data in this migration because
-- (a) the user gave explicit go-ahead ("reset db when done, so we dont
-- need data migration") and (b) the cost shape change is forward-only.
-- Councils + canonical prompts are recreated by the existing seed
-- scripts after this migration runs:
--   npx tsx --env-file=.env.local scripts/seed-councils.ts
--   npx tsx --env-file=.env.local scripts/populate-council-logos.ts
--
-- The `users` table is preserved — accounts, push subscriptions, and
-- service tier rollups stay intact. Only the per-appeal working data is
-- wiped.

-- ──────────────────────────────────────────────────────────────
-- 1. Wipe working data. Order matters: child rows first.
-- ──────────────────────────────────────────────────────────────
-- (DELETE rather than TRUNCATE so we don't need CASCADE permissions on
--  the FK graph and so each step is auditable in dev logs.)
DELETE FROM inbound_messages;
DELETE FROM appeal_photos;
DELETE FROM jobs;
DELETE FROM appeals;
DELETE FROM council_automation;

-- ──────────────────────────────────────────────────────────────
-- 2. Drop the legacy single-cost columns. The `ai_calls` table is now
--    the source of truth; admin views SUM across stages.
-- ──────────────────────────────────────────────────────────────
ALTER TABLE appeals DROP COLUMN IF EXISTS cost_pence_millis;
ALTER TABLE appeals DROP COLUMN IF EXISTS model_used;

-- ──────────────────────────────────────────────────────────────
-- 3. Create `ai_calls` — one row per Claude invocation. Shape leaves
--    space for SDK migration: `cache_read_tokens` / `cache_write_tokens`
--    fields stay NULL in CLI mode and populate once we switch.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_calls (
  id text PRIMARY KEY,
  appeal_id text REFERENCES appeals(id) ON DELETE CASCADE,
  job_id text REFERENCES jobs(id) ON DELETE SET NULL,
  -- 'ocr' | 'council_id' | 'lookup' | 'draft' | 'strength' | 'submit' |
  -- 'coach' | 'strengthen_notes'. Free-text on purpose so new stages
  -- don't require a migration.
  stage text NOT NULL,
  model text NOT NULL,
  -- 'cli' for Claude CLI subprocess, 'sdk' for direct Anthropic SDK
  -- (planned for production deployment).
  mode text NOT NULL,
  input_tokens integer,
  output_tokens integer,
  cache_read_tokens integer,
  cache_write_tokens integer,
  -- USD cost reported by the model. Stored as numeric for precision;
  -- pence conversion happens at render time.
  cost_usd numeric(10, 6),
  duration_ms integer,
  ok boolean NOT NULL DEFAULT true,
  -- Loose error taxonomy — 'timeout' | 'rate_limit' | 'parse' |
  -- 'mcp' | 'other'. NULL when ok.
  error_kind text,
  -- Optional one-line error message for admin diagnostics.
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_calls_appeal_idx ON ai_calls (appeal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_calls_stage_idx ON ai_calls (stage, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_calls_job_idx ON ai_calls (job_id);
