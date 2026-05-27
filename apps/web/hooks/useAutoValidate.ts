"use client";

/**
 * useAutoValidate — silently fire a council-portal lookup for an old
 * appeal row that's missing one BUT has already been confirmed by the
 * customer.
 *
 * Cost-aware: we ONLY auto-fire when `appeal.step === TICKET_CONFIRMED_STEP`.
 * That gate exists because OCR can misread the PCN ref or VRM (blurry
 * photos, handwritten plates) — burning ~$0.30 + ~60s on a guaranteed
 * `not_found` MCP run is wasteful. The pending_review confirm step
 * forces the customer's eyeball on those two fields before we spend.
 *
 * After the user taps "Confirm & validate" in the card, the
 * agreeTicket handler explicitly POSTs to /api/appeals/[id]/lookup.
 * This hook is the BACKSTOP that re-fires for old tickets the user
 * already confirmed but whose lookup never ran (e.g. server crashed
 * mid-job, or the appeal predates validate-first).
 *
 * Fire conditions (all must hold):
 *   - the council is automated (caller passes the resolved flag)
 *   - portalLookup is null OR portalLookup.status === "error"
 *   - no active job already attached to the appeal
 *   - OCR has settled with a councilSlug + pcnRef + VRM
 *   - **appeal.step === TICKET_CONFIRMED_STEP** — user has confirmed
 *   - we haven't already fired for THIS appeal id in this session
 *     (prevents storms when the card re-mounts on tab visibility, etc.)
 *
 * The server route is idempotent on its own end (queued/running guard),
 * but client-side debouncing keeps the network quiet on bouncy mounts.
 */
import { useEffect, useRef } from "react";
import type { AppealRecord } from "@/lib/server/appeals";
import { TICKET_CONFIRMED_STEP } from "@/lib/deriveCardState";
import { getOrCreateSessionId } from "@/lib/client/session";

interface Options {
  appeal: AppealRecord;
  councilAutomated: boolean;
  /** Set when there's already a queued or running pcn_lookup / submit
   *  job tied to this appeal — skips the auto-fire. */
  hasActiveJob: boolean;
  /** Callback the parent uses to refresh the appeal row after the
   *  pending snapshot is stamped (so the card flips to validating). */
  onLookupFired?: () => void;
}

/** In-memory dedup so a card that mounts → unmounts → re-mounts (e.g.
 *  tab visibility toggles, list virtualisation) doesn't fire twice in
 *  the same session. Server-side idempotency is still the source of
 *  truth — this is just bandwidth politeness. */
const FIRED_SESSION = new Set<string>();

export function useAutoValidate({
  appeal,
  councilAutomated,
  hasActiveJob,
  onLookupFired,
}: Options): void {
  // Hold the latest onLookupFired in a ref so a parent that re-renders
  // with a fresh callback doesn't restart the effect.
  const onFiredRef = useRef(onLookupFired);
  useEffect(() => {
    onFiredRef.current = onLookupFired;
  }, [onLookupFired]);

  useEffect(() => {
    if (!councilAutomated) return;
    if (hasActiveJob) return;
    if (FIRED_SESSION.has(appeal.id)) return;

    const portal = appeal.portalLookup;
    const portalUsable = portal && portal.status !== "error";
    if (portalUsable) return;

    const ocrDone = appeal.processing?.ocr?.status === "done";
    if (!ocrDone) return;

    const ticket = appeal.ticket;
    if (!appeal.councilSlug || !ticket?.pcnRef || !ticket?.vehicleReg) return;

    // Cost gate: only auto-validate once the user has CONFIRMED the
    // OCR'd PCN ref + VRM via the pending_review card. Pre-confirm we
    // could be firing on misread data and burning ~$0.30. The confirm
    // step is the dam — don't open it from the hook.
    if (appeal.step !== TICKET_CONFIRMED_STEP) return;

    // Add to FIRED_SESSION synchronously BEFORE kicking off the
    // async fetch so concurrent mounts (React StrictMode dev mode,
    // tab-visibility remount) can't both reach the same `/lookup`
    // POST. The IIFE may unblock it again on a recoverable 403.
    FIRED_SESSION.add(appeal.id);

    // Capture the session id outside the IIFE so a guest viewer's
    // /lookup POST passes canViewAppeal (which matches on the header).
    // Without the header every guest backstop POSTed anonymously and
    // hit a silent 403 — the documented backstop was broken for
    // anyone who hadn't signed in.
    const sessionId = getOrCreateSessionId();

    void (async () => {
      try {
        const res = await fetch(`/api/appeals/${appeal.id}/lookup`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-parkingrabbit-session": sessionId,
          },
        });
        if (!res.ok) {
          // Soft failure — surfaced via the existing
          // council_lookup_failed card kind once the appeal row
          // re-polls. On 403 specifically we clear the dedup so a
          // refreshed session (sign-in, header reissue) can retry;
          // a single 403 used to permanently trap a guest user.
          if (res.status === 403) FIRED_SESSION.delete(appeal.id);
          return;
        }
        onFiredRef.current?.();
      } catch {
        /* swallow — same reasoning as above */
      }
    })();
    // We deliberately key the effect on appeal.id only (not the whole
    // appeal object) so polling re-renders don't re-trigger the gate
    // logic when nothing material has changed. The gate is computed
    // against `appeal` on each run by closure capture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appeal.id, councilAutomated, hasActiveJob]);
}
