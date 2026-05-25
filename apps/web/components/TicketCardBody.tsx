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
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Accessibility,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Calendar,
  Camera,
  CalendarX,
  Cctv,
  Check,
  CheckCircle2,
  ChevronRight,
  FileWarning,
  HandCoins,
  Loader2,
  Lock,
  MessageCircle,
  Receipt,
  Search,
  ShieldCheck,
  Signpost,
  Sparkles,
  Star,
} from "lucide-react";
import { LetterPreview } from "@/components/LetterPreview";
import type { LucideIcon } from "lucide-react";
import { DictationPanel } from "@/components/DictationPanel";
import { EvidenceCarousel } from "@/components/EvidenceCarousel";
import { getEvidencePhotos, type OcrHandoff } from "@/lib/client/session";
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
  /** Re-runs the drafter with the existing grounds + notes but the
   *  latest evidence-photo set. Surfaced inside PaidSubmitCta when
   *  the strength scorer flagged the draft as weak. */
  onRedraftWithEvidence?: () => void;
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
  onRedraftWithEvidence,
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
          onRedraftWithEvidence={onRedraftWithEvidence}
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

/** YYYY-MM-DD value expected by <input type="date">. Accepts ISO
 *  timestamps or already-truncated date strings; returns "" for null. */
function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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
  const [pcnRefLocal, setPcnRefLocal] = useState<string>(ticket?.pcnRef ?? "");
  const [vehicleRegLocal, setVehicleRegLocal] = useState<string>(
    ticket?.vehicleReg ?? "",
  );
  const [amountLocal, setAmountLocal] = useState<string>(
    ticket?.amountPence != null ? String(Math.round(ticket.amountPence / 100)) : "",
  );
  const [issuedAtLocal, setIssuedAtLocal] = useState<string>(
    toDateInputValue(ticket?.issuedAt ?? null),
  );
  // Sync local state when the appeal row refreshes (e.g. from a
  // reconciliation poll). All setStates are external-sync (prop->state).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setPcnRefLocal(ticket?.pcnRef ?? "");
    setVehicleRegLocal(ticket?.vehicleReg ?? "");
    setAmountLocal(
      ticket?.amountPence != null
        ? String(Math.round(ticket.amountPence / 100))
        : "",
    );
    setIssuedAtLocal(toDateInputValue(ticket?.issuedAt ?? null));
  }, [
    ticket?.pcnRef,
    ticket?.vehicleReg,
    ticket?.amountPence,
    ticket?.issuedAt,
  ]);
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
      {/* Issuing council field has moved to the council logo tile in
       *  the ticket header — tapping the square logo opens the same
       *  picker. Removing it here avoids the duplicate row. */}
      <EditableFieldRow
        label="Amount"
        value={amountLocal}
        onChange={(v) => {
          // Strip anything that isn't a digit or dot, then keep at
          // most one dot. Persist as pence on PATCH.
          const cleaned = v
            .replace(/[^0-9.]/g, "")
            .replace(/(\..*)\./g, "$1");
          setAmountLocal(cleaned);
          const pounds = Number(cleaned);
          if (Number.isFinite(pounds) && pounds >= 0) {
            onEditField?.("amountPence", String(Math.round(pounds * 100)));
          }
        }}
        placeholder="130"
        prefix="£"
        inputMode="decimal"
      />
      <EditableFieldRow
        label="Issue date"
        value={issuedAtLocal}
        onChange={(v) => {
          setIssuedAtLocal(v);
          // <input type="date"> emits YYYY-MM-DD; the backend
          // accepts an ISO string. Empty string clears the field.
          if (v) onEditField?.("issuedAt", new Date(v).toISOString());
        }}
        type="date"
      />

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
/* ──────────── Build appeal — recommended grounds picker ────────────
 *
 * The customer-facing "pick your appeal reason" surface. Replaces the
 * dense accordion that previously fronted all 75 cards in the
 * grounds-catalog: most users only need a single, decisive prompt and
 * Rabbit can route from there. The catalog still drives the data
 * model — each recommended reason maps to a small handful of canonical
 * card IDs from `grounds-catalog.ts`, so the AI drafter receives the
 * same shape it always has.
 *
 * Layout, top to bottom:
 *   - Title + subtitle
 *   - Search field + filter chips (Recommended / All / Signs / Permit)
 *   - Top 3 ranked recommended cards (single-select, rank-numbered)
 *   - "More reasons" pill row + "See all (N)" to expand the full picker
 *   - Step 2: Add evidence (collapsible)
 *   - Step 3: Tell us what happened (collapsible)
 *   - Continue CTA + reassurance line
 *
 * `confidence` percentages are UI signal only — not legal guarantees.
 * Hardcoded for now; structure leaves room to inject real ranking
 * later (e.g. from contravention code + portal verdict).
 */

