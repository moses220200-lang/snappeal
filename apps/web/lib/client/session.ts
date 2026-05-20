/**
 * Client-side session id + appeal-id helpers. Persists in localStorage so
 * a guest returning a week later still sees their case history.
 */
const KEY_SESSION = "snappeal.sessionId";
const KEY_PCN = "snappeal.pcnPhoto";
const KEY_EVIDENCE = "snappeal.evidencePhotos";
const KEY_NOTES = "snappeal.notes";
const KEY_APPEAL = "snappeal.currentAppealId";
const KEY_TICKET = "snappeal.confirmedTicket";

export type ServiceTier = "buy_time" | "grounds" | "care_plan";

const KEY_TIER = "snappeal.serviceTier";

export function getServiceTier(): ServiceTier {
  if (typeof window === "undefined") return "grounds";
  const v = window.localStorage.getItem(KEY_TIER) as ServiceTier | null;
  return v === "buy_time" || v === "grounds" || v === "care_plan" ? v : "grounds";
}

export function setServiceTier(tier: ServiceTier) {
  window.localStorage.setItem(KEY_TIER, tier);
}

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

export function setConfirmedTicket(ticket: ConfirmedTicket) {
  window.sessionStorage.setItem(KEY_TICKET, JSON.stringify(ticket));
}
export function getConfirmedTicket(): ConfirmedTicket | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY_TICKET);
    return raw ? (JSON.parse(raw) as ConfirmedTicket) : null;
  } catch {
    return null;
  }
}
export function clearConfirmedTicket() {
  window.sessionStorage.removeItem(KEY_TICKET);
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

export function setNotes(text: string) {
  window.sessionStorage.setItem(KEY_NOTES, text);
}
export function getNotes(): string {
  if (typeof window === "undefined") return "";
  return window.sessionStorage.getItem(KEY_NOTES) ?? "";
}
export function clearNotes() {
  window.sessionStorage.removeItem(KEY_NOTES);
}

/* Selected ground-card IDs from the step-2 quiz. Stored as a JSON array
 * so the cards can be hydrated on back-navigation and so /api/generate
 * can be informed of the customer's chosen grounds before drafting. */
const KEY_GROUNDS = "snappeal.selectedGrounds";
export function setSelectedGrounds(cardIds: string[]) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(KEY_GROUNDS, JSON.stringify(cardIds));
}
export function getSelectedGrounds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(KEY_GROUNDS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
export function clearSelectedGrounds() {
  window.sessionStorage.removeItem(KEY_GROUNDS);
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
  clearNotes();
  clearCurrentAppealId();
  clearConfirmedTicket();
}
