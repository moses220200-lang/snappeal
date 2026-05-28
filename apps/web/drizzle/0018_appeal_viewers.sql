-- 0018_appeal_viewers.sql
--
-- 2026-05-27 — "one appeals row per canonical PCN" join table.
--
-- When User B uploads a PCN that User A already has an appeals row
-- for, we add B as a viewer of A's appeals row instead of spawning a
-- duplicate. Viewers can READ the canonical ticket data + portal
-- verdict (which were never per-user anyway), but the owner-only
-- fields (letter body, grounds, evidence, notes, payment, submit)
-- stay gated to the original user.
--
-- The owner remains identifiable by `appeals.user_id` / `appeals.session_id`
-- — this table is for ADDITIONAL viewers only. Reads:
--
--   SELECT a.* FROM appeals a
--   WHERE a.user_id = $viewer  -- I own it
--      OR a.session_id = $session  -- I'm the guest who created it
--      OR EXISTS (
--        SELECT 1 FROM appeal_viewers v
--        WHERE v.appeal_id = a.id
--          AND (v.user_id = $viewer OR v.session_id = $session)
--      )                                -- I was added as a viewer
--
-- This is an ADDITIVE migration. Existing appeals rows are unchanged.
-- The dedup logic in /api/extract is what populates this table on
-- future duplicate uploads.

CREATE TABLE IF NOT EXISTS appeal_viewers (
  appeal_id    text NOT NULL REFERENCES appeals(id) ON DELETE CASCADE,
  -- Optional — signed-in users have a userId; guests have only a
  -- sessionId. session_id is always set so the (appeal_id, session_id)
  -- PK works for both authentication modes.
  user_id      text REFERENCES users(id) ON DELETE CASCADE,
  session_id   text NOT NULL,
  joined_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (appeal_id, session_id)
);

CREATE INDEX IF NOT EXISTS appeal_viewers_user_idx
  ON appeal_viewers (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS appeal_viewers_session_idx
  ON appeal_viewers (session_id);
