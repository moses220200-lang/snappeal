-- 0014_council_payment_portal.sql
--
-- Adds the `payment_portal_url` column to `councils`. Some councils run
-- their appeals portal and payment portal on entirely different hosts:
--
--   Lambeth:    appeal/challenge  → https://pcnevidence.lambeth.gov.uk/pcnonline/challenge.php
--               payment           → https://lambethparking.paypcn.com/default.aspx
--
-- Until now the Pay-yourself tile reused `appeal_portal_url` for both,
-- which sent the customer to the appeals portal even when they tapped
-- "Pay yourself". This column lets the admin record the two URLs
-- separately; the ticket card prefers `payment_portal_url` for the Pay
-- tile and falls back to `appeal_portal_url` when null.
--
-- Nullable + no default — existing rows keep the legacy single-URL
-- behaviour (Pay tile uses appealPortalUrl).

ALTER TABLE councils
  ADD COLUMN IF NOT EXISTS payment_portal_url text;
