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

  // ----- 3a. Processing — appeal row exists but OCR hasn't returned
  //         field data yet. v0.2.15 — progressive ticket creation routes
  //         the user to the smart card the instant we have an appealId,
  //         and the OCR / status-check / analysis pipelines fan out in
  //         the background. The card renders inline status rows here
  //         ("Reading PCN details…") instead of a full-screen blocker. -----
  const ocrStep = appeal.processing?.ocr;
  const ocrRunning = ocrStep?.status === "running" || ocrStep?.status === "pending";
  const ocrFailed = ocrStep?.status === "failed";
  const ocrTimedOut = !!timeouts.ocr && ocrRunning;
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

  // ----- 3.x — OCR failure / timeout. The pipeline can't progress
  //         without a real read. Surface a clear "Reading failed" state
  //         with retry / manual entry / re-upload options.
  //
  //         v0.3.11 — manual-entry trap guard. The failure card is only
  //         a dead-end while the required PCN data is missing. If the
  //         user has since supplied pcnRef + vehicleReg via
  //         /app/manual-entry (or inline edit), we have everything we
  //         need to proceed — fall through to pending_review so the
  //         normal "Confirm details" + lookup flow can take over.
  //         Belt-and-braces against any future caller that writes
  //         ticket data without clearing processing.ocr.status.
  //         (patchAppealDraft also clears the failed flag on its own.) -----
  const hasManualTicketData =
    !!appeal.ticket?.pcnRef && !!appeal.ticket?.vehicleReg;
  if (isPreLookup && (ocrFailed || ocrTimedOut) && !hasManualTicketData) {
    return finalize({
      kind: "extraction_failed",
      pillLabel: "Action needed",
      pillTone: "warn",
      caption: ocrTimedOut
        ? "Reading is taking longer than expected — try again."
        : "Rabbit couldn't finish reading this PCN.",
      progress: null,
      inFlight: false,
      stage,
      canAppeal,
      isEscalated,
    });
  }

  // ----- 3.y — OCR ran but the photo doesn't look like a PCN at all.
  //         Heuristic: zero or one of the four critical fields came back.
  //         (A genuine PCN photo will have at least the PCN ref AND a
  //         vehicle reg, usually all four.) -----
  if (isPreLookup && !ocrRunning && ocrStep?.status === "done" && critical <= 1) {
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

  if (
    isPreLookup &&
    (ocrRunning || !appeal.ticket?.pcnRef || !appeal.ticket?.vehicleReg)
  ) {
    return finalize({
      kind: "processing",
      pillLabel: "Processing",
      pillTone: "info",
      caption: "Reading your PCN…",
      progress: ocrRunning ? 0.35 : null,
      inFlight: ocrRunning,
      stage,
      canAppeal,
      isEscalated,
    });
  }

  // ----- 3b. Pending review — OCR has run, ticket fields are on the
  //         appeal, the user hasn't tapped "Agree" yet (step is not the
  //         confirmed sentinel). v0.3.6 — Agree is the explicit
  //         confirmation gesture before Pay/Appeal tiles appear; the
  //         user can also edit the PCN ref / vehicle reg / council
  //         picker inline here if OCR misread anything. -----
  if (
    appeal.status === "draft" &&
    !portal &&
    !appeal.preferredMethod &&
    !appeal.letterBody &&
    appeal.ticket?.pcnRef &&
    appeal.ticket?.vehicleReg &&
    appeal.step !== TICKET_CONFIRMED_STEP
  ) {
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
