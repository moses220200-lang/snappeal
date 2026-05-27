"use client";

/**
 * TicketCard — the single live surface for a PCN in the ParkingRabbit app.
 *
 * Used on both `/app/tickets` (list mode, collapsed by default) and
 * `/app/tickets/[id]` (detail mode, defaultExpanded). The same component
 * powers both — detail mode just opens the body, mounts the letter
 * preview, surfaces the Watch-live disclosure, and renders the back header.
 *
 * Responsibilities:
 *   - Derive card visual state via `deriveCardState()` (single source of truth).
 *   - Subscribe to live job progress via `useAppealLiveState()` while a
 *     pcn_lookup or submit_appeal job is active.
 *   - Poll `/api/appeals/[id]` while drafting (no queue job to subscribe to).
 *   - Render: header + status pill (morphing), meta, live caption, progress
 *     bar, body (when expanded), action buttons.
 *   - Own its handlers: startAppeal (PATCH preferredMethod), openPaymentSheet,
 *     overrideLookup, hide/archive.
 *   - In detail mode, owns the PaymentSheet, the NotificationPermissionSheet,
 *     and the lightbox for warden photos.
 *
 * Replaces: the legacy <ActiveCard>/<ResolvedCard> inline functions in
 * tickets/page.tsx, the bespoke detail-page body in tickets/[id]/page.tsx,
 * <TicketActionPanel>, <PassiveStatusBanner> (inline now), <GeneratingOverlay>
 * (inline now), <VerdictReveal> modal (inline pill morph now), the entire
 * `/app/validating/[jobId]` and `/app/submitting/[id]` routes.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  Images,
  Loader2,
  Pencil,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { LetterActions } from "@/components/LetterActions";
import { MCPLiveStrip } from "@/components/MCPLiveStrip";
import { NotificationPromptGate } from "@/components/NotificationPromptGate";
import { CouncilPickerSheet } from "@/components/CouncilPickerSheet";
import { PaymentSheet } from "@/components/PaymentSheet";
import { ScanningOverlay } from "@/components/ScanningOverlay";
import { TicketCardBody } from "@/components/TicketCardBody";
import { TicketCardHeader } from "@/components/TicketCardHeader";
// Extracted sub-components — `components/ticket/*` modules own one
// thing each, keeping TicketCard.tsx focused on orchestration. See
// each file's top docblock for the boundary contract.
import { StatusPill } from "@/components/ticket/StatusPill";
import { DeleteTicketButton } from "@/components/ticket/DeleteTicketButton";
import { Field } from "@/components/ticket/Field";
import {
  ReadingFailureActions,
  CouncilFailureActions,
  ExtractedStream,
} from "@/components/ticket/FailureActions";
import {
  OutstandingDetail,
  StuckSubmittingNotice,
  isSubmissionStuck,
} from "@/components/ticket/SubmissionStatusBits";
import {
  TicketLifecycleTimeline,
  type LifecycleStep,
  type LifecycleStepStatus,
} from "@/components/TicketLifecycleTimeline";
import { formatGBP, formatShortDate } from "@/lib/format";
import { resolveDisplayTicket, assertAmountConsistency } from "@/lib/ticketDisplay";
import {
  deriveCardState,
  EVIDENCE_DONE_STEP,
  TICKET_CONFIRMED_STEP,
  type CardKind,
  type CardPillTone,
  type CardState,
  type JobKindLive,
  type TimeoutFlags,
} from "@/lib/deriveCardState";
// v0.2.16 — the card mutates the appeal it's MOUNTED with, which is not
//   necessarily the same as the session's current draft pointer. Build a
//   targeted PATCH helper inline rather than use lib/client/draft.ts's
//   patchCurrentAppeal (that one mutates sessionStorage's pointer).
import {
  clearOcrResult,
  getEvidencePhotos,
  getOcrHandoff,
  getOrCreateSessionId,
  getPcnPhoto,
  type OcrHandoff,
} from "@/lib/client/session";
import { useAppealLiveState } from "@/hooks/useAppealLiveState";
import { useAutoValidate } from "@/hooks/useAutoValidate";
// ActivityIndicator + activityKindFor were used here to render an
// absolute "Agent at work" pill in the card's top-right corner. The pill
// collided with the £ amount and duplicated the inline status pill in
// the header, so it's no longer mounted from this card. The component
// itself still ships and is used by the global nav (busy-indicator).
import { getDeadlineProximity } from "@/lib/deriveDeadlineProximity";
import { useFlags } from "@/lib/client/flags";
import type { AppealRecord } from "@/lib/server/appeals";
import type { TicketStatusSnapshot } from "@/lib/server/connectors/types";

interface CouncilOption {
  slug: string;
  name: string;
  /** `automated_beta` / `automated_ga` means we have a real MCP recipe
   *  that can drive the portal. The card uses this to decide whether
   *  the validating gate should fire (automated) or whether to fall
   *  back to OCR + Unverified chip (manual). */
  automationStatus?: "manual" | "automated_beta" | "automated_ga";
  appealPortalUrl?: string | null;
  /** Optional separate Pay-yourself URL — used when a council runs its
   *  appeal portal and payment portal on different hosts (Lambeth). When
   *  present, the Pay tile opens this URL instead of `appealPortalUrl`. */
  paymentPortalUrl?: string | null;
  logoUrl?: string | null;
  logoBg?: string | null;
}

export interface TicketCardProps {
  appeal: AppealRecord;
  /** "list" (collapsed by default, controlled expansion via isExpanded) or
   *  "detail" (always expanded, full body always visible, letter inline). */
  mode?: "list" | "detail";
  /** List mode only — whether this card is the expanded one. */
  isExpanded?: boolean;
  /** List mode only — flip expansion. */
  onToggle?: () => void;
  /** List mode only — archive / hide (local-only for now). */
  onHide?: () => void;
  /** Triggered with a refreshed appeal record from the server. */
  onAppealRefresh?: (next: AppealRecord) => void;
  /** Current time in ms — accepted for parity with the list page's
   *  countdown tick; the card itself doesn't render a countdown. */
  now?: number;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  ready: "Ready",
  submitting: "Submitting",
  submitted: "Submitted",
  under_review: "Under review",
  decision_pending: "Decision pending",
  cancelled: "Cancelled",
  rejected: "Rejected",
};

