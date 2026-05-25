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

// One-shot cleanup of legacy keys we used to store. Safe to call on every
// page load — does nothing once the keys are already gone. Runs in module
// scope so any module that touches session also flushes the legacy data.
//
// v0.2.7 (2026-05-22): `KEY_SESSION` and `KEY_APPEAL` moved from
// localStorage → sessionStorage so a fresh browser launch (closed tab,
// re-opened) starts with no resurrected guest state. The product rule:
// "tickets page should not show tickets if you are not logged in". The
// localStorage entries are removed once on first load so returning users
// get a clean slate exactly once.
const LEGACY_KEYS = [
  "snappeal.notes",
  "snappeal.confirmedTicket",
  "snappeal.selectedGrounds",
];
const LEGACY_LOCAL_TO_REMOVE = [
  "snappeal.sessionId",          // moved to sessionStorage in v0.2.7
  "snappeal.currentAppealId",    // moved to sessionStorage in v0.2.7
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
  for (const k of LEGACY_LOCAL_TO_REMOVE) {
    try {
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
  // sessionStorage (not localStorage) — clears on tab close so a fresh
  // browser launch never resurrects an old guest session. Signed-in users
  // are identified by the snappeal.token JWT cookie; this id only ever
  // identifies guests within the lifetime of a single tab.
  let id = window.sessionStorage.getItem(KEY_SESSION);
  if (!id) {
    id = `snap_${crypto.randomUUID()}`;
    window.sessionStorage.setItem(KEY_SESSION, id);
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

// currentAppealId tracks the in-flight draft so capture → validating →
// evidence → paywall all operate on the same row. Stored in sessionStorage
// (not localStorage) — same rationale as sessionId: a fresh tab is a fresh
// flow; signed-in users carry their appeals across tabs via the JWT cookie
// + /api/appeals lookup, not via this pointer.
export function setCurrentAppealId(id: string) {
  window.sessionStorage.setItem(KEY_APPEAL, id);
}
export function getCurrentAppealId(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(KEY_APPEAL);
}
export function clearCurrentAppealId() {
  window.sessionStorage.removeItem(KEY_APPEAL);
}

export function clearCaptureFlow() {
  clearPcnPhoto();
  clearEvidencePhotos();
  clearCurrentAppealId();
  clearOcrResult();
}

/* ───── OCR result handoff (v0.2.14) ─────
 * Capture page stashes the OCR confidence + photo coach output in
 * sessionStorage right before navigating to /app/tickets/[id], so the
 * smart card can render the review UI (confidence pills, image preview,
 * "2 greens" check, retake popup) without re-running OCR.
 */
const KEY_OCR = "snappeal.ocrHandoff";

export interface OcrHandoff {
  appealId: string;
  confidence: {
    issuer?: number;
    councilSlug?: number;
    pcnRef?: number;
    vehicleReg?: number;
    contraventionCode?: number;
    location?: number;
    issuedAt?: number;
    amountPence?: number;
  };
  photoCoach: {
    legible: boolean;
    quality: "good" | "ok" | "poor";
    issues: string[];
    advice: string;
  } | null;
}

export function setOcrHandoff(handoff: OcrHandoff) {
  try {
    window.sessionStorage.setItem(KEY_OCR, JSON.stringify(handoff));
  } catch {
    /* sessionStorage quota / private mode — handoff is non-critical */
  }
}

export function getOcrHandoff(appealId: string): OcrHandoff | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY_OCR);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OcrHandoff;
    return parsed.appealId === appealId ? parsed : null;
  } catch {
    return null;
  }
}

export function clearOcrResult() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(KEY_OCR);
  } catch {
    /* best effort */
  }
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
