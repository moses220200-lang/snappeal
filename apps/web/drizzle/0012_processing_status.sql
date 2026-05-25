-- 0012_processing_status.sql
--
-- Adds the `processing` jsonb column to `appeals`. v0.2.15 — the smart
-- ticket card uses progressive ticket creation: after a PCN photo is
-- uploaded, the appeal row is created immediately and the user is routed
-- to the ticket detail page where each backend step (OCR, council
-- portal lookup, AI appeal analysis) reports its status inline.
--
-- Shape: { ocr?: { status, error? }, analysis?: { status, error? } }
--   status ∈ "pending" | "running" | "done" | "failed"
--
-- Portal lookup status lives on `portal_lookup.status` (set by the
-- pcn_lookup job) — kept separate so each step's error trail stays
-- targeted. Nullable: pre-existing appeals read NULL and the card
-- renders the existing "done" surfaces.

ALTER TABLE appeals
  ADD COLUMN IF NOT EXISTS processing jsonb;

ALTER TABLE appeals
  ADD COLUMN IF NOT EXISTS pcn_image_url text;
