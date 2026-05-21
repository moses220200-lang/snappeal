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
const SESSION_HEADER = "x-snappeal-session";

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
 *   - guest:          the `x-snappeal-session` header must match
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
