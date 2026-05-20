import { NextResponse } from "next/server";
import { getDb, schema } from "@/lib/server/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/councils — public list of London authorities used by the
 * manual-entry wizard's council picker. Returns slug + name + type +
 * automation status so the UI can label "fast" vs "slower" routes.
 */
export async function GET() {
  const db = getDb();
  if (!db) return NextResponse.json({ councils: [] });
  const rows = await db
    .select({
      slug: schema.councils.slug,
      name: schema.councils.name,
      type: schema.councils.type,
      automationStatus: schema.councils.automationStatus,
    })
    .from(schema.councils)
    .orderBy(schema.councils.name);
  return NextResponse.json({ councils: rows });
}
