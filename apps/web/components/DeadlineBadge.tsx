"use client";

/**
 * DeadlineBadge — small red/amber pill rendered on the ticket card
 * header and inside the backlog banner.
 *
 * Pure presentational; takes the proximity result from
 * `getDeadlineProximity()` and decides the tone + label:
 *   - ≤3 days  → red, "Act today" / "X days left"
 *   - ≤7 days  → amber, "X days left"
 *   - >7 days  → muted, "X days left" (only rendered if `showAlways`)
 *
 * "Discount ending" copy is used when the critical window is the
 * discount band (vs the final rep deadline). The customer sees what's
 * actually about to lapse.
 */
import { AlertTriangle, Clock } from "lucide-react";
import type { DeadlineProximity } from "@/lib/deriveDeadlineProximity";

interface Props {
  proximity: DeadlineProximity | null;
  /** When false (default), the badge ONLY renders when ≤7 days
   *  remain. When true, it always renders if proximity is non-null
   *  (used inside the appeal detail header). */
  showAlways?: boolean;
  /** Sometimes the card surface already conveys urgency (e.g. the
   *  big red Pay tile in the appeal_expired state). Pass true to
   *  render a quieter monochrome variant. */
  muted?: boolean;
  size?: "sm" | "md";
}

export function DeadlineBadge({
  proximity,
  showAlways,
  muted,
  size = "sm",
}: Props) {
  if (!proximity) return null;
  if (proximity.daysToCritical == null) return null;
  if (proximity.expired) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full ${
          muted
            ? "bg-parkingrabbit-bg text-parkingrabbit-muted border border-parkingrabbit-border"
            : "bg-red-50 text-red-700 border border-red-200"
        } ${size === "md" ? "px-2.5 py-1 text-[11.5px]" : "px-2 py-0.5 text-[10px]"} font-bold uppercase tracking-wide`}
      >
        <AlertTriangle className={size === "md" ? "size-3.5" : "size-3"} />
        Window closed
      </span>
    );
  }
  const days = proximity.daysToCritical;
  if (!showAlways && days > 7) return null;

  const tone =
    days <= 3
      ? "danger"
      : days <= 7
        ? "warn"
        : "muted";

  const palette =
    muted || tone === "muted"
      ? "bg-parkingrabbit-bg text-parkingrabbit-muted border-parkingrabbit-border"
      : tone === "danger"
        ? "bg-red-50 text-red-700 border-red-200"
        : "bg-amber-50 text-amber-800 border-amber-200";

  // Identify whether the critical date is the discount band or the
  // rep window — copy varies for clarity.
  const isDiscount =
    proximity.discountMs != null &&
    proximity.criticalMs === proximity.discountMs;
  const dayLabel =
    days === 0 ? "Last day" : days === 1 ? "1 day left" : `${days} days left`;
  const prefix = isDiscount ? "Discount ends" : "Deadline";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border ${palette} ${
        size === "md" ? "px-2.5 py-1 text-[11.5px]" : "px-2 py-0.5 text-[10px]"
      } font-bold uppercase tracking-wide`}
      title={proximity.criticalAt ?? undefined}
    >
      {tone === "danger" ? (
        <AlertTriangle className={size === "md" ? "size-3.5" : "size-3"} />
      ) : (
        <Clock className={size === "md" ? "size-3.5" : "size-3"} />
      )}
      <span>
        {prefix} · {dayLabel}
      </span>
    </span>
  );
}
