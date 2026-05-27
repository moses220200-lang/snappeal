/**
 * GET /api/admin/notifications/users → { users: UserRow[] }
 *
 * Lists every user with a flag indicating whether they have a push
 * subscription stored. Powers the recipient picker in
 * /admin/notifications/test. Returns at most 200 users — if you need
 * to send a test to a specific user not in the list, type their id
 * directly (the test endpoint accepts any userId).
 */
import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { requireAdminApi } from "@/lib/server/admin";
import { getDb, schema } from "@/lib/server/db/client";
import { mergePrefs } from "@/lib/server/notifications/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const db = getDb();
  if (!db) return NextResponse.json({ users: [] });
  const rows = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      displayName: schema.users.displayName,
      prefs: schema.users.notificationPrefs,
    })
    .from(schema.users)
    .orderBy(desc(schema.users.lastSignInAt))
    .limit(200);
  return NextResponse.json({
    users: rows.map((r) => {
      const prefs = mergePrefs(r.prefs);
      return {
        id: r.id,
        email: r.email,
        displayName: r.displayName,
        hasPushSubscription: prefs.push !== null,
      };
    }),
  });
}
