/**
 * POST /api/users/me/notification-prefs/asked
 *   body: { moment: "appealTap" | "submitDone" }
 *   → { ok: true }
 *
 * Recorded by the NotificationPromptGate when it shows the
 * "Turn on notifications" sheet. Once recorded, that moment is
 * never shown again (skip-once). This is a separate endpoint from
 * the main PATCH because:
 *   - It runs on every prompt show (cheap, narrow scope)
 *   - It writes a different sub-object (`pushAskedAt`) with no risk
 *     of clobbering the customer-toggle fields
 *   - It's safe to fire-and-forget client-side
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/server/db/client";
import { getViewer } from "@/lib/server/viewer";
import { jsonError } from "@/lib/server/contracts";
import { mergePrefs } from "@/lib/server/notifications/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  moment: z.enum(["appealTap", "submitDone"]),
});

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer.userId) {
    // Guests have no persistent prefs surface — fail-soft. The gate
    // shouldn't even attempt to call this without a userId, but a
    // 204-style success keeps it harmless.
    return NextResponse.json({ ok: true, ignored: "guest" });
  }
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch (err) {
    return NextResponse.json(jsonError("BAD_REQUEST", String(err)), { status: 400 });
  }
  const db = getDb();
  if (!db) {
    return NextResponse.json(jsonError("DATABASE_NOT_CONFIGURED", "DB missing"), {
      status: 503,
    });
  }
  const existing = await db
    .select({ prefs: schema.users.notificationPrefs })
    .from(schema.users)
    .where(eq(schema.users.id, viewer.userId));
  const prefs = mergePrefs(existing[0]?.prefs);
  prefs.pushAskedAt = {
    ...prefs.pushAskedAt,
    [body.moment]: new Date().toISOString(),
  };
  await db
    .update(schema.users)
    .set({ notificationPrefs: prefs })
    .where(eq(schema.users.id, viewer.userId));
  return NextResponse.json({ ok: true });
}
