/**
 * Server-side viewer resolver — single source for "who is making this
 * request". Returns null userId for guests, the ParkingRabbit userId from the
 * session JWT for signed-in users. OAuth providers add tokens with the
 * same shape so this resolver stays unchanged.
 *
 * Auth is intentionally optional: the whole flow works as a guest; signing
 * in adds cross-device sync, inbound-mail linkage, and ownership claims on
 * previously-anonymous appeals.
 */
import { getSessionUser } from "./auth";

export interface Viewer {
  userId: string | null;
  isSignedIn: boolean;
  role: "user" | "admin" | null;
}

export async function getViewer(): Promise<Viewer> {
  try {
    const user = await getSessionUser();
    if (!user) return { userId: null, isSignedIn: false, role: null };
    return { userId: user.id, isSignedIn: true, role: user.role };
  } catch {
    return { userId: null, isSignedIn: false, role: null };
  }
}

/**
 * Header the client sends with every appeal-scoped request so the server
 * can prove the caller is the same browser that created the (guest) appeal.
 * For signed-in users the JWT cookie is authoritative; this header is the
 * guest-equivalent.
 *
 * EventSource can't send custom headers, so we also accept the same value
 * as a `?session=…` query-string parameter — only used for the SSE endpoint.
 */
const SESSION_HEADER = "x-parkingrabbit-session";

export function getRequestSessionId(req: Request): string | null {
  const fromHeader = req.headers.get(SESSION_HEADER);
  if (fromHeader && fromHeader.trim().length > 0) return fromHeader.trim();
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("session");
    return q && q.trim().length > 0 ? q.trim() : null;
  } catch {
    return null;
  }
}

interface OwnableAppeal {
  userId: string | null;
  sessionId: string;
}

/**
 * True iff the viewer (or anonymous-session-id from the request header)
 * is the owner of the appeal. Admins always pass.
 *
 *   - signed-in user: their `userId` must match `appeal.userId`
 *   - guest:          the `x-parkingrabbit-session` header must match
 *                     `appeal.sessionId` AND the appeal must still be
 *                     unclaimed (`userId IS NULL`)
 *   - admin:          always allowed
 */
export function canViewAppeal(
  viewer: Viewer,
  appeal: OwnableAppeal,
  requestSessionId: string | null,
): boolean {
  if (viewer.role === "admin") return true;
  if (viewer.userId && appeal.userId && viewer.userId === appeal.userId) {
    return true;
  }
  if (
    !appeal.userId &&
    requestSessionId &&
    requestSessionId === appeal.sessionId
  ) {
    return true;
  }
  return false;
}

/**
 * 2026-05-27 — viewer-aware access check that ALSO consults the
 * appeal_viewers join table. Returns:
 *   - "owner"   — viewer owns the appeal (full read/write)
 *   - "shared"  — viewer was linked via the join table (read-only)
 *   - "none"    — no access
 *
 * Admins always return "owner" (full access).
 *
 * Used by /api/appeals/[id] and similar routes to gate edit/action
 * surfaces. The pure-synchronous `canViewAppeal` above is kept for
 * code paths that only care about "owner or not" — extending those
 * to support shared-viewer access requires a DB read, which the
 * caller can avoid when they're inside a transaction or already
 * fetching the appeal row.
 */
export type AccessRole = "owner" | "shared" | "none";

export async function resolveAccess(
  viewer: Viewer,
  appeal: OwnableAppeal & { id: string },
  requestSessionId: string | null,
): Promise<AccessRole> {
  if (viewer.role === "admin") return "owner";
  if (canViewAppeal(viewer, appeal, requestSessionId)) return "owner";
  // Fall through — check the viewers join table for a shared link.
  if (!requestSessionId && !viewer.userId) return "none";
  // Lazy-import to avoid the schema → viewer → db cycle.
  const { getDb, schema } = await import("./db/client");
  const { and, eq, or } = await import("drizzle-orm");
  const db = getDb();
  if (!db) return "none";
  const userOrSession = viewer.userId
    ? or(
        eq(schema.appealViewers.userId, viewer.userId),
        requestSessionId
          ? eq(schema.appealViewers.sessionId, requestSessionId)
          : undefined,
      )
    : requestSessionId
      ? eq(schema.appealViewers.sessionId, requestSessionId)
      : undefined;
  if (!userOrSession) return "none";
  const rows = await db
    .select({ appealId: schema.appealViewers.appealId })
    .from(schema.appealViewers)
    .where(and(eq(schema.appealViewers.appealId, appeal.id), userOrSession))
    .limit(1);
  return rows.length > 0 ? "shared" : "none";
}

/**
 * Add a viewer link so a second user/session can READ a shared appeal
 * without spawning a duplicate row. Idempotent — calling twice for the
 * same (appealId, sessionId) is a no-op (PK conflict swallowed).
 */
export async function linkAsViewer(
  appealId: string,
  viewerUserId: string | null,
  viewerSessionId: string,
): Promise<void> {
  const { getDb, schema } = await import("./db/client");
  const db = getDb();
  if (!db) return;
  await db
    .insert(schema.appealViewers)
    .values({
      appealId,
      userId: viewerUserId,
      sessionId: viewerSessionId,
    })
    .onConflictDoNothing();
}
