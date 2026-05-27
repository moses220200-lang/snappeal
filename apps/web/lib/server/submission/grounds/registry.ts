/**
 * Per-council grounds-mapping registry.
 *
 * Single source of truth for the slug → council-specific radio label
 * translation that the submission engine consumes. Add a new council by:
 *   1. Creating `grounds/<slug>.ts` with a `CouncilGroundsMapping` export.
 *   2. Importing + registering it below.
 *   3. Optionally rendering the translation table into the submission
 *      prompt with `renderTranslationRule(mapping)`.
 *
 * The submission engine PRE-RESOLVES the council-specific label from the
 * appeal's canonical grounds (priority order — first canonical match wins,
 * fallback otherwise) and surfaces both the resolved label and the full
 * table as a hint to the council-portal MCP agent.
 */

import type { CanonicalGroundId } from "@/lib/grounds-catalog";
import type { CouncilGroundsMapping, ResolvedGroundLabel } from "./types";
import { LAMBETH_GROUNDS } from "./lambeth";

const REGISTRY: Record<string, CouncilGroundsMapping> = {
  [LAMBETH_GROUNDS.councilSlug]: LAMBETH_GROUNDS,
  // Westminster, Camden, RBKC, Islington, TfL, City of London — add as
  // portal screenshots arrive.
};

/** Returns the mapping for a council slug, or `null` if unregistered. */
export function getCouncilGroundsMapping(
  councilSlug: string,
): CouncilGroundsMapping | null {
  return REGISTRY[councilSlug] ?? null;
}

/**
 * Pre-resolve the council's portal-specific radio label from an appeal's
 * canonical grounds. Grounds are tried in array order — the first one
 * with a per-council entry wins; falls back to the council's `fallbackLabel`
 * if no canonical ground has an entry.
 *
 * Returns `null` only when the council itself isn't registered.
 */
export function resolveCouncilGroundLabel(
  councilSlug: string,
  canonicalGrounds: readonly CanonicalGroundId[],
): ResolvedGroundLabel | null {
  const mapping = REGISTRY[councilSlug];
  if (!mapping) return null;
  for (const g of canonicalGrounds) {
    const label = mapping.translate[g];
    if (label) return { label, source: g, mapping };
  }
  return { label: mapping.fallbackLabel, source: null, mapping };
}

/**
 * Render the per-council translation table as a markdown bullet list for
 * embedding inside the submission prompt. The LLM uses this as a fallback
 * if the pre-resolved label fails (e.g. portal drift renamed a row).
 *
 * Output shape:
 *   • "contravention-did-not-occur" → "The contravention did not occur"
 *   • "vehicle-not-mine"            → "I was not the owner of the vehicle ..."
 *   …
 *   • UNMAPPED                      → "I wish to challenge this PCN for other reasons"
 */
export function renderTranslationRule(mapping: CouncilGroundsMapping): string {
  const lines: string[] = [];
  const longest = Math.max(
    ...Object.keys(mapping.translate).map((k) => k.length),
    "UNMAPPED".length,
  );
  for (const [canonical, label] of Object.entries(mapping.translate)) {
    if (!label) continue;
    lines.push(
      `   • "${canonical}"${" ".repeat(longest - canonical.length)} → "${label}"`,
    );
  }
  lines.push(
    `   • UNMAPPED${" ".repeat(longest - "UNMAPPED".length)} → "${mapping.fallbackLabel}"  (safe default)`,
  );
  return lines.join("\n");
}

/**
 * Render the council's full radio list as a numbered audit hint for the
 * submission agent — lets the LLM verify it's on the right page by
 * cross-checking row count + text.
 */
export function renderPortalGroundsList(
  mapping: CouncilGroundsMapping,
): string {
  return mapping.portalGrounds.map((g, i) => `  ${i + 1}. ${g}`).join("\n");
}

/** All registered council slugs — useful for admin UI / drift dashboards. */
export function listRegisteredCouncils(): string[] {
  return Object.keys(REGISTRY);
}

export type { CouncilGroundsMapping, ResolvedGroundLabel };
