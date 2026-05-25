-- 0013_appeal_strength_and_kb.sql
--
-- Adds the AI-strength score columns + an audit trail of which knowledge
-- pack entries were used when generating each appeal.
--
-- PR 3 of the deep-quiz / dictation / knowledge-base / strength-score
-- upgrade. The strength score is the drafter's calibrated read of how
-- likely the council is to cancel — surfaced in the smart card so the
-- user can be warned about a weak appeal BEFORE paying £2.99.
--
-- All columns are nullable so existing rows render with no badge
-- (the UI hides the surface when score IS NULL). No backfill needed.

ALTER TABLE appeals
  ADD COLUMN IF NOT EXISTS strength_score integer,
  ADD COLUMN IF NOT EXISTS strength_rationale text,
  ADD COLUMN IF NOT EXISTS strength_improvements jsonb,
  ADD COLUMN IF NOT EXISTS knowledge_pack_used jsonb;
