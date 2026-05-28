/**
 * deriveCardState — single source of truth for the ticket card UI.
 *
 * Pure function: (appeal, statusSnapshot, liveProgress) → CardState.
 *
 * Every visual decision on `<TicketCard>` flows from this function. No
 * other component should branch on `appeal.portalLookup.status`,
 * `appeal.letterBody`, `appeal.preferredMethod`, `statusSnapshot.stage`,
 * etc. — they all collapse here into one discriminated union.
 *
 * Seven top-level kinds:
 *   - scanning       — no portalLookup yet (rare, immediately post-create)
 *   - validating     — `portalLookup.status === "pending"` OR active pcn_lookup job
 *   - needs_decision — lookup done, no method picked. Sub-flavor for
 *                      escalated stages (charge cert / OFR / enforcement)
 *                      and appeal-expired window.
 *   - drafting       — preferredMethod stamped, letterBody null
 *   - letter_ready   — letterBody present, status in draft/ready
 *   - submitting     — appeal.status === "submitting" OR active submit_appeal job
 *   - submitted      — status in submitted/under_review/decision_pending
 *   - terminal       — paid / cancelled / closed / rejected
 *
 * `pillLabel`, `pillTone`, `caption` are precomputed here so the UI is a
 * mechanical render of the state.
 */
import type { AppealRecord } from "@/lib/server/appeals";
import type { TicketStage, TicketStatusSnapshot } from "@/lib/server/connectors/types";

export type JobKindLive = "pcn_lookup" | "generate_draft" | "submit_appeal";

export interface LiveProgress {
  jobId: string;
  kind: JobKindLive;
  status: "queued" | "running" | "done" | "failed";
  /** Most recent step caption from the agent ("Reading the council portal…"). */
  latestStep: string | null;
  /** Most recent free-form "thought" from the agent. */
  latestThought: string | null;
  /** 1-indexed milestone number reached, or null. */
  milestonesReached: number;
  /** Last screenshot URL (only set when screenshots are subscribed). */
  latestScreenshotUrl: string | null;
}

export type CardPillTone =
  | "muted"    // scanning / unknown
  | "info"     // validating, drafting, submitting (in-flight)
  | "warn"     // escalated, appeal-expired
  | "positive" // verdict open, letter ready, submitted
  | "danger"   // terminal closed, rejected
  | "success"; // settled positively (paid by user, cancelled by council)

export type CardKind =
  | "scanning"
  | "processing"
  | "pending_review"
  | "validating"
  | "needs_decision"
  | "gathering_evidence"
  | "drafting"
  | "letter_ready"
  | "submitting"
  | "submitted"
  | "terminal"
  // v0.3.5 — the user picked Appeal but the council's verdict came
  // back as paid / closed / not_found. We must NOT draft a letter we
  // can't file (matches the /api/submit gate). Recoverable: the user
  // can override and force a draft anyway, mark resolved, or pay.
  | "appeal_not_possible"
  // ─── failure kinds (v0.3.x — surfaced when the pipeline can't progress
  //     without user input). All five are recoverable: the user can retake
  //     the photo, edit fields manually, retry the council check, or move
  //     forward anyway. ───
  | "image_issue"            // OCR ran but the photo doesn't look like a PCN
  | "image_unclear"          // OCR ran but the read was low-confidence
  | "info_needed"            // some required fields are missing
  | "extraction_failed"      // OCR errored or timed out
  | "council_lookup_failed"; // portal check errored or timed out

/** v0.2.16 — sentinel value stamped into `appeal.step` once the user
 *  finishes the grounds quiz + evidence upload. Lets `deriveCardState`
 *  branch between "Appeal tapped, still gathering inputs" and "all
 *  inputs in, drafting can run". */
export const EVIDENCE_DONE_STEP = "evidence_gathered";

/** v0.3.6 — sentinel stamped into `appeal.step` when the user has
 *  tapped "Agree to continue" on the pending_review surface, confirming
 *  the OCR'd ticket fields are correct. Splits the post-OCR experience
 *  into two distinct steps:
 *
 *    - step !== TICKET_CONFIRMED_STEP → `pending_review`: editable
 *      fields + photo coach + Agree button. The customer must verify
 *      (or edit) the OCR before any decision tiles render.
 *    - step === TICKET_CONFIRMED_STEP → `needs_decision` (pre-lookup):
 *      Pay/Appeal tiles + "Edit details" link back to pending_review.
 *
 *  No cost is incurred by the Agree gesture — the council lookup is
 *  still only fired when the user picks Appeal (v0.3.5 lazy lookup). */
