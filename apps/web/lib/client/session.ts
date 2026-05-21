/**
 * Client-side session helpers.
 *
 * Holds ONLY:
 *   - `sessionId` — anonymous guest identity, used by every API call so the
 *     server can attribute appeals before sign-in.
 *   - `currentAppealId` — pointer to the in-flight draft, so the capture →
 *     notes → paywall transitions all operate on the same row.
 *   - `pcnPhoto` + `evidencePhotos` — large data URLs held in sessionStorage
 *     until the paywall ships them to the server. Stays client-side until
 *     Vercel Blob (or equivalent) is wired up — tracked in `wiki/docs/todo.md`.
 *   - `serviceTier` — UX-only "what does the customer want to do?" preference
 *     captured before an appeal exists (e.g. the home `Challenge a ticket`
 *     hero sets it). Once the appeal is created the value is mirrored onto
 *     `appeals.serviceTier` in the DB and reads should prefer that.
 *
 * Ticket fields, notes, and selected grounds USED to live in sessionStorage
 * too; they've moved to the DB via `lib/client/draft.ts` so the cloud is the
 * authoritative source and the customer never loses a draft on a tab close.
 */
const KEY_SESSION = "snappeal.sessionId";
const KEY_PCN = "snappeal.pcnPhoto";
const KEY_EVIDENCE = "snappeal.evidencePhotos";
const KEY_APPEAL = "snappeal.currentAppealId";
const KEY_TIER = "snappeal.serviceTier";

// One-shot cleanup of the keys we used to store on first import in a
// browser. Safe to call on every page load — does nothing once the keys
// are already gone. Runs in module scope so any module that touches
// session also flushes the legacy data.
const LEGACY_KEYS = [
  "snappeal.notes",
  "snappeal.confirmedTicket",
  "snappeal.selectedGrounds",
];
if (typeof window !== "undefined") {
  for (const k of LEGACY_KEYS) {
    try {
      window.sessionStorage.removeItem(k);
      window.localStorage.removeItem(k);
    } catch {
      /* private mode / quota — best effort */
    }
  }
}

export type ServiceTier = "buy_time" | "grounds" | "care_plan";

export function getServiceTier(): ServiceTier {
  if (typeof window === "undefined") return "grounds";
  const v = window.localStorage.getItem(KEY_TIER) as ServiceTier | null;
  return v === "buy_time" || v === "grounds" || v === "care_plan" ? v : "grounds";
}

export function setServiceTier(tier: ServiceTier) {
  window.localStorage.setItem(KEY_TIER, tier);
}

export function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  let id = window.localStorage.getItem(KEY_SESSION);
  if (!id) {
    id = `snap_${crypto.randomUUID()}`;
    window.localStorage.setItem(KEY_SESSION, id);
  }
  return id;
}

export function setPcnPhoto(dataUrl: string) {
  window.sessionStorage.setItem(KEY_PCN, dataUrl);
}
export function getPcnPhoto(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(KEY_PCN);
}
export function clearPcnPhoto() {
  window.sessionStorage.removeItem(KEY_PCN);
}

export function setEvidencePhotos(dataUrls: string[]) {
  window.sessionStorage.setItem(KEY_EVIDENCE, JSON.stringify(dataUrls));
}
export function getEvidencePhotos(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(KEY_EVIDENCE);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}
export function clearEvidencePhotos() {
  window.sessionStorage.removeItem(KEY_EVIDENCE);
}

export function setCurrentAppealId(id: string) {
  window.localStorage.setItem(KEY_APPEAL, id);
}
export function getCurrentAppealId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEY_APPEAL);
}
export function clearCurrentAppealId() {
  window.localStorage.removeItem(KEY_APPEAL);
}

export function clearCaptureFlow() {
  clearPcnPhoto();
  clearEvidencePhotos();
  clearCurrentAppealId();
}

/**
 * Backwards-compat shape for `ConfirmedTicket` — kept so existing capture
 * page typing still works while the form bridges into the cloud-PATCH
 * helpers in `lib/client/draft.ts`. The DB column accepts the same fields.
 */
export interface ConfirmedTicket {
  issuer?: string;
  councilSlug?: string;
  pcnRef?: string;
  vehicleReg?: string;
  contraventionCode?: string;
  contraventionDescription?: string;
  issuedAt?: string;
  location?: string;
  amountPence?: number;
}
