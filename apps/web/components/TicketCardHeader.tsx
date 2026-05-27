"use client";

/**
 * TicketCardHeader — the top block on every ticket card.
 *
 * Layout: a 112px logo tile anchors the left column, with the status
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
import { MapPin } from "lucide-react";
import { formatGBP, formatShortDate } from "@/lib/format";
import { IssuerLogoReel, type ReelCouncil } from "@/components/IssuerLogoReel";
import { DeadlineBadge } from "@/components/DeadlineBadge";
import type { DeadlineProximity } from "@/lib/deriveDeadlineProximity";

interface Props {
  council: { name: string; logoUrl?: string | null; logoBg?: string | null } | null;
  councilName: string | null;
  amountPence: number | null;
  /** Optional explanation shown under the amount when the council's
   *  verified figure differs from the scanned one — values are never
   *  changed silently. Null pre-verification / when unchanged. */
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
}

export function TicketCardHeader({
  council,
  councilName,
  amountPence,
  amountNote,
  pcnRef,
  vehicleReg,
  issuedAt,
  location,
  pill,
  onCouncilClick,
  scanning = false,
  reelCouncils,
  deadlineProximity,
}: Props) {
  return (
    <header className="px-5 pt-4 pb-3 flex items-start gap-4">
      {/* Left column: tappable council logo with an "Issuer" label
       *  underneath. Tapping it opens the council picker so users can
       *  change the issuer without an inline field in the confirm
       *  form. The status pill moved inline with the £ amount on the
       *  right so the price and state read together at a glance. */}
      <div
        className="shrink-0 flex flex-col items-center gap-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        <IssuerLogoReel
          scanning={scanning}
          council={council}
          councilName={councilName}
          pool={reelCouncils ?? []}
          onCouncilClick={onCouncilClick}
        />
        <span className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-parkingrabbit-muted">
          Issuer
        </span>
      </div>
      <div className="flex-1 min-w-0">
        {/* Council name is implied by the big logo tile on the left,
         *  so we no longer repeat it as a text header. Issued date now
         *  sits inline with the £ amount so the price and the
         *  when-it-was-issued read together at a glance. */}
        <div className="flex items-baseline gap-2 flex-wrap">
          <p className="text-[26px] sm:text-[30px] font-extrabold text-parkingrabbit-navy leading-none tracking-tight">
            {amountPence != null ? formatGBP(amountPence) : "£—"}
          </p>
          {issuedAt && (
            <p className="text-[11.5px] text-parkingrabbit-muted leading-tight whitespace-nowrap">
              Issued {formatShortDate(issuedAt)}
            </p>
          )}
        </div>
        {amountNote && (
          <p className="mt-1 text-[11px] font-semibold text-amber-700 leading-snug parkingrabbit-amount-note">
            {amountNote}
          </p>
        )}
        {/* Status pill + (when ≤7 days) deadline pill side-by-side.
         *  The deadline pill only renders when proximity is supplied
         *  AND the daysToCritical is in the warning band — keeps
         *  calm tickets calm. */}
        {(pill || deadlineProximity) && (
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            {pill}
            {deadlineProximity && <DeadlineBadge proximity={deadlineProximity} />}
          </div>
        )}
        <p className="text-[12px] font-semibold text-parkingrabbit-muted mt-2 leading-tight">
          {pcnRef ?? "Reading PCN…"}
          {vehicleReg && (
            <>
              <span className="text-parkingrabbit-border mx-1.5">·</span>
              {vehicleReg}
            </>
          )}
        </p>
        {location && (
          <p className="text-[11.5px] text-parkingrabbit-muted mt-1 leading-snug flex items-start gap-1">
            <MapPin
              className="size-3 mt-0.5 shrink-0"
              strokeWidth={1.75}
            />
            <span className="min-w-0">{location}</span>
          </p>
        )}
      </div>
    </header>
  );
}
