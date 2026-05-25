"use client";

/**
 * TicketCardBody — the action surface that renders inside the expanded
 * `<TicketCard>`. Strict consumer of the precomputed `CardState`: every
 * branch here is driven by `state.kind` + `state.flavor`. No state
 * derivation happens in this file.
 *
 * Replaces:
 *   - components/TicketActionPanel.tsx (9 surfaces collapsed to 7 kinds)
 *   - the per-state cards that used to mount alongside the panel
 *
 * Inline passive banners replace the standalone <PassiveStatusBanner>:
 *   validating / drafting / submitting all render as a quiet status row
 *   inside the card body — no full-page overlay.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Lock,
  Mic,
  Plus,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { LetterPreview } from "@/components/LetterPreview";
import type { LucideIcon } from "lucide-react";
import { EvidenceCarousel } from "@/components/EvidenceCarousel";
import {
  getEvidencePhotos,
  setEvidencePhotos,
  type OcrHandoff,
} from "@/lib/client/session";
import { ReviewRecommendation } from "@/components/ReviewRecommendation";
import type { AppealRecord } from "@/lib/server/appeals";
import type { CardState } from "@/lib/deriveCardState";
import type { TicketStatusSnapshot } from "@/lib/server/connectors/types";

interface CouncilOption {
  slug: string;
  name: string;
  appealPortalUrl?: string | null;
  logoUrl?: string | null;
  logoBg?: string | null;
}

interface Props {
  appeal: AppealRecord;
  state: CardState;
  /** Resolved council `appealPortalUrl` (or snapshot.paymentUrl). */
  payUrl: string | null;
  councilName: string | null;
  /** v0.2.17 — list of councils for the inline council picker on the
   *  pending_review surface. NULL until /api/councils responds. */
  councils?: CouncilOption[] | null;
  statusSnapshot: TicketStatusSnapshot | null;
  /** Kicks off paid Appeal: PATCH preferredMethod=portal, starts drafting. */
  onStartAppeal: () => void;
  /** Opens the £2.99 PaymentSheet. */
  onOpenPaymentSheet: () => void;
  /** Lookup override — only relevant in `terminal` flavored as invalid-verdict. */
  onOverrideLookup?: () => void;
  /** v0.2.14 — fired when the user taps "I agree to T&Cs" in the
   *  pending_review state. The card POSTs /api/appeals/[id]/lookup. */
  onConfirmTicket?: () => void;
  /** Fired when the user finishes the grounds quiz + dictation in the
   *  gathering_evidence state. The card PATCHes grounds + notes + step
   *  sentinel atomically then triggers /api/generate-stream. */
  onConfirmEvidence?: (input: { grounds: string[]; notes: string }) => void;
  /** Re-scores the appeal with the latest evidence photos (no redraft).
   *  Surfaced inside PaidSubmitCta when the strength scorer flagged the
   *  draft as weak — adding evidence updates the score in place. */
  onRescoreWithEvidence?: (photos: string[]) => Promise<void> | void;
  /** v0.2.17 — debounced PATCH of a single ticket field (PCN ref /
   *  vehicle reg / council slug). Fired from the editable inputs +
   *  council select on PendingReviewCard. */
  onEditTicketField?: (
    field:
      | "pcnRef"
      | "vehicleReg"
      | "councilSlug"
      | "amountPence"
      | "issuedAt"
      | "location",
    value: string,
  ) => void;
  /** Pending-review pcn image data URL (sessionStorage handoff). */
  pcnImage?: string | null;
  /** Pending-review OCR confidence + photo-coach handoff. */
  ocrHandoff?: OcrHandoff | null;
  /** Set while a method-pick or submit is in flight. */
  busy?: boolean;
}

export function TicketCardBody({
  appeal,
  state,
  payUrl,
  councilName,
  statusSnapshot,
  onStartAppeal,
  onOpenPaymentSheet,
  onOverrideLookup,
  onConfirmTicket,
  onConfirmEvidence,
  onRescoreWithEvidence,
  onEditTicketField,
  pcnImage,
  ocrHandoff,
  busy,
}: Props) {
  switch (state.kind) {
    case "processing":
      return (
        <ProcessingCard
          appeal={appeal}
          pcnImage={pcnImage ?? appeal.pcnImageUrl ?? null}
          state={state}
        />
      );
    case "pending_review":
      return (
        <PendingReviewCard
          appeal={appeal}
          ocrHandoff={ocrHandoff ?? null}
          onConfirm={onConfirmTicket ?? (() => {})}
          onEditField={onEditTicketField}
          busy={busy}
        />
      );
    case "scanning":
    case "validating":
      return (
        <InlineStatusRow
          icon={ShieldCheck}
          title="Validating with the council"
          body={
            state.caption ??
            "Reading the council portal to confirm what's on record."
          }
          tone="info"
        />
      );
    case "drafting":
      return (
        <InlineStatusRow
          icon={Sparkles}
          title="Drafting your appeal"
          body={
            state.caption ??
            "ParkingRabbit AI is writing your appeal letter — usually 20–30 seconds."
          }
          tone="info"
        />
      );
    case "submitting":
      return (
        <InlineStatusRow
          icon={Loader2}
          title="Filing your appeal"
          body={
            state.caption ??
            "ParkingRabbit AI is operating the council portal."
          }
          tone="info"
        />
      );
    case "gathering_evidence":
      return (
        <GatheringEvidenceCard
          appeal={appeal}
          busy={busy}
          onConfirm={onConfirmEvidence ?? (() => {})}
        />
      );
    case "letter_ready":
      return (
        <PaidSubmitCta
          appeal={appeal}
          busy={busy}
          onOpenPaymentSheet={onOpenPaymentSheet}
          onRescoreWithEvidence={onRescoreWithEvidence}
        />
      );
    case "submitted":
      return (
        <div className="flex flex-col gap-3">
          <SubmittedCard appeal={appeal} />
          {appeal.letterBody && (
            <LetterPreview
              appealId={appeal.id}
              subject={appeal.letterSubject}
              body={appeal.letterBody}
              wordCount={appeal.letterWordCount}
              defaultOpen={false}
            />
          )}
        </div>
      );
    case "terminal":
      return <TerminalCard state={state} appeal={appeal} statusSnapshot={statusSnapshot} onOverrideLookup={onOverrideLookup} />;
    case "needs_decision":
      if (state.flavor === "escalated") {
        return (
          <EscalationCard
            statusSnapshot={statusSnapshot}
            payUrl={payUrl}
            councilName={councilName}
            state={state}
          />
        );
      }
      // expired + recommendation both go through ReviewRecommendation —
      // the card itself branches on canAppeal internally.
      return (
        <ReviewRecommendation
          onStartAppeal={onStartAppeal}
          payUrl={payUrl}
          councilName={councilName}
          canAppeal={state.canAppeal && !!appeal.councilSlug}
          daysLeftToAppeal={statusSnapshot?.daysLeftToAppeal ?? null}
          busy={busy}
        />
      );
    case "info_needed":
      // Same surface as pending_review — the user fills in the missing
      // fields inline; the only difference is the lifecycle step shows
      // a failed badge instead of an active loader.
      return (
        <PendingReviewCard
          appeal={appeal}
          ocrHandoff={ocrHandoff ?? null}
          onConfirm={onConfirmTicket ?? (() => {})}
          onEditField={onEditTicketField}
          busy={busy}
        />
      );
    case "image_issue":
    case "image_unclear":
    case "extraction_failed":
    case "council_lookup_failed":
      // Failure UIs render directly inside the lifecycle step that
      // owns the failure (Retake / Choose another / Continue anyway).
      // The body has nothing to add here.
      return null;
  }
}

