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
      "x-parkingrabbit-session": sessionId,
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
      "x-parkingrabbit-session": sessionId,
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
          coach?: PhotoCoachResult | null;
          /** Server-side post-OCR dedup may have folded this upload
           *  into an older draft for the same (pcnRef, vehicleReg).
           *  When set, the duplicate row has been deleted and this id
           *  is the surviving target — re-point the session pointer
           *  so any follow-up PATCH from this device hits the right
           *  row. The reconciliation poll on /app/tickets picks up
           *  the merge naturally on its next tick. */
          mergedInto?: string | null;
        };
        const survivingAppealId = json.mergedInto ?? updated.id;
        if (json.mergedInto && json.mergedInto !== updated.id) {
          setCurrentAppealId(json.mergedInto);
        }
        // Fold the photo-coach verdict into the handoff so the
        // failure card / pending-review form can render the
        // "photo could be sharper" amber hint when needed.
        // Per-field `confidence` was removed from Pass 2's schema
        // in 2026-05-27 (no UI consumer remained).
        setOcrHandoff({
          appealId: survivingAppealId,
          confidence: {},
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
 * Re-run OCR against an EXISTING failed appeal row with a new photo.
 *
 * Used by the "Retake photo" / "Choose another photo" recovery actions
 * on the Reading-failed surface. The naive approach (call `uploadPcn`
 * with the new photo) would create a fresh appeal row + leave the
 * failed one as an orphan in the list. This helper instead reuses the
 * same row so the user sees THEIR card recover in place.
 *
 * Steps:
 *   1. Replace the sessionStorage photo + reset the OCR handoff so the
 *      smart card renders the new photo immediately and clears any
 *      confidence pills from the failed run.
 *   2. PATCH `pcnImageUrl` on the existing appeal row. Best-effort.
 *   3. Fire `/api/extract` with `{ appealId, pcnPhoto }`. The route's
 *      first action is `setProcessingStep("ocr", "running")` which
 *      overwrites the existing `"failed"` status — so by the next
 *      polling tick `deriveCardState` exits the failure branch and
 *      flips the card back to `processing`. On success the route
 *      PATCHes the new ticket fields + flips status to `"done"`; on
 *      failure it sets `"failed"` again and the card returns to the
 *      same surface (with the new image preview).
 *
 * `setProcessingStep` is called server-side as fire-and-forget, so the
 * client briefly sees stale `"failed"` between this call and the next
 * `/api/appeals/[id]` poll. That's acceptable: the calling component
 * disables the button + shows a spinner during this window, so the
 * user has feedback that something is happening.
 */
export async function retryOcrWithPhoto(
  appealId: string,
  photoDataUrl: string,
): Promise<void> {
  setPcnPhoto(photoDataUrl);
  setOcrHandoff({
    appealId,
    confidence: {},
    photoCoach: null,
  });

  const sessionId = getOrCreateSessionId();
  const headers = {
    "content-type": "application/json",
    "x-parkingrabbit-session": sessionId,
  };

  // Step 1 — PATCH the new photo onto the row. /api/extract reads
  // `pcnPhoto` from the request body for OCR (so this PATCH isn't
  // load-bearing for the extraction itself), but the appeal row's
  // pcnImageUrl drives the preview rendered inside ReadingPCNActive,
  // so we update it before triggering OCR so the card flips to the
  // new image immediately.
  //
  // We deliberately do NOT clear the OCR-extracted ticket fields
  // here — that's done atomically inside the server's `startOcrRun`
  // helper, which is invoked at the top of /api/extract. Doing it
  // server-side keeps the clear + the new-run stamp in a single
  // UPDATE (no half-cleared state visible to the polling loop).
  void fetch(`/api/appeals/${encodeURIComponent(appealId)}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ pcnImageUrl: photoDataUrl }),
  }).catch(() => {});

  // Step 2 — re-fire OCR. The new /api/extract call invokes
  // `startOcrRun()` server-side, which:
  //   1. Stamps a fresh `runId` onto processing.ocr.
  //   2. Flips status: "failed" / "done" → "running" (clears prior
  //      error message from the audit trail too).
  //   3. Clears the OCR-extracted ticket fields so the subsequent
  //      fill-empty merge can write fresh values without being
  //      blocked by a previous failed pass's wrong data.
  //
  // Any in-flight stale writes from the previous run check the
  // runId and silently skip, so the user only ever sees this new
  // run's results.
  void fetch("/api/extract", {
    method: "POST",
    headers,
    body: JSON.stringify({ sessionId, pcnPhoto: photoDataUrl, appealId }),
  }).catch(() => {});
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
