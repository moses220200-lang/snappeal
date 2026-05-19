import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/server/db/client";
import { getSessionUser } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.string().email().max(254),
  sessionId: z.string().max(128).optional(),
  source: z.string().max(40).optional(),
});

/**
 * POST /api/care-plan/waitlist — drops the joiner's email into the
 * `care_plan_waitlist` table. Idempotent on email (upsert).
 */
export async function POST(request: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch (err) {
    return NextResponse.json(jsonError("BAD_REQUEST", "Invalid waitlist body", String(err)), {
      status: 400,
    });
  }
  const db = getDb();
  if (!db) {
    return NextResponse.json(jsonError("DATABASE_NOT_CONFIGURED", "DB missing"), { status: 503 });
  }
  try {
    const user = await getSessionUser();
    const id = `wl_${randomBytes(8).toString("hex")}`;
    await db
      .insert(schema.carePlanWaitlist)
      .values({
        id,
        email: body.email.trim().toLowerCase(),
        userId: user?.id ?? null,
        sessionId: body.sessionId ?? null,
        source: body.source ?? null,
      })
      .onConflictDoUpdate({
        target: schema.carePlanWaitlist.email,
        set: {
          userId: user?.id ?? null,
          sessionId: body.sessionId ?? null,
          source: body.source ?? null,
        },
      });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      jsonError("INTERNAL", err instanceof Error ? err.message : "Waitlist insert failed"),
      { status: 500 },
    );
  }
}

/** GET /api/care-plan/waitlist?email=... — check if an email is already on the list. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const email = url.searchParams.get("email")?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json(jsonError("BAD_REQUEST", "Missing email"), { status: 400 });
  }
  const db = getDb();
  if (!db) return NextResponse.json({ joined: false });
  const rows = await db.select().from(schema.carePlanWaitlist).where(eq(schema.carePlanWaitlist.email, email));
  return NextResponse.json({ joined: rows.length > 0 });
}
