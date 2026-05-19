/**
 * Server-side viewer resolver — single source for "who is making this
 * request". Returns null userId for guests, the Snappeal userId from the
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
