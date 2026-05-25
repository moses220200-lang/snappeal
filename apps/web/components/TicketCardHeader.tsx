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

interface Props {
  council: { name: string; logoUrl?: string | null; logoBg?: string | null } | null;
  councilName: string | null;
  amountPence: number | null;
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
}

export function TicketCardHeader({
  council,
  councilName,
  amountPence,
  pcnRef,
  vehicleReg,
  issuedAt,
  location,
  pill,
  onCouncilClick,
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
        {onCouncilClick ? (
          <button
            type="button"
            onClick={onCouncilClick}
            className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-snappeal-primary/40 transition active:scale-[0.98]"
            aria-label={
              council
                ? `Change issuer (currently ${council.name})`
                : "Select issuer"
            }
          >
            <CouncilLogoTile council={council} councilName={councilName} />
          </button>
        ) : (
          <CouncilLogoTile council={council} councilName={councilName} />
        )}
        <span className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-snappeal-muted">
          Issuer
        </span>
      </div>
      <div className="flex-1 min-w-0">
        {/* Council name is implied by the big logo tile on the left,
         *  so we no longer repeat it as a text header. Issued date now
         *  sits inline with the £ amount so the price and the
         *  when-it-was-issued read together at a glance. */}
        <div className="flex items-baseline gap-2 flex-wrap">
          <p className="text-[26px] sm:text-[30px] font-extrabold text-snappeal-navy leading-none tracking-tight">
            {amountPence != null ? formatGBP(amountPence) : "£—"}
          </p>
          {issuedAt && (
            <p className="text-[11.5px] text-snappeal-muted leading-tight whitespace-nowrap">
              Issued {formatShortDate(issuedAt)}
            </p>
          )}
        </div>
        {pill && <div className="mt-2">{pill}</div>}
        <p className="text-[12px] font-semibold text-snappeal-muted mt-2 leading-tight">
          {pcnRef ?? "Reading PCN…"}
          {vehicleReg && (
            <>
              <span className="text-snappeal-border mx-1.5">·</span>
              {vehicleReg}
            </>
          )}
        </p>
        {location && (
          <p className="text-[11.5px] text-snappeal-muted mt-1 leading-snug flex items-start gap-1">
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

function CouncilLogoTile({
  council,
  councilName,
}: {
  council: Props["council"];
  councilName: Props["councilName"];
}) {
  return (
    <span
      className="size-28 rounded-2xl border border-snappeal-border shrink-0 flex items-center justify-center overflow-hidden"
      style={{ background: council?.logoBg || "#ffffff" }}
      aria-hidden
    >
      {council?.logoUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={council.logoUrl}
          alt=""
          className="max-w-[80%] max-h-[80%] object-contain"
        />
      ) : councilName ? (
        <span className="text-[24px] font-bold text-snappeal-navy">
          {initials(councilName)}
        </span>
      ) : (
        <span className="size-full bg-snappeal-bg/60 animate-pulse" />
      )}
    </span>
  );
}

function initials(name: string): string {
  const words = name
    .replace(/\b(of|the|borough|city|council|royal|corporation)\b/gi, "")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return name.charAt(0).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
