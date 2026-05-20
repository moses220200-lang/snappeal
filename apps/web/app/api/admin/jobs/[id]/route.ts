import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireAdminApi } from "@/lib/server/admin";
import { getDb, schema } from "@/lib/server/db/client";
import { jsonError } from "@/lib/server/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  action: z.enum(["retry", "cancel"]),
});

/** POST /api/admin/jobs/[id] {action} — retry (re-queue) or cancel a job. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json(jsonError("BAD_REQUEST", "Invalid body", String(err)), { status: 400 });
  }
  const db = getDb();
  if (!db) return NextResponse.json(jsonError("DATABASE_NOT_CONFIGURED", "DB missing"), { status: 503 });

  if (body.action === "retry") {
    await db
      .update(schema.jobs)
      .set({
        status: "queued",
        runAfter: new Date(),
        lockedAt: null,
        lockedBy: null,
        attempts: 0,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.jobs.id, id));
  } else {
    await db
      .update(schema.jobs)
      .set({
        status: "failed",
        lastError: `Cancelled by admin ${auth.user.email}`,
        lockedAt: null,
        lockedBy: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.jobs.id, id));
  }

  const fresh = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
  return NextResponse.json({ job: fresh[0] ?? null });
}
