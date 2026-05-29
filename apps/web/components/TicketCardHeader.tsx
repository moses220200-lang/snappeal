"use client";

/**
 * TicketCardHeader — the top block on every ticket card.
 *
 * Layout: a 96px logo tile anchors the left column, with the status
 * pill stacked directly underneath it so the issuer's identity and
 * the ticket's current state read as one unit. Council name + amount
 * + PCN metadata stack to the right.
 *
 * The big logo gives each issuer real visual presence (Westminster
 * green, TfL roundel, RBKC crest). When the council isn't known yet
 * we show a pulsing placeholder so the card structure doesn't reflow
 * once the lookup lands.
 */
import type { ReactNode } from "react";
import { MapPin, Pencil } from "lucide-react";
import { formatGBP, formatShortDate } from "@/lib/format";
import { IssuerLogoReel, type ReelCouncil } from "@/components/IssuerLogoReel";
import { DeadlineBadge } from "@/components/DeadlineBadge";
import type { DeadlineProximity } from "@/lib/deriveDeadlineProximity";

interface Props {
  council: { name: string; logoUrl?: string | null; logoBg?: string | null } | null;
  councilName: string | null;
  amountPence: number | null;
  /** Optional — the originally-scanned amount when the council's
   *  verified figure differs from it. When supplied, rendered
   *  struck-through grey to the LEFT of the main bold amount so the
   *  customer reads "old → new" at a glance. Replaces the orange
   *  `amountNote` text-line the header used to render under the
   *  price — see the redesign 2026-05-28: the strikethrough is the
   *  visual story, no prose explanation needed. NULL when there's
   *  nothing to compare (no OCR, no verification, or values match). */
  scannedAmountPence?: number | null;
  /** @deprecated 2026-05-28 — replaced by `scannedAmountPence`'s
   *  inline strikethrough. Kept on the interface so existing callers
   *  compile, but no longer rendered. Remove once every caller has
   *  switched. */
  amountNote?: string | null;
  pcnRef: string | null;
  vehicleReg: string | null;
  issuedAt: string | null;
  /** Where the PCN was issued — rendered directly under the issued
   *  date so the address sits next to the council logo tile instead
   *  of as a separate row below the header. */
  location?: string | null;
  /** Status pill (or any badge) rendered inline with the £ amount. */
  pill: ReactNode;
  /** Optional — when supplied, tapping the council logo tile fires
   *  this callback (typically opens a council picker sheet). */
  onCouncilClick?: () => void;
  /** True while the PCN is being read (card kind scanning/processing).
   *  Drives the issuer tile's slot-machine logo reel. */
  scanning?: boolean;
  /** Candidate councils for the reel to cycle through while scanning. */
  reelCouncils?: ReelCouncil[];
  /** Deadline proximity from `getDeadlineProximity()`. Renders a red /
   *  amber ribbon next to the status pill when ≤7 days remain.
   *  Hidden when no signal exists or when the ticket is settled. */
  deadlineProximity?: DeadlineProximity | null;
  /** 2026-05-27 — when true, suppress the PCN ref · Reg line + the
   *  location line in the header. Used during pending_review (and the
   *  validating transition that immediately follows the Confirm tap)
   *  where the inline TicketDetailsForm already shows those fields
   *  as editable inputs — duplicating them in the header reads as
   *  "asks twice to confirm". The header keeps the council badge,
   *  amount, issue date, status pill, and deadline badge so the user
   *  still has the at-a-glance context. */
  hideIdentityLine?: boolean;
}

