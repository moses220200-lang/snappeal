/**
 * Admin authorisation helpers. Wraps the viewer pattern with a hard
 * "must be role=admin" gate, so admin routes either get a typed admin
 * user or a 403 response.
 */
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { getSessionUser, type SessionUser } from "./auth";
import { jsonError } from "./contracts";

export async function requireAdminPage(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=/admin");
  if (user.role !== "admin") redirect("/app?notAdmin=1");
  return user;
}

export async function requireAdminApi(): Promise<
  { ok: true; user: SessionUser } | { ok: false; response: Response }
> {
  const user = await getSessionUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(jsonError("UNAUTHENTICATED", "Sign in first"), { status: 401 }),
    };
  }
  if (user.role !== "admin") {
    return {
      ok: false,
      response: NextResponse.json(jsonError("FORBIDDEN", "Admin role required"), { status: 403 }),
    };
  }
  return { ok: true, user };
}
