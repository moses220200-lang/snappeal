import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getSessionUser, setSessionCookie, signJwt } from "@/lib/server/auth";
import { getDb, schema } from "@/lib/server/db/client";
import { jsonError } from "@/lib/server/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/auth/me
 *
 * Returns the lightweight SessionUser (used everywhere the cookie is the only
 * source of truth — Wizard, header, AuthGate). Also returns the `profile`
 * shape with the postal-address + phone fields stored in `users` from
 * migration 0008. The JWT stays small; the profile is fetched on demand for
 * the /app/profile/personal-details page only.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ user: null, profile: null });

  const db = getDb();
  if (!db) return NextResponse.json({ user, profile: null });

  const rows = await db
    .select({
      phone: schema.users.phone,
      addressLine1: schema.users.addressLine1,
      addressLine2: schema.users.addressLine2,
      addressCity: schema.users.addressCity,
      addressPostcode: schema.users.addressPostcode,
    })
    .from(schema.users)
    .where(eq(schema.users.id, user.id))
    .limit(1);
  const profile = rows[0] ?? null;
  return NextResponse.json({ user, profile });
}

const Patch = z.object({
  displayName: z.string().min(1).max(80).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  addressLine1: z.string().max(120).nullable().optional(),
  addressLine2: z.string().max(120).nullable().optional(),
  addressCity: z.string().max(80).nullable().optional(),
  addressPostcode: z.string().max(20).nullable().optional(),
});

export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(jsonError("UNAUTHENTICATED", "Sign in first"), { status: 401 });
  }
  let body: z.infer<typeof Patch>;
  try {
    body = Patch.parse(await request.json());
  } catch (err) {
    return NextResponse.json(jsonError("BAD_REQUEST", "Invalid patch body", String(err)), {
      status: 400,
    });
  }
  const db = getDb();
  if (!db) {
    return NextResponse.json(jsonError("DATABASE_NOT_CONFIGURED", "DB missing"), { status: 503 });
  }

  // Build the update payload from whichever fields the client sent.
  // `undefined` = "don't touch this column"; explicit `null` = "clear it".
  const updates: Partial<typeof schema.users.$inferInsert> = {};
  if (body.displayName !== undefined) updates.displayName = body.displayName;
  if (body.phone !== undefined) updates.phone = body.phone;
  if (body.addressLine1 !== undefined) updates.addressLine1 = body.addressLine1;
  if (body.addressLine2 !== undefined) updates.addressLine2 = body.addressLine2;
  if (body.addressCity !== undefined) updates.addressCity = body.addressCity;
  if (body.addressPostcode !== undefined) updates.addressPostcode = body.addressPostcode;

  if (Object.keys(updates).length > 0) {
    await db.update(schema.users).set(updates).where(eq(schema.users.id, user.id));
  }

  // Refresh the JWT so displayName stays in sync on the cookie.
  const refreshed = {
    ...user,
    displayName: body.displayName !== undefined ? body.displayName : user.displayName,
  };
  await setSessionCookie(signJwt(refreshed));

  // Read back the profile so the client doesn't need a follow-up GET.
  const rows = await db
    .select({
      phone: schema.users.phone,
      addressLine1: schema.users.addressLine1,
      addressLine2: schema.users.addressLine2,
      addressCity: schema.users.addressCity,
      addressPostcode: schema.users.addressPostcode,
    })
    .from(schema.users)
    .where(eq(schema.users.id, user.id))
    .limit(1);

  return NextResponse.json({ user: refreshed, profile: rows[0] ?? null });
}