export const TICKET_CONFIRMED_STEP = "ticket_confirmed";

export interface CardState {
  kind: CardKind;
  /** Sub-flavor for needs_decision: "recommendation" | "escalated" | "expired". */
  flavor?: "recommendation" | "escalated" | "expired";
  /** Top-right pill label. Short, max ~16 chars. */
  pillLabel: string;
  pillTone: CardPillTone;
  /** Single rotating caption under the header. NULL = nothing to show. */
  caption: string | null;
  /** Visual progress indicator [0, 1]. NULL = no bar. */
  progress: number | null;
  /** When true, the card body shows an inline activity affordance
   *  (Watch live disclosure / live caption / progress bar). */
  inFlight: boolean;
  /** TicketStage derived from the snapshot (or "scanned" pre-snapshot). */
  stage: TicketStage;
  /** Useful for the body: can the user still appeal? */
  canAppeal: boolean;
  /** Useful for the body: is this a charge-cert/OFR/enforcement card? */
  isEscalated: boolean;
}

/**
 * Caption defaults — used when no live agent caption is streaming. Each
 * kind has a calm fallback line so the card never feels mute.
 */
const FALLBACK_CAPTION: Partial<Record<CardKind, string>> = {
  validating: "Checking with the council…",
  drafting: "Drafting your appeal…",
  submitting: "Filing your appeal…",
};

const MILESTONES_PER_KIND: Record<JobKindLive, number> = {
  pcn_lookup: 5,
  generate_draft: 4,
  submit_appeal: 6,
};

/** Client-supplied watchdog signals — the card raises these when a
 *  step has been spinning past its expected duration without a state
 *  change. Lets the pure-state derivation flip the kind into a clear
 *  failure so the user is never trapped in a permanent loader. */
export interface TimeoutFlags {
  /** OCR ("Reading PCN") has been running too long. */
  ocr?: boolean;
  /** Portal lookup ("Checking council") has been running too long. */
  portal?: boolean;
}