export function TicketCardHeader({
  council,
  councilName,
  amountPence,
  scannedAmountPence,
  pcnRef,
  vehicleReg,
  issuedAt,
  location,
  pill,
  onCouncilClick,
  scanning = false,
  reelCouncils,
  deadlineProximity,
  hideIdentityLine = false,
}: Props) {
  // Only render the strikethrough when there are TWO distinct amounts
  // worth comparing. If the scanned figure equals the current one (or
  // either is missing) we drop it — a single price with a phantom
  // strike next to it would read as "two different prices, same".
  const showOldPrice =
    scannedAmountPence != null &&
    amountPence != null &&
    scannedAmountPence !== amountPence;

  return (
    <header className="pl-4 pr-5 py-4 flex items-center gap-4">
      {/* Left column: council logo tile, with a small caption overlaid
       *  on its bottom edge. Two modes:
       *
       *    Editable  — caller supplied `onCouncilClick` (we only do this
       *                during pending_review, when the user is still
       *                confirming PCN fields). The tile is a button, the
       *                overlay reads "EDIT" with a pencil glyph so the
       *                affordance is unambiguous.
       *    Display   — no `onCouncilClick`. Tile is plain, overlay reads
       *                "ISSUER" as a quiet caption. We're past the
       *                editing window (pay/appeal, drafting, submitted,
       *                etc.) and the council should not be mutable.
       *
       *  The bottom-edge badge sits as a small white-backed pill so it
       *  reads against any logo — Westminster green, TfL roundel, RBKC
       *  crest — without per-issuer contrast tweaks. */}
      <div
        className="shrink-0 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <IssuerLogoReel
          scanning={scanning}
          council={council}
          councilName={councilName}
          pool={reelCouncils ?? []}
          onCouncilClick={onCouncilClick}
        />
        {onCouncilClick ? (
          <span className="pointer-events-none absolute bottom-1.5 left-1/2 -translate-x-1/2 inline-flex items-center gap-0.5 px-1.5 py-[2px] rounded-md bg-parkingrabbit-primary text-white text-[8.5px] font-bold uppercase tracking-[0.14em] shadow-sm">
            <Pencil className="size-2.5" strokeWidth={2.5} />
            Edit
          </span>
        ) : (
          <span className="pointer-events-none absolute bottom-1.5 left-1/2 -translate-x-1/2 px-1.5 py-[2px] rounded-md bg-white/85 backdrop-blur-sm text-[8.5px] font-bold uppercase tracking-[0.14em] text-parkingrabbit-muted shadow-sm">
            Issuer
          </span>
        )}
      </div>
      {/* Right column — 2026-05-28 layout rebalance. The wrapper is
       *  now a `flex flex-col justify-center` so the metadata stack
       *  vertically centres against the 96-px issuer tile next to
       *  it (the parent header switched to `items-center` for the
       *  same reason). Rows in narrative order:
       *
       *    Row 1  Headline    £old struck-through + £current bold,
       *                       status pill pinned to the right edge.
       *    Row 2  Identity    PCN ref · vehicle reg.
       *    Row 3  Schedule    Issued <date> · Pay by <date> pill.
       *    Row 4  Location    pin + address (always one line, ellipsised).
       *
       *  Previously the rows used `gap-2`; tightened to `gap-1.5`
       *  here so all four metadata rows comfortably fit inside the
       *  issuer-tile height without inflating card height. Identity
       *  swapped above Schedule because the PCN ref + reg are the
       *  ticket's "what is this" — the eye wants to land on them
       *  immediately after the price; the issue date is "when did
       *  this happen", calmer context that belongs lower. */}
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
        {/* Row 1 — Headline. Prices on the left, status pill pinned
         *  right. Same font size for both prices so the eye reads
         *  "old → new" not "headline → footnote". */}
        <div className="flex items-center justify-between gap-1.5 sm:gap-3 flex-wrap">
          <div className="flex items-baseline gap-2 sm:gap-2.5 flex-wrap">
            {showOldPrice && (
              <p className="text-[22px] sm:text-[30px] font-extrabold text-parkingrabbit-muted/70 leading-none tracking-tight line-through decoration-[2px]">
                {formatGBP(scannedAmountPence as number)}
              </p>
            )}
            <p className="text-[22px] sm:text-[30px] font-extrabold text-parkingrabbit-navy leading-none tracking-tight">
              {amountPence != null ? formatGBP(amountPence) : "£—"}
            </p>
          </div>
          {pill && (
            /* 2026-05-28 — optical-centre nudge. The £ headline uses
             *  `leading-none`, so its CSS box is tall but the visual
             *  mass sits in the upper half (caps + ascenders) with
             *  little/no descender. Geometric `items-center` parks
             *  the pill at the box centre, which reads as ~2–3 px
             *  too low against the price's optical centre. Pulling
             *  the pill up by that amount restores alignment with
             *  the headline's x-height. */
            <div className="shrink-0 -translate-y-[2px] sm:-translate-y-[3px]">
              {pill}
            </div>
          )}
        </div>

        {/* Row 2 — Identity. PCN ref · vehicle reg, the ticket's
         *  "what is this". Promoted above the Issued date row so the
         *  eye lands on the identifier immediately after the price.
         *  `truncate` on the whole line guards against a freakishly
         *  long PCN reference pushing the layout vertically; we'd
         *  rather ellipsis the tail of the ref than wrap the row. */}
        {!hideIdentityLine && (pcnRef || vehicleReg) && (
          <p className="text-[12px] font-semibold text-parkingrabbit-muted leading-tight truncate">
            {pcnRef ?? "Reading PCN…"}
            {vehicleReg && (
              <>
                <span className="text-parkingrabbit-border mx-1.5">·</span>
                {vehicleReg}
              </>
            )}
          </p>
        )}

        {/* Row 3 — Schedule. "Issued <date>" + the deadline pill (when
         *  proximity is supplied AND the ticket is within the warning
         *  band; calm tickets stay calm). */}
        {(issuedAt || deadlineProximity) && (
          <div className="flex items-center gap-2 flex-wrap text-[11.5px] text-parkingrabbit-muted leading-tight">
            {issuedAt && (
              <span className="whitespace-nowrap">
                Issued {formatShortDate(issuedAt)}
              </span>
            )}
            {deadlineProximity && (
              <DeadlineBadge proximity={deadlineProximity} />
            )}
          </div>
        )}

        {/* Row 4 — Location. ALWAYS one line — `truncate` collapses
         *  the tail with an ellipsis rather than wrapping into a
         *  second row, which would inflate card height and break the
         *  metadata-stack-matches-issuer-tile rhythm above. The
         *  surrounding `<p>` is `flex items-center min-w-0` so the
         *  pin glyph and the truncated span share a single baseline. */}
        {!hideIdentityLine && location && (
          <p className="text-[11.5px] text-parkingrabbit-muted leading-snug flex items-center gap-1 min-w-0">
            <MapPin className="size-3 shrink-0" strokeWidth={1.75} />
            <span className="truncate">{location}</span>
          </p>
        )}
      </div>
    </header>
  );
}
