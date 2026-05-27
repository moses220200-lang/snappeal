"use client";

/**
 * ActivityIndicator — small "agent at work" pill rendered while a
 * Claude/MCP job is in flight on an appeal (or anywhere in the app).
 *
 * Pure presentational. Two visual sizes:
 *   - sm: list-card chrome (top-right of a ticket card)
 *   - md: global nav pill (when ANY of the user's appeals has an
 *         active job)
 *
 * The parent component decides whether to mount this — it has no
 * polling or state of its own.
 *
 * Tones map to the kind so the colour conveys which stage is running
 * without reading the label:
 *   - ocr / council_id   → calm info blue (cheap, ~3s)
 *   - lookup             → primary blue (real council read, ~60-120s)
 *   - draft              → amber (creative work, ~20-30s)
 *   - submit             → action red-ish (real filing, ~2-5 min)
 */
import { Loader2, ScanLine, ShieldCheck, Sparkles, Send } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type ActivityKind = "ocr" | "lookup" | "draft" | "submit";

interface Props {
  kind: ActivityKind | null;
  size?: "sm" | "md";
  /** Optional override for the label — when null we use the default
   *  per-kind copy below. */
  label?: string | null;
  /** Optional click handler — turns the pill into a button. The nav
   *  pill uses this to scroll to the busy card. */
  onClick?: () => void;
}

const COPY: Record<ActivityKind, { label: string; icon: LucideIcon; tone: ToneKey }> = {
  ocr: { label: "Reading PCN", icon: ScanLine, tone: "info" },
  lookup: { label: "Validating with council", icon: ShieldCheck, tone: "primary" },
  draft: { label: "Drafting appeal", icon: Sparkles, tone: "amber" },
  submit: { label: "Filing with council", icon: Send, tone: "action" },
};

type ToneKey = "info" | "primary" | "amber" | "action";

const TONE_CLASSES: Record<ToneKey, { bg: string; border: string; text: string; dot: string }> = {
  info: {
    bg: "bg-parkingrabbit-primary-50",
    border: "border-parkingrabbit-primary/15",
    text: "text-parkingrabbit-primary",
    dot: "bg-parkingrabbit-primary",
  },
  primary: {
    bg: "bg-parkingrabbit-primary-50",
    border: "border-parkingrabbit-primary/30",
    text: "text-parkingrabbit-primary",
    dot: "bg-parkingrabbit-primary",
  },
  amber: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-700",
    dot: "bg-amber-500",
  },
  action: {
    bg: "bg-parkingrabbit-action/10",
    border: "border-parkingrabbit-action/30",
    text: "text-parkingrabbit-action",
    dot: "bg-parkingrabbit-action",
  },
};

export function ActivityIndicator({
  kind,
  size = "sm",
  label,
  onClick,
}: Props) {
  if (!kind) return null;
  const config = COPY[kind];
  const tone = TONE_CLASSES[config.tone];
  const Icon = config.icon;
  const text = label ?? config.label;

  const sizeClasses =
    size === "md"
      ? "px-3 py-1.5 text-[12.5px] gap-2"
      : "px-2 py-1 text-[10.5px] gap-1.5";
  const iconSize = size === "md" ? "size-3.5" : "size-3";
  const dotSize = size === "md" ? "size-2" : "size-1.5";

  const inner = (
    <>
      <span className={`relative ${dotSize} shrink-0`}>
        <span
          className={`absolute inset-0 rounded-full ${tone.dot} animate-ping opacity-75`}
        />
        <span className={`absolute inset-0 rounded-full ${tone.dot}`} />
      </span>
      <Icon className={`${iconSize} ${tone.text}`} strokeWidth={2.25} />
      <span className={`font-semibold whitespace-nowrap ${tone.text}`}>{text}</span>
      <Loader2
        className={`${iconSize} ${tone.text} animate-spin opacity-70`}
        strokeWidth={2.25}
      />
    </>
  );

  const sharedClass = `inline-flex items-center rounded-full border ${tone.bg} ${tone.border} ${sizeClasses}`;
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${sharedClass} cursor-pointer hover:shadow-sm transition`}
        aria-label={text}
      >
        {inner}
      </button>
    );
  }
  return (
    <span className={sharedClass} role="status" aria-live="polite">
      {inner}
    </span>
  );
}

/** Map an active job kind from the appeal record to the
 *  `ActivityKind` enum the indicator expects. Returns null when the
 *  job doesn't correspond to a customer-facing activity stage. */
export function activityKindFor(
  jobKind: string | null | undefined,
): ActivityKind | null {
  switch (jobKind) {
    case "pcn_lookup":
      return "lookup";
    case "submit_appeal":
      return "submit";
    case "generate_draft":
      return "draft";
    default:
      return null;
  }
}