export function deriveCardState(
  appeal: AppealRecord,
  statusSnapshot: TicketStatusSnapshot | null,
  liveProgress: LiveProgress | null,
  timeouts: TimeoutFlags = {},
): CardState {
  const portal = appeal.portalLookup;
  const stage: TicketStage = statusSnapshot?.stage ?? "scanned";
  const canAppeal = statusSnapshot?.canAppeal ?? true;
  const isEscalated =
    stage === "charge_certificate_issued" ||
    stage === "order_for_recovery" ||
    stage === "enforcement";

  // ----- 1. Terminal first — short-circuits everything else. -----
  if (appeal.status === "cancelled") {
    return finalize({
      kind: "terminal",
      pillLabel: "Cancelled",
      pillTone: "success",
      caption: "Your appeal succeeded — nothing more to pay.",
      progress: null,
      inFlight: false,
      stage,
      canAppeal: false,
      isEscalated,
    });
  }
  if (appeal.status === "rejected") {
    return finalize({
      kind: "terminal",
      pillLabel: "Rejected",
      pillTone: "danger",
      caption: "The council rejected this appeal.",
      progress: null,
      inFlight: false,
      stage,
      canAppeal: false,
      isEscalated,
    });
  }
  if (stage === "paid") {
    return finalize({
      kind: "terminal",
      pillLabel: "Paid",
      pillTone: "success",
      caption: "Settled in full.",
      progress: null,
      inFlight: false,
      stage,
      canAppeal: false,
      isEscalated,
    });
  }
  if (stage === "closed") {
    return finalize({
      kind: "terminal",
      pillLabel: "Closed",
      pillTone: "danger",
      caption: "The issuer has closed this PCN.",
      progress: null,
      inFlight: false,
      stage,
      canAppeal: false,
      isEscalated,
    });
  }

  // ----- 2. Submitting — appeal mid-flight. -----
  if (
    appeal.status === "submitting" ||
    (liveProgress?.kind === "submit_appeal" &&
      (liveProgress.status === "queued" || liveProgress.status === "running"))
  ) {
    return finalize({
      kind: "submitting",
      pillLabel: "Submitting",
      pillTone: "info",
      caption:
        liveProgress?.latestThought ??
        liveProgress?.latestStep ??
        FALLBACK_CAPTION.submitting ??
        null,
      progress: progressFraction(liveProgress, "submit_appeal"),
      inFlight: true,
      stage,
      canAppeal,
      isEscalated,
    });
  }

  // ----- 3. Submitted — awaiting council reply. -----
  if (
    appeal.status === "submitted" ||
    appeal.status === "under_review" ||
    appeal.status === "decision_pending" ||
    stage === "appeal_submitted" ||
    stage === "under_review"
  ) {
    return finalize({
      kind: "submitted",
      pillLabel: "Submitted",
      pillTone: "positive",
      caption: "We'll notify you when the council replies.",
      progress: null,
      inFlight: false,
      stage,
      canAppeal: false,
      isEscalated,
    });
  }

  // ============================================================
  //   PCN extraction state machine — the spec's named states map
  //   onto the existing CardKind union as follows:
  //
  //     spec name              | CardKind          | trigger
  //     ───────────────────────|───────────────────|──────────────────────
  //     uploading              | (instant — no UI) | n/a — /api/appeals
  //                            |                   |   returns synchronously
  //     image_uploaded         | processing        | ocr.status pending
  //     extracting             | processing        | ocr.status running
  //     partially_extracted    | processing        | ocr running, some
  //                            |                   |   fields landed via
  //                            |                   |   Pass 1 (issuer)
  //     ready_to_confirm       | pending_review    | issuer + pcnRef +
  //                            |                   |   vehicleReg present
  //     validating_with_council| validating        | portal lookup running
  //     validation_complete    | needs_decision /  | portal lookup verdict
  //                            |   letter_ready /  |   landed
  //                            |   appeal_not_…    |
  //     extraction_failed      | extraction_failed | ocr.status=failed AND
  //                            |   / image_issue / |   critical fields
  //                            |   image_unclear   |   missing
  //
  //   Acceptance criteria the spec asks for, implemented here:
  //     • Never show failure while OCR is still running.
  //       → ocrRunning short-circuits to `processing`.
  //     • Never show failure when issuer + pcnRef + vehicleReg are
  //       all present (regardless of OCR status — a definitive
  //       "failed" status with all required fields means OCR's job
  //       is materially done; the user can confirm and proceed).
  //       → `hasAllRequired` check below short-circuits to
  //       `pending_review` BEFORE any failure branch.
  //     • `timeouts.ocr` (client watchdog flag) is NO LONGER a
  //       failure trigger. The card stays in `processing` even after
  //       the watchdog fires; the slow-OCR helper banner inside
  //       <ReadingPCNActive> (8 s timer) provides the user-visible
  //       escape hatch (manual entry / try another photo) without
  //       flipping the card kind.
  // ============================================================
  const ocrStep = appeal.processing?.ocr;
  const ocrRunning = ocrStep?.status === "running" || ocrStep?.status === "pending";
  const ocrFailed = ocrStep?.status === "failed";
  const ocrDone = ocrStep?.status === "done";
  // `timeouts.ocr` is retained on the interface for portal lookups +
  // any future use, but intentionally NOT consulted by the OCR
  // failure branches below — see the acceptance-criteria block above.
  void timeouts;
  // How many of the 4 critical PCN fields did OCR actually extract?
  // Used to disambiguate "not a PCN" from "PCN but blurry / cropped".
  const critical = [
    appeal.ticket?.pcnRef,
    appeal.ticket?.vehicleReg,
    appeal.ticket?.issuer,
    appeal.ticket?.amountPence,
  ].filter((v) => v != null && v !== "").length;
  const isPreLookup =
    appeal.status === "draft" &&
    !portal &&
    !appeal.preferredMethod &&
    !appeal.letterBody;
  // The spec's "ready_to_confirm" gate: all three council-validation
  // anchors (issuer, PCN reference, vehicle registration) are present.
  // When this holds, the card MUST land in `pending_review` regardless
  // of OCR status — a late `ocr.status="failed"` can no longer drag a
  // confirmable ticket back into the failure surface.
  const hasAllRequired =
    !!appeal.ticket?.issuer &&
    !!appeal.ticket?.pcnRef &&
    !!appeal.ticket?.vehicleReg;

  // ----- Ready to confirm — wins over both failure branches and the
  //         processing fallthrough. This is the load-bearing fix for
  //         the spec's "A late successful OCR result cannot be
  //         overwritten by an older failure/timeout" acceptance
  //         criterion: even if a stale `ocr.status="failed"` is on
  //         the row, the presence of the three required fields means
  //         the user has everything they need to proceed. -----
  if (isPreLookup && hasAllRequired && appeal.step !== TICKET_CONFIRMED_STEP) {
    return finalize({
      kind: "pending_review",
      pillLabel: "Confirm",
      pillTone: "info",
      caption: "Check these details and tap Agree when they look right.",
      progress: null,
      inFlight: false,
      stage,
      canAppeal,
      isEscalated,
    });
  }

  // ----- Confirm-tapped → validating transition. The agreeTicket
  //         handler PATCHes step=TICKET_CONFIRMED_STEP and POSTs
  //         /api/appeals/:id/lookup in parallel. The PATCH lands fast
  //         (~50 ms); the lookup POST takes longer (~500 ms+) to write
  //         portalLookup={status:"pending"}. During that race window
  //         step is set but portalLookup is still null — without this
  //         branch the state machine falls through pending_review's
  //         exclusion → into the image_unclear failure branch → user
  //         briefly sees "Couldn't read all details" on a perfectly
  //         valid ticket. (2026-05-27 audit: this is the "second
  //         confirm card asking again" symptom the user reported.)
  //         Show validating with a "Starting…" caption until the
  //         portalLookup write lands and the regular validating
  //         branch takes over. -----
  if (isPreLookup && hasAllRequired && appeal.step === TICKET_CONFIRMED_STEP) {
    return finalize({
      kind: "validating",
      pillLabel: "Validating",
      pillTone: "info",
      caption: "Starting council check…",
      progress: 0.1,
      inFlight: true,
      stage,
      canAppeal,
      isEscalated,
    });
  }

  // ----- OCR still running → processing. Per spec we NEVER enter a
  //         failure kind while OCR is in flight; the client watchdog
  //         no longer escalates to failure. The slow-OCR helper card
  //         inside ReadingPCNActive offers manual entry / re-shoot
  //         without changing the card kind. -----
  if (isPreLookup && ocrRunning) {
    return finalize({
      kind: "processing",
      pillLabel: "Processing",
      pillTone: "info",
      caption: "Reading your PCN…",
      progress: 0.35,
      inFlight: true,
      stage,
      canAppeal,
      isEscalated,
    });
  }

  // ----- OCR settled (done or failed) WITHOUT the three required
  //         fields → one of the failure variants. Copy + recovery
  //         affordances vary by how much we DID manage to read:
  //
  //         critical ≤ 1            → image_issue ("not a PCN")
  //         critical ≥ 2, missing   → image_unclear / extraction_failed
  //           one or more required  →   (the surface itself further
  //           fields                →   softens when the issuer was
  //                                 →   detected by Pass 1)
  //
  //         All three share the same recovery actions; the kind
  //         differentiation is purely for the headline copy. -----
  if (isPreLookup && (ocrDone || ocrFailed)) {
    if (critical <= 1) {
      return finalize({
        kind: "image_issue",
        pillLabel: "Action needed",
        pillTone: "warn",
        caption: "This doesn't look like a parking ticket.",
        progress: null,
        inFlight: false,
        stage,
        canAppeal,
        isEscalated,
      });
    }
    if (ocrFailed) {
      return finalize({
        kind: "extraction_failed",
        pillLabel: "Action needed",
        pillTone: "warn",
        caption: "Rabbit couldn't finish reading this PCN.",
        progress: null,
        inFlight: false,
        stage,
        canAppeal,
        isEscalated,
      });
    }
    return finalize({
      kind: "image_unclear",
      pillLabel: "Action needed",
      pillTone: "warn",
      caption: "We couldn't read this PCN clearly.",
      progress: null,
      inFlight: false,
      stage,
      canAppeal,
      isEscalated,
    });
  }

  // ----- Defensive fallthrough: appeal row exists but no OCR step
  //         has been recorded yet (e.g., immediately after row
  //         creation, before /api/extract has flipped status to
  //         "running"). Show processing until the first status
  //         write lands. -----
  if (
    isPreLookup &&
    (!appeal.ticket?.pcnRef || !appeal.ticket?.vehicleReg)
  ) {
    return finalize({
      kind: "processing",
      pillLabel: "Processing",
      pillTone: "info",
      caption: "Reading your PCN…",
      progress: null,
      inFlight: false,
      stage,
      canAppeal,
      isEscalated,
    });
  }

  // ----- 4. Validating — portal lookup in flight WITHOUT the user
  //         already being inside the Appeal flow. v0.3.5 — the lookup
  //         validate-first architecture (post v0.3.7): the lookup runs
  //         the moment OCR commits (auto-fired from /api/extract). The
  //         card's primary state until verdict lands is "validating" —
  //         no Pay/Appeal tiles, no editable price/date, just the live
  //         MCP screenshot strip + "Validating with [Council]…" caption.
  //
  //         When the council is non-automated (no MCP recipe), the
  //         status route returns an OCR-derived snapshot instead and
  //         this branch is skipped — the user goes straight to
  //         needs_decision with the OCR figures + an Unverified chip.
  //
  //         Signals that say "validating":
  //           1. portal.status === "pending"  — we've stamped the
  //              pending snapshot but the worker hasn't run yet.
  //           2. liveProgress is a queued/running pcn_lookup job.
  //           3. statusSnapshot.stage === "status_check_pending" —
  //              automated council with no portal_lookup row yet
  //              (e.g. the auto-fire is still in-flight on the server).
  const portalRunning =
    portal?.status === "pending" ||
    (liveProgress?.kind === "pcn_lookup" &&
      (liveProgress.status === "queued" || liveProgress.status === "running")) ||
    statusSnapshot?.stage === "status_check_pending";
  if (portalRunning) {
    return finalize({
      kind: "validating",
      pillLabel: "Validating",
      pillTone: "info",
      caption:
        liveProgress?.latestThought ??
        liveProgress?.latestStep ??
        FALLBACK_CAPTION.validating ??
        null,
      progress: progressFraction(liveProgress, "pcn_lookup"),
      inFlight: true,
      stage,
      canAppeal,
      isEscalated,
    });
  }

  // ----- 4a. Portal lookup errored (or timed out client-side) but
  //          the user has enough OCR'd data to keep going. Show an
  //          actionable failure inline so the user can retry the
  //          council check, edit details, or continue anyway. -----
  if (
    portal?.status === "error" ||
    (timeouts.portal && !portal)
  ) {
    return finalize({
      kind: "council_lookup_failed",
      pillLabel: "Check needed",
      pillTone: "warn",
      caption: "We couldn't check the council portal.",
      progress: null,
      inFlight: false,
      stage,
      canAppeal,
      isEscalated,
    });
  }

  // ----- 4b. Appeal not possible — v0.3.5. The user picked Appeal,
  //         the lazy lookup ran in parallel with the Build-appeal
  //         conversation, and the verdict came back as one the submit
  //         gate would refuse (paid / closed / not_found). Surface
  //         this BEFORE gathering_evidence/drafting so we never burn
  //         AI tokens on a letter that can't be filed. The user can
  //         still override via the existing override flow (sets
  //         portalLookup.status = "overridden") and continue drafting. -----
  if (
    appeal.preferredMethod === "portal" &&
    portal &&
    portal.status !== "overridden" &&
    (portal.verdict === "paid" ||
      portal.verdict === "closed" ||
      portal.verdict === "not_found") &&
    !appeal.letterBody
  ) {
    const verdictLabel =
      portal.verdict === "paid"
        ? "Already paid"
        : portal.verdict === "closed"
          ? "Closed"
          : "Not found";
    const verdictCaption =
      portal.verdict === "paid"
        ? "The council says this PCN is already paid — no appeal needed."
        : portal.verdict === "closed"
          ? "The council has already closed this PCN."
          : "The council can't find this PCN in their system.";
    return finalize({
      kind: "appeal_not_possible",
      pillLabel: verdictLabel,
      pillTone: portal.verdict === "paid" ? "success" : "warn",
      caption: verdictCaption,
      progress: null,
      inFlight: false,
      stage,
      canAppeal: false,
      isEscalated,
    });
  }

  // ----- 5a. Gathering evidence — user tapped "Appeal with Rabbit",
  //         preferredMethod is stamped, but we still need their grounds
  //         + evidence before the AI draft can run. The card body shows
  //         the inline grounds quiz + evidence carousel here. (v0.2.16) -----
  if (
    appeal.preferredMethod === "portal" &&
    !appeal.letterBody &&
    appeal.step !== "generation_failed" &&
    appeal.step !== EVIDENCE_DONE_STEP
  ) {
    return finalize({
      kind: "gathering_evidence",
      pillLabel: "Tell us more",
      pillTone: "info",
      caption: "Two quick questions, then Rabbit drafts your appeal.",
      progress: null,
      inFlight: false,
      stage,
      canAppeal,
      isEscalated,
    });
  }

  // ----- 5b. Drafting — letter being generated. v0.3.6: we also fall
  //         INTO this branch when step === "generation_failed" so the
  //         card surfaces the failure + a Retry button inside the
  //         drafting body, instead of silently falling through to the
  //         decision tiles (which would lose the error context). -----
  if (
    appeal.preferredMethod === "portal" &&
    !appeal.letterBody
  ) {
    return finalize({
      kind: "drafting",
      pillLabel: "Drafting",
      pillTone: "info",
      caption:
        liveProgress?.latestThought ??
        liveProgress?.latestStep ??
        FALLBACK_CAPTION.drafting ??
        null,
      progress: progressFraction(liveProgress, "generate_draft"),
      inFlight: true,
      stage,
      canAppeal,
      isEscalated,
    });
  }

  // ----- 6. Letter ready — awaiting customer's Submit £2.99. -----
  if (
    appeal.letterBody &&
    appeal.preferredMethod === "portal" &&
    (appeal.status === "draft" || appeal.status === "ready")
  ) {
    return finalize({
      kind: "letter_ready",
      pillLabel: "Ready to submit",
      pillTone: "positive",
      caption: "Your appeal letter is ready — submit when you're ready.",
      progress: null,
      inFlight: false,
      stage,
      canAppeal,
      isEscalated,
    });
  }

  // ----- 7. Needs decision — the recommendation card lives here. -----
  if (isEscalated) {
    return finalize({
      kind: "needs_decision",
      flavor: "escalated",
      pillLabel: stageBadgeLabel(stage),
      pillTone: "warn",
      caption: "This PCN has been escalated. Settle with the council below.",
      progress: null,
      inFlight: false,
      stage,
      canAppeal: false,
      isEscalated,
    });
  }
  if (statusSnapshot && !canAppeal) {
    return finalize({
      kind: "needs_decision",
      flavor: "expired",
      pillLabel: "Appeal expired",
      pillTone: "warn",
      caption: "The 28-day appeal window has closed.",
      progress: null,
      inFlight: false,
      stage,
      canAppeal: false,
      isEscalated,
    });
  }

  // Recommendation card surface (open window).
  //
  // Validate-first rule: we only show the Pay + Appeal tiles when we
  // have an *actionable* status snapshot — i.e. either:
  //   - A real portal_lookup result wrote canAppeal/canPay, OR
  //   - The OCR fallback (non-automated council) returned a snapshot
  //     with a concrete stage (appeal_open / appeal_expired).
  //
  // We DELIBERATELY don't fall back to "show tiles because OCR data
  // looks complete". For automated councils the server returns a
  // status_check_pending snapshot that's caught by the validating
  // branch above; we never reach this code path with a missing
  // statusSnapshot on an automated council. The only legitimate
  // pre-snapshot decision surface is when there's no councilSlug
  // resolved at all (rare; pre-OCR), and that should stay in scanning.
  const showDecision = !!statusSnapshot && stage !== "status_check_pending";
  return finalize({
    kind: showDecision ? "needs_decision" : "scanning",
    flavor: showDecision ? "recommendation" : undefined,
    pillLabel: showDecision ? "Open" : "Scanning",
    pillTone: showDecision ? "positive" : "muted",
    caption: showDecision
      ? "Choose how to handle this ticket."
      : "Reading your ticket…",
    progress: null,
    inFlight: !showDecision,
    stage,
    canAppeal,
    isEscalated,
  });
}

function progressFraction(
  live: LiveProgress | null,
  expectedKind: JobKindLive,
): number | null {
  if (!live || live.kind !== expectedKind) return null;
  if (live.status === "queued") return 0.05;
  const total = MILESTONES_PER_KIND[expectedKind];
  if (live.status === "done") return 1;
  if (live.milestonesReached <= 0) return 0.1;
  return Math.min(0.95, live.milestonesReached / total);
}

function stageBadgeLabel(stage: TicketStage): string {
  switch (stage) {
    case "charge_certificate_issued":
      return "Charge cert";
    case "order_for_recovery":
      return "Order for Recovery";
    case "enforcement":
      return "Enforcement";
    default:
      return "Action needed";
  }
}

// Identity helper that exists to make the object-spread + flavor handling
// at every return site readable; TS infers the union correctly.
function finalize(s: CardState): CardState {
  return s;
}
