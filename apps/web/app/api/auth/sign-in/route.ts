import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { authenticateUser, setSessionCookie, signJwt } from "@/lib/server/auth";
import { getDb, schema } from "@/lib/server/db/client";
import { jsonError } from "@/lib/server/contracts";
import { getRequestSessionId } from "@/lib/server/viewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.string().min(3).max(254),
  password: z.string().min(1).max(200),
  /** Optional: anonymous session id whose guest appeals should be claimed on sign-in. */
  sessionId: z.string().max(128).optional(),
});

export async function POST(request: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch (err) {
    return NextResponse.json(jsonError("BAD_REQUEST", "Invalid sign-in body", String(err)), {
      status: 400,
    });
  }
  try {
    const user = await authenticateUser(body.email, body.password);
    if (!user) {
      return NextResponse.json(jsonError("INVALID_CREDENTIALS", "Wrong email or password"), {
        status: 401,
      });
    }
    await setSessionCookie(signJwt(user));

    // Same defence as sign-up: only claim guest appeals when the body's
    // sessionId matches the `x-parkingrabbit-session` header set from the
    // browser's own localStorage.
    const headerSession = getRequestSessionId(request);
    const claimSession =
      body.sessionId && headerSession && body.sessionId === headerSession
        ? body.sessionId
        : null;
    if (claimSession) {
      const db = getDb();
      if (db) {
        await db
          .update(schema.appeals)
          .set({ userId: user.id })
          .where(and(eq(schema.appeals.sessionId, claimSession), isNull(schema.appeals.userId)));
      }
    }

    return NextResponse.json({ user });
  } catch (err) {
    return NextResponse.json(
      jsonError("SIGN_IN_FAILED", err instanceof Error ? err.message : "Sign-in failed"),
      { status: 500 },
    );
  }
}