/* ──────────── processing (v0.2.15) ────────────
 *
 * Progressive ticket creation surface. Renders the instant the appeal
 * row is created on the server (before OCR has finished), and stays
 * up while each backend step does its work. Three inline status rows:
 *
 *   1. Reading PCN details — OCR running (Claude vision)
 *   2. Checking issuer portal — pending until OCR settles + lookup runs
 *   3. Generating recommendation — surfaced once the snapshot lands
 *
 * No full-screen blocker, no fake percentages — each row shows its own
 * status (running / done / failed) and surfaces an inline retry on
 * failure. The PCN image stays at the top of the card so the user
 * always sees what they uploaded.
 *
 * Why progressive: blocking the customer on a full-page "Reading your
 * PCN" overlay made the app feel fragile when OCR / portal lookup /
 * AI analysis took >5 seconds. Progressive creation routes the user
 * to a real ticket immediately; they can leave, come back, refresh,
 * and the state stays consistent because it's all persisted on the
 * appeal row.
 */
function ProcessingCard({
  appeal,
  pcnImage,
  state,
}: {
  appeal: AppealRecord;
  pcnImage: string | null;
  state: CardState;
}) {
  const ocr = appeal.processing?.ocr;
  const ocrStatus = ocr?.status ?? (appeal.ticket?.pcnRef ? "done" : "pending");
  const ocrError = ocr?.error ?? null;

  return (
    <section className="rounded-3xl bg-white border border-snappeal-border p-5 flex flex-col gap-4">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-snappeal-primary">
          {state.pillLabel === "Needs review" ? "Couldn't read photo" : "Setting up your ticket"}
        </p>
        <p className="text-[15px] font-bold text-snappeal-navy mt-1 leading-tight">
          {state.pillLabel === "Needs review"
            ? "We hit a snag reading your PCN."
            : "Hold tight — Rabbit is reading your PCN now."}
        </p>
        <p className="text-[12px] text-snappeal-muted mt-1 leading-snug">
          You&apos;ll get a notification as soon as scanning&apos;s done.
          Feel free to leave this page — your ticket keeps working in the
          background, and you can pop back any time to see progress.
        </p>
      </div>

      {/* Uploaded image preview — always at the top so the user sees what
       *  they sent in. Falls back to a placeholder if the photo isn't in
       *  this tab's sessionStorage (cross-device load). */}
      {pcnImage && (
        <div className="rounded-2xl overflow-hidden border border-snappeal-border bg-snappeal-bg">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL or Blob URL */}
          <img
            src={pcnImage}
            alt="Your PCN"
            className="w-full h-auto object-contain max-h-64"
          />
        </div>
      )}

      {/* All three sections always render as a live checklist — pending
       *  rows show as muted "up next" so the user understands the full
       *  pipeline even while OCR is still in flight. Each row reflects
       *  the persisted state on `appeal.processing` / `appeal.portalLookup`
       *  so a refresh restores the same view.
       *
       *  Section 1 — OCR (ticket field extraction). */}
      <ProcessingStepRow
        title="Reading PCN details"
        running={
          ocrStatus === "running" || ocrStatus === "pending"
            ? "Rabbit is extracting the PCN reference, vehicle registration, issuer, amount, and dates."
            : null
        }
        done={ocrStatus === "done" ? "Captured." : null}
        errorMessage={ocrStatus === "failed" ? ocrError ?? "Couldn't read the photo." : null}
        pendingMessage="Up next."
        icon={Sparkles}
      />

      {/* Section 2 — issuer portal lookup. Reflects portalLookup.status
       *  when available, otherwise shows as pending until OCR finishes. */}
      <ProcessingStepRow
        title="Checking issuer portal"
        running={
          appeal.portalLookup?.status === "pending"
            ? "Rabbit is checking the official issuer website for current status, amount due, and appeal/payment options."
            : null
        }
        done={
          appeal.portalLookup?.status === "verified" ||
          appeal.portalLookup?.status === "invalid" ||
          appeal.portalLookup?.status === "overridden"
            ? "Confirmed with the council."
            : null
        }
        errorMessage={
          appeal.portalLookup?.status === "error"
            ? appeal.portalLookup?.verdictReason ?? "Couldn't reach the portal."
            : null
        }
        pendingMessage={
          ocrStatus === "done"
            ? "Waiting for you to confirm the ticket details."
            : "Up next, once the PCN details are read."
        }
        icon={ShieldCheck}
      />

      {/* Section 3 — AI appeal analysis. Reflects processing.analysis when
       *  set; otherwise shows as pending until the user starts an appeal. */}
      <ProcessingStepRow
        title="Generating recommendation"
        running={
          appeal.processing?.analysis?.status === "running" ||
          appeal.processing?.analysis?.status === "pending"
            ? "Rabbit is reviewing possible grounds for appeal."
            : null
        }
        done={
          appeal.processing?.analysis?.status === "done"
            ? "Ready for review."
            : null
        }
        errorMessage={
          appeal.processing?.analysis?.status === "failed"
            ? appeal.processing?.analysis?.error ?? "Couldn't analyse the appeal."
            : null
        }
        pendingMessage="Up next, after the portal check."
        icon={Sparkles}
      />

      {/* Failure retry — only surfaces when OCR specifically failed. */}
      {ocrStatus === "failed" && (
        <Link
          href="/app/capture"
          className="self-start inline-flex items-center gap-1.5 rounded-2xl bg-snappeal-navy text-white font-semibold text-[13px] px-4 py-2.5 hover:bg-snappeal-navy/90 transition"
        >
          <Camera className="size-4" strokeWidth={2.25} />
          Try again with a clearer photo
        </Link>
      )}
    </section>
  );
}

function ProcessingStepRow({
  title,
  running,
  done,
  errorMessage,
  pendingMessage,
  icon: Icon,
}: {
  title: string;
  running: string | null;
  done: string | null;
  errorMessage: string | null;
  /** Shown when none of running/done/errorMessage are set — renders the
   *  row as a muted "up next" placeholder so the user sees the full
   *  pipeline as a checklist. */
  pendingMessage?: string;
  icon: LucideIcon;
}) {
  const isRunning = !!running && !done && !errorMessage;
  const isDone = !!done;
  const isFailed = !!errorMessage;
  const isPending = !isRunning && !isDone && !isFailed;
  const tone = isFailed
    ? "bg-red-50 text-red-700 border-red-200"
    : isDone
      ? "bg-green-50 text-green-700 border-green-200"
      : isPending
        ? "bg-snappeal-bg text-snappeal-muted border-snappeal-border"
        : "bg-snappeal-primary-50 text-snappeal-primary border-snappeal-primary/20";
  return (
    <div className={`rounded-2xl border p-3.5 flex items-start gap-3 ${tone}`}>
      <span className="size-9 rounded-xl bg-white shrink-0 flex items-center justify-center">
        {isRunning ? (
          <Loader2 className="size-4 animate-spin text-snappeal-primary" strokeWidth={2.25} />
        ) : isFailed ? (
          <AlertTriangle className="size-4 text-red-700" strokeWidth={2.25} />
        ) : isDone ? (
          <CheckCircle2 className="size-4 text-green-700" strokeWidth={2.25} />
        ) : (
          <Icon className="size-4 text-snappeal-muted" strokeWidth={2} />
        )}
      </span>
      <div className="flex-1 min-w-0">
        <p className={`text-[13px] font-bold ${isPending ? "text-snappeal-muted" : "text-snappeal-navy"}`}>
          {title}
          {isRunning && (
            <span className="text-snappeal-muted font-semibold">…</span>
          )}
        </p>
        <p className="text-[11.5px] mt-0.5 leading-snug text-snappeal-navy/70">
          {errorMessage ?? done ?? running ?? pendingMessage}
        </p>
      </div>
    </div>
  );
}

