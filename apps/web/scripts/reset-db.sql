-- reset-db.sql
--
-- One-shot dev-only data wipe. Leaves the knowledge-base intact (councils,
-- council_automation), keeps every admin row in `users`, and clears
-- everything else so we can test the new portal-validation flow against
-- a real PCN with a clean slate.
--
-- Run:
--   docker exec -i parkingrabbit-db psql -U snappeal -d snappeal < apps/web/scripts/reset-db.sql
-- (Postgres role + db kept as "snappeal" for volume compat; only the docker
--  container name is rebranded.)
--
-- After running, also clear the on-disk artifact directories:
--   rm -rf apps/web/public/submissions/* apps/web/public/dev-blobs/*
--
-- (This SQL can't delete directory contents — it only touches the DB.)
--
-- Order of TRUNCATEs matters because of FK constraints:
--   inbound_messages → appeal_photos → submissions → payments → jobs →
--   appeals → care_plan_waitlist → subscriptions → non-admin users.

BEGIN;

-- Children of `appeals` first (FK targets).
TRUNCATE TABLE inbound_messages CASCADE;
TRUNCATE TABLE appeal_photos    CASCADE;
TRUNCATE TABLE submissions      CASCADE;
TRUNCATE TABLE payments         CASCADE;
TRUNCATE TABLE jobs             CASCADE;
TRUNCATE TABLE appeals          CASCADE;

-- Per-user collateral (waitlist + Care Plan subs). Subscriptions don't
-- have a FK to users but the data is per-user; nothing else points at them.
TRUNCATE TABLE care_plan_waitlist CASCADE;
TRUNCATE TABLE subscriptions      CASCADE;

-- Keep admin rows only.
DELETE FROM users WHERE role IS DISTINCT FROM 'admin';

-- Verification snapshot.
DO $$
DECLARE
  appeal_count   bigint;
  user_count     bigint;
  admin_count    bigint;
  council_count  bigint;
  job_count      bigint;
BEGIN
  SELECT COUNT(*) INTO appeal_count  FROM appeals;
  SELECT COUNT(*) INTO user_count    FROM users;
  SELECT COUNT(*) INTO admin_count   FROM users WHERE role = 'admin';
  SELECT COUNT(*) INTO council_count FROM councils;
  SELECT COUNT(*) INTO job_count     FROM jobs;
  RAISE NOTICE '=== reset-db summary ===';
  RAISE NOTICE 'appeals    = %  (should be 0)',        appeal_count;
  RAISE NOTICE 'jobs       = %  (should be 0)',        job_count;
  RAISE NOTICE 'users      = %  (admins kept)',         user_count;
  RAISE NOTICE 'admins     = %  (should be >= 1)',     admin_count;
  RAISE NOTICE 'councils   = %  (KB unchanged)',        council_count;
END $$;

COMMIT;
