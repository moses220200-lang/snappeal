/**
 * GET   /api/admin/users/[id]/notification-prefs → { prefs }
 * PATCH /api/admin/users/[id]/notification-prefs
 *   body: Partial<CustomerToggles> & {
 *     resetAskedAt?: boolean;
 *     clearSubscription?: boolean;
 *   }
 *   → { prefs }
 *
 * Admin-only mirror of /api/users/me/notification-prefs with two
 * extra destructive actions:
 *   - resetAskedAt: wipe pushAskedAt (re-prompt the user at the
 *     NotificationPromptGate moments).
 *   - clearSubscription: null the stored push subscription. User
 *     must re-grant in the browser on next visit.
 *
 * Both customer-facing edits and admin edits go through the same
 * `mergePrefs` codepath so the JSONB stays disciplined.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireAdminApi } from "@/lib/server/admin";
import { getDb, schema } from "@/lib/server/db/client";
import { jsonError } from "@/lib/server/contracts";
import {
  CUSTOMER_TOGGLE_KEYS,
  mergePrefs,
  type CustomerToggleKey,
} from "@/lib/server/notifications/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const db = getDb();
  if (!db)
    return NextResponse.json(jsonError("DATABASE_NOT_CONFIGURED", "DB missing"), {
      status: 503,
    });
  const rows = await db
    .select({ prefs: schema.users.notificationPrefs })
    .from(schema.users)
    .where(eq(schema.users.id, id));
  if (!rows[0])
    return NextResponse.json(jsonError("NOT_FOUND", "User not found"), {
      status: 404,
    });
  return NextResponse.json({ prefs: mergePrefs(rows[0].prefs) });
}

const PatchBody = z.object({
  // Boolean customer toggles — same surface as the customer-facing
  // endpoint; admin can flip on user's behalf.
  pushOnValidation: z.boolean().optional(),
  pushOnSubmission: z.boolean().optional(),
  pushOnCouncilReply: z.boolean().optional(),
  emailOnCouncilReply: z.boolean().optional(),
  emailOnSubmission: z.boolean().optional(),
  showMcpLiveView: z.boolean().optional(),
  // Admin-only actions:
  resetAskedAt: z.boolean().optional(),
  clearSubscription: z.boolean().optional(),
  // Free-form passthrough for UI hint messages; ignored server-side.
  _info: z.string().optional(),
});

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  let body: z.infer<typeof PatchBody>;
  try {
    body = PatchBody.parse(await request.json());
  } catch (err) {
    return NextResponse.json(jsonError("BAD_REQUEST", String(err)), {
      status: 400,
    });
  }
  const db = getDb();
  if (!db)
    return NextResponse.json(jsonError("DATABASE_NOT_CONFIGURED", "DB missing"), {
      status: 503,
    });

  // Read-modify-write so we never clobber fields outside this admin's
  // scope (e.g. another concurrent push-subscribe).
  const existing = await db
    .select({ prefs: schema.users.notificationPrefs })
    .from(schema.users)
    .where(eq(schema.users.id, id));
  if (!existing[0])
    return NextResponse.json(jsonError("NOT_FOUND", "User not found"), {
      status: 404,
    });

  const next = mergePrefs(existing[0].prefs);

  for (const key of CUSTOMER_TOGGLE_KEYS) {
    const v = body[key as keyof typeof body];
    if (typeof v === "boolean") {
      (next as Record<CustomerToggleKey, boolean>)[key] = v;
    }
  }
  if (body.resetAskedAt) {
    next.pushAskedAt = {};
  }
  if (body.clearSubscription) {
    next.push = null;
  }

  await db
    .update(schema.users)
    .set({ notificationPrefs: next })
    .where(eq(schema.users.id, id));

  return NextResponse.json({ prefs: next });
}