/* ──────────── pending review (v0.2.14) ────────────
 *
 * After /app/capture uploads the photo and OCR succeeds, the user lands
 * directly on the smart card here. The card shows the photo at the top,
 * the OCR'd fields with confidence pills, the resolved council, and a
 * single "I agree to T&Cs" button. On submit we check whether both PCN
 * ref + vehicle reg came back HIGH confidence ("two greens") AND the
 * photo coach said quality === "good"; if not, we surface an inline
 * popup with "Try again" / "Use anyway" so the user is never surprised
 * by a poor-quality submission.
 */

function PendingReviewCard({
  appeal,
  ocrHandoff,
  onConfirm,
  onEditField,
  busy,
}: {
  appeal: AppealRecord;
  ocrHandoff: OcrHandoff | null;
  onConfirm: () => void;
  /** v0.2.17 — debounced PATCH of a single ticket field. Numeric
   *  (amountPence) and date (issuedAt) values are forwarded as strings;
   *  the parent handler coerces / persists them appropriately. */
  onEditField?: (
    field:
      | "pcnRef"
      | "vehicleReg"
      | "councilSlug"
      | "amountPence"
      | "issuedAt"
      | "location",
    value: string,
  ) => void;
  busy?: boolean;
}) {
  const ticket = appeal.ticket;
  const coach = ocrHandoff?.photoCoach ?? null;
  // Optimistic local state so typing feels instant even on a slow PATCH.
  // Only the two fields the council lookup actually needs are editable
  // here — PCN reference + registration. Amount and issue date are NOT
  // shown/edited at this stage: the OCR'd figures are treated as a
  // preview and the council's record is authoritative once verified, so
  // surfacing an editable (and occasionally misread) amount here just
  // invited mistrust.
  const [pcnRefLocal, setPcnRefLocal] = useState<string>(ticket?.pcnRef ?? "");
  const [vehicleRegLocal, setVehicleRegLocal] = useState<string>(
    ticket?.vehicleReg ?? "",
  );
  // Sync local state when the appeal row refreshes (e.g. from a
  // reconciliation poll). All setStates are external-sync (prop->state).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setPcnRefLocal(ticket?.pcnRef ?? "");
    setVehicleRegLocal(ticket?.vehicleReg ?? "");
  }, [ticket?.pcnRef, ticket?.vehicleReg]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Inline-validate: PCN ref + vehicle reg + council are the minimum
  // we need to fire the council lookup. Amount / date / location are
  // helpful but can be filled by the portal check itself.
  const councilSlug = appeal.councilSlug ?? appeal.ticket?.councilSlug ?? null;
  const fieldsFilled =
    pcnRefLocal.trim().length > 0 &&
    vehicleRegLocal.trim().length > 0 &&
    !!councilSlug;

  const submit = () => {
    if (busy) return;
    if (!fieldsFilled) return;
    onConfirm();
  };

  return (
    // No outer rounded card wrapper, no duplicate "Confirm your
    // ticket" header — the parent lifecycle step ("Confirm details" /
    // "Check the details below.") already provides the section
    // framing. Just the editable fields, stacked vertically full-width.
    <section className="flex flex-col gap-2.5 relative">
      <EditableFieldRow
        label="PCN reference"
        value={pcnRefLocal}
        onChange={(v) => {
          const upper = v.toUpperCase();
          setPcnRefLocal(upper);
          onEditField?.("pcnRef", upper);
        }}
        placeholder="WC12345678"
        autoCapitalize="characters"
      />
      <EditableFieldRow
        label="Registration"
        value={vehicleRegLocal}
        onChange={(v) => {
          const upper = v.toUpperCase();
          setVehicleRegLocal(upper);
          onEditField?.("vehicleReg", upper);
        }}
        placeholder="AB12 CDE"
        autoCapitalize="characters"
      />
      {/* Issuing council field lives on the council logo tile in the
       *  ticket header — tapping the square logo opens the picker.
       *  Amount + issue date are intentionally NOT editable here: the
       *  council's record is authoritative once verified, so we don't
       *  surface a (sometimes misread) amount for the user to second-
       *  guess at this stage. */}

      {/* Photo-coach hint (only when not "good") */}
      {coach && coach.quality !== "good" && coach.advice && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-2.5">
          <AlertTriangle
            className="size-3.5 text-amber-700 mt-0.5 shrink-0"
            strokeWidth={2.25}
          />
          <div className="flex-1 min-w-0">
            <p className="text-[11.5px] font-bold text-amber-900">
              {coach.quality === "ok" ? "Photo could be sharper" : "Photo looks rough"}
            </p>
            <p className="text-[11px] text-amber-900/80 mt-0.5 leading-snug">
              {coach.advice}
            </p>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={busy || !fieldsFilled}
        className="rounded-2xl bg-snappeal-primary text-white font-bold py-3.5 hover:bg-snappeal-primary-600 transition disabled:opacity-60 flex items-center justify-center gap-2 shadow-lg shadow-snappeal-primary/30 active:scale-[0.99]"
      >
        {busy ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Starting validation…
          </>
        ) : (
          <>
            <ShieldCheck className="size-4" strokeWidth={2.25} />
            I agree and confirm details
          </>
        )}
      </button>

      <p className="text-[10.5px] text-snappeal-muted text-center leading-snug">
        By tapping above you confirm these details and agree to our{" "}
        <Link
          href="/terms"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-snappeal-navy"
        >
          Terms &amp; Conditions
        </Link>
        .
      </p>

    </section>
  );
}

/** Inline-editable field row. Used for every extracted detail on the
 *  Confirm-your-ticket surface (PCN ref, vehicle reg, amount, issue
 *  date, location). The row IS the input — no extra pencil affordance;
 *  the focus ring on tap signals editability. */
