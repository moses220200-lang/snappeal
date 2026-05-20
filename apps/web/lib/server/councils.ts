import { cache } from "react";
import { getDb, schema } from "./db/client";

export type CouncilInfo = {
  slug: string;
  name: string;
  logoUrl: string | null;
  logoBg: string | null;
};

/**
 * Look up every council's display info (name + logo) keyed by slug.
 * Cached per-request via React `cache()` so callers can hit it multiple
 * times without re-querying. Returns an empty Map in mock-data mode.
 */
export const getCouncilLookup = cache(async (): Promise<Map<string, CouncilInfo>> => {
  const db = getDb();
  if (!db) return new Map();
  const rows = await db
    .select({
      slug: schema.councils.slug,
      name: schema.councils.name,
      logoUrl: schema.councils.logoUrl,
      logoBg: schema.councils.logoBg,
    })
    .from(schema.councils);
  return new Map(rows.map((r) => [r.slug, r]));
});

/** Resolve one council's display info by slug. */
export async function getCouncil(
  slug: string | null | undefined,
): Promise<CouncilInfo | null> {
  if (!slug) return null;
  const lookup = await getCouncilLookup();
  return lookup.get(slug) ?? null;
}