interface RecommendedGround {
  id: string;
  title: string;
  description: string;
  evidenceHint: string;
  badge: string;
  /** 0–100 — pure UI signal. */
  confidence: number;
  icon: LucideIcon;
  /** Catalog card IDs preselected when this reason is chosen. */
  groundIds: string[];
  /** Search/filter keywords. */
  keywords: string[];
  /** When true, the reason shows in the default "Recommended" filter
   *  (top 3 cards). When false, it only appears when the user taps
   *  "All" or that reason's specific category chip. */
  featured: boolean;
  /** Short label used for the per-category filter chip at the top. */
  chipLabel: string;
}

const RECOMMENDED_GROUNDS: RecommendedGround[] = [
  {
    id: "signs_markings",
    title: "Signs & markings unclear",
    description: "Signs were missing, unclear or didn't match the rules.",
    evidenceHint: "Best if you have photos",
    badge: "Strong match",
    confidence: 78,
    icon: Signpost,
    groundIds: ["sign-missing", "sign-obscured", "markings-faded"],
    keywords: ["signs", "markings", "signage", "obscured", "faded"],
    featured: true,
    chipLabel: "Signs",
  },
  {
    id: "permit_paid",
    title: "Permit / paid parking issue",
    description: "I had a valid permit or paid but the ticket was issued.",
    evidenceHint: "Check permit, payment and dates",
    badge: "Worth checking",
    confidence: 64,
    icon: BadgeCheck,
    groundIds: ["resident-permit", "paid-app-correct-bay"],
    keywords: ["permit", "paid", "parking", "resident", "visitor"],
    featured: true,
    chipLabel: "Permit",
  },
  {
    id: "procedural_error",
    title: "Procedural error",
    description: "The council didn't follow the correct process.",
    evidenceHint: "Check ticket wording and dates",
    badge: "Possible",
    confidence: 42,
    icon: FileWarning,
    groundIds: ["nto-late", "observation-too-short", "photographic-evidence-missing"],
    keywords: ["procedural", "process", "notice", "nto", "wrong"],
    featured: true,
    chipLabel: "Procedural",
  },
  {
    id: "settled",
    title: "Already paid or cancelled",
    description: "I already paid this PCN, or the council cancelled it.",
    evidenceHint: "Receipts or council emails help",
    badge: "Strong match",
    confidence: 82,
    icon: Receipt,
    groundIds: ["already-paid", "already-cancelled"],
    keywords: ["paid", "settled", "cancelled", "duplicate"],
    featured: false,
    chipLabel: "Already paid",
  },
  {
    id: "blue_badge",
    title: "Blue Badge issue",
    description: "I was displaying a valid Blue Badge.",
    evidenceHint: "Have your badge details ready",
    badge: "Worth checking",
    confidence: 70,
    icon: Accessibility,
    groundIds: ["bb-displayed", "bb-clock-set"],
    keywords: ["blue", "badge", "disabled"],
    featured: false,
    chipLabel: "Blue Badge",
  },
  {
    id: "suspensions",
    title: "Bay was suspended",
    description: "The bay was suspended but I wasn't properly notified.",
    evidenceHint: "Photos of the bay and signage help",
    badge: "Worth checking",
    confidence: 58,
    icon: CalendarX,
    groundIds: ["suspension-no-notice", "suspension-late-posted"],
    keywords: ["suspended", "suspension", "bay"],
    featured: false,
    chipLabel: "Suspensions",
  },
  {
    id: "cctv",
    title: "CCTV-issued PCN",
    description: "A camera issued the ticket, not a warden in person.",
    evidenceHint: "We'll check the warning sign rules",
    badge: "Possible",
    confidence: 48,
    icon: Cctv,
    groundIds: ["cctv-misread", "cctv-no-warning-sign"],
    keywords: ["cctv", "camera", "moving"],
    featured: false,
    chipLabel: "CCTV",
  },
  {
    id: "amount",
    title: "Charge or amount looks wrong",
    description: "The amount on the ticket doesn't match the contravention.",
    evidenceHint: "Check ticket wording carefully",
    badge: "Possible",
    confidence: 40,
    icon: HandCoins,
    groundIds: ["vat-or-fee-added"],
    keywords: ["amount", "charge", "fee", "vat"],
    featured: false,
    chipLabel: "Charge",
  },
];

