import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireAdminApi } from "@/lib/server/admin";
import { getDb, schema } from "@/lib/server/db/client";
import { jsonError } from "@/lib/server/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Patch = z.object({
  name: z.string().min(2).max(160).optional(),
  type: z.enum(["borough", "corporation", "tfl", "royal_parks"]).optional(),
  appealPortalUrl: z.string().url().optional(),
  paymentPortalUrl: z.string().url().nullable().optional(),
  appealEmail: z.string().email().nullable().optional(),
  postalAddress: z.string().max(400).nullable().optional(),
  submissionMethods: z.array(z.enum(["portal", "email", "post"])).optional(),
  identifierHints: z.array(z.string()).optional(),
  pcnRefPattern: z.string().max(80).nullable().optional(),
  automationStatus: z.enum(["manual", "automated_beta", "automated_ga"]).optional(),
  notes: z.string().max(2000).nullable().optional(),
  logoUrl: z.string().url().max(500).nullable().optional(),
  logoBg: z.string().max(20).nullable().optional(),
});

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const { slug } = await ctx.params;
  const db = getDb();
  if (!db) return NextResponse.json(jsonError("DATABASE_NOT_CONFIGURED", "DB missing"), { status: 503 });
  const rows = await db.select().from(schema.councils).where(eq(schema.councils.slug, slug));
  if (!rows[0]) return NextResponse.json(jsonError("NOT_FOUND", `Council ${slug} not found`), { status: 404 });
  return NextResponse.json({ council: rows[0] });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const { slug } = await ctx.params;
  let body: z.infer<typeof Patch>;
  try {
    body = Patch.parse(await req.json());
  } catch (err) {
    return NextResponse.json(jsonError("BAD_REQUEST", "Invalid body", String(err)), { status: 400 });
  }
  const db = getDb();
  if (!db) return NextResponse.json(jsonError("DATABASE_NOT_CONFIGURED", "DB missing"), { status: 503 });
  await db
    .update(schema.councils)
    .set({ ...body, lastVerifiedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.councils.slug, slug));
  const fresh = await db.select().from(schema.councils).where(eq(schema.councils.slug, slug));
  return NextResponse.json({ council: fresh[0] ?? null });
}
