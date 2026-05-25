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
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { LetterActions } from "@/components/LetterActions";
import { MCPLiveStrip } from "@/components/MCPLiveStrip";
import { NotificationPermissionSheet } from "@/components/NotificationPermissionSheet";
import { CouncilPickerSheet } from "@/components/CouncilPickerSheet";
import { PaymentSheet } from "@/components/PaymentSheet";
import { ScanningOverlay } from "@/components/ScanningOverlay";
import { TicketCardBody } from "@/components/TicketCardBody";
import { TicketCardHeader } from "@/components/TicketCardHeader";
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
import { useFlags } from "@/lib/client/flags";
import type { AppealRecord } from "@/lib/server/appeals";
import type { TicketStatusSnapshot } from "@/lib/server/connectors/types";

interface CouncilOption {
  slug: string;
  name: string;
  appealPortalUrl?: string | null;
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
  const [notifPromptTrigger, setNotifPromptTrigger] = useState(0);
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
  useEffect(() => {
    if (!appeal.ticket?.pcnRef || !appeal.ticket.vehicleReg) return;
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(`/api/appeals/${encodeURIComponent(appeal.id)}/status`, {
          cache: "no-store",
          headers: { "x-snappeal-session": getOrCreateSessionId() },
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
  }, [appeal.id, appeal.ticket?.pcnRef, appeal.ticket?.vehicleReg]);

  // ─── live SSE subscription ───
  const fetchAppealRow = async (): Promise<AppealRecord | null> => {
    try {
      const res = await fetch(`/api/appeals/${encodeURIComponent(appeal.id)}`, {
        cache: "no-store",
        headers: { "x-snappeal-session": getOrCreateSessionId() },
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
            headers: { "x-snappeal-session": getOrCreateSessionId() },
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
    if (cardState.kind !== "processing" && cardState.kind !== "drafting") {
      return;
    }
    const interval = cardState.kind === "processing" ? 2000 : 3000;
    const maxPolls = cardState.kind === "processing" ? 60 : 60;
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
      }
      if (polls < maxPolls) timer = setTimeout(tick, interval);
    };
    timer = setTimeout(tick, interval);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
    // Intentionally only on state.kind transitions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardState.kind]);

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

  const councilName = council?.name ?? ticket?.issuer ?? null;
  const payUrl = statusSnapshot?.paymentUrl ?? council?.appealPortalUrl ?? null;

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
        "x-snappeal-session": getOrCreateSessionId(),
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
      const updated = await patchThisAppeal({ preferredMethod: "portal" });
      refreshAppeal(updated);
      // No generate-stream here — drafting fires after the grounds quiz
      // + evidence are submitted via `confirmEvidenceAndDraft` below.
      setNotifPromptTrigger((n) => n + 1);
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
      // Fire generate-stream — the drafting-state poll picks up the
      // letter when it lands and flips the card to letter_ready.
      //
      // The server's GenerateRequest schema requires `pcnPhoto` and uses
      // `confirmedTicket` to skip a re-OCR pass that otherwise blows the
      // 120s CLI timeout. Photos still live in sessionStorage (Blob
      // upload is on the roadmap) so we forward them here; the confirmed
      // ticket comes off the freshly PATCHed appeal row.
      const pcnPhoto = getPcnPhoto();
      const evidencePhotos = getEvidencePhotos();
      void fetch("/api/generate-stream", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-snappeal-session": getOrCreateSessionId(),
        },
        body: JSON.stringify({
          sessionId: getOrCreateSessionId(),
          appealId: updated.id,
          pcnPhoto: pcnPhoto ?? undefined,
          evidencePhotos,
          confirmedTicket: updated.ticket ?? undefined,
        }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start drafting");
    } finally {
      setBusy(false);
    }
  };

  // Re-runs the drafter on the EXISTING grounds + notes but with the
  // current evidence-photos set. Used when the strength scorer flagged
  // the original draft as weak — adding photos and redrafting often
  // boosts the score because the AI can splice the new evidence in.
  //
  // Optimistic flow: clears letterBody locally so deriveCardState
  // routes the card back into the `drafting` state (with its own
  // loader + polling). Server-side, generate-stream overwrites the
  // letter + strengthScore when it settles; the drafting poll picks
  // up the new values.
  const redraftWithEvidence = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // Optimistic local clear so the card immediately flips to the
      // "drafting" loader instead of staying on the old letter.
      refreshAppeal({
        ...appeal,
        letterBody: null,
        letterSubject: null,
        letterWordCount: null,
        strengthScore: null,
        strengthRationale: null,
        strengthImprovements: null,
      });
      const pcnPhoto = getPcnPhoto();
      const evidencePhotos = getEvidencePhotos();
      void fetch("/api/generate-stream", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-snappeal-session": getOrCreateSessionId(),
        },
        body: JSON.stringify({
          sessionId: getOrCreateSessionId(),
          appealId: appeal.id,
          pcnPhoto: pcnPhoto ?? undefined,
          evidencePhotos,
          confirmedTicket: appeal.ticket ?? undefined,
        }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't redraft");
    } finally {
      setBusy(false);
    }
  };

  // v0.2.14 — pending-review confirm: POSTs /api/appeals/[id]/lookup,
  // refreshes the appeal so the card flips into the validating state.
  const confirmTicket = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/appeals/${encodeURIComponent(appeal.id)}/lookup`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-snappeal-session": getOrCreateSessionId(),
          },
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(
          body?.error?.message ?? `Couldn't start validation (${res.status})`,
        );
      }
      await res.json().catch(() => null);
      // Clear the OCR handoff — once the user has confirmed, we don't
      // want the review UI to flash back on a refresh.
      clearOcrResult();
      setOcrHandoff(null);
      const next = await fetchAppealRow();
      if (next) refreshAppeal(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start validation");
    } finally {
      setBusy(false);
    }
  };

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
            "x-snappeal-session": getOrCreateSessionId(),
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
          "x-snappeal-session": getOrCreateSessionId(),
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

  // ─── MCP live agent panel — full-width, mounted inside the
  //     "Checking council" timeline step instead of as a separate
  //     supplementary card. Pre-built here so buildLifecycleSteps
  //     stays a pure function over plain values. Returns null when
  //     the admin flag is OFF or there's nothing to show yet. ───
  const mcpPanel: React.ReactNode | null = (() => {
    const galleryEvents = events.length > 0 ? events : pastSubmitEvents;
    const isLive =
      cardState.inFlight &&
      (activeJobKind === "pcn_lookup" || activeJobKind === "submit_appeal");
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
    onStartAppeal: () => void startAppeal(),
    onOpenPaymentSheet: () => setPaySheetOpen(true),
    onOverrideLookup: () => void overrideLookup(),
    onConfirmTicket: () => void confirmTicket(),
    onConfirmEvidence: (input) => void confirmEvidenceAndDraft(input),
    onRedraftWithEvidence: () => void redraftWithEvidence(),
    onEditTicketField: editTicketField,
  });

  // ─── render ───
  return (
    <article
      ref={rootRef}
      className={`relative rounded-3xl bg-white border ${
        cardState.inFlight ? "border-snappeal-primary/40 shadow-lg shadow-snappeal-primary/10" : "border-snappeal-border"
      } overflow-hidden transition-all duration-300`}
    >
      {/* Top-of-card progress bar — extra-thin, only when in-flight. */}
      {cardState.inFlight && cardState.progress != null && (
        <div className="h-0.5 bg-snappeal-primary/15 relative overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-snappeal-primary transition-[width] duration-500 ease-out"
            style={{ width: `${Math.round(cardState.progress * 100)}%` }}
          />
        </div>
      )}

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
          onCouncilClick={
            councils && councils.length > 0
              ? () => setCouncilPickerOpen(true)
              : undefined
          }
          scanning={
            cardState.kind === "scanning" || cardState.kind === "processing"
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
            className="absolute top-3 right-3 size-7 rounded-full bg-snappeal-bg/80 hover:bg-snappeal-bg text-snappeal-muted hover:text-snappeal-navy flex items-center justify-center transition"
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
      <NotificationPermissionSheet trigger={notifPromptTrigger > 0} />
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

/* ─────────────────────── pill ─────────────────────── */

function StatusPill({ state }: { state: CardState }) {
  const palette = pillPaletteFor(state.kind, state.pillTone);
  const showLoader =
    state.kind === "validating" ||
    state.kind === "drafting" ||
    state.kind === "submitting" ||
    state.kind === "scanning";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide whitespace-nowrap transition-colors duration-500 ${palette}`}
    >
      {showLoader ? (
        <Loader2 className="size-3 animate-spin" strokeWidth={2.5} />
      ) : state.kind === "letter_ready" ? (
        <Sparkles className="size-3" strokeWidth={2.5} fill="currentColor" />
      ) : state.kind === "submitted" || state.kind === "terminal" ? (
        state.pillTone === "success" ? (
          <CheckCircle2 className="size-3" strokeWidth={2.5} />
        ) : (
          <Check className="size-3" strokeWidth={2.5} />
        )
      ) : (
        <span className="size-1.5 rounded-full bg-current snappeal-mcp-tick-dot" />
      )}
      {state.pillLabel}
    </span>
  );
}

function pillPaletteFor(kind: CardKind, tone: CardPillTone): string {
  if (tone === "info" || kind === "scanning") {
    return "bg-snappeal-primary-50 text-snappeal-primary border border-snappeal-primary/20";
  }
  if (tone === "positive") {
    return "bg-green-50 text-green-700 border border-green-200";
  }
  if (tone === "success") {
    return "bg-green-100 text-green-800 border border-green-300";
  }
  if (tone === "warn") {
    return "bg-amber-50 text-amber-800 border border-amber-200";
  }
  if (tone === "danger") {
    return "bg-red-50 text-red-700 border border-red-200";
  }
  return "bg-snappeal-bg text-snappeal-muted border border-snappeal-border";
}

/* ─────────────────────── delete button ─────────────────────── */

function DeleteTicketButton({ onConfirm }: { onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleClick = () => {
    if (confirming) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setConfirming(false);
      onConfirm();
      return;
    }
    setConfirming(true);
    timerRef.current = setTimeout(() => {
      setConfirming(false);
      timerRef.current = null;
    }, 4000);
  };

  if (confirming) {
    return (
      <button
        type="button"
        onClick={handleClick}
        autoFocus
        className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-red-600 text-white border border-red-700 hover:bg-red-700 transition py-3 text-[12px] font-bold shadow-sm active:scale-[0.99]"
      >
        <Trash2 className="size-4" strokeWidth={2.25} />
        Tap again to confirm
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-white border border-snappeal-border text-snappeal-muted hover:text-red-700 hover:border-red-200 hover:bg-red-50/40 transition py-3 text-[12px] font-semibold"
    >
      <Trash2 className="size-4" strokeWidth={2} />
      Delete
    </button>
  );
}

/* ─────────────────────── small helpers ─────────────────────── */

function Field({ label, value }: { label: string; value: string }) {
  const display = formatFieldValue(label, value);
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wide text-snappeal-muted">
        {humanize(label)}
      </dt>
      <dd className="text-snappeal-navy font-semibold truncate" title={display}>
        {display}
      </dd>
    </div>
  );
}

function humanize(field: string): string {
  return field
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/\s*Pence$/, "");
}

/** SSE-driven `extracted` events arrive as raw stringified pence /
 *  ISO timestamps because that's what the connector emits. Format on
 *  display so the customer doesn't see "16000" under "Amount" or a
 *  raw ISO under "Issued At". */
function formatFieldValue(field: string, raw: string): string {
  if (raw == null || raw === "") return "—";
  // Amounts — any field name ending in "Pence" carries integer pence.
  if (/Pence$/.test(field)) {
    const n = Number(raw);
    if (Number.isFinite(n)) {
      return new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
        maximumFractionDigits: 0,
      }).format(n / 100);
    }
  }
  // Timestamps — issuedAt, paidAt, fetchedAt, dueDateAt, discountUntil,
  // fullChargeFrom — anything that parses cleanly as a date.
  if (/At$|Date$|Until$|From$|Date[A-Z]/.test(field)) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      // Same-day events get a time too — daily deadlines just need
      // the date.
      const hasTime = /T\d{2}:/.test(raw);
      return hasTime
        ? d.toLocaleString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : d.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          });
    }
  }
  return raw;
}

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
  /** Card expand state. Children are mounted only when expanded so the
   *  collapsed timeline stays compact in the list view. */
  expanded: boolean;
  busy: boolean;
  submitting: boolean;
  onStartAppeal: () => void;
  onOpenPaymentSheet: () => void;
  onOverrideLookup: () => void;
  onConfirmTicket: () => void;
  onConfirmEvidence: (input: { grounds: string[]; notes: string }) => void;
  onRedraftWithEvidence: () => void;
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
    expanded,
    busy,
    submitting,
    onStartAppeal,
    onOpenPaymentSheet,
    onOverrideLookup,
    onConfirmTicket,
    onConfirmEvidence,
    onRedraftWithEvidence,
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
      onOpenPaymentSheet={onOpenPaymentSheet}
      onOverrideLookup={onOverrideLookup}
      onConfirmTicket={onConfirmTicket}
      onConfirmEvidence={onConfirmEvidence}
      onRedraftWithEvidence={onRedraftWithEvidence}
      onEditTicketField={onEditTicketField}
      pcnImage={pcnImage}
      ocrHandoff={ocrHandoff}
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
      if (readingStatus === "failed") return renderReadingFailureActions(kind);
      if (readingStatus !== "active") return null;
      if (!pcnImage) return null;
      return (
        <div className="relative rounded-2xl overflow-hidden border border-snappeal-border bg-snappeal-bg">
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

  // 2) Information collected — required fields exist OR the user is in
  //    the pending_review surface (active w/ confirmation form). The
  //    PendingReviewCard surface lives here.
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
          ? "Check the details below."
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
  const councilStatus: LifecycleStepStatus =
    kind === "council_lookup_failed"
      ? "failed"
      : kind === "validating"
        ? "active"
        : portalDone
          ? "done"
          : "upcoming";
  steps.push({
    id: "council",
    title:
      councilStatus === "failed" ? "Council check needed" : "Checking council",
    supporting:
      councilStatus === "failed"
        ? "We couldn't check the council portal."
        : councilStatus === "active"
          ? state.caption ??
            "Checking the issuer portal for payment status, deadlines, and available options."
          : councilStatus === "done"
            ? "Confirmed with the council."
            : "Up next, once the PCN details are confirmed.",
    status: councilStatus,
    busy: councilStatus === "active",
    tint: councilStatus === "failed" ? "warn" : undefined,
    // Live agent browser (MCPLiveStrip) + extracted-field stream sit
    // inside this step ONLY while the check is active (or a failure
    // surface needs the retry action). The moment the council
    // confirms and we move on to "Pay / appeal", everything inside
    // Checking council collapses — the user's already seen the
    // browser do its work, and the verified amount / discount line
    // now lives inside the Pay / appeal step.
    children: expanded
      ? councilStatus === "failed"
        ? renderCouncilFailureActions(onOverrideLookup)
        : councilStatus === "active"
          ? (
              <div className="flex flex-col gap-3">
                {mcpPanel}
                {Object.keys(extracted).length > 0 &&
                  renderExtractedStream(extracted)}
              </div>
            )
          : null
      : null,
  });

  // 4) Pay / appeal — the decision point. Active when needs_decision;
  //    done once the user has either picked a path (preferredMethod
  //    stamped) or the ticket is terminally paid. The three choice
  //    cards (Appeal with Rabbit / Pay yourself / Pay instantly) live
  //    inside this step's children, AS DO the verified payment
  //    options + due-amount / discount line surfaced by the
  //    council snapshot (legacy "Outstanding" step folded into here
  //    so the timeline never claims a discount before the council has
  //    confirmed it).
  const payAppealStatus: LifecycleStepStatus =
    kind === "needs_decision"
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
    title: "Pay / appeal",
    supporting:
      payAppealStatus === "active"
        ? "Review your options below"
        : payAppealStatus === "done"
          ? draftPicked
            ? "You chose to appeal with Rabbit."
            : "Decision made."
          : councilStatus === "done"
            ? "Review your options below"
            : "Rabbit will show your options once the council check is complete.",
    // Verified status line ("Due: £X · £Y if paid by Z") only appears
    // once the council snapshot has landed AND we're actively offering
    // the decision. Never claim a discount pre-validation.
    detail:
      outstanding && payAppealStatus === "active" ? (
        <OutstandingDetail snapshot={statusSnapshot} />
      ) : null,
    status: payAppealStatus,
    // No outer yellow wrapper around the decision tiles — the
    // "Appeal expired" / "Open" copy + the "Due: £X" line carry the
    // urgency on their own. The choice cards inside are designed to
    // stand full-width without any tinted parent.
    children: expanded && payAppealStatus === "active" ? renderBody() : null,
    // Decision tiles escape the rail indent so they span the full
    // card width (matching the Delete button in the footer below).
    childrenFullBleed: payAppealStatus === "active",
  });

  // 5) Build appeal — the grounds + evidence + dictation surface. Only
  //    shown once the user has chosen the appeal path. The
  //    GatheringEvidenceCard lives here as children when active.
  if (draftPicked || hasLetter) {
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
      children:
        expanded && hasLetter && (kind === "letter_ready" || kind === "submitting")
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
  if (draftPicked || hasLetter || submitStatus !== "upcoming") {
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

function renderReadingFailureActions(kind: CardKind): React.ReactElement {
  const body =
    kind === "image_issue"
      ? "Please upload a clear photo of the Penalty Charge Notice, including the PCN number, issuer, date, amount, and vehicle registration."
      : kind === "image_unclear"
        ? "Please retake the photo in good light and make sure the whole notice is visible."
        : "Please try again, upload another photo, or enter the details manually.";
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[12px] text-amber-900/90 leading-snug">{body}</p>
      <div className="flex flex-col gap-2">
        <Link
          href="/app/capture"
          className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-snappeal-navy text-white font-semibold text-[12.5px] px-4 py-2.5 hover:bg-snappeal-navy/90 transition"
        >
          <Camera className="size-3.5" strokeWidth={2.25} />
          Retake photo
        </Link>
        <Link
          href="/app/capture?source=library"
          className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-white border border-snappeal-border text-snappeal-navy font-semibold text-[12.5px] px-4 py-2.5 hover:border-snappeal-primary transition"
        >
          <Images className="size-3.5" strokeWidth={2.25} />
          Choose another photo
        </Link>
      </div>
    </div>
  );
}

function renderCouncilFailureActions(
  onOverrideLookup: () => void,
): React.ReactElement {
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[12px] text-amber-900/90 leading-snug">
        You can still continue, but please review the details carefully.
      </p>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onOverrideLookup}
          className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-snappeal-navy text-white font-semibold text-[12.5px] px-4 py-2.5 hover:bg-snappeal-navy/90 transition"
        >
          <RefreshCw className="size-3.5" strokeWidth={2.25} />
          Continue anyway
        </button>
      </div>
    </div>
  );
}

function renderExtractedStream(
  extracted: Record<string, string>,
): React.ReactElement {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[10.5px] font-bold uppercase tracking-wide text-snappeal-success">
        Council confirms
      </p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11.5px]">
        {Object.entries(extracted).map(([field, value]) => (
          <Field key={field} label={field} value={value} />
        ))}
      </dl>
    </div>
  );
}

function renderLetterActions(appeal: AppealRecord): React.ReactElement | null {
  if (!appeal.letterBody) return null;
  return (
    <LetterActions
      letterBody={appeal.letterBody}
      letterSubject={appeal.letterSubject ?? "ParkingRabbit appeal letter"}
    />
  );
}

/** Renders the "Due: £X · £Y if paid by Z" line under the Outstanding
 *  step once the council has confirmed the ticket. */
function OutstandingDetail({
  snapshot,
}: {
  snapshot: TicketStatusSnapshot | null;
}) {
  if (!snapshot) return null;
  if (
    snapshot.status !== "unpaid" &&
    snapshot.status !== "charge_certificate_issued"
  ) {
    return null;
  }
  const due =
    snapshot.currentDuePence != null
      ? formatGBP(snapshot.currentDuePence)
      : null;
  const discounted =
    snapshot.discountedDuePence != null
      ? formatGBP(snapshot.discountedDuePence)
      : null;
  const discountUntil = formatShortDate(snapshot.discountUntil);
  if (!due) return null;
  return (
    <p className="text-amber-900/90">
      <span className="font-bold text-snappeal-navy">
        {snapshot.status === "charge_certificate_issued" ? "Now due: " : "Due: "}
        {due}
      </span>
      {discounted && discountUntil && (
        <span className="text-snappeal-muted">
          {" · "}
          {discounted} if paid by {discountUntil}
        </span>
      )}
    </p>
  );
}

/* ─────────────────────── stuck-submission notice ─────────────────────── */

/** A submission is "stuck" when the appeal has been in `status="submitting"`
 *  longer than the worker's job-level timeout PLUS a small grace window
 *  (worker has 10 min for the submit_appeal kind — see `JOB_TIMEOUT_MS` in
 *  `lib/server/jobs/worker.ts`). The worker bounces the appeal back to
 *  "ready" on timeout, but a worker that's down or a server that crashed
 *  won't run that recovery — so we still need a client-side fallback so
 *  the customer isn't trapped on a permanently-spinning card. 12 minutes
 *  is the worker cap (10) + 2 min of headroom for clock skew + DB write
 *  propagation. */
const STUCK_THRESHOLD_MS = 12 * 60_000;

function isSubmissionStuck(appeal: AppealRecord): boolean {
  if (appeal.status !== "submitting") return false;
  if (!appeal.updatedAt) return false;
  const updatedAtMs = new Date(appeal.updatedAt).getTime();
  if (!Number.isFinite(updatedAtMs)) return false;
  return Date.now() - updatedAtMs > STUCK_THRESHOLD_MS;
}

/** Surfaces the stuck-submission state to the customer with a manual
 *  refresh affordance. Deliberately minimal — no destructive actions;
 *  the worker's job timeout is the authoritative recovery mechanism. */
function StuckSubmittingNotice() {
  return (
    <section className="rounded-2xl bg-amber-50 border-2 border-amber-200 p-4 flex items-start gap-3">
      <span className="size-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
        <AlertTriangle className="size-5" strokeWidth={2.25} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold text-amber-900 leading-tight">
          This is taking longer than expected
        </p>
        <p className="text-[11.5px] text-amber-900/80 mt-1 leading-snug">
          The council portal is slow or our automation hit a snag.
          Refresh to check the latest state — if it stays stuck, the
          system will auto-retry or bounce the appeal back to ready so
          you can try again.
        </p>
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined") window.location.reload();
          }}
          className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white border border-amber-300 text-amber-900 text-[11.5px] font-semibold px-3 py-1.5 hover:bg-amber-100 transition"
        >
          <RefreshCw className="size-3.5" strokeWidth={2.25} />
          Refresh
        </button>
      </div>
    </section>
  );
}