/** Filter pill identifier. "recommended" + "all" are meta-filters;
 *  every other id is a `chipLabel` from a specific reason. */
type ReasonFilter = "recommended" | "all" | string;

function GatheringEvidenceCard({
  appeal,
  busy,
  onConfirm,
}: {
  appeal: AppealRecord;
  busy?: boolean;
  onConfirm: (input: { grounds: string[]; notes: string }) => void;
}) {
  // Default selection: the top recommendation. The customer can change
  // it with a single tap; we never strand them on a blank state.
  const [selectedReasonId, setSelectedReasonId] = useState<string>(() => {
    const saved = Array.isArray(appeal.grounds) ? appeal.grounds : [];
    const fromSaved = RECOMMENDED_GROUNDS.find((r) =>
      r.groundIds.some((id) => saved.includes(id)),
    );
    if (fromSaved) return fromSaved.id;
    return RECOMMENDED_GROUNDS[0].id;
  });
  const [filter, setFilter] = useState<ReasonFilter>("recommended");
  const [query, setQuery] = useState<string>("");
  const [notes, setNotes] = useState<string>(appeal.notes ?? "");
  const [evidenceCount, setEvidenceCount] = useState<number>(0);
  const [evidenceOpen, setEvidenceOpen] = useState<boolean>(false);
  const [notesOpen, setNotesOpen] = useState<boolean>(false);

  const selectedReason = useMemo<RecommendedGround | undefined>(
    () => RECOMMENDED_GROUNDS.find((r) => r.id === selectedReasonId),
    [selectedReasonId],
  );

  // Cards rendered by the filter / search. Query matches title +
  // description + keywords. Filter chips are: "Recommended" (top 3
  // featured reasons), "All" (every reason), or a per-reason
  // chipLabel (single matching reason).
  const visibleReasons = useMemo<RecommendedGround[]>(() => {
    const q = query.trim().toLowerCase();
    const base = RECOMMENDED_GROUNDS.filter((r) => {
      if (filter === "recommended") return r.featured;
      if (filter === "all") return true;
      return r.chipLabel === filter;
    });
    if (!q) return base;
    return base.filter((r) =>
      [r.title, r.description, ...r.keywords]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [filter, query]);

  const handleContinue = () => {
    if (!selectedReason || busy) return;
    onConfirm({ grounds: selectedReason.groundIds, notes });
  };

  return (
    <section
      className="flex flex-col gap-5"
      style={{
        paddingBottom: "calc(120px + env(safe-area-inset-bottom, 0px))",
      }}
    >
      {/* Header */}
      <div>
        <p className="text-[16px] font-bold text-snappeal-navy leading-tight">
          Choose your best appeal reason
        </p>
        <p className="text-[12px] text-snappeal-muted mt-1 leading-snug">
          Rabbit ranks the strongest options first based on success likelihood.
        </p>
      </div>

      {/* Search + filter chips */}
      <div className="flex flex-col gap-3">
        <label className="h-12 rounded-2xl border border-[#E5E7EB] bg-white px-4 flex items-center gap-2.5 focus-within:border-snappeal-primary focus-within:ring-2 focus-within:ring-snappeal-primary/15 transition">
          <Search
            className="size-4 text-snappeal-muted shrink-0"
            strokeWidth={2}
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search reasons"
            className="flex-1 min-w-0 bg-transparent text-[14px] text-snappeal-navy placeholder:text-snappeal-muted/70 focus:outline-none"
          />
        </label>
        {/* Filter pills — every reason gets its own chip, so the
         *  legacy "More reasons" disclosure + secondary chip grid is
         *  gone. Recommended (star) is the default; All shows
         *  everything; per-reason chips narrow to a single card.
         *  Horizontal-scroll, no wrap, trailing pad so the last chip
         *  scrolls fully into view. */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pr-6 flex-nowrap">
          <FilterChip
            label="Recommended"
            active={filter === "recommended"}
            onClick={() => setFilter("recommended")}
            withStar
          />
          <FilterChip
            label="All"
            active={filter === "all"}
            onClick={() => setFilter("all")}
          />
          {RECOMMENDED_GROUNDS.map((r) => (
            <FilterChip
              key={r.id}
              label={r.chipLabel}
              icon={r.icon}
              active={filter === r.chipLabel}
              onClick={() => setFilter(r.chipLabel)}
            />
          ))}
        </div>
      </div>

      {/* Reason cards — natural list order conveys priority; no
       *  explicit 1 / 2 / 3 numerals on each row. */}
      {visibleReasons.length > 0 ? (
        <ul className="flex flex-col gap-[14px]">
          {visibleReasons.map((r) => (
            <li key={r.id}>
              <RecommendedCard
                reason={r}
                selected={selectedReasonId === r.id}
                onSelect={() => setSelectedReasonId(r.id)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12px] text-snappeal-muted text-center py-4">
          No matching reasons — try a different search or tap All.
        </p>
      )}

      {/* Sub-step cards */}
      <SubStepCard
        number={2}
        title="Add evidence"
        subtitle="Upload photos or documents to support your appeal."
        icon={Camera}
        open={evidenceOpen}
        done={evidenceCount > 0}
        doneLabel={
          evidenceCount > 0
            ? `${evidenceCount} photo${evidenceCount === 1 ? "" : "s"}`
            : null
        }
        onToggle={() => setEvidenceOpen((o) => !o)}
      >
        <EvidenceCarousel onChange={(next) => setEvidenceCount(next.length)} />
      </SubStepCard>

      <SubStepCard
        number={3}
        title="Tell us what happened"
        subtitle="Your summary helps Rabbit build a stronger appeal."
        icon={MessageCircle}
        open={notesOpen}
        done={notes.trim().length > 0}
        onToggle={() => setNotesOpen((o) => !o)}
      >
        <DictationPanel
          value={notes}
          onChange={setNotes}
          selectedCardIds={selectedReason?.groundIds ?? []}
          disabled={busy}
        />
      </SubStepCard>

      {/* CTA */}
      <button
        type="button"
        onClick={handleContinue}
        disabled={!selectedReason || busy}
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
            Continue with selected reason
            <ArrowRight className="size-4" strokeWidth={2.5} />
          </>
        )}
      </button>

      <p className="text-[10.5px] text-snappeal-muted text-center leading-snug inline-flex items-center justify-center gap-1">
        <Lock className="size-3" strokeWidth={2.25} />
        You can change this later if needed.
      </p>
    </section>
  );
}

/** Single filter chip in the horizontal scroll row above the reason
 *  cards. "Recommended" carries a leading star; per-reason chips
 *  carry their own icon. */
function FilterChip({
  label,
  active,
  onClick,
  withStar,
  icon: Icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  withStar?: boolean;
  icon?: LucideIcon;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 h-9 inline-flex items-center gap-1.5 rounded-full text-[13px] font-semibold px-4 transition whitespace-nowrap ${
        active
          ? "bg-snappeal-primary text-white"
          : "bg-white border border-[#E5E7EB] text-snappeal-muted hover:text-snappeal-navy"
      }`}
    >
      {withStar && (
        <Star
          className="size-3.5"
          strokeWidth={2.5}
          fill={active ? "white" : "none"}
        />
      )}
      {Icon && <Icon className="size-3.5" strokeWidth={2.25} />}
      {label}
    </button>
  );
}

/** One of the recommended ground cards. Single-select; the parent
 *  owns selection state.
 *
 *  Layout (per the v0.3.x premium-fintech refresh):
 *    ┌─────────────────────────────────────────────┐
 *    │ [icon]   Title                       (sel)  │
 *    │          BADGE                              │
 *    │          Description                        │
 *    │          📷 Evidence hint                   │
 *    │          ───────────────────────────────    │
 *    │          78% success                        │
 *    └─────────────────────────────────────────────┘
 *
 *  Icon sits aligned with the title (not centered vertically), badge
 *  on its own row, success rate at the bottom behind a thin divider. */
function RecommendedCard({
  reason,
  selected,
  onSelect,
}: {
  reason: RecommendedGround;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = reason.icon;
  const badgeTone =
    reason.confidence >= 70
      ? "bg-green-50 text-green-800 border-green-200"
      : reason.confidence >= 50
        ? "bg-amber-50 text-amber-800 border-amber-200"
        : "bg-snappeal-bg text-snappeal-muted border-snappeal-border";
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`relative w-full text-left rounded-2xl p-5 max-[380px]:p-4 transition active:scale-[0.995] ${
        selected
          ? "border-2 border-snappeal-primary bg-[#F3F8FF] shadow-[0_6px_18px_rgba(47,115,255,0.10)]"
          : "border border-[#E5E7EB] bg-white hover:border-snappeal-primary/60"
      }`}
    >
      {/* Selector — absolutely positioned so it doesn't steal width
       *  from the title column. */}
      <span
        className={`absolute top-4 right-4 size-7 rounded-full flex items-center justify-center z-[2] ${
          selected
            ? "bg-snappeal-primary text-white"
            : "bg-white border-2 border-[#E1E3E8]"
        }`}
        aria-hidden
      >
        {selected && <Check className="size-4" strokeWidth={3} />}
      </span>

      {/* Two-column grid: icon | content. The selector floats above
       *  via absolute positioning and doesn't occupy any grid space. */}
      <div className="grid grid-cols-[44px_1fr] gap-x-3.5 items-start">
        {/* Icon box */}
        <span
          className={`size-11 rounded-2xl flex items-center justify-center shrink-0 ${
            selected
              ? "bg-[#E2EEFF] text-snappeal-primary"
              : "bg-[#F4F5F7] text-snappeal-muted"
          }`}
          aria-hidden
        >
          <Icon className="size-5" strokeWidth={2.25} />
        </span>

        {/* Content column. Title + badge row needs right-side padding
         *  to clear the absolute selector; description / evidence /
         *  divider / success below use the full content-column width. */}
        <div className="min-w-0 flex flex-col">
          {/* Title + badge — pr-9 reserves room for selector */}
          <div className="pr-9">
            <p
              className="font-bold text-snappeal-navy text-[17px] leading-[1.2] break-words"
              style={{ letterSpacing: "-0.01em" }}
            >
              {reason.title}
            </p>
            <span
              className={`mt-2 self-start inline-flex items-center rounded-full font-bold uppercase tracking-wide border px-2 py-0.5 text-[10.5px] ${badgeTone}`}
            >
              {reason.badge}
            </span>
          </div>

          {/* Description */}
          <p className="mt-3 text-[13px] leading-[1.4] text-[#6B7280] break-words">
            {reason.description}
          </p>

          {/* Evidence hint */}
          <p className="mt-2 text-[13px] font-semibold text-snappeal-primary flex items-start gap-1.5 leading-[1.3] break-words">
            <Camera
              className="size-[14px] mt-0.5 shrink-0"
              strokeWidth={2.25}
            />
            <span className="min-w-0">{reason.evidenceHint}</span>
          </p>

          {/* Divider */}
          <div className="mt-3 h-px w-full bg-[#E3E7ED]" />

          {/* Success rate */}
          <p className="mt-2.5 text-[13.5px] font-bold text-snappeal-navy">
            {reason.confidence}% success
          </p>
        </div>
      </div>
    </button>
  );
}

/** Collapsible sub-step (Add evidence / Tell us what happened). Header
 *  shows a numbered badge, icon, title, subtitle, optional pill, done
 *  pill, and a chevron. Tapping expands the children inline. */
function SubStepCard({
  number,
  title,
  subtitle,
  icon: Icon,
  open,
  done,
  doneLabel,
  onToggle,
  children,
}: {
  number: number;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  open: boolean;
  done?: boolean;
  doneLabel?: string | null;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-snappeal-border bg-white overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full text-left px-3.5 py-3 flex items-center gap-3 hover:bg-snappeal-bg/40 transition"
      >
        <span
          className={`size-7 rounded-full shrink-0 flex items-center justify-center text-[12px] font-bold ${
            done
              ? "bg-snappeal-success text-white"
              : "bg-snappeal-bg text-snappeal-muted"
          }`}
          aria-hidden
        >
          {done ? <Check className="size-3.5" strokeWidth={3} /> : number}
        </span>
        <span className="size-9 rounded-xl bg-snappeal-primary-50 text-snappeal-primary flex items-center justify-center shrink-0">
          <Icon className="size-4" strokeWidth={2.25} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-[13.5px] font-bold text-snappeal-navy leading-tight">
              {title}
            </p>
            {done && doneLabel && (
              <span className="inline-flex items-center rounded-full bg-green-50 border border-green-200 text-green-800 text-[9.5px] font-bold uppercase tracking-wide px-1.5 py-0.5">
                {doneLabel}
              </span>
            )}
          </div>
          <p className="text-[11px] text-snappeal-muted leading-snug mt-0.5">
            {subtitle}
          </p>
        </div>
        <ChevronRight
          className={`size-4 text-snappeal-muted shrink-0 transition-transform ${
            open ? "rotate-90" : ""
          }`}
          strokeWidth={2.25}
        />
      </button>
      {open && (
        <div className="border-t border-snappeal-border px-3.5 py-3">
          {children}
        </div>
      )}
    </section>
  );
}

/* ──────────── letter ready ──────────── */

function PaidSubmitCta({
  appeal,
  busy,
  onOpenPaymentSheet,
  onRedraftWithEvidence,
}: {
  appeal: AppealRecord;
  busy?: boolean;
  onOpenPaymentSheet: () => void;
  /** Re-runs the drafter with the latest evidence-photo set. Surfaced
   *  inside the weak-appeal warning so the user can boost a poor
   *  draft by adding photos rather than abandoning. */
  onRedraftWithEvidence?: () => void;
}) {
  const score = appeal.strengthScore;
  const rationale = appeal.strengthRationale;
  const improvements = appeal.strengthImprovements ?? [];
  const tone: "strong" | "solid" | "weak" | null =
    score == null ? null : score >= 80 ? "strong" : score >= 50 ? "solid" : "weak";
  // Weak appeals gate the £2.99 submit CTA behind an explicit "Use
  // anyway" tap. The letter is still drafted and displayed with the
  // typewriter reveal — only the next destructive step (paying to
  // submit a likely-doomed letter) requires acknowledging the risk.
  const [useAnywayPressed, setUseAnywayPressed] = useState(false);
  const ctaVisible = tone !== "weak" || useAnywayPressed;

  // Evidence-boost flow. Default-collapsed; expands an EvidenceCarousel
  // when the user taps "Add evidence". Once at least one photo has
  // been added, the primary CTA flips to "Redraft with evidence" so
  // the user can fire the AI again with the new context.
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [evidenceCount, setEvidenceCount] = useState<number>(() =>
    typeof window === "undefined" ? 0 : getEvidencePhotos().length,
  );
  const handleRedraft = () => {
    setUseAnywayPressed(false);
    setEvidenceOpen(false);
    onRedraftWithEvidence?.();
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

          {/* Evidence-boost flow — gives the user a constructive
           *  next step instead of just "abandon or submit weak". */}
          {onRedraftWithEvidence && !evidenceOpen && evidenceCount === 0 && (
            <button
              type="button"
              onClick={() => setEvidenceOpen(true)}
              className="mt-1 w-full rounded-2xl bg-snappeal-primary text-white font-bold py-3 text-[13px] hover:bg-snappeal-primary-600 transition active:scale-[0.99] inline-flex items-center justify-center gap-2"
            >
              <Camera className="size-4" strokeWidth={2.25} />
              Add evidence to boost score
            </button>
          )}

          {evidenceOpen && (
            <div className="mt-1 rounded-2xl bg-white border border-red-200 p-3 flex flex-col gap-3">
              <p className="text-[11.5px] text-snappeal-muted leading-snug">
                Add photos of the sign, markings, or scene. Rabbit will
                rewrite the appeal with the new evidence and re-score it.
              </p>
              <EvidenceCarousel
                onChange={(next) => setEvidenceCount(next.length)}
              />
              <button
                type="button"
                onClick={handleRedraft}
                disabled={evidenceCount === 0 || busy}
                className="w-full rounded-2xl bg-snappeal-primary text-white font-bold py-3 text-[13px] hover:bg-snappeal-primary-600 transition disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Redrafting…
                  </>
                ) : (
                  <>
                    <Sparkles
                      className="size-4"
                      strokeWidth={2.25}
                      fill="white"
                    />
                    {evidenceCount > 0
                      ? `Redraft with ${evidenceCount} photo${
                          evidenceCount === 1 ? "" : "s"
                        }`
                      : "Add at least one photo"}
                  </>
                )}
              </button>
            </div>
          )}

          {/* Already have photos but the score is still weak? Offer a
           *  redraft directly (the original draft may have run BEFORE
           *  the photos were added). */}
          {onRedraftWithEvidence && !evidenceOpen && evidenceCount > 0 && (
            <button
              type="button"
              onClick={handleRedraft}
              disabled={busy}
              className="mt-1 w-full rounded-2xl bg-snappeal-primary text-white font-bold py-3 text-[13px] hover:bg-snappeal-primary-600 transition disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Redrafting…
                </>
              ) : (
                <>
                  <Sparkles
                    className="size-4"
                    strokeWidth={2.25}
                    fill="white"
                  />
                  Redraft with your {evidenceCount} photo
                  {evidenceCount === 1 ? "" : "s"}
                </>
              )}
            </button>
          )}

          {!useAnywayPressed && (
            <button
              type="button"
              onClick={() => setUseAnywayPressed(true)}
              className="w-full rounded-2xl bg-white border-2 border-red-300 text-red-900 font-bold py-3 text-[13px] hover:bg-red-100 transition active:scale-[0.99]"
            >
              Use anyway
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