function EditableFieldRow({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  prefix,
  inputMode,
  autoCapitalize,
  tight = false,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  type?: "text" | "date";
  /** Static prefix glyph shown left of the input (e.g. "£"). */
  prefix?: string;
  inputMode?: "decimal" | "numeric" | "text";
  autoCapitalize?: "characters" | "off";
  /** Half-width compact mode: nowrap label, responsive value font,
   *  ellipsis on overflow. Used by the PCN ref + Registration row,
   *  which has to fit two columns on the narrowest mobile widths. */
  tight?: boolean;
}) {
  // For tight rows, scale the value font down once content gets long
  // (>10 chars) so a 12-char PCN ref stops pushing the input wider
  // than its column. Negative letter-spacing closes the visual gap.
  const valueShrink = tight && value.length > 10;
  const valueStyle: React.CSSProperties | undefined = tight
    ? {
        fontSize: valueShrink ? "clamp(14px, 3.6vw, 18px)" : "clamp(15px, 4vw, 20px)",
        letterSpacing: valueShrink ? "-0.02em" : undefined,
      }
    : undefined;
  return (
    <label
      className={`rounded-xl border border-snappeal-border flex flex-col gap-0.5 focus-within:border-snappeal-primary focus-within:ring-2 focus-within:ring-snappeal-primary/15 transition min-w-0 ${
        tight ? "p-3 max-[380px]:p-2.5" : "p-3"
      }`}
    >
      <span
        className="text-[11px] uppercase text-snappeal-muted whitespace-nowrap overflow-hidden text-ellipsis"
        style={{ letterSpacing: "0.04em" }}
      >
        {label}
      </span>
      <div className="flex items-center gap-1.5 min-w-0">
        {prefix && (
          <span
            className={`font-bold text-snappeal-navy shrink-0 ${
              tight ? "text-[16px]" : "text-[14px]"
            }`}
          >
            {prefix}
          </span>
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          inputMode={inputMode}
          autoCapitalize={autoCapitalize ?? "off"}
          spellCheck={false}
          style={valueStyle}
          className={`flex-1 min-w-0 bg-transparent font-bold text-snappeal-navy focus:outline-none placeholder:text-snappeal-muted/60 overflow-hidden text-ellipsis whitespace-nowrap ${
            tight ? "" : "text-[14px]"
          }`}
        />
      </div>
    </label>
  );
}

/* ──────────── shared inline status row (replaces PassiveStatusBanner) ──────────── */

function InlineStatusRow({
  icon: Icon,
  title,
  body,
  tone,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  tone: "info" | "warn" | "positive";
}) {
  const palette =
    tone === "info"
      ? "bg-snappeal-primary-50 text-snappeal-primary"
      : tone === "warn"
        ? "bg-amber-50 text-amber-700"
        : "bg-green-50 text-green-700";
  return (
    <section className="rounded-2xl bg-white border border-snappeal-border p-4 flex items-start gap-3">
      <span className={`size-10 rounded-xl flex items-center justify-center shrink-0 ${palette}`}>
        <span className="relative">
          <Icon className="size-5" strokeWidth={2} />
          <Loader2
            className="size-3 animate-spin absolute -top-1 -right-1.5 text-snappeal-primary"
            strokeWidth={2.5}
          />
        </span>
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-snappeal-navy">{title}</p>
        <p className="text-[11.5px] text-snappeal-muted mt-1 leading-snug">{body}</p>
      </div>
    </section>
  );
}

/* ──────────── gathering evidence (v0.2.16, three-step v0.2.19) ────────────
 *
 * After the user taps "Appeal with Rabbit" on the recommendation card,
 * the card flips into this state. We collect three things before the
 * drafter fires:
 *
 *   1. Grounds — multi-select from the 75-card catalog (required).
 *   2. Evidence — up to 6 photos via the existing EvidenceCarousel
 *      (optional). Persisted to sessionStorage so /api/generate-stream
 *      can ride them.
 *   3. Voice note / free text — DictationPanel (optional). Tells the
 *      drafter what actually happened in the user's own words.
 *
 * Sections are numbered, each unlocks once the previous has at least a
 * minimum-viable input (so the page doesn't dump three big panes on
 * the user at once). On "Start drafting" the parent PATCHes grounds +
 * notes + step sentinel atomically and fires /api/generate-stream;
 * evidence photos ride along from sessionStorage.
 */
/* ──────────── Build appeal — conversational reason picker (v0.3.4) ────────────
 *
 * The customer-facing "build your appeal" surface, rebuilt as a calm,
 * ChatGPT-style experience instead of a ranked card list:
 *
 *   1. "What happened?" — a single premium composer where the user
 *      describes the problem in their own words (type, dictate, or attach
 *      a photo). This free text is the `notes` the drafter reads.
 *   2. "Common reasons" — wrapped pills (flex-wrap, no horizontal scroll).
 *      Tapping one selects it (blue, slightly raised — never green) and
 *      expands an inline explainer with the evidence that helps most.
 *   3. Evidence — three premium tiles (Camera / Upload / Voice).
 *
 * Each reason still maps to a small handful of canonical card IDs from
 * `grounds-catalog.ts`, so the AI drafter receives the same `grounds`
 * shape it always has.
 */

interface CommonReason {
  id: string;
  /** Short pill label. */
  label: string;
  /** Heading shown in the inline expander. */
  title: string;
  /** One-sentence plain-English explanation. */
  explanation: string;
  /** The evidence that strengthens this reason most. */
  evidence: string[];
  /** Catalog card IDs forwarded to the drafter when chosen. */
  groundIds: string[];
}

const COMMON_REASONS: CommonReason[] = [
  {
    id: "broke-down",
    label: "My car broke down",
    title: "My car broke down",
    explanation:
      "Your vehicle became immobilised through no fault of your own, so it couldn't be moved.",
    evidence: [
      "Recovery / garage invoice or report",
      "AA / RAC call-out reference",
      "Photos of the breakdown",
    ],
    groundIds: ["breakdown-mechanical", "breakdown-aa-rac-attended"],
  },
  {
    id: "already-paid",
    label: "Already paid",
    title: "I already paid for parking",
    explanation:
      "You'd already paid to park here (or paid this PCN) when the ticket was issued.",
    evidence: [
      "Payment receipt or bank statement",
      "Parking app confirmation",
      "Council payment email",
    ],
    groundIds: ["paid-app-correct-bay", "already-paid"],
  },
  {
    id: "machine-failed",
    label: "Machine failed",
    title: "The payment machine failed",
    explanation:
      "The pay-and-display machine was broken or wouldn't take payment, so you couldn't pay.",
    evidence: [
      "Photo of the out-of-order machine",
      "A failed payment or card decline",
      "The time you tried to pay",
    ],
    groundIds: ["paid-pd", "paid-app-grace-period"],
  },
  {
    id: "wrong-details",
    label: "Wrong details",
    title: "The ticket has the wrong details",
    explanation:
      "The PCN gets a key detail wrong — the time, place, or contravention doesn't match what happened.",
    evidence: [
      "Photos showing the real situation",
      "Anything with a timestamp",
      "The PCN itself",
    ],
    groundIds: ["wrong-vrm-misread", "cctv-misread"],
  },
  {
    id: "medical",
    label: "Medical emergency",
    title: "There was a medical emergency",
    explanation:
      "You had to stop or stay because of a genuine medical emergency.",
    evidence: [
      "Hospital / GP letter or appointment",
      "Prescription or discharge note",
      "Anything showing the time",
    ],
    groundIds: ["medical-emergency"],
  },
  {
    id: "hidden-signs",
    label: "Hidden signs",
    title: "The signs were hidden or unclear",
    explanation:
      "The restriction signs were missing, covered, or too unclear to read.",
    evidence: [
      "Wide shot of the bay and signs",
      "Close-up of the obscured / missing sign",
      "Photo from the driver's view",
    ],
    groundIds: ["sign-obscured", "sign-missing", "markings-faded"],
  },
  {
    id: "permit-valid",
    label: "Permit valid",
    title: "I had a valid permit",
    explanation:
      "You held a valid resident, business, or visitor permit for this bay.",
    evidence: [
      "Photo of the permit and its dates",
      "Permit confirmation email",
      "Visitor session in the app",
    ],
    groundIds: ["resident-permit", "visitor-digital"],
  },
  {
    id: "loading",
    label: "Loading goods",
    title: "I was loading or unloading",
    explanation:
      "You were actively loading or unloading goods, which is usually permitted.",
    evidence: [
      "Delivery note or order",
      "Photos of the goods being moved",
      "Anything showing the activity",
    ],
    groundIds: ["loading-bulky-goods", "loading-continuous-activity"],
  },
  {
    id: "blue-badge",
    label: "Blue badge",
    title: "I was displaying a Blue Badge",
    explanation:
      "A valid Blue Badge was on display with the clock set correctly.",
    evidence: [
      "Photo of the badge on the dashboard",
      "Badge serial and expiry",
      "The set clock face",
    ],
    groundIds: ["bb-displayed", "bb-clock-set"],
  },
  {
    id: "vehicle-sold",
    label: "Vehicle sold",
    title: "I'd sold the vehicle",
    explanation:
      "You'd already sold or transferred the vehicle before the PCN date.",
    evidence: [
      "Bill of sale or transfer",
      "DVLA sale confirmation",
      "The buyer's details",
    ],
    groundIds: ["not-keeper-sold"],
  },
  {
    id: "not-mine",
    label: "Not my vehicle",
    title: "This isn't my vehicle",
    explanation:
      "The plate was misread or cloned — this PCN isn't for your car.",
    evidence: [
      "Photo of your actual numberplate",
      "Where your car really was at the time",
      "V5C showing your vehicle",
    ],
    groundIds: ["wrong-vrm-misread", "fleet-driver-not-self"],
  },
  {
    id: "council-error",
    label: "Council error",
    title: "The council made a procedural error",
    explanation:
      "The council didn't follow the correct process — late notice, too-short observation, or missing evidence.",
    evidence: [
      "The PCN and any letters with dates",
      "Envelopes or postmarks",
      "Anything showing the timings",
    ],
    groundIds: ["nto-late", "observation-too-short", "photographic-evidence-missing"],
  },
];

const MAX_EVIDENCE = 6;
const MAX_NOTES = 2000;

function GatheringEvidenceCard({
  appeal,
  busy,
  onConfirm,
}: {
  appeal: AppealRecord;
  busy?: boolean;
  onConfirm: (input: { grounds: string[]; notes: string }) => void;
}) {
  // Free-text "what happened" — the notes the drafter reads. Pre-filled
  // from any saved notes so nothing the user wrote is ever lost.
  const [notes, setNotes] = useState<string>(appeal.notes ?? "");
  // Selected common reason (single-select). Restored from saved grounds.
  const [selectedReasonId, setSelectedReasonId] = useState<string | null>(
    () => {
      const saved = Array.isArray(appeal.grounds) ? appeal.grounds : [];
      const match = COMMON_REASONS.find((r) =>
        r.groundIds.some((id) => saved.includes(id)),
      );
      return match?.id ?? null;
    },
  );
  const [evidence, setEvidence] = useState<string[]>(() => getEvidencePhotos());
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  // Dictation recorder state — the mic toggles recording in place. The
  // card layout/height is identical whether typing or dictating; only the
  // mic's appearance changes (grey idle → blue active).
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [recError, setRecError] = useState<string | null>(null);
  // Common-reason pills collapse to exactly 3 rows by default; "Show all"
  // reveals the rest. `reasonsRowH` is the measured pill height so the
  // clamp lands cleanly on the boundary between row 3 and row 4.
  const [reasonsExpanded, setReasonsExpanded] = useState(false);
  const [reasonsRowH, setReasonsRowH] = useState(40);
  const [reasonsOverflow, setReasonsOverflow] = useState(false);

  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const reasonsWrapRef = useRef<HTMLDivElement | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const selectedReason = useMemo(
    () => COMMON_REASONS.find((r) => r.id === selectedReasonId) ?? null,
    [selectedReasonId],
  );

  // Auto-grow the composer from its tall resting height (keeps the large
  // form factor in both typing and dictation states).
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 210), 360)}px`;
  }, [notes]);

  // Measure the real pill height (and whether the list runs past 3 rows)
  // so the collapsed clamp is exact regardless of font / width.
  useEffect(() => {
    const wrap = reasonsWrapRef.current;
    if (!wrap) return;
    const measure = () => {
      const first = wrap.firstElementChild as HTMLElement | null;
      const h = first?.offsetHeight ?? 40;
      setReasonsRowH(h);
      setReasonsOverflow(wrap.scrollHeight > h * 3 + 16 + 1);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  const reasonsCollapsedMaxH = reasonsRowH * 3 + 16; // 3 rows + 2 × 8px gap

  const addEvidenceFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setEvidenceError(null);
    try {
      const next = [...evidence];
      for (const f of files) {
        if (next.length >= MAX_EVIDENCE) break;
        if (f.size > 8 * 1024 * 1024) throw new Error(`"${f.name}" is over 8 MB.`);
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () =>
            reject(reader.error ?? new Error("Couldn't read that file"));
          reader.readAsDataURL(f);
        });
        next.push(dataUrl);
      }
      setEvidence(next);
      setEvidencePhotos(next);
    } catch (err) {
      setEvidenceError(err instanceof Error ? err.message : String(err));
    }
  };

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    void addEvidenceFiles(files);
  };

  const removeEvidence = (idx: number) => {
    const next = evidence.filter((_, i) => i !== idx);
    setEvidence(next);
    setEvidencePhotos(next);
  };

  const appendTranscript = (text: string) => {
    if (!text) return;
    setNotes((prev) => {
      const joiner =
        prev.length === 0 ? "" : /[.!?]\s*$/.test(prev) ? "\n" : " ";
      return `${prev}${joiner}${text}`.slice(0, MAX_NOTES);
    });
  };

  // ── Dictation recorder (mic button inside the composer) ──
  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  const startDictation = async () => {
    setRecError(null);
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setRecError("Voice isn't available here — type instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => chunksRef.current.push(e.data);
      rec.onstop = () => stream.getTracks().forEach((t) => t.stop());
      rec.start();
      recRef.current = rec;
      setRecording(true);
    } catch {
      setRecError("Couldn't reach the microphone — type instead.");
    }
  };

  const stopDictation = async () => {
    const rec = recRef.current;
    if (!rec) return;
    rec.stop();
    setRecording(false);
    setTranscribing(true);
    await new Promise((r) => setTimeout(r, 100));
    const blob = new Blob(chunksRef.current, {
      type: rec.mimeType || "audio/webm",
    });
    chunksRef.current = [];
    recRef.current = null;
    streamRef.current = null;
    try {
      const form = new FormData();
      form.append("audio", blob);
      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error?.message ?? `Transcribe failed (${res.status})`);
      }
      if (json.text) appendTranscript(String(json.text).trim());
    } catch (err) {
      setRecError(err instanceof Error ? err.message : "Transcribe failed");
    } finally {
      setTranscribing(false);
    }
  };

  const toggleDictation = () => {
    if (busy || transcribing) return;
    if (recording) void stopDictation();
    else void startDictation();
  };

  const canContinue = !!selectedReason || notes.trim().length > 0;
  const handleContinue = () => {
    if (!canContinue || busy) return;
    onConfirm({ grounds: selectedReason?.groundIds ?? [], notes: notes.trim() });
  };

  return (
    <section
      className="flex flex-col gap-6"
      style={{ paddingBottom: "calc(120px + env(safe-area-inset-bottom, 0px))" }}
    >
      {/* ── What happened? — dictation-first ── */}
      <div className="flex flex-col gap-4">
        <div>
          <h3 className="text-[20px] font-extrabold text-snappeal-navy tracking-tight">
            What happened?
          </h3>
          <p className="text-[13px] text-snappeal-muted mt-1 leading-snug">
            Tell us what happened in your own words
          </p>
        </div>
        {/* One large composer card — identical height/layout whether
         *  typing or dictating. The mic (bottom-right) toggles dictation
         *  and turns blue while active; the "+" (bottom-left) attaches a
         *  photo/doc and is identical in both states. */}
        <div
          className={`relative rounded-3xl bg-white border-2 shadow-[0_10px_34px_-16px_rgba(16,24,40,0.22)] transition focus-within:border-snappeal-primary/50 focus-within:shadow-[0_0_0_4px_rgba(47,115,255,0.14)] ${
            recording ? "border-snappeal-primary/40" : "border-snappeal-primary/15"
          }`}
        >
          <textarea
            ref={composerRef}
            value={notes}
            disabled={busy}
            maxLength={MAX_NOTES}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Why is this ticket unfair?"
            className="w-full bg-transparent resize-none px-5 pt-5 pb-16 text-[15px] leading-relaxed text-snappeal-navy placeholder:text-snappeal-muted/80 focus:outline-none"
            style={{ minHeight: 210, maxHeight: 360 }}
          />
          {/* Bottom-left: attach evidence. Identical in both modes. */}
          <button
            type="button"
            onClick={() => uploadInputRef.current?.click()}
            aria-label="Add evidence"
            className="absolute bottom-3 left-3 h-10 inline-flex items-center gap-1.5 rounded-full border border-snappeal-border bg-white text-snappeal-navy text-[12px] font-bold tracking-wide px-3.5 hover:border-snappeal-primary/50 hover:text-snappeal-primary transition active:scale-95"
          >
            <Plus className="size-4" strokeWidth={2.75} />
            EVIDENCE
          </button>
          {/* Bottom-right: mic. Grey idle, blue while dictating. */}
          <button
            type="button"
            onClick={toggleDictation}
            disabled={busy || transcribing}
            aria-pressed={recording}
            aria-label={recording ? "Stop dictating" : "Start dictating"}
            className={`absolute bottom-3 right-3 size-11 rounded-full flex items-center justify-center transition active:scale-95 disabled:opacity-60 ${
              recording
                ? "bg-snappeal-primary text-white shadow-[0_8px_22px_-6px_rgba(47,115,255,0.6)]"
                : "text-snappeal-muted hover:bg-snappeal-bg"
            }`}
          >
            {recording && (
              <span className="absolute inset-0 rounded-full bg-snappeal-primary/25 animate-ping" />
            )}
            {transcribing ? (
              <Loader2 className="size-5 animate-spin" strokeWidth={2.25} />
            ) : (
              <Mic className="size-5" strokeWidth={2.25} />
            )}
          </button>
        </div>
        {recError && (
          <p className="text-[11.5px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
            {recError}
          </p>
        )}
        {/* Attached evidence (added via "+ EVIDENCE"). */}
        {evidence.length > 0 && (
          <div className="grid grid-cols-4 gap-2">
            {evidence.map((src, i) => (
              <div
                key={i}
                className="relative aspect-square rounded-xl overflow-hidden border border-snappeal-border bg-snappeal-bg"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`Evidence ${i + 1}`}
                  className="absolute inset-0 size-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeEvidence(i)}
                  aria-label={`Remove evidence ${i + 1}`}
                  className="absolute top-1 right-1 size-6 rounded-full bg-black/65 text-white flex items-center justify-center hover:bg-black/85 transition"
                >
                  <X className="size-3.5" strokeWidth={2.5} />
                </button>
              </div>
            ))}
          </div>
        )}
        {evidenceError && (
          <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">
            {evidenceError}
          </p>
        )}
      </div>

      {/* ── Common reasons (pills, clamped to 3 rows) — unchanged behaviour ── */}
      <div className="flex flex-col gap-3">
        <p className="text-[12px] font-bold text-snappeal-muted uppercase tracking-[0.08em]">
          Common reasons
        </p>
        <div
          ref={reasonsWrapRef}
          className="flex flex-wrap gap-2"
          style={{
            maxHeight: reasonsExpanded ? undefined : reasonsCollapsedMaxH,
            overflow: "hidden",
            transition: "max-height 260ms ease",
          }}
        >
          {COMMON_REASONS.map((r) => {
            const active = selectedReasonId === r.id;
            return (
              <button
                key={r.id}
                type="button"
                aria-pressed={active}
                onClick={() => setSelectedReasonId(active ? null : r.id)}
                className={`rounded-full text-[13.5px] font-semibold px-4 py-2.5 transition active:scale-[0.97] ${
                  active
                    ? "bg-snappeal-primary text-white shadow-[0_6px_16px_-4px_rgba(47,115,255,0.5)] -translate-y-px"
                    : "bg-white text-snappeal-navy border border-[#E5E7EB] hover:border-snappeal-primary/50"
                }`}
              >
                {r.label}
              </button>
            );
          })}
        </div>
        {reasonsOverflow && (
          <button
            type="button"
            onClick={() => setReasonsExpanded((o) => !o)}
            className="self-start inline-flex items-center gap-1 text-[12.5px] font-bold text-snappeal-primary hover:underline"
          >
            {reasonsExpanded ? "Show fewer" : "Show all reasons"}
            <ChevronDown
              className={`size-3.5 transition-transform ${reasonsExpanded ? "rotate-180" : ""}`}
              strokeWidth={2.5}
            />
          </button>
        )}
        {selectedReason && (
          <div className="rounded-3xl border border-snappeal-primary/25 bg-[#F5F9FF] p-5 flex flex-col gap-3 snappeal-mcp-fade-in">
            <div>
              <p className="text-[16px] font-bold text-snappeal-navy leading-tight">
                {selectedReason.title}
              </p>
              <p className="text-[13px] text-snappeal-muted mt-1 leading-snug">
                {selectedReason.explanation}
              </p>
            </div>
            <div>
              <p className="text-[10.5px] font-bold uppercase tracking-wide text-snappeal-primary mb-1.5">
                Helpful evidence
              </p>
              <ul className="flex flex-col gap-1.5">
                {selectedReason.evidence.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2 text-[13px] text-snappeal-navy/85 leading-snug"
                  >
                    <Check
                      className="size-3.5 mt-0.5 shrink-0 text-snappeal-primary"
                      strokeWidth={3}
                    />
                    <span className="min-w-0">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Primary CTA */}
      <button
        type="button"
        onClick={handleContinue}
        disabled={!canContinue || busy}
        className="rounded-2xl bg-snappeal-primary text-white font-bold py-4 hover:bg-snappeal-primary-600 transition disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-snappeal-primary/30 active:scale-[0.99]"
      >
        {busy ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Starting draft…
          </>
        ) : (
          <>
            <Sparkles className="size-4" strokeWidth={2.25} fill="white" />
            Build my appeal
            <ArrowRight className="size-4" strokeWidth={2.5} />
          </>
        )}
      </button>

      <p className="text-[10.5px] text-snappeal-muted text-center leading-snug inline-flex items-center justify-center gap-1">
        <Lock className="size-3" strokeWidth={2.25} />
        You can change this later if needed.
      </p>

      {/* Hidden file input driving the "+ EVIDENCE" picker (photos / docs). */}
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={onPickFiles}
      />
    </section>
  );
}

/* ──────────── letter ready ──────────── */

function PaidSubmitCta({
  appeal,
  busy,
  onOpenPaymentSheet,
  onRescoreWithEvidence,
}: {
  appeal: AppealRecord;
  busy?: boolean;
  onOpenPaymentSheet: () => void;
  /** Re-scores the appeal with the latest evidence photos (no redraft).
   *  Surfaced inside the weak-appeal warning so adding evidence updates
   *  the score in place. */
  onRescoreWithEvidence?: (photos: string[]) => Promise<void> | void;
}) {
  const score = appeal.strengthScore;
  const rationale = appeal.strengthRationale;
  const improvements = appeal.strengthImprovements ?? [];
  const tone: "strong" | "solid" | "weak" | null =
    score == null ? null : score >= 80 ? "strong" : score >= 50 ? "solid" : "weak";
  // Weak appeals gate the £2.99 submit CTA behind an explicit "Submit
  // anyway" tap. The letter is still drafted and shown — only the next
  // destructive step (paying to submit a likely-doomed letter) needs the
  // risk acknowledged.
  const [useAnywayPressed, setUseAnywayPressed] = useState(false);
  const ctaVisible = tone !== "weak" || useAnywayPressed;

  // Add-more-evidence flow. Default-collapsed; expands an EvidenceCarousel
  // when the user taps "Add more evidence". Adding photos re-scores the
  // appeal automatically (no redraft) — the warning updates in place and
  // disappears once the score crosses 50.
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [rescoring, setRescoring] = useState(false);
  const lastScoredCountRef = useRef<number>(
    typeof window === "undefined" ? 0 : getEvidencePhotos().length,
  );

  const handleEvidenceChange = (next: string[]) => {
    // Re-score only when the photo set actually changed, one call at a
    // time. The parent refreshes the appeal so `score` updates and the
    // warning re-renders (or unmounts once it's ≥ 50).
    if (!onRescoreWithEvidence) return;
    if (next.length === lastScoredCountRef.current) return;
    if (rescoring) return;
    lastScoredCountRef.current = next.length;
    setRescoring(true);
    void Promise.resolve(onRescoreWithEvidence(next)).finally(() =>
      setRescoring(false),
    );
  };
  return (
    <section className="flex flex-col gap-3">
      {/* Letter preview — collapsible with a typewriter reveal on first
       *  sight. Sits above the warning + CTA so the user can read what
       *  they're about to submit before deciding. */}
      <LetterPreview
        appealId={appeal.id}
        subject={appeal.letterSubject}
        body={appeal.letterBody}
        wordCount={appeal.letterWordCount}
      />
      {/* Weak-appeal warning — rendered above the CTA so the user reads
       *  it BEFORE tapping the £2.99 button. While the warning is up
       *  AND the user hasn't tapped "Use anyway", the £2.99 submit CTA
       *  is hidden so the only next step is an explicit override. */}
      {tone === "weak" && (
        <aside className="rounded-2xl bg-red-50 border-2 border-red-200 p-4 flex flex-col gap-3">
          <div className="flex items-start gap-2.5">
            <span className="size-8 rounded-xl bg-red-600 text-white flex items-center justify-center shrink-0">
              <AlertTriangle className="size-4" strokeWidth={2.25} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-bold text-red-900 leading-tight">
                This appeal may not succeed
                {score != null && (
                  <span className="text-red-700 font-extrabold ml-1">({score}/100)</span>
                )}
              </p>
              {rationale && (
                <p className="text-[11.5px] text-red-800 mt-1 leading-snug">{rationale}</p>
              )}
            </div>
          </div>
          {improvements.length > 0 && (
            <ul className="ml-10 list-disc text-[11.5px] text-red-800 leading-snug flex flex-col gap-1">
              {improvements.map((tip, i) => (
                <li key={i}>{tip}</li>
              ))}
            </ul>
          )}

          {/* Add more evidence — re-scores in place, no redraft. */}
          {onRescoreWithEvidence && !evidenceOpen && (
            <button
              type="button"
              onClick={() => setEvidenceOpen(true)}
              className="mt-1 w-full rounded-2xl bg-snappeal-primary text-white font-bold py-3 text-[13px] hover:bg-snappeal-primary-600 transition active:scale-[0.99] inline-flex items-center justify-center gap-2"
            >
              <Camera className="size-4" strokeWidth={2.25} />
              Add more evidence
            </button>
          )}

          {evidenceOpen && (
            <div className="mt-1 rounded-2xl bg-white border border-red-200 p-3 flex flex-col gap-2.5">
              <p className="text-[11.5px] text-snappeal-muted leading-snug">
                Add photos of the sign, markings, or scene — Rabbit
                re-scores your appeal automatically as you add them.
              </p>
              <EvidenceCarousel onChange={handleEvidenceChange} />
              {rescoring && (
                <p className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-snappeal-primary">
                  <Loader2 className="size-3.5 animate-spin" strokeWidth={2.5} />
                  Re-scoring your appeal…
                </p>
              )}
            </div>
          )}

          {!useAnywayPressed && (
            <button
              type="button"
              onClick={() => setUseAnywayPressed(true)}
              className="w-full rounded-2xl bg-white border-2 border-red-300 text-red-900 font-bold py-3 text-[13px] hover:bg-red-100 transition active:scale-[0.99]"
            >
              Submit anyway
            </button>
          )}
        </aside>
      )}

      {ctaVisible && (
      <section className="relative rounded-3xl bg-gradient-to-br from-snappeal-primary-50 via-white to-white border-2 border-snappeal-primary/40 p-5 shadow-xl shadow-snappeal-primary/10">
        <span className="absolute -top-2.5 left-5 inline-flex items-center gap-1 rounded-full bg-snappeal-primary text-white text-[10px] font-bold uppercase tracking-wide px-2.5 py-0.5 shadow-md shadow-snappeal-primary/30">
          <Sparkles className="size-3" strokeWidth={2.5} fill="white" />
          Ready to submit
        </span>
        <div className="flex items-start gap-3">
          <span className="size-11 rounded-2xl bg-snappeal-primary text-white flex items-center justify-center shrink-0 shadow-lg shadow-snappeal-primary/40">
            <Sparkles className="size-5" strokeWidth={2.25} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-bold text-snappeal-navy leading-tight">
              Your appeal letter is ready
            </p>
            <p className="text-[11.5px] text-snappeal-muted mt-1 leading-snug">
              Submit £2.99 and our{" "}
              <span className="font-semibold text-snappeal-navy">AI Auto-Submit Agent</span>{" "}
              files it through {appeal.ticket?.issuer ?? "the council's"} portal — live, end-to-end.
            </p>
          </div>
        </div>

        {tone === "strong" && score != null && (
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-green-100 border border-green-300 text-green-800 text-[11px] font-bold px-2.5 py-1">
            <Sparkles className="size-3" strokeWidth={2.5} />
            Strong appeal — {score}/100
          </div>
        )}
        {tone === "solid" && score != null && (
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-100 border border-amber-300 text-amber-900 text-[11px] font-bold px-2.5 py-1">
            <Sparkles className="size-3" strokeWidth={2.5} />
            Solid appeal — {score}/100
          </div>
        )}

        <button
          type="button"
          onClick={onOpenPaymentSheet}
          disabled={busy}
          className="mt-4 w-full rounded-2xl bg-snappeal-primary text-white font-bold py-4 hover:bg-snappeal-primary-600 transition disabled:opacity-60 flex items-center justify-center gap-2 shadow-lg shadow-snappeal-primary/40 active:scale-[0.99]"
        >
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Submitting…
            </>
          ) : (
            <>
              {tone === "weak" ? "Submit anyway for £2.99" : "Submit appeal for £2.99"}
              <ArrowRight className="size-4" strokeWidth={2.5} />
            </>
          )}
        </button>
      </section>
      )}
    </section>
  );
}

/* ──────────── submitted ──────────── */

function SubmittedCard({ appeal }: { appeal: AppealRecord }) {
  return (
    <section className="rounded-2xl bg-green-50 border border-green-200 p-4 flex items-start gap-3">
      <span className="size-9 rounded-full bg-green-600 text-white flex items-center justify-center flex-shrink-0">
        <Check className="size-[1.125rem]" strokeWidth={3} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-green-900">
          {appeal.status === "cancelled"
            ? "🎉 PCN cancelled by the council"
            : "Filed with the council"}
        </p>
        <p className="text-xs text-green-800/80 mt-0.5 leading-snug">
          {appeal.status === "cancelled"
            ? "Your appeal succeeded. Nothing more to pay."
            : "We'll notify you the moment a reply lands in your inbox."}
        </p>
      </div>
      <CheckCircle2 className="size-4 text-green-600 shrink-0" strokeWidth={2.25} />
    </section>
  );
}

/* ──────────── terminal (paid / cancelled / closed / rejected) ──────────── */

function TerminalCard({
  state,
  appeal,
  statusSnapshot,
  onOverrideLookup,
}: {
  state: CardState;
  appeal: AppealRecord;
  statusSnapshot: TicketStatusSnapshot | null;
  onOverrideLookup?: () => void;
}) {
  // Special case: the portal lookup said paid/closed/not_found but the
  // user wants to override. Surface the inline override action.
  const lookupVerdict = appeal.portalLookup?.verdict;
  const showOverride =
    appeal.portalLookup?.status !== "overridden" &&
    !!onOverrideLookup &&
    (lookupVerdict === "paid" ||
      lookupVerdict === "closed" ||
      lookupVerdict === "not_found");

  const config = configForTerminal(state.stage, appeal.status, statusSnapshot);
  const Icon = config.icon;

  return (
    <section
      className={`rounded-2xl border p-4 flex flex-col gap-3 ${
        config.tone === "positive"
          ? "bg-green-50 border-green-200"
          : config.tone === "danger"
            ? "bg-red-50 border-red-200"
            : "bg-snappeal-bg/40 border-snappeal-border"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`size-10 rounded-xl flex items-center justify-center shrink-0 ${
            config.tone === "positive"
              ? "bg-green-600 text-white"
              : config.tone === "danger"
                ? "bg-red-600 text-white"
                : "bg-snappeal-navy/80 text-white"
          }`}
        >
          <Icon className="size-5" strokeWidth={2} />
        </span>
        <div className="flex-1 min-w-0">
          <p
            className={`text-sm font-bold ${
              config.tone === "positive"
                ? "text-green-900"
                : config.tone === "danger"
                  ? "text-red-900"
                  : "text-snappeal-navy"
            }`}
          >
            {config.title}
          </p>
          <p
            className={`text-[12px] mt-0.5 leading-snug ${
              config.tone === "positive"
                ? "text-green-800/80"
                : config.tone === "danger"
                  ? "text-red-800/80"
                  : "text-snappeal-muted"
            }`}
          >
            {config.body}
          </p>
        </div>
      </div>
      {showOverride && (
        <button
          type="button"
          onClick={onOverrideLookup}
          className="self-start text-[11.5px] text-snappeal-primary font-semibold hover:underline underline-offset-2"
        >
          I disagree — let me appeal anyway →
        </button>
      )}
    </section>
  );
}

