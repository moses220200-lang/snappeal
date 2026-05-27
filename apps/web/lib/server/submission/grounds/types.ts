/**
 * Per-council grounds-translation registry — shared types.
 *
 * Each council's appeal portal exposes its own radio-button list of
 * statutory grounds (Lambeth has 10; Westminster has 11; Camden's wording
 * differs again, etc.). Our customer-facing quiz lets the user pick from
 * a friendly card taxonomy whose cards roll up to ONE of the eleven
 * `CanonicalGroundId` slugs (see `lib/grounds-catalog.ts`).
 *
 * This registry maps `CanonicalGroundId` → council-specific radio label
 * STRING — verbatim, character-for-character what appears next to the
 * radio button on the council portal. The submission engine pre-resolves
 * the chosen label from the appeal payload (deterministic, no LLM cost)
 * and embeds it in the council's submission prompt as a hint. The
 * embedded mapping table acts as a fallback the LLM can fall back on if
 * the pre-resolved label is invalidated by drift (a portal text change).
 *
 * To onboard a new council:
 *   1. Screenshot the portal's grounds page (it's the first wizard step
 *      on most Imperial/RingGo/IPS portals).
 *   2. Copy the grounds rows VERBATIM into `portalGrounds`.
 *   3. Pick the closest portal row for each `CanonicalGroundId` and put
 *      it under `translate`. Use the fallback row (typically the council's
 *      "Other reasons" / "I wish to challenge this PCN for other reasons"
 *      row) for canonical grounds that have no statutory analogue.
 *   4. Register the export in `grounds/registry.ts`.
 *
 * The Lambeth entry was hand-verified against four real portal screenshots
 * on 2026-05-26 — see `grounds/lambeth.ts`.
 */

import type { CanonicalGroundId } from "@/lib/grounds-catalog";

export interface CouncilGroundsMapping {
  /** Council slug (matches `councils.slug` column). */
  readonly councilSlug: string;
  /** Display name for log lines + admin UI. */
  readonly councilName: string;
  /**
   * Council's portal-specific radio list, ordered as they appear on screen.
   * The submission agent uses this list to verify it's seeing the right
   * page (drift check) before clicking.
   */
  readonly portalGrounds: readonly string[];
  /**
   * Canonical-ground → portal-radio-label translation. The value MUST
   * match a string in `portalGrounds` exactly (the submission engine
   * looks for that text on the page).
   *
   * Every CanonicalGroundId should map to SOMETHING — leave it empty
   * (or undefined) only when the council has a true catch-all "Other"
   * row that should swallow it, and rely on `fallbackLabel`.
   */
  readonly translate: Partial<Record<CanonicalGroundId, string>>;
  /**
   * Catch-all label used when none of the appeal's canonical grounds has
   * a per-council entry. Typically the "Other reasons" / "I wish to
   * challenge this PCN for other reasons" row on the portal.
   */
  readonly fallbackLabel: string;
  /**
   * Optional source-of-truth pointer — file path or URL where the
   * portal-grounds list was captured. Helps the next maintainer find
   * the screenshot that backs each row.
   */
  readonly verifiedAgainst?: string;
}

/**
 * Result of resolving an appeal's canonical grounds against a council's
 * portal-specific radios.
 */
export interface ResolvedGroundLabel {
  /** The exact portal-row text the agent should click. */
  readonly label: string;
  /**
   * Which canonical ground triggered this label, or `null` if no
   * canonical ground matched and the fallback was used.
   */
  readonly source: CanonicalGroundId | null;
  /** The full mapping used (council-scoped). */
  readonly mapping: CouncilGroundsMapping;
}