export function TicketCard({
  appeal: initialAppeal,
  mode = "list",
  isExpanded,
  onToggle,
  onHide,
  onAppealRefresh,
  now: _now,
}: TicketCardProps) {
  void _now;
  // Local mirror of the appeal — refreshed by polling/SSE settle. The
  // parent gets a callback so the list page can update its master state.
  // The prop-sync effect deliberately mirrors prop → state so the parent
  // list can push fresh appeal rows into the card from its reconciliation
  // poll without remounting the card.
  const [appeal, setAppeal] = useState<AppealRecord>(initialAppeal);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAppeal(initialAppeal);
  }, [initialAppeal]);
  const refreshAppeal = (next: AppealRecord) => {
    setAppeal(next);
    onAppealRefresh?.(next);
  };

  const isDetail = mode === "detail";
  // Detail mode always expanded; list mode controlled by parent.
  const expanded = isDetail || !!isExpanded;

  const [statusSnapshot, setStatusSnapshot] = useState<TicketStatusSnapshot | null>(null);
  const [councils, setCouncils] = useState<CouncilOption[] | null>(null);
  const [paySheetOpen, setPaySheetOpen] = useState(false);
  const [councilPickerOpen, setCouncilPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [overriding, setOverriding] = useState(false);
  // Admin-controlled flag — gates the entire MCP live view. Default OFF:
  //   customers stay on a calm destination (status pill + push notif),
  //   the disclosure isn't rendered, and the SSE skips screenshot
  //   frames entirely.
  //   ON: disclosure renders and auto-expands on every new job.
  const { showMcpLiveView } = useFlags();
  // Two trigger counters — one per moment we may prompt. The Gate
  // wrapper handles the skip-once logic so we don't have to.
  const [notifPromptTriggerAppealTap, setNotifPromptTriggerAppealTap] = useState(0);
  const [notifPromptTriggerSubmitDone, setNotifPromptTriggerSubmitDone] = useState(0);
  // Latch so we only fire the submitDone prompt once per local
  // submission lifecycle (not on every poll showing status=submitted).
  const submitPromptFiredRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  // v0.2.14 — pending-review handoff from /app/capture: the OCR result is
  // already on the appeal row, but the PCN image data URL + confidence
  // pills + photo-coach hint come through sessionStorage so the card can
  // render the review surface without re-OCRing.
  const [pcnImage, setPcnImage] = useState<string | null>(null);
  const [ocrHandoff, setOcrHandoff] = useState<OcrHandoff | null>(null);
  useEffect(() => {
    // One-shot handoff read from sessionStorage on mount — no render cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPcnImage(getPcnPhoto());
    setOcrHandoff(getOcrHandoff(initialAppeal.id));
  }, [initialAppeal.id]);

  const rootRef = useRef<HTMLDivElement | null>(null);

  // ─── derive active job id + kind from the appeal record ───
  const activeJobId = useMemo<string | null>(() => {
    const portal = appeal.portalLookup;
    if (portal?.status === "pending" && portal.jobId) return portal.jobId;
    // Submission job id surfaced on AppealRecord by the API extension
    // (task #2). Fall back to null if not present (pre-extension).
    const submitJobId = (appeal as unknown as { activeJobId?: string | null }).activeJobId ?? null;
    return submitJobId ?? null;
  }, [appeal]);

  const activeJobKind = useMemo<JobKindLive | null>(() => {
    const portal = appeal.portalLookup;
    if (portal?.status === "pending" && portal.jobId) return "pcn_lookup";
    const kind = (appeal as unknown as { activeJobKind?: JobKindLive | null }).activeJobKind ?? null;
    return kind ?? null;
  }, [appeal]);

// ─── council lookup (one-shot, cached at module level via fetch cache) ───
  useEffect(() => {
    if (councils !== null) return;
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/councils", { cache: "no-store" });
        if (!res.ok || !alive) return;
        const json = (await res.json()) as { councils: CouncilOption[] };
        if (alive) setCouncils(json.councils);
      } catch {
        /* swallow */
      }
    })();
    return () => {
      alive = false;
    };
  }, [councils]);

  // ─── status snapshot fetch — async, fire-and-forget ───
  //
  // v0.3.10 — added `appeal.portalLookup?.status` to the dep array. Without
  // it, the very-first fetch (when portal_lookup is null) cached the
  // validating-stub snapshot `{stage: "status_check_pending"}`. When the
  // worker later flipped portal_lookup.status to "verified" the per-card
  // appeal poll picked that up, but statusSnapshot stayed stale —
  // deriveCardState's `portalRunning` check was still true because of
  // `statusSnapshot?.stage === "status_check_pending"`, and the card was
  // stuck on "Validating" until a full page refresh remounted the card
  // and rebuilt the snapshot from the now-verified portal_lookup. The
  // updatedAt dep is a belt-and-braces signal so any other portal_lookup
  // shape change (verdict text, photo url additions) also refreshes the
  // derived snapshot.
  useEffect(() => {
    if (!appeal.ticket?.pcnRef || !appeal.ticket.vehicleReg) return;
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(`/api/appeals/${encodeURIComponent(appeal.id)}/status`, {
          cache: "no-store",
          headers: { "x-parkingrabbit-session": getOrCreateSessionId() },
        });
        if (!res.ok || !alive) return;
        const json = (await res.json()) as { snapshot?: TicketStatusSnapshot };
        if (json.snapshot && alive) setStatusSnapshot(json.snapshot);
      } catch {
        /* non-fatal */
      }
    })();
    return () => {
      alive = false;
    };
  }, [
    appeal.id,
    appeal.ticket?.pcnRef,
    appeal.ticket?.vehicleReg,
    appeal.portalLookup?.status,
    appeal.portalLookup?.fetchedAt,
  ]);

  // ─── live SSE subscription ───
  const fetchAppealRow = async (): Promise<AppealRecord | null> => {
    try {
      const res = await fetch(`/api/appeals/${encodeURIComponent(appeal.id)}`, {
        cache: "no-store",
        headers: { "x-parkingrabbit-session": getOrCreateSessionId() },
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { appeal: AppealRecord };
      return json.appeal;
    } catch {
      return null;
    }
  };

  // Persisted submit_appeal events — fetched from the new
  // /api/appeals/[id]/submit-progress endpoint so the inline gallery
  // survives page refreshes. Populated only when the card lands in
  // `submitted`/`terminal` state and there are no live events flowing.
  const [pastSubmitEvents, setPastSubmitEvents] = useState<
    import("@/hooks/useAppealLiveState").ProgressEvent[]
  >([]);

  const { live, events, extracted } = useAppealLiveState({
    activeJobId,
    activeJobKind,
    rootRef: isDetail ? undefined : rootRef,
    // Subscription gating depends ONLY on the admin flag, not on the
    // user's Hide/Show tap. Earlier we tied `subscribeScreenshots` and
    // `keepEvents` to `watchLiveOpen` — but those are useEffect deps
    // for the SSE hook, so toggling the disclosure closed and reopened
    // the EventSource. That looked like the agent "rebooting" because
    // the buffered events array reset and screenshots restarted. Now
    // the SSE stays open continuously while the flag is ON; the
    // disclosure is a pure visual collapse with no transport churn.
    // The bandwidth saving from disabling screenshots-while-collapsed
    // wasn't worth the perceived reboot.
    subscribeScreenshots: showMcpLiveView,
    keepEvents: showMcpLiveView,
    onSettled: async () => {
      const next = await fetchAppealRow();
      if (next) refreshAppeal(next);
    },
  });

  // Fetch the persisted submit-appeal events when the card is in a
  // post-submit state and the live event buffer is empty (typical on a
  // fresh page mount). Skipped while live events are streaming — those
  // are authoritative.
  const isPostSubmit =
    appeal.status === "submitted" ||
    appeal.status === "under_review" ||
    appeal.status === "decision_pending" ||
    appeal.status === "cancelled" ||
    appeal.status === "rejected";
  useEffect(() => {
    if (!isPostSubmit) return;
    if (events.length > 0) return;
    if (pastSubmitEvents.length > 0) return;
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(
          `/api/appeals/${encodeURIComponent(appeal.id)}/submit-progress`,
          {
            cache: "no-store",
            headers: { "x-parkingrabbit-session": getOrCreateSessionId() },
          },
        );
        if (!res.ok || !alive) return;
        const json = (await res.json()) as {
          events?: import("@/hooks/useAppealLiveState").ProgressEvent[];
        };
        if (alive && Array.isArray(json.events)) {
          setPastSubmitEvents(json.events);
        }
      } catch {
        /* non-fatal — the disclosure simply stays empty */
      }
    })();
    return () => {
      alive = false;
    };
  }, [appeal.id, isPostSubmit, events.length, pastSubmitEvents.length]);

  // ─── progressive poll for background work without a job queue ───
  //
  // Two states need this:
  //   - `processing` — OCR is running on the server (fire-and-forget HTTP
  //     POST from /app/capture). Polls until ticket.pcnRef arrives OR
  //     processing.ocr.status flips to "failed". 2s tick — short enough
  //     to feel snappy on the typical ~6s Claude vision pass.
  //   - `drafting` — letter generation is streaming. Polls until
  //     appeal.letterBody lands OR appeal.step === "generation_failed".
  //     3s tick.
  //
  // ─── timeout watchdog ───
  //
  // The OCR / portal-lookup steps occasionally hang silently — server
  // crash mid-job, transient network issue, CLI timeout overshoot — and
  // the customer is left staring at a "Reading PCN…" loader that never
  // resolves. The watchdog flips a flag after a generous grace window
  // (45 s for OCR, 90 s for portal lookup) so `deriveCardState` can
  // route the card into a clear actionable failure kind instead of
  // staying stuck in flight.
  //
  // The timers are scoped to the *step that's currently in flight*: as
  // soon as the persisted status flips out of pending/running, the
  // effect clears and the flag resets, so a slow-but-successful run
  // never gets mislabelled as a timeout.
  const [ocrTimedOut, setOcrTimedOut] = useState(false);
  const [portalTimedOut, setPortalTimedOut] = useState(false);
  useEffect(() => {
    const ocrStatus = appeal.processing?.ocr?.status;
    const inflight =
      ocrStatus === "running" ||
      ocrStatus === "pending" ||
      (appeal.status === "draft" &&
        !appeal.portalLookup &&
        !appeal.preferredMethod &&
        !appeal.letterBody &&
        !appeal.ticket?.pcnRef);
    if (!inflight) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOcrTimedOut(false);
      return;
    }
    const id = setTimeout(() => setOcrTimedOut(true), 45_000);
    return () => clearTimeout(id);
  }, [
    appeal.processing?.ocr?.status,
    appeal.status,
    appeal.portalLookup,
    appeal.preferredMethod,
    appeal.letterBody,
    appeal.ticket?.pcnRef,
  ]);
  useEffect(() => {
    const portalStatus = appeal.portalLookup?.status;
    if (portalStatus !== "pending") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPortalTimedOut(false);
      return;
    }
    const id = setTimeout(() => setPortalTimedOut(true), 90_000);
    return () => clearTimeout(id);
  }, [appeal.portalLookup?.status]);
  const timeouts: TimeoutFlags = useMemo(
    () => ({ ocr: ocrTimedOut, portal: portalTimedOut }),
    [ocrTimedOut, portalTimedOut],
  );

  // Lookup / submission states subscribe to job SSE instead — see
  // useAppealLiveState above.
  const cardState = deriveCardState(appeal, statusSnapshot, live, timeouts);
  useEffect(() => {
    // v0.3.5 — gathering_evidence is polled while the lazy lookup is
    // in flight, so the CouncilCheckChip at the top of the Build-appeal
    // surface transitions pending → verified live without requiring a
    // user gesture or page refresh. Without this poll, the chip would
    // freeze at whatever portalLookup.status was when the user landed
    // in gathering_evidence (typically "pending") and only update when
    // the user finally tapped "Start drafting".
    const gatheringWithPendingLookup =
      cardState.kind === "gathering_evidence" &&
      appeal.portalLookup?.status === "pending";
    if (
      cardState.kind !== "processing" &&
      cardState.kind !== "drafting" &&
      cardState.kind !== "validating" &&
      !gatheringWithPendingLookup
    ) {
      return;
    }
    // `validating` is polled too so the card can advance to Pay/appeal the
    // INSTANT the council confirms the verdict — the lookup worker persists
    // the verified snapshot mid-job (while it keeps capturing warden photos
    // in the background), and this poll picks up `portalLookup.status`
    // flipping out of "pending" without waiting for the whole job to settle.
    //
    // v0.3.5 — in `drafting`, the poll also covers the lazy-lookup window:
    // while step === EVIDENCE_DONE_STEP and portalLookup is still pending,
    // we tick at the same cadence as `validating` so the draft-kickoff
    // useEffect re-fires the moment the verdict lands. Longer cap too,
    // since the user can sit in this state through both the lookup AND
    // the actual AI draft.
    const draftingWaitingOnLookup =
      cardState.kind === "drafting" &&
      appeal.step === EVIDENCE_DONE_STEP &&
      appeal.portalLookup?.status === "pending";
    const interval =
      cardState.kind === "processing"
        ? 2000
        : cardState.kind === "validating" ||
            draftingWaitingOnLookup ||
            gatheringWithPendingLookup
          ? 2500
          : 3000;
    const maxPolls =
      cardState.kind === "validating" ||
      draftingWaitingOnLookup ||
      gatheringWithPendingLookup
        ? 120
        : 60;
    let alive = true;
    let polls = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      polls += 1;
      const next = await fetchAppealRow();
      if (!alive) return;
      if (next) refreshAppeal(next);
      // Stop once the step we were watching settles.
      if (cardState.kind === "drafting") {
        if (next?.letterBody || next?.step === "generation_failed") return;
      } else if (cardState.kind === "processing") {
        const ocr = next?.processing?.ocr?.status;
        if (next?.ticket?.pcnRef && next?.ticket?.vehicleReg) return;
        if (ocr === "failed") return;
      } else if (cardState.kind === "validating") {
        // The council has confirmed (or rejected) — advance immediately.
        const portal = next?.portalLookup;
        if (portal && portal.status !== "pending") return;
      } else if (cardState.kind === "gathering_evidence") {
        // v0.3.5 — lookup verdict has landed (or errored). The chip
        // transitions to "verified" / amber via the refreshAppeal
        // above; we can stop polling now. If the user hasn't tapped
        // Start drafting yet, no further server-side state will
        // change until they do.
        const portal = next?.portalLookup;
        if (portal && portal.status !== "pending") return;
      }
      if (polls < maxPolls) timer = setTimeout(tick, interval);
    };
    timer = setTimeout(tick, interval);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
    // Intentionally only on state.kind transitions.
    // v0.3.7 — also re-mount when step or letterBody changes. Without
    // appeal.step the Retry flow stalls: after a generation_failed →
    // retryDraft() PATCH, cardState.kind stays "drafting" (the v0.3.6
    // widened branch keeps the kind stable across the failure→retry
    // cycle), so the previous tick chain dies on the
    // step==="generation_failed" stop condition and never restarts.
    // Including step here re-mounts the effect when the retry stamps
    // EVIDENCE_DONE_STEP, kicking off a fresh poll chain that catches
    // the new letterBody. appeal.letterBody is included as a belt-and-
    // -braces signal so the poll also terminates cleanly when the
    // letter lands in any code path that doesn't go via step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardState.kind, appeal.step, appeal.letterBody]);

  // ─── auto-scroll on lifecycle transitions ───
  //
  // Every transition through the card's state machine (Confirm details,
  // Start drafting, Submit for £2.99, Use override, etc.) re-renders
  // the body with new content. Without a scroll, the user is left
  // wherever the button-they-just-tapped used to live — often mid-card
  // or near the bottom — and has to scroll back up to see the new
  // headline. Snapping the card top into view on every kind change
  // keeps the lifecycle reading like a single forward-moving flow.
  //
  // Also fires for SSE-driven transitions (drafting → letter_ready when
  // the AI finishes, submitting → submitted when the agent files) —
  // those are the moments the customer most wants to see right away.
  //
  // Gates:
  //   - First render: skip (no prior state to transition from).
  //   - Same kind: skip (re-render not a transition).
  //   - Not expanded: skip (don't yank focus to a background card).
  //
  // `block: "start"` lands the card top at scroll-padding-top, which
  // globals.css sets to the AppHeader height + safe-area inset — so
  // the card never lands behind the sticky header.
  const previousKindRef = useRef<CardState["kind"] | null>(null);
  useEffect(() => {
    const prev = previousKindRef.current;
    previousKindRef.current = cardState.kind;
    if (prev === null) return;
    if (prev === cardState.kind) return;
    if (!expanded) return;
    // Defer one frame so the new body content has committed to the DOM
    // before we ask the browser to scroll to its bounding box.
    const raf = requestAnimationFrame(() => {
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(raf);
  }, [cardState.kind, expanded]);

  // Footer "View details" toggle — fire the parent's onToggle then,
  // after the body has expanded/collapsed in the DOM, smooth-scroll
  // the card root into view. Stops the user being stranded at the
  // bottom of the page looking at empty space after a collapse.
  const handleToggleWithScroll = () => {
    if (!onToggle) return;
    onToggle();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  };

  // ─── derived display info ───
  const ticket = appeal.ticket;
  // Single source of truth for every displayed field. Trust rule: before
  // the council has VERIFIED the PCN, all values (incl. the £ amount) come
  // ONLY from the OCR-extracted ticket — never the eagerly-fetched
  // status-checker balance or an inferred/discounted figure. This keeps
  // the header amount identical to the confirm-form amount until the
  // council confirms otherwise. See lib/ticketDisplay.ts.
  const display = useMemo(
    () => resolveDisplayTicket(appeal, statusSnapshot),
    [appeal, statusSnapshot],
  );
  // Dev-only guardrail: scream if a pre-verification mismatch ever returns.
  useEffect(() => {
    assertAmountConsistency(display);
  }, [display]);
  const displayPcnRef = display.pcnRef;
  const displayVehicleReg = display.vehicleReg;
  const displayLocation = display.location;
  const displayIssuedAt = display.issuedAt;
  const displayAmountPence = display.amountPence;
  // When the council's verified amount differs from what was scanned,
  // explain it rather than swapping the number silently.
  const amountNote =
    display.amountChangedByCouncil && display.verifiedAmountPence != null
      ? `Council records show ${formatGBP(display.verifiedAmountPence)}${
          display.ocrAmountPence != null
            ? ` — you scanned ${formatGBP(display.ocrAmountPence)}`
            : ""
        }`
      : null;

  const council = useMemo(() => {
    if (!appeal.councilSlug || !councils) return null;
    return councils.find((c) => c.slug === appeal.councilSlug) ?? null;
  }, [appeal.councilSlug, councils]);

  // `councilAutomated` drives the validate-first gate. We treat the
  // automation flag as authoritative only once the councils list has
  // loaded (avoids a one-frame mis-classification while the fetch is
  // in-flight). For old tickets where the slug doesn't match any
  // current council row (legacy data) we default to false — safer to
  // show the OCR fallback than to lock the user into a never-arriving
  // validating gate.
  const councilAutomated = useMemo(() => {
    if (!council) return false;
    return (
      council.automationStatus === "automated_beta" ||
      council.automationStatus === "automated_ga"
    );
  }, [council]);

  // Auto-validate old tickets the moment the user opens them. Old =
  // automated council, no usable portal_lookup, no active job. The hook
  // dedups per appeal id so a re-mount doesn't double-fire; the server
  // route is idempotent regardless.
  useAutoValidate({
    appeal,
    councilAutomated,
    hasActiveJob: activeJobId !== null,
  });

  // Moment B — submission-done. Fire the NotificationPromptGate the
  // FIRST time we observe a successful submission on this card. The
  // ref latch prevents re-firing on every subsequent poll that still
  // sees status=submitted. The Gate handles the skip-once persistence
  // server-side so a user who already saw this prompt at submitDone
  // won't see it again on a future ticket.
  useEffect(() => {
    if (submitPromptFiredRef.current) return;
    const submitted =
      appeal.status === "submitted" ||
      appeal.status === "under_review" ||
      appeal.status === "decision_pending";
    if (submitted) {
      submitPromptFiredRef.current = true;
      setNotifPromptTriggerSubmitDone((n) => n + 1);
    }
  }, [appeal.status]);

  const councilName = council?.name ?? ticket?.issuer ?? null;

  // Deadline proximity for the card header pill (≤7 days = ribbon).
  // Computed inline because it's a pure function of fields already on
  // the appeal — no extra fetches, recomputed each render. Cheap.
  const deadlineProximity = useMemo(
    () => getDeadlineProximity(appeal),
    [appeal],
  );
  // Pay-tile URL fall-through (Lambeth uses a distinct payment host):
  //   1) per-appeal `statusSnapshot.paymentUrl` (connector-derived deep link)
  //   2) council `paymentPortalUrl` (e.g. lambethparking.paypcn.com)
  //   3) council `appealPortalUrl` (legacy single-URL behaviour)
  const payUrl =
    statusSnapshot?.paymentUrl ??
    council?.paymentPortalUrl ??
    council?.appealPortalUrl ??
    null;

  // ─── handlers ───
  // v0.2.16 — Appeal tap NO LONGER triggers drafting directly. Two-phase:
  //   1) startAppeal: stamps preferredMethod=portal so the card flips
  //      into `gathering_evidence`. The body shows the inline grounds
  //      quiz + evidence carousel.
  //   2) confirmEvidenceAndDraft: PATCH grounds + step=EVIDENCE_DONE_STEP,
  //      kick off /api/generate-stream, card flips to `drafting`.
  //
  // Both PATCHes target THIS appeal's id (not the session's current-draft
  // pointer) so the card mutates the row it's mounted with — important
  // when the user opens an old ticket from the list.
  const patchThisAppeal = async (
    body: Record<string, unknown>,
  ): Promise<AppealRecord> => {
    const res = await fetch(`/api/appeals/${encodeURIComponent(appeal.id)}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-parkingrabbit-session": getOrCreateSessionId(),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      throw new Error(j?.error?.message ?? `PATCH failed (${res.status})`);
    }
    const json = (await res.json()) as { appeal: AppealRecord };
    return json.appeal;
  };

  // v0.2.17 — edits to ticket fields on the pending-review surface.
  //   PCN ref + vehicle reg debounce for 500 ms (typing); council select
  //   fires immediately (one-shot select gesture). Optimistic local
  //   update via refreshAppeal keeps the inputs snappy and the
  //   confidence pills accurate.
  const editFieldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editTicketField = (
    field:
      | "pcnRef"
      | "vehicleReg"
      | "councilSlug"
      | "amountPence"
      | "issuedAt"
      | "location",
    value: string,
  ) => {
    // Coerce the value into whatever shape the ticket field needs.
    // amountPence ships as an integer (pence) on the JSON; issuedAt
    // is an ISO timestamp; everything else stays as a string.
    let typedValue: string | number = value;
    if (field === "amountPence") {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0) return;
      typedValue = Math.round(n);
    }
    const nextTicket = {
      ...(appeal.ticket ?? {}),
      [field]: typedValue,
    };
    refreshAppeal({
      ...appeal,
      ticket: nextTicket as AppealRecord["ticket"],
      // For councilSlug, also reflect on the top-level field so the
      // server-hoisted FK column stays in sync optimistically.
      councilSlug:
        field === "councilSlug" ? value : appeal.councilSlug,
    });
    const fire = () => {
      void patchThisAppeal({ ticket: nextTicket }).catch(() => {
        /* Soft failure — the user will see the input still reflects
         *  their typed value; the next manual save (Submit) will retry. */
      });
    };
    if (editFieldTimerRef.current) clearTimeout(editFieldTimerRef.current);
    if (field === "councilSlug" || field === "issuedAt") {
      // Atomic / picker-driven fields — write immediately.
      fire();
    } else {
      editFieldTimerRef.current = setTimeout(fire, 500);
    }
  };

  const startAppeal = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // v0.3.9 — the council-portal lookup was moved EARLIER in the
      // flow: it fires from `agreeTicket` when the customer taps
      // "Confirm & validate with council" on pending_review. By the
      // time we reach `startAppeal` (the Appeal £2.99 tile tap on
      // needs_decision) the lookup is already in flight or settled.
      // The previous v0.3.5 design POSTed a fresh `/lookup` here too;
      // that double-enqueued the job once the first lookup had
      // completed (server idempotency only catches queued/running
      // siblings). We just PATCH preferredMethod now and re-derive —
      // `useAutoValidate` is the backstop for the legacy case where
      // a confirmed appeal somehow ended up without a lookup.
      //
      // The Pay tile is an external deep-link out — it never hits
      // this handler and never enqueues a lookup. That's the cost-
      // saving unit: customers who pay burn zero AI tokens.
      await patchThisAppeal({ preferredMethod: "portal" });
      const next = await fetchAppealRow();
      if (next) refreshAppeal(next);
      // OCR handoff cleanup — previously lived in confirmTicket(), which
      // is gone in v0.3.5. Without this the review pills can flash back
      // on a refresh after Appeal is tapped.
      clearOcrResult();
      setOcrHandoff(null);
      // Moment A — Appeal-tap. The Gate consults
      // /api/users/me/notification-prefs to skip if we already asked
      // at this moment OR if native permission isn't 'default'.
      setNotifPromptTriggerAppealTap((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start appeal");
    } finally {
      setBusy(false);
    }
  };

  const confirmEvidenceAndDraft = async (input: {
    grounds: string[];
    notes: string;
  }) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // v0.2.18 — drafting requires a signed-in user. The AI-drafted
      // appeal letter is a customer record they may need to retrieve
      // later (council reply, escalation, evidence pack), so we don't
      // generate it for a guest. If the viewer isn't signed in, save
      // the grounds + notes + intent so they survive the sign-up
      // round-trip and re-mount with both pre-populated.
      const meRes = await fetch("/api/auth/me", { cache: "no-store" });
      const me = meRes.ok
        ? ((await meRes.json()) as { user: { id?: string } | null })
        : { user: null };
      if (!me.user) {
        try {
          await patchThisAppeal({
            grounds: input.grounds,
            notes: input.notes,
          });
        } catch {
          /* non-fatal — the user can re-enter after sign-up */
        }
        const next = encodeURIComponent(
          `/app/tickets/${appeal.id}?resumeDraft=1`,
        );
        if (typeof window !== "undefined") {
          window.location.href = `/sign-up?next=${next}`;
        }
        return;
      }

      // Stamp grounds + notes + the EVIDENCE_DONE_STEP sentinel in ONE
      // PATCH so deriveCardState routes the card to `drafting` next
      // render and the drafter reads the latest notes on first call.
      const updated = await patchThisAppeal({
        grounds: input.grounds,
        notes: input.notes,
        step: EVIDENCE_DONE_STEP,
      });
      refreshAppeal(updated);
      // v0.3.5 — /api/generate-stream is NOT fired here any more.
      // The draft-kickoff useEffect below watches for (step ===
      // EVIDENCE_DONE_STEP && lookup-settled && verdict-not-bad) and
      // fires generate-stream then. This is the parallelism gate the
      // user asked for: drafting waits for the lookup verdict so the
      // letter sees authoritative council metadata, AND we never burn
      // AI tokens drafting a letter we can't file (paid/closed/
      // not_found verdicts route to the appeal_not_possible card
      // upstream of the kickoff).
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start drafting");
    } finally {
      setBusy(false);
    }
  };

  // v0.3.5 — draft kickoff watcher. Fires /api/generate-stream exactly
  // once per appeal, the moment BOTH conditions are met:
  //
  //   1. The user has finished Build-appeal (step === EVIDENCE_DONE_STEP).
  //   2. The lazy council lookup has either settled (verdict in) or
  //      explicitly failed (status === "error", or status missing
  //      because the POST never landed). Bad verdicts (paid / closed /
  //      not_found) abort — the appeal_not_possible state takes over
  //      and we burn no AI tokens drafting a letter we can't file.
  //
  // Whichever finishes second wins the race — a slow user / fast lookup
  // OR a fast user / slow lookup both end up here and the letter
  // streams in. The poll loop above keeps the appeal row fresh while
  // step === EVIDENCE_DONE_STEP && portalLookup is pending, so this
  // effect re-evaluates as soon as the verdict lands.
  //
  // Ref-guarded so React strict-mode double-fire (or a rapid prop
  // refresh) can't enqueue two generate-stream jobs for the same row.
  const draftKickedOffRef = useRef<string | null>(null);
  useEffect(() => {
    if (appeal.step !== EVIDENCE_DONE_STEP) return;
    if (appeal.letterBody) return;
    const portal = appeal.portalLookup;
    if (portal?.status === "pending") return; // still checking council
    const verdict = portal?.verdict;
    if (
      portal?.status !== "overridden" &&
      (verdict === "paid" || verdict === "closed" || verdict === "not_found")
    ) {
      // appeal_not_possible card takes over — don't burn tokens.
      return;
    }
    if (draftKickedOffRef.current === appeal.id) return;
    draftKickedOffRef.current = appeal.id;
    const pcnPhoto = getPcnPhoto();
    const evidencePhotos = getEvidencePhotos();
    void fetch("/api/generate-stream", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-parkingrabbit-session": getOrCreateSessionId(),
      },
      body: JSON.stringify({
        sessionId: getOrCreateSessionId(),
        appealId: appeal.id,
        pcnPhoto: pcnPhoto ?? undefined,
        evidencePhotos,
        confirmedTicket: appeal.ticket ?? undefined,
      }),
    })
      .catch(() => {
        // Soft failure — the drafting-state poll will surface
        // step === "generation_failed" if the server side errors. We let
        // the user retry there rather than ringing alarms inline.
        draftKickedOffRef.current = null;
      })
      .finally(() => {
        // v0.3.11 — backstop refetch.
        //
        // The fetch promise settles when the server closes the SSE
        // stream — which is AFTER `attachDraftToAppeal` has already
        // persisted `letterBody`. The 3 s poll loop above usually
        // catches that on its next tick, but a handful of legit paths
        // can terminate the poll early:
        //   - cardState.kind transitions out of "drafting" because of
        //     a concurrent state change.
        //   - fetchAppealRow returned 404 (e.g. mergeDuplicateDraftIfAny
        //     folded this row into an older one).
        //   - the poll already hit its 180 s cap.
        // In every one of those cases the letter IS in the DB; the UI
        // just doesn't know yet. A one-shot refetch here guarantees
        // the card flips to letter_ready as soon as the SSE response
        // closes, even when the cosmetic 80-char chunk loop on the
        // server died with "Controller is already closed".
        void (async () => {
          try {
            const fresh = await fetchAppealRow();
            if (fresh) refreshAppeal(fresh);
          } catch {
            /* poll loop will retry the next tick */
          }
        })();
      });
  }, [
    appeal.id,
    appeal.step,
    appeal.letterBody,
    appeal.portalLookup,
    appeal.ticket,
  ]);

  // Re-score the EXISTING appeal with the latest evidence photos — the
  // letter is NOT rewritten. The /rescore endpoint re-evaluates strength
  // only; we refresh the appeal so the weak-appeal warning updates in
  // place (and clears once the score crosses 50). Returns when done so
  // the caller can drop its "re-scoring…" spinner.
  const rescoreWithEvidence = async (photos: string[]): Promise<void> => {
    try {
      const res = await fetch(
        `/api/appeals/${encodeURIComponent(appeal.id)}/rescore`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-parkingrabbit-session": getOrCreateSessionId(),
          },
          body: JSON.stringify({
            sessionId: getOrCreateSessionId(),
            evidencePhotos: photos,
          }),
        },
      );
      if (!res.ok) return;
      const json = (await res.json()) as { appeal?: AppealRecord };
      if (json.appeal) refreshAppeal(json.appeal);
    } catch {
      /* non-fatal — the score simply stays as it was */
    }
  };

  // v0.3.9 — "Confirm & validate with council". The customer's
  // explicit confirmation that the OCR'd PCN ref + VRM look right.
  // ONLY now do we burn MCP tokens by firing the lookup.
  //
  // Sequence:
  //   1. PATCH step → TICKET_CONFIRMED_STEP (cheap; locks in the
  //      ticket fields so the user can't keep editing while the
  //      lookup runs).
  //   2. POST /api/appeals/[id]/lookup — kicks the pcn_lookup job
  //      against the council portal IF the council is automated.
  //      For non-automated councils the route writes a "skipped"
  //      snapshot and the card flips straight to needs_decision
  //      with the OCR fallback.
  //   3. Card refresh — deriveCardState now sees portal_lookup
  //      pending → flips into the validating gate (with the live
  //      MCP screenshot strip + agent thought bubble).
  //
  // Cost economics: if OCR misreads pcnRef/VRM, the user catches it
  // here before we spend ~$0.30 on a guaranteed-not-found MCP run.
  const agreeTicket = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await patchThisAppeal({ step: TICKET_CONFIRMED_STEP });
      refreshAppeal(updated);
      // Fire the council-portal lookup. Best-effort: if the POST
      // fails (council not automated, missing data, network blip)
      // the card stays in needs_decision and the user can still
      // pay/appeal via the OCR fallback. The route is idempotent;
      // a retry from useAutoValidate later is safe.
      try {
        await fetch(`/api/appeals/${appeal.id}/lookup`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            // Required for guest viewers — viewer.ts:canViewAppeal
            // rejects with 403 otherwise. Was the silent failure
            // path before v0.3.10 that kept guests stuck on
            // pending_review with no lookup ever firing.
            "x-parkingrabbit-session": getOrCreateSessionId(),
          },
        });
      } catch {
        /* swallow — useAutoValidate hook will retry on next mount */
      }
      // The pending_review OCR handoff is no longer relevant once the
      // user has confirmed — clear it so a refresh doesn't bring the
      // confidence pills back.
      clearOcrResult();
      setOcrHandoff(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't confirm details");
    } finally {
      setBusy(false);
    }
  };

  // v0.3.6 — "Edit details" inside the needs_decision surface. PATCHes
  // step BACK to the default so the card returns to pending_review with
  // the editable fields surfaced. The user can fix typos and tap Agree
  // again.
  const editTicket = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await patchThisAppeal({ step: "photos" });
      refreshAppeal(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reopen edit");
    } finally {
      setBusy(false);
    }
  };

  // v0.3.6 — retry drafting after a generation_failed. PATCHes step
  // back to EVIDENCE_DONE_STEP and clears the draft-kickoff ref so the
  // useEffect that fires /api/generate-stream re-runs. Also clears the
  // processing.draft.error so the failure row dismisses immediately on
  // the next poll tick.
  const retryDraft = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await patchThisAppeal({
        step: EVIDENCE_DONE_STEP,
        processing: {
          ...(appeal.processing ?? {}),
          draft: { status: "pending" },
        },
      });
      refreshAppeal(updated);
      draftKickedOffRef.current = null;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't retry");
    } finally {
      setBusy(false);
    }
  };

  // v0.3.5 — the old `confirmTicket()` handler (the "I agree to T&Cs"
  // path that POSTed /api/appeals/[id]/lookup) is gone. Pay/Appeal
  // tiles now render on the pending_review surface itself, and the
  // lookup is enqueued lazily inside `startAppeal()` above — only when
  // the user actually picks the Appeal path, so customers who pay
  // don't trigger the expensive Playwright MCP + Claude vision run.

  const overrideLookup = async () => {
    if (overriding) return;
    setOverriding(true);
    try {
      const res = await fetch(
        `/api/appeals/${encodeURIComponent(appeal.id)}/lookup/override`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-parkingrabbit-session": getOrCreateSessionId(),
          },
        },
      );
      if (!res.ok) throw new Error(`Override failed (${res.status})`);
      const json = (await res.json()) as { appeal: AppealRecord };
      refreshAppeal(json.appeal);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Override failed");
    } finally {
      setOverriding(false);
    }
  };

  const handlePaid = async (paymentIntentId: string) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-parkingrabbit-session": getOrCreateSessionId(),
        },
        body: JSON.stringify({
          sessionId: getOrCreateSessionId(),
          appealId: appeal.id,
          paymentIntentId,
        }),
      });
      const body = (await res.json()) as {
        submissionId?: string;
        error?: { message?: string };
      };
      if (!res.ok) {
        throw new Error(body?.error?.message ?? `Submission failed (${res.status})`);
      }
      // Refresh the appeal so the card flips into "submitting".
      const next = await fetchAppealRow();
      if (next) refreshAppeal(next);
      setPaySheetOpen(false);
      // The submission live view is now inline — no router.push to
      // /app/submitting/<id>. The user stays on the card and watches the
      // status pill morph through the SSE subscription.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
      setPaySheetOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  // ─── MCP live agent panel — full-width, mounted inside a timeline
  //     step instead of as a separate supplementary card. Pre-built here
  //     so buildLifecycleSteps stays a pure function over plain values. ───
  //
  // The read-only council LOOKUP no longer pushes a screenshot slideshow
  // on the customer: there's no reason to watch the agent grab page +
  // warden screenshots. During the lookup they see a calm "Checking
  // council" status + the confirmed-data stream, and advance to
  // Pay/appeal the moment the verdict lands (the agent keeps capturing in
  // the background). The live agent view is reserved for the actual
  // submission (submit_appeal), where watching the filing is meaningful.
  const mcpPanel: React.ReactNode | null = (() => {
    if (activeJobKind !== "submit_appeal") return null;
    const galleryEvents = events.length > 0 ? events : pastSubmitEvents;
    const isLive = cardState.inFlight && activeJobKind === "submit_appeal";
    const hasGallery = galleryEvents.length > 0;
    if (!showMcpLiveView) return null;
    if (!isLive && !hasGallery) return null;
    return (
      <MCPLiveStrip
        council={
          council
            ? {
                name: council.name,
                logoUrl: council.logoUrl ?? null,
                logoBg: council.logoBg ?? null,
              }
            : null
        }
        latestScreenshotUrl={live?.latestScreenshotUrl ?? null}
        latestCaption={live?.latestStep ?? null}
        latestThought={live?.latestThought ?? null}
        events={galleryEvents}
        status={isLive ? live?.status ?? "queued" : "done"}
      />
    );
  })();

  // ─── unified lifecycle steps ───
  // Pure function of the precomputed state + handlers. Replaces the
  // legacy 3-step TicketJourney + the ProcessingCard step rows + the
  // bottom-of-card "Progress" Timeline panel — every milestone lives
  // in one ordered list now.
  //
  // The React Compiler's react-hooks/refs lint rule flags the call
  // below because one of the handlers we forward — editTicketField —
  // closes over a useRef (a debounce timer). The ref is only ever
  // read/written from event handlers, never during render, so the
  // disable is intentional.
  // eslint-disable-next-line react-hooks/refs
  // v0.3.6 — live MCP agent thought during the council lookup. Fed
  // into the CouncilCheckChip inside the gathering_evidence body so
  // the chip narrates the agent's progress ("Filling in PCN ref",
  // "Navigating to ticket details") rather than a static caption.
  // Empty unless the pcn_lookup job is queued or running.
  const liveCouncilThought =
    live &&
    live.kind === "pcn_lookup" &&
    (live.status === "queued" || live.status === "running")
      ? live.latestThought ?? live.latestStep ?? null
      : null;

  const lifecycleSteps = buildLifecycleSteps({
    appeal,
    state: cardState,
    statusSnapshot,
    councils,
    councilName,
    payUrl,
    pcnImage,
    ocrHandoff,
    extracted,
    expanded,
    busy,
    submitting,
    mcpPanel,
    liveCouncilThought,
    onStartAppeal: () => void startAppeal(),
    onAgreeTicket: () => void agreeTicket(),
    onEditTicket: () => void editTicket(),
    onOpenPaymentSheet: () => setPaySheetOpen(true),
    onOverrideLookup: () => void overrideLookup(),
    onConfirmEvidence: (input) => void confirmEvidenceAndDraft(input),
    onRetryDraft: () => void retryDraft(),
    onRescoreWithEvidence: (photos) => void rescoreWithEvidence(photos),
    onEditTicketField: editTicketField,
  });

  // ─── render ───
  return (
    <article
      ref={rootRef}
      className={`relative rounded-3xl bg-white border ${
        cardState.inFlight ? "border-parkingrabbit-primary/40 shadow-lg shadow-parkingrabbit-primary/10" : "border-parkingrabbit-border"
      } overflow-hidden transition-all duration-300`}
    >
      {/* Top-of-card progress bar — extra-thin, only when in-flight. */}
      {cardState.inFlight && cardState.progress != null && (
        <div className="h-0.5 bg-parkingrabbit-primary/15 relative overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-parkingrabbit-primary transition-[width] duration-500 ease-out"
            style={{ width: `${Math.round(cardState.progress * 100)}%` }}
          />
        </div>
      )}

      {/* Note: the legacy absolute "Agent at work" ActivityIndicator
       *  used to render here in the top-right corner of the card and
       *  visually collided with the £ amount + the inline status pill
       *  in the header (both communicated the same in-flight state).
       *  The status pill in `<TicketCardHeader pill={…} />` is now the
       *  single source of truth for "what's happening" on a card; the
       *  ActivityIndicator stays mounted only as the global nav pill
       *  (see /app/tickets header). */}

      {/* Header — tappable to expand/collapse on list pages. The
       *  wide "View Details" footer button has been removed; tapping
       *  anywhere on the header (or the chevron) toggles the card. On
       *  detail pages there's no toggle. */}
      <div
        role={!isDetail && onToggle ? "button" : undefined}
        tabIndex={!isDetail && onToggle ? 0 : undefined}
        aria-expanded={!isDetail && onToggle ? expanded : undefined}
        onClick={!isDetail && onToggle ? handleToggleWithScroll : undefined}
        onKeyDown={
          !isDetail && onToggle
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleToggleWithScroll();
                }
              }
            : undefined
        }
        className={`relative ${
          !isDetail && onToggle ? "cursor-pointer select-none" : ""
        }`}
      >
        <TicketCardHeader
          council={
            council
              ? {
                  name: council.name,
                  logoUrl: council.logoUrl ?? null,
                  logoBg: council.logoBg ?? null,
                }
              : null
          }
          councilName={councilName}
          amountPence={displayAmountPence}
          amountNote={amountNote}
          pcnRef={displayPcnRef}
          vehicleReg={displayVehicleReg}
          issuedAt={displayIssuedAt}
          location={displayLocation}
          pill={<StatusPill state={cardState} />}
          deadlineProximity={deadlineProximity}
          onCouncilClick={
            councils && councils.length > 0
              ? () => setCouncilPickerOpen(true)
              : undefined
          }
          // The reel spins through the entire scanning + processing
          // window so the "looking for your council" affordance always
          // gets its full beat — the reel's own settle logic then
          // glides onto the detected council the instant `processing`
          // ends (which is when OCR finishes and councilSlug is final).
          //
          // We DELIBERATELY don't latch on the council pre-pass's early
          // PATCH of `councilSlug` here: that PATCH can land within the
          // first ~200ms, before the reel has even mounted, which made
          // the animation disappear entirely. Pinning the spin to
          // cardState.kind keeps the runway visible until OCR settles.
          //
          // v0.3.10 — also stop the spinner the moment the cheap
          // council-id pass (pass 1 of `/api/extract`, ~2–3s) writes a
          // councilSlug onto the appeal. Without this gate the reel
          // keeps shuffling for the full ~10–15s extract even though we
          // already know which council to land on. The slug presence
          // implies the FK-hoist in patchAppealDraft matched a real
          // councils row, so the council logo is ready to render.
          scanning={
            (cardState.kind === "scanning" ||
              cardState.kind === "processing") &&
            !appeal.councilSlug
          }
          reelCouncils={councils ?? undefined}
        />
        {!isDetail && onToggle && (
          <button
            type="button"
            aria-label={expanded ? "Collapse ticket" : "Expand ticket"}
            onClick={(e) => {
              e.stopPropagation();
              handleToggleWithScroll();
            }}
            className="absolute top-3 right-3 size-7 rounded-full bg-parkingrabbit-bg/80 hover:bg-parkingrabbit-bg text-parkingrabbit-muted hover:text-parkingrabbit-navy flex items-center justify-center transition"
          >
            <ChevronDown
              className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
              strokeWidth={2.5}
            />
          </button>
        )}
      </div>

      {/* Location now lives inside the header (under "Issued 20 May",
       *  next to the council logo). The standalone "Checking with the
       *  council..." live caption row that used to sit here has been
       *  removed — the active "Checking council" lifecycle step below
       *  already says the same thing, with a real spinner. */}

      {/* ─── ONE unified lifecycle timeline ───
       *  Replaces the legacy trio (TicketJourney 3-step + the inline
       *  ProcessingCard rows + the Progress Timeline section). Every
       *  state, milestone, loader, and expanded action surface lives in
       *  here as a single vertical journey. Collapsed cards still show
       *  the timeline so the user can see *where* the ticket is at a
       *  glance; expanded cards mount each step's interactive content
       *  inline under the relevant step. */}
      <div className="px-5 pb-4">
        <TicketLifecycleTimeline steps={lifecycleSteps} />
      </div>

      {/* Body — supplementary surfaces that don't belong to any single
       *  lifecycle step (stuck-submission notice + error toast). The
       *  MCP live agent panel now lives inside the "Checking council"
       *  timeline step itself. */}
      {expanded && (cardState.kind === "submitting" || error) && (
        <div className="px-5 pb-4 flex flex-col gap-4">
          {cardState.kind === "submitting" && isSubmissionStuck(appeal) && (
            <StuckSubmittingNotice />
          )}
          {error && (
            <p className="text-[11.5px] text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              {error}
            </p>
          )}
        </div>
      )}

      {/* Footer — Delete only. The wide "View Details" wide button is
       *  gone (the user taps the card itself or the chevron in the
       *  header to expand/collapse). Delete stays as a quiet,
       *  two-tap-to-confirm row underneath. */}
      {onHide && (
        <footer className="px-5 pb-4 pt-1 flex flex-col gap-2">
          <DeleteTicketButton onConfirm={onHide} />
        </footer>
      )}

      <PaymentSheet
        open={paySheetOpen}
        onClose={() => setPaySheetOpen(false)}
        appealId={appeal.id}
        onPaid={handlePaid}
        busy={submitting}
        councilName={councilName}
      />
      {/* Moment A — fired when the user taps Appeal (see startAppeal). */}
      <NotificationPromptGate
        trigger={notifPromptTriggerAppealTap}
        moment="appealTap"
      />
      {/* Moment B — fired the first time we observe status=submitted
       *  on this card's lifecycle. */}
      <NotificationPromptGate
        trigger={notifPromptTriggerSubmitDone}
        moment="submitDone"
      />
      {councilPickerOpen && councils && (
        <CouncilPickerSheet
          councils={councils}
          selectedSlug={appeal.councilSlug ?? appeal.ticket?.councilSlug ?? null}
          onClose={() => setCouncilPickerOpen(false)}
          onPick={(slug) => {
            editTicketField("councilSlug", slug);
            setCouncilPickerOpen(false);
          }}
        />
      )}
    </article>
  );
}

/* StatusPill, pillPaletteFor → components/ticket/StatusPill.tsx
 * DeleteTicketButton          → components/ticket/DeleteTicketButton.tsx
 * Field, humanize, formatFieldValue → components/ticket/Field.tsx */

// Re-export to allow consumers like the list page to peek at status without
// re-deriving (rare).
export { STATUS_LABEL };

/* ─────────────────────── unified lifecycle mapping ───────────────────────
 *
 * Each ticket runs through the same vertical journey from upload →
 * resolution. The mapper below takes the precomputed CardState plus the
 * action handlers from the smart card and returns ONE ordered list of
 * `LifecycleStep` rows for `<TicketLifecycleTimeline>` to render. No
 * other progress component should exist on the same ticket — the
 * inline ProcessingCard step rows, the legacy 3-step TicketJourney, and
 * the "Progress" Timeline panel that used to sit below the body are all
 * collapsed here.
 *
 * The active step's interactive content (image preview + scan overlay,
 * confirm-details form, grounds quiz, decision cards, £2.99 submit CTA,
 * etc.) is mounted as that step's `children` so the user always sees the
 * action *next to* the milestone it belongs to. Done steps with
 * post-hoc info (council-confirmed metadata, warden photos, letter
 * actions) attach those panels the same way.
 */

interface BuildStepArgs {
  appeal: AppealRecord;
  state: CardState;
  statusSnapshot: TicketStatusSnapshot | null;
  councils: CouncilOption[] | null;
  councilName: string | null;
  payUrl: string | null;
  pcnImage: string | null;
  ocrHandoff: OcrHandoff | null;
  extracted: Record<string, string>;
  /** Pre-rendered MCP live-agent panel — full-width, mounted as the
   *  children of the "Checking council" step when active or when a
   *  past-job gallery exists. NULL when the admin flag is OFF or
   *  nothing's running. */
  mcpPanel: React.ReactNode | null;
  /** v0.3.6 — live MCP agent thought during a council lookup. Forwarded
   *  to the CouncilCheckChip in the gathering_evidence body. */
  liveCouncilThought: string | null;
  /** Card expand state. Children are mounted only when expanded so the
   *  collapsed timeline stays compact in the list view. */
  expanded: boolean;
  busy: boolean;
  submitting: boolean;
  onStartAppeal: () => void;
  onAgreeTicket: () => void;
  onEditTicket: () => void;
  onOpenPaymentSheet: () => void;
  onOverrideLookup: () => void;
  onConfirmEvidence: (input: { grounds: string[]; notes: string }) => void;
  onRetryDraft: () => void;
  onRescoreWithEvidence: (photos: string[]) => void;
  onEditTicketField: (
    field:
      | "pcnRef"
      | "vehicleReg"
      | "councilSlug"
      | "amountPence"
      | "issuedAt"
      | "location",
    value: string,
  ) => void;
}

function buildLifecycleSteps(args: BuildStepArgs): LifecycleStep[] {
  const {
    appeal,
    state,
    statusSnapshot,
    councils,
    councilName,
    payUrl,
    pcnImage,
    ocrHandoff,
    extracted,
    mcpPanel,
    liveCouncilThought,
    expanded,
    busy,
    submitting,
    onStartAppeal,
    onAgreeTicket,
    onEditTicket,
    onOpenPaymentSheet,
    onOverrideLookup,
    onConfirmEvidence,
    onRetryDraft,
    onRescoreWithEvidence,
    onEditTicketField,
  } = args;

  const kind = state.kind;
  const portal = appeal.portalLookup;
  const hasLetter = !!appeal.letterBody;
  const draftPicked = appeal.preferredMethod === "portal";
  const groundsPicked = (appeal.grounds?.length ?? 0) > 0;
  const ticketComplete = !!(appeal.ticket?.pcnRef && appeal.ticket?.vehicleReg);
  const portalDone =
    portal?.status === "verified" ||
    portal?.status === "invalid" ||
    portal?.status === "overridden" ||
    portal?.status === "skipped";
  const outstanding =
    statusSnapshot &&
    (statusSnapshot.status === "unpaid" ||
      statusSnapshot.status === "charge_certificate_issued");

  // Body content is rendered through TicketCardBody for the kinds it
  // already supports; failure kinds + inline pieces are rendered
  // directly below.
  const renderBody = () => (
    <TicketCardBody
      appeal={appeal}
      state={state}
      payUrl={payUrl}
      councilName={councilName}
      councils={councils}
      statusSnapshot={statusSnapshot}
      onStartAppeal={onStartAppeal}
      onAgreeTicket={onAgreeTicket}
      onEditTicket={onEditTicket}
      onOpenPaymentSheet={onOpenPaymentSheet}
      onOverrideLookup={onOverrideLookup}
      onConfirmEvidence={onConfirmEvidence}
      onRetryDraft={onRetryDraft}
      onRescoreWithEvidence={onRescoreWithEvidence}
      onEditTicketField={onEditTicketField}
      pcnImage={pcnImage}
      ocrHandoff={ocrHandoff}
      liveCouncilThought={liveCouncilThought}
      busy={busy || submitting}
    />
  );

  const steps: LifecycleStep[] = [];

  // 1) Reading PCN — covers both the upload and the OCR pass. The
  //    legacy "Ticket uploaded" step was redundant: the moment the
  //    appeal exists the image is already in front of the user, so a
  //    separate "uploaded" milestone just added noise. Fails for
  //    non-PCN / unclear / extraction_failed kinds. The uploaded
  //    image preview lives here, with a scanning animation overlay
  //    while active.
  const readingStatus: LifecycleStepStatus =
    kind === "image_issue" ||
    kind === "image_unclear" ||
    kind === "extraction_failed"
      ? "failed"
      : kind === "scanning" || kind === "processing"
        ? "active"
        : "done";
  const showScanOverlay = readingStatus === "active";
  steps.push({
    id: "reading",
    title:
      readingStatus === "failed"
        ? kind === "image_issue"
          ? "Image issue"
          : kind === "image_unclear"
            ? "Image unclear"
            : "Reading failed"
        : "Reading PCN",
    supporting:
      readingStatus === "failed"
        ? kind === "image_issue"
          ? "This doesn't look like a parking ticket."
          : kind === "image_unclear"
            ? "We couldn't read this PCN clearly."
            : "Rabbit couldn't finish reading this PCN."
        : readingStatus === "active"
          ? "Rabbit is reading the PCN details."
          : "PCN details captured.",
    status: readingStatus,
    busy: readingStatus === "active",
    tint: readingStatus === "failed" ? "warn" : undefined,
    // Show the image preview ONLY while OCR is actively running (or
    // a reading failure surface needs retry actions). The moment OCR
    // settles and the user moves on to "Information collected", the
    // thumbnail collapses — the user already saw the photo, and the
    // confirmation form below is where their attention should be.
    children: (() => {
      if (!expanded) return null;
      if (readingStatus === "failed")
        return <ReadingFailureActions kind={kind} appealId={appeal.id} />;
      if (readingStatus !== "active") return null;
      if (!pcnImage) return null;
      return (
        <div className="relative rounded-2xl overflow-hidden border border-parkingrabbit-border bg-parkingrabbit-bg">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL */}
          <img
            src={pcnImage}
            alt="Your PCN"
            className="w-full h-auto object-contain max-h-64"
          />
          {showScanOverlay && <ScanningOverlay />}
        </div>
      );
    })(),
  });

  // 2) Information collected. v0.3.6 — re-introduced the active branch
  //    for pending_review. The user must verify (or edit) the OCR'd
  //    PCN ref / registration / council and tap "Agree to continue"
  //    before the Pay/Appeal decision tiles appear. The agree gesture
  //    is purely a confirmation — no server cost (the lookup is still
  //    lazy and only fires on Appeal). PendingReviewCard (editable
  //    fields + photo coach + Agree button) mounts as the children
  //    here when active.
  const infoStatus: LifecycleStepStatus =
    readingStatus === "failed"
      ? "upcoming"
      : kind === "info_needed"
        ? "failed"
        : kind === "pending_review"
          ? "active"
          : ticketComplete
            ? "done"
            : "upcoming";
  steps.push({
    id: "info",
    title:
      infoStatus === "failed"
        ? "Information needed"
        : infoStatus === "active"
          ? "Confirm details"
          : "Information collected",
    supporting:
      infoStatus === "failed"
        ? "We need a few details to continue."
        : infoStatus === "active"
          ? "Check these details below and tap Agree when they look right."
          : infoStatus === "done"
            ? "PCN details confirmed."
            : "Up next, once the photo is read.",
    status: infoStatus,
    tint: infoStatus === "failed" ? "warn" : undefined,
    children:
      expanded && (infoStatus === "active" || infoStatus === "failed")
        ? renderBody()
        : null,
  });

  // 3) Checking council — validation against the issuer portal. Fails
  //    on portal error. Warden photos + council-confirmed metadata pin
  //    here once it's done. Until this step finishes we don't know
  //    whether the ticket is outstanding, what's currently due, or
  //    whether the discount window is open — so the legacy
  //    "Outstanding" step has been removed entirely and that info is
  //    surfaced inside "Pay / appeal" once verified.
  // v0.3.6 — "Checking council" timeline step is GONE. The
  // CouncilCheckChip inside the Build-appeal body is the single
  // ambient surface for the lookup signal (pending / verified-with-diffs
  // / error) AND the live MCP agent thought streams into it
  // (liveAgentThought prop) so the user sees "Filling in PCN ref…",
  // "Navigating to ticket details…" etc. inline. We only re-introduce
  // the step here for the explicit failure card (council_lookup_failed),
  // which still needs the retry / override surface.
  if (kind === "council_lookup_failed") {
    steps.push({
      id: "council",
      title: "Council check needed",
      supporting: "We couldn't check the council portal.",
      status: "failed",
      tint: "warn",
      children: expanded ? (
        <CouncilFailureActions onOverrideLookup={onOverrideLookup} />
      ) : null,
    });
  }
  // The mcpPanel + extracted-field stream still belong to the LIVE
  // validating fallback (when preferredMethod hasn't been picked).
  // The chip and the inline thought handle the gathering_evidence /
  // drafting cases.
  if (kind === "validating") {
    steps.push({
      id: "council",
      title: "Checking council",
      supporting:
        state.caption ??
        "Checking the issuer portal for payment status, deadlines, and available options.",
      status: "active",
      busy: true,
      children: expanded
        ? (
            <div className="flex flex-col gap-3">
              {mcpPanel}
              {Object.keys(extracted).length > 0 && (
                <ExtractedStream extracted={extracted} />
              )}
            </div>
          )
        : null,
    });
  }

  // 4) Pay / appeal — the decision point. v0.3.6 — only active in
  //    needs_decision (which now also fires PRE-lookup once the user
  //    has tapped Agree on pending_review; see deriveCardState's
  //    ticket-confirmed branch). pending_review keeps its own step
  //    above (Confirm details) so the Agree gesture has visible
  //    ownership on the rail. Failed when the lazy lookup verdict
  //    says paid/closed/not_found (appeal_not_possible).
  const payAppealStatus: LifecycleStepStatus =
    kind === "appeal_not_possible"
      ? "failed"
      : kind === "needs_decision"
        ? "active"
        : draftPicked ||
            kind === "gathering_evidence" ||
            kind === "drafting" ||
            kind === "letter_ready" ||
            kind === "submitting" ||
            kind === "submitted" ||
            kind === "terminal"
          ? "done"
          : "upcoming";
  steps.push({
    id: "pay-appeal",
    title:
      payAppealStatus === "failed" ? "Appeal not possible" : "Pay / appeal",
    supporting:
      payAppealStatus === "failed"
        ? state.caption ??
          "The council's record means an appeal can't be filed for this PCN."
        : payAppealStatus === "active"
          ? "Review your options below"
          : payAppealStatus === "done"
            ? draftPicked
              ? "You chose to appeal with Rabbit."
              : "Decision made."
            : portalDone
              ? "Review your options below"
              : "Rabbit will show your options once the council check is complete.",
    // Verified status line ("Due: £X · £Y if paid by Z") only appears
    // once the COUNCIL LOOKUP has verified the PCN AND we're actively
    // offering the decision. Never claim a discount pre-validation —
    // the /api/appeals/[id]/status snapshot is cheap and runs early,
    // but its figures are not the council's record until the lazy
    // pcn_lookup (Playwright MCP) confirms them.
    detail:
      outstanding && payAppealStatus === "active" && portalDone ? (
        <OutstandingDetail snapshot={statusSnapshot} />
      ) : null,
    status: payAppealStatus,
    tint: payAppealStatus === "failed" ? "warn" : undefined,
    // No outer yellow wrapper around the decision tiles — the
    // "Appeal expired" / "Open" copy + the "Due: £X" line carry the
    // urgency on their own. The choice cards inside are designed to
    // stand full-width without any tinted parent.
    children:
      expanded && (payAppealStatus === "active" || payAppealStatus === "failed")
        ? renderBody()
        : null,
    // Decision tiles escape the rail indent so they span the full
    // card width (matching the Delete button in the footer below).
    childrenFullBleed: payAppealStatus === "active",
  });

  // 5) Build appeal — the grounds + evidence + dictation surface. Only
  //    shown once the user has chosen the appeal path. The
  //    GatheringEvidenceCard lives here as children when active.
  //    Skipped entirely when appeal_not_possible — there's nothing to
  //    build if the council refuses the appeal.
  if ((draftPicked || hasLetter) && kind !== "appeal_not_possible") {
    const buildStatus: LifecycleStepStatus =
      kind === "gathering_evidence"
        ? "active"
        : groundsPicked && (hasLetter || appeal.step === EVIDENCE_DONE_STEP)
          ? "done"
          : "upcoming";
    steps.push({
      id: "build",
      title: "Build appeal",
      supporting:
        buildStatus === "active"
          ? "Pick your grounds and add evidence."
          : buildStatus === "done"
            ? "Grounds and notes captured."
            : "Up next.",
      status: buildStatus,
      children: expanded && buildStatus === "active" ? renderBody() : null,
    });

    // 6) Drafting appeal — merged with the legacy "Appeal written"
    //    step. Active while the AI is writing OR while the user is
    //    reviewing the finished letter; done once it's been
    //    submitted. Splitting these into two steps was duplicate
    //    signal — "Drafting" and "Written" refer to the same milestone
    //    just at different points in time.
    const draftingActive =
      kind === "drafting" ||
      kind === "letter_ready" ||
      kind === "submitting";
    const draftingDone =
      kind === "submitted" || (kind === "terminal" && hasLetter);
    const draftingStatus: LifecycleStepStatus = draftingActive
      ? "active"
      : draftingDone
        ? "done"
        : "upcoming";
    steps.push({
      id: "drafting",
      title:
        kind === "drafting"
          ? "Drafting appeal"
          : kind === "letter_ready" || kind === "submitting"
            ? "Appeal ready"
            : draftingDone
              ? "Appeal ready"
              : "Drafting appeal",
      supporting:
        kind === "drafting"
          ? state.caption ?? "Rabbit is drafting your appeal."
          : kind === "letter_ready"
            ? "Your appeal letter is ready to review."
            : draftingDone
              ? "Letter ready."
              : "Up next.",
      status: draftingStatus,
      busy: kind === "drafting",
      // v0.3.6 — mount the drafting body during the actual drafting
      // phase too. The body now renders the Council-confirms details
      // block while the AI writes, so the user sees what their letter
      // is being drafted from. Previously the body was only mounted
      // once a letterBody existed (letter_ready / submitting).
      children:
        expanded && kind === "drafting"
          ? renderBody()
          : expanded && hasLetter && (kind === "letter_ready" || kind === "submitting")
            ? renderBody()
            : expanded && hasLetter
              ? renderLetterActions(appeal)
              : null,
    });
  }

  // 8) Submit appeal / Appeal submitted — the agent is filing, or the
  //     filing is complete.
  const submitStatus: LifecycleStepStatus =
    kind === "submitting"
      ? "active"
      : kind === "submitted" ||
          (kind === "terminal" && hasLetter)
        ? "done"
        : "upcoming";
  if (
    (draftPicked || hasLetter || submitStatus !== "upcoming") &&
    kind !== "appeal_not_possible"
  ) {
    steps.push({
      id: "submit",
      title:
        submitStatus === "active"
          ? "Submitting appeal"
          : submitStatus === "done"
            ? "Appeal submitted"
            : "Submit appeal",
      supporting:
        submitStatus === "active"
          ? state.caption ?? "Filing your appeal with the council..."
          : submitStatus === "done"
            ? "Your appeal has been submitted."
            : "After you submit, Rabbit files this directly with the council.",
      status: submitStatus,
      busy: submitStatus === "active",
      children: expanded && submitStatus === "done" && kind === "submitted"
        ? renderBody()
        : null,
    });
  }

  // 9) Resolved / Paid — the final state.
  const resolvedStatus: LifecycleStepStatus =
    kind === "terminal"
      ? "done"
      : appeal.status === "rejected"
        ? "failed"
        : "upcoming";
  if (resolvedStatus !== "upcoming") {
    steps.push({
      id: "resolved",
      title:
        appeal.status === "rejected"
          ? "Appeal rejected"
          : appeal.status === "cancelled"
            ? "Cancelled by council"
            : state.stage === "paid"
              ? "Paid"
              : "Resolved",
      supporting:
        appeal.status === "rejected"
          ? "The council rejected this appeal."
          : appeal.status === "cancelled"
            ? "Your appeal succeeded — nothing more to pay."
            : state.stage === "paid"
              ? "Settled in full."
              : "No further action available.",
      status: resolvedStatus,
      tint: appeal.status === "rejected" ? "danger" : undefined,
      children: expanded && kind === "terminal" ? renderBody() : null,
    });
  }

  return steps;
}

/* ReadingFailureActions, CouncilFailureActions, ExtractedStream
 *   → components/ticket/FailureActions.tsx                         */

function renderLetterActions(appeal: AppealRecord): React.ReactElement | null {
  if (!appeal.letterBody) return null;
  return (
    <LetterActions
      letterBody={appeal.letterBody}
      letterSubject={appeal.letterSubject ?? "ParkingRabbit appeal letter"}
    />
  );
}

/* OutstandingDetail, isSubmissionStuck, StuckSubmittingNotice, STUCK_THRESHOLD_MS
 *   → components/ticket/SubmissionStatusBits.tsx                            */

