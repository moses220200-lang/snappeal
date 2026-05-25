"use client";

/**
 * Single-source-of-truth badge for `TicketStatus`. Drives the visual
 * across the ticket detail page, the tickets list, the admin queue, and
 * any future surface. Tone is read from the canonical
 * `STATUS_TONE` map in `lib/server/connectors/types.ts`.
 *
 * When the snapshot comes from the mock connector we additionally show a
 * "preview" pill — the customer must NOT see a fake "Paid" verdict
 * dressed up as authoritative.
 */
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Lock,
  Scale,
  ShieldOff,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  STATUS_LABEL,
  STATUS_TONE,
  type ConnectorId,
  type StatusTone,
  type TicketStatus,
  type TicketStatusSnapshot,
} from "@/lib/server/connectors/types";

const ICON: Record<TicketStatus, LucideIcon> = {
  unpaid: Clock,
  paid: CheckCircle2,
  under_appeal: Scale,
  cancelled: CheckCircle2,
  charge_certificate_issued: AlertTriangle,
  closed: Lock,
  unknown: ShieldOff,
};

const TONE_CLASS: Record<StatusTone, { bg: string; text: string; border: string; iconBg: string; iconText: string }> = {
  neutral: {
    bg: "bg-snappeal-bg/50",
    text: "text-snappeal-navy",
    border: "border-snappeal-border",
    iconBg: "bg-white",
    iconText: "text-snappeal-muted",
  },
  positive: {
    bg: "bg-green-50",
    text: "text-green-900",
    border: "border-green-200",
    iconBg: "bg-green-100",
    iconText: "text-green-700",
  },
  warning: {
    bg: "bg-amber-50",
    text: "text-amber-900",
    border: "border-amber-200",
    iconBg: "bg-amber-100",
    iconText: "text-amber-700",
  },
  danger: {
    bg: "bg-red-50",
    text: "text-red-900",
    border: "border-red-200",
    iconBg: "bg-red-100",
    iconText: "text-red-700",
  },
  info: {
    bg: "bg-snappeal-primary-50",
    text: "text-snappeal-navy",
    border: "border-snappeal-primary-100",
    iconBg: "bg-snappeal-primary",
    iconText: "text-white",
  },
};

function formatAmount(pence: number | undefined | null): string | null {
  if (pence == null) return null;
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
}

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

interface Props {
  snapshot: TicketStatusSnapshot;
  /** Slim mode renders a one-line pill (used in the tickets list card).
   *  Default is the full banner with detail text + key amounts. */
  variant?: "pill" | "banner";
}

export function TicketStatusBadge({ snapshot, variant = "banner" }: Props) {
  const tone = TONE_CLASS[STATUS_TONE[snapshot.status]];
  const Icon = ICON[snapshot.status];
  const label = STATUS_LABEL[snapshot.status];
  const due = formatAmount(snapshot.currentDuePence);
  const discounted = formatAmount(snapshot.discountedDuePence);
  const discountUntil = formatDate(snapshot.discountUntil);
  const paidAt = formatDate(snapshot.paidAt);
  const isMock = snapshot.source === "mock";

  if (variant === "pill") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full ${tone.bg} border ${tone.border} px-2.5 py-1 text-[11px] font-semibold ${tone.text}`}
      >
        <Icon className="size-3" strokeWidth={2.25} />
        {label}
        {isMock && <span className="text-[9px] font-bold uppercase tracking-wide opacity-70">· preview</span>}
      </span>
    );
  }

  return (
    <section className={`rounded-2xl ${tone.bg} border ${tone.border} p-4 flex items-start gap-3`}>
      <span className={`size-10 rounded-xl ${tone.iconBg} ${tone.iconText} flex items-center justify-center shrink-0`}>
        <Icon className="size-5" strokeWidth={2} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={`text-sm font-bold ${tone.text}`}>{label}</p>
          {isMock && (
            <span className="inline-flex items-center text-[9px] font-bold uppercase tracking-wide rounded-full bg-snappeal-bg/60 border border-snappeal-border px-1.5 py-0.5 text-snappeal-muted">
              Preview · connector not live yet
            </span>
          )}
        </div>
        {snapshot.detail && (
          <p className={`text-[12px] ${tone.text} opacity-80 mt-0.5 leading-snug`}>{snapshot.detail}</p>
        )}
        {/* Status-specific amount/date cells. */}
        {(snapshot.status === "unpaid" || snapshot.status === "charge_certificate_issued") && due && (
          <p className="mt-2 text-[12px] font-semibold">
            {snapshot.status === "charge_certificate_issued" ? "Now due: " : "Due: "}
            <span>{due}</span>
            {discounted && discountUntil && (
              <span className="text-snappeal-muted font-normal">
                {" "}
                · {discounted} if paid by {discountUntil}
              </span>
            )}
          </p>
        )}
        {snapshot.status === "paid" && paidAt && (
          <p className="mt-2 text-[12px] font-semibold">Paid on {paidAt}</p>
        )}
      </div>
    </section>
  );
}

/** Re-export the connector type so consumers can import everything from
 *  this one file when they only need UI + types. */
export type { TicketStatus, TicketStatusSnapshot, ConnectorId };
