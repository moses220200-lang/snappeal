import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getSessionUser, setSessionCookie, signJwt } from "@/lib/server/auth";
import { getDb, schema } from "@/lib/server/db/client";
import { jsonError } from "@/lib/server/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  return NextResponse.json({ user });
}

const Patch = z.object({
  displayName: z.string().min(1).max(80).nullable().optional(),
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
  if (body.displayName !== undefined) {
    await db.update(schema.users).set({ displayName: body.displayName }).where(eq(schema.users.id, user.id));
  }
  const refreshed = { ...user, displayName: body.displayName ?? user.displayName };
  await setSessionCookie(signJwt(refreshed));
  return NextResponse.json({ user: refreshed });
}
