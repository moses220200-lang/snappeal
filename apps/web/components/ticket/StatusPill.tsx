"use client";

/**
 * Status pill rendered inline with the £ amount in `<TicketCardHeader>`.
 *
 * Single source of truth for "what state is this ticket in" — the legacy
 * absolute-positioned `<ActivityIndicator>` overlay was removed from the
 * card because it duplicated this pill and collided with the £ amount.
 *
 * Extracted out of TicketCard.tsx — pure presentational + a tiny palette
 * helper. No DB, no derived state of its own.
 */
import { Check, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import type { CardKind, CardPillTone, CardState } from "@/lib/deriveCardState";

export function StatusPill({ state }: { state: CardState }) {
  const palette = pillPaletteFor(state.kind, state.pillTone);
  const showLoader =
    state.kind === "validating" ||
    state.kind === "drafting" ||
    state.kind === "submitting" ||
    state.kind === "scanning";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide whitespace-nowrap transition-colors duration-500 ${palette}`}
    >
      {showLoader ? (
        <Loader2 className="size-3 animate-spin" strokeWidth={2.5} />
      ) : state.kind === "letter_ready" ? (
        <Sparkles className="size-3" strokeWidth={2.5} fill="currentColor" />
      ) : state.kind === "submitted" || state.kind === "terminal" ? (
        state.pillTone === "success" ? (
          <CheckCircle2 className="size-3" strokeWidth={2.5} />
        ) : (
          <Check className="size-3" strokeWidth={2.5} />
        )
      ) : (
        <span className="size-1.5 rounded-full bg-current parkingrabbit-mcp-tick-dot" />
      )}
      {state.pillLabel}
    </span>
  );
}

/** Maps a (CardKind, CardPillTone) pair to its tailwind palette classes.
 *  Exposed for callers that need to render a custom pill that should
 *  match the canonical status pill colour scheme (e.g. inline pills in
 *  the body). Kept here so the palette is defined once. */
export function pillPaletteFor(kind: CardKind, tone: CardPillTone): string {
  if (tone === "info" || kind === "scanning") {
    return "bg-parkingrabbit-primary-50 text-parkingrabbit-primary border border-parkingrabbit-primary/20";
  }
  if (tone === "positive") {
    return "bg-green-50 text-green-700 border border-green-200";
  }
  if (tone === "success") {
    return "bg-green-100 text-green-800 border border-green-300";
  }
  if (tone === "warn") {
    return "bg-amber-50 text-amber-800 border border-amber-200";
  }
  if (tone === "danger") {
    return "bg-red-50 text-red-700 border border-red-200";
  }
  return "bg-parkingrabbit-bg text-parkingrabbit-muted border border-parkingrabbit-border";
}
