import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { createUser, setSessionCookie, signJwt } from "@/lib/server/auth";
import { getDb, schema } from "@/lib/server/db/client";
import { jsonError } from "@/lib/server/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.string().min(3).max(254),
  password: z.string().min(8).max(200),
  displayName: z.string().max(80).optional().nullable(),
  /** Optional: anonymous session id whose guest appeals should be claimed onto the new user. */
  sessionId: z.string().max(128).optional(),
});

export async function POST(request: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch (err) {
    return NextResponse.json(jsonError("BAD_REQUEST", "Invalid sign-up body", String(err)), {
      status: 400,
    });
  }
  try {
    const user = await createUser({
      email: body.email,
      password: body.password,
      displayName: body.displayName ?? null,
    });
    await setSessionCookie(signJwt(user));

    // Claim any guest appeals for this anonymous session onto the new userId.
    if (body.sessionId) {
      const db = getDb();
      if (db) {
        await db
          .update(schema.appeals)
          .set({ userId: user.id })
          .where(and(eq(schema.appeals.sessionId, body.sessionId), isNull(schema.appeals.userId)));
      }
    }

    return NextResponse.json({ user });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sign-up failed";
    return NextResponse.json(jsonError("SIGN_UP_FAILED", message), { status: 400 });
  }
}
