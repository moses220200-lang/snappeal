/**
 * uploadPcn — single-call helper that takes a PCN photo (data URL) and
 * orchestrates the progressive ticket-creation pipeline:
 *
 *   1. PATCH the current appeal with `pcnImageUrl` (creates the row on
 *      first call via `ensureCurrentAppeal()`).
 *   2. Stash the OCR handoff in sessionStorage so the smart card can
 *      render confidence pills once OCR settles.
 *   3. Fire `/api/extract` fire-and-forget — the route PATCHes ticket
 *      fields and processing.ocr.status as OCR completes.
 *
 * Returns the appeal id so the caller can navigate or update local UI.
 *
 * Extracted from `apps/web/app/app/capture/page.tsx → runExtract()` in
 * v0.2.18 so the same pipeline can be triggered from `/app/tickets`
 * directly (without ever visiting `/app/capture`). The visible
 * "Add a ticket" page is now redundant; the file picker lives on the
 * destination page.
 */
import {
  getOrCreateSessionId,
  setCurrentAppealId,
  setOcrHandoff,
  setPcnPhoto,
} from "@/lib/client/session";
import type { AppealRecord } from "@/lib/server/appeals";

export interface UploadPcnResult {
  appealId: string;
}

interface PhotoCoachResult {
  legible: boolean;
  quality: "good" | "ok" | "poor";
  issues: string[];
  advice: string;
}

export async function uploadPcn(photoDataUrl: string): Promise<UploadPcnResult> {
  // Persist the photo to sessionStorage so the smart card can show it
  // inline even before the server-side blob (when wired) lands.
  setPcnPhoto(photoDataUrl);

  // v0.2.18 — every upload creates a fresh appeal row. Reusing the
  //   session's "current draft" pointer (the old `patchCurrentAppeal`
  //   path) caused 403s when a user had signed in, created a draft, then
  //   signed out: sessionStorage still held the appeal id but the guest
  //   no longer had permission to mutate it. Each scanned PCN is its
  //   own ticket; always create.
  const sessionId = getOrCreateSessionId();
  const createRes = await fetch("/api/appeals", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-snappeal-session": sessionId,
    },
    body: JSON.stringify({ sessionId }),
  });
  if (!createRes.ok) {
    throw new Error(`Couldn't create the appeal (${createRes.status})`);
  }
  const createJson = (await createRes.json()) as { appeal: AppealRecord };
  const created = createJson.appeal;
  setCurrentAppealId(created.id);

  // Stamp the photo URL on the fresh appeal.
  const patchRes = await fetch(`/api/appeals/${encodeURIComponent(created.id)}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "x-snappeal-session": sessionId,
    },
    body: JSON.stringify({ pcnImageUrl: photoDataUrl }),
  });
  if (!patchRes.ok) {
    throw new Error(`Couldn't save the photo (${patchRes.status})`);
  }
  const patchJson = (await patchRes.json()) as { appeal: AppealRecord };
  const updated = patchJson.appeal;

  // 2) Pre-stash an empty OCR handoff so the card knows the appeal id;
  //    we'll fold confidence + coach in once /api/extract responds.
  setOcrHandoff({
    appealId: updated.id,
    confidence: {},
    photoCoach: null,
  });

  // 3) Fire OCR in the background. The server-side handler PATCHes the
  //    appeal row with ticket fields when it settles AND updates
  //    `processing.ocr.status`. We don't await; the smart card's
  //    polling loop picks up the result whenever it arrives.
  void fetch("/api/extract", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sessionId: getOrCreateSessionId(),
      pcnPhoto: photoDataUrl,
      appealId: updated.id,
    }),
  })
    .then(async (res) => {
      if (!res.ok) return;
      try {
        const json = (await res.json()) as {
          confidence?: Record<string, number>;
          coach?: PhotoCoachResult | null;
        };
        // Fold confidence + photo coach into the handoff so the card
        // can render the "2 greens" confidence pills on the inputs.
        setOcrHandoff({
          appealId: updated.id,
          confidence: json.confidence ?? {},
          photoCoach: json.coach ?? null,
        });
      } catch {
        /* non-fatal — the ticket fields are already on the appeal row */
      }
    })
    .catch(() => {
      /* server-side handler marks processing.ocr.status='failed' */
    });

  return { appealId: updated.id };
}

/**
 * Read a File as a base64 data URL. Used by the file-input onChange
 * handler before calling `uploadPcn`. Throws on files larger than 8 MB
 * to keep the OCR payload bounded.
 */
const MAX_BYTES = 8 * 1024 * 1024;

export function readFileAsDataUrl(file: File): Promise<string> {
  if (file.size > MAX_BYTES) {
    return Promise.reject(
      new Error(
        `Photo too large (${(file.size / 1024 / 1024).toFixed(1)} MB) — max 8 MB.`,
      ),
    );
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Couldn't read photo"));
    reader.readAsDataURL(file);
  });
}