function configForTerminal(
  stage: string,
  status: AppealRecord["status"],
  snapshot: TicketStatusSnapshot | null,
): { title: string; body: string; icon: LucideIcon; tone: "positive" | "danger" | "neutral" } {
  if (status === "rejected") {
    return {
      title: "Appeal rejected",
      body: "The council rejected this appeal. You may still pay or escalate to a tribunal.",
      icon: AlertOctagon,
      tone: "danger",
    };
  }
  if (status === "cancelled" || stage === "cancelled") {
    return {
      title: "Cancelled by the issuer",
      body: "The council cancelled this PCN. Nothing more is owed.",
      icon: CheckCircle2,
      tone: "positive",
    };
  }
  if (stage === "paid") {
    return {
      title: "Settled in full",
      body: snapshot?.paidAt
        ? `Paid on ${new Date(snapshot.paidAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.`
        : "This PCN has been paid — nothing more to do.",
      icon: CheckCircle2,
      tone: "positive",
    };
  }
  return {
    title: "File closed",
    body: "The issuer has closed this PCN. No further action available in-app.",
    icon: Lock,
    tone: "neutral",
  };
}

/* ──────────── escalated (charge cert / OFR / enforcement) ──────────── */

function EscalationCard({
  statusSnapshot,
  payUrl,
  councilName,
  state,
}: {
  statusSnapshot: TicketStatusSnapshot | null;
  payUrl: string | null;
  councilName: string | null;
  state: CardState;
}) {
  const copyByStage: Record<string, { title: string; body: string }> = {
    charge_certificate_issued: {
      title: "Charge Certificate issued",
      body: "The council has escalated this PCN. The amount has increased by 50% and the standard appeal route is closed.",
    },
    order_for_recovery: {
      title: "Order for Recovery filed",
      body: "The council has filed an Order for Recovery at Northampton CCBC. A court fee has been added.",
    },
    enforcement: {
      title: "Enforcement stage",
      body: "This PCN has been passed to enforcement agents. Contact the council directly before further charges accrue.",
    },
  };
  const copy = copyByStage[state.stage] ?? {
    title: "Action needed",
    body: "Settle with the council below.",
  };
  const due =
    statusSnapshot?.currentDuePence != null
      ? new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
          statusSnapshot.currentDuePence / 100,
        )
      : null;

  return (
    <section className="rounded-3xl bg-white border border-snappeal-border p-5 flex flex-col gap-4">
      <div className="rounded-2xl bg-red-50 border border-red-200 p-4 flex items-start gap-3">
        <span className="size-10 rounded-xl bg-red-100 text-red-700 flex items-center justify-center shrink-0">
          <AlertOctagon className="size-5" strokeWidth={2} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-red-900">{copy.title}</p>
          <p className="text-[12px] text-red-900/80 mt-1 leading-snug">{copy.body}</p>
          {due && (
            <p className="mt-2 text-[13px] font-bold text-red-900">Now due: {due}</p>
          )}
        </div>
      </div>

      {payUrl ? (
        <a
          href={payUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-2xl bg-white border-2 border-snappeal-primary p-4 flex items-center gap-3 text-left transition active:scale-[0.99] hover:border-snappeal-primary/60 shadow-md shadow-snappeal-primary/15"
        >
          <span className="size-11 rounded-xl bg-snappeal-primary-50 text-snappeal-primary flex items-center justify-center shrink-0">
            <Calendar className="size-5" strokeWidth={2} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-bold text-snappeal-navy">Pay yourself</p>
            <p className="text-[11.5px] text-snappeal-muted mt-0.5 leading-snug">
              Open the official {councilName ?? "council"} payment page and settle directly.
            </p>
            <p className="text-[11px] text-snappeal-primary font-semibold mt-1.5">
              Open payment page →
            </p>
          </div>
          <ArrowRight className="size-4 text-snappeal-muted shrink-0" strokeWidth={2.5} />
        </a>
      ) : (
        <div className="rounded-2xl bg-white border border-snappeal-border p-4 text-center text-[12px] text-snappeal-muted">
          Contact {councilName ?? "the council"} directly to settle — no in-app link
          available for this issuer yet.
        </div>
      )}
    </section>
  );
}

