import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireAdminApi } from "@/lib/server/admin";
import { getDb, schema } from "@/lib/server/db/client";
import { jsonError } from "@/lib/server/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  slug: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/, "kebab-case ASCII"),
  name: z.string().min(2).max(160),
  type: z.enum(["borough", "corporation", "tfl", "royal_parks"]),
  appealPortalUrl: z.string().url(),
  appealEmail: z.string().email().nullable().optional(),
  postalAddress: z.string().max(400).nullable().optional(),
  submissionMethods: z.array(z.enum(["portal", "email", "post"])).min(1),
  identifierHints: z.array(z.string()).min(1).max(20),
  pcnRefPattern: z.string().max(80).nullable().optional(),
  automationStatus: z.enum(["manual", "automated_beta", "automated_ga"]).default("manual"),
  notes: z.string().max(2000).nullable().optional(),
});

/** POST /api/admin/councils — create a new council row. */
export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch (err) {
    return NextResponse.json(jsonError("BAD_REQUEST", "Invalid council body", String(err)), {
      status: 400,
    });
  }
  const db = getDb();
  if (!db) return NextResponse.json(jsonError("DATABASE_NOT_CONFIGURED", "DB missing"), { status: 503 });
  try {
    const existing = await db.select().from(schema.councils).where(eq(schema.councils.slug, body.slug));
    if (existing[0]) {
      return NextResponse.json(jsonError("CONFLICT", `Slug ${body.slug} already exists`), { status: 409 });
    }
    const [row] = await db
      .insert(schema.councils)
      .values({
        ...body,
        appealEmail: body.appealEmail ?? null,
        postalAddress: body.postalAddress ?? null,
        pcnRefPattern: body.pcnRefPattern ?? null,
        notes: body.notes ?? null,
        lastVerifiedAt: new Date(),
      })
      .returning();
    return NextResponse.json({ council: row });
  } catch (err) {
    return NextResponse.json(
      jsonError("INTERNAL", err instanceof Error ? err.message : "Insert failed"),
      { status: 500 },
    );
  }
}
