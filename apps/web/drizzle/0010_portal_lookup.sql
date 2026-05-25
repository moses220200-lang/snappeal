-- 0010_portal_lookup.sql
--
-- Adds the portal-validation feature columns:
--   1. appeals.portal_lookup           — jsonb snapshot of the council-
--                                        portal lookup (warden photos +
--                                        validity verdict). Drives the
--                                        validation banner + hard-block
--                                        routing on the evidence page.
--   2. council_automation.lookup_agent_prompt — per-council prompt for
--                                        the read-only Playwright MCP
--                                        lookup agent. Falls back to the
--                                        FALLBACK_LOOKUP_PROMPT in code
--                                        when null.
--
-- Both columns are nullable so existing rows keep working (skipped lookup).
ALTER TABLE "appeals" ADD COLUMN IF NOT EXISTS "portal_lookup" jsonb;--> statement-breakpoint
ALTER TABLE "council_automation" ADD COLUMN IF NOT EXISTS "lookup_agent_prompt" text;
