-- 0011_appeal_preferred_method.sql
--
-- Adds the `preferred_method` column to `appeals` so each appeal can be
-- routed onto either the free-email submission path or the £2.99 portal-
-- automation path. The choice is stamped from the recommendation card on
-- the ticket detail page once the user picks an action.
--
-- Nullable + no default: pre-existing appeals read NULL, and the API
-- routes (`/api/submit`, `<TicketActionPanel>`) interpret NULL as "user
-- hasn't picked yet" (state B in the ticket page state machine) — which
-- means the existing £2.99-only behaviour for old appeals stays
-- backwards-compatible: the user just sees the recommendation card again
-- and explicitly picks the method.

ALTER TABLE appeals
  ADD COLUMN IF NOT EXISTS preferred_method text;
