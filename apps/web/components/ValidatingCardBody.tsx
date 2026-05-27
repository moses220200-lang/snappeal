"use client";

/**
 * ValidatingCardBody — the post-OCR gate while the Playwright MCP
 * lookup runs against the council portal.
 *
 * Replaces the older one-line `InlineStatusRow` for the validating
 * state. This is the user's primary surface for ~1-2 minutes, so it
 * earns a hero treatment: council logo, live thought stream from the
 * agent (the same ping-dot bubble pattern from CouncilCheckChip), and
 * an escape hatch for the rare case where the user can't wait.
 *
 * No Pay or Appeal tiles render here — that's the whole point of the
 * gate. The card flips into needs_decision the moment the portal
 * verdict lands and statusSnapshot updates.
 *
 * Pure presentation — the parent owns the live-progress subscription
 * (useAppealLiveState) and passes the latest thought/step in as props.
 */
import { Loader2, ShieldCheck, Building2 } from "lucide-react";

interface Props {
  /** Council display name — used in the header copy + as initials fallback. */
  councilName: string | null;
  /** Council logo URL — when present, replaces the generic ShieldCheck icon. */
  councilLogoUrl: string | null;
  /** Background colour for the logo tile (per-council branding). */
  councilLogoBg: string | null;
  /** Latest "thought" from the agent (one-line plain text). When null,
   *  we show a calm default — never an empty bubble. */
  liveThought: string | null;
  /** Most recent step caption (e.g. "Navigating to the ticket-details
   *  page"). Used as a fallback when no thought is available. */
  liveStep: string | null;
  /** Optional escape hatch — when supplied, renders a subtle text link
   *  the user can tap if the lookup is stuck. The parent flips the
   *  card into the OCR-fallback decision state. */
  onProceedWithoutValidation?: () => void;
  /** Set true while the proceed-without action is in flight. */
  busy?: boolean;
}

export function ValidatingCardBody({
  councilName,
  councilLogoUrl,
  councilLogoBg,
  liveThought,
  liveStep,
  onProceedWithoutValidation,
  busy,
}: Props) {
  const bubbleText =
    liveThought?.trim() ||
    liveStep?.trim() ||
    "Reading the council portal — usually under 2 minutes.";

  return (
    <section className="rounded-2xl bg-white border border-parkingrabbit-border p-5 flex flex-col gap-4">
      {/* Hero row — council logo + headline */}
      <div className="flex items-start gap-3">
        <span
          className="size-12 rounded-xl border border-parkingrabbit-border shrink-0 flex items-center justify-center overflow-hidden"
          style={{ background: councilLogoBg || "#ffffff" }}
          aria-hidden
        >
          {councilLogoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={councilLogoUrl}
              alt=""
              className="max-w-[80%] max-h-[80%] object-contain"
            />
          ) : (
            <Building2 className="size-5 text-parkingrabbit-muted" strokeWidth={1.75} />
          )}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[15px] font-bold text-parkingrabbit-navy leading-tight">
              Validating with {councilName ?? "the council"}
            </p>
            <span className="inline-flex items-center gap-1 rounded-full bg-parkingrabbit-primary-50 border border-parkingrabbit-primary/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-parkingrabbit-primary">
              <Loader2 className="size-3 animate-spin" strokeWidth={2.5} />
              Live
            </span>
          </div>
          <p className="text-[12px] text-parkingrabbit-muted mt-1 leading-snug">
            We're reading the council's own portal so the amount, deadline
            and photos you see are theirs — not just our scan.
          </p>
        </div>
      </div>

      {/* Live thought bubble — ping-dot + animated text */}
      <div
        className="rounded-2xl bg-parkingrabbit-primary-50/60 border border-parkingrabbit-primary/20 px-4 py-3 flex items-start gap-3"
        aria-live="polite"
        aria-atomic="true"
      >
        <span className="relative size-2 shrink-0 mt-1.5">
          <span className="absolute inset-0 rounded-full bg-parkingrabbit-primary animate-ping opacity-75" />
          <span className="absolute inset-0 rounded-full bg-parkingrabbit-primary" />
        </span>
        {/* `key` on the text forces a remount when the thought changes,
            so the fade-in transition replays on each update. */}
        <p
          key={bubbleText}
          className="flex-1 text-[12.5px] font-medium text-parkingrabbit-primary leading-snug parkingrabbit-thought-fade"
        >
          {bubbleText}
        </p>
      </div>

      {/* Reassurance row */}
      <div className="flex items-center gap-2.5 text-[11.5px] text-parkingrabbit-muted">
        <ShieldCheck className="size-3.5 text-parkingrabbit-muted shrink-0" strokeWidth={2} />
        <span className="leading-snug">
          Pay and Appeal options will appear here once the council confirms.
        </span>
      </div>

      {/* Escape hatch — only render when the parent supplies a handler.
          Deliberately understated so it doesn't compete with the calm
          "wait two minutes" pitch. */}
      {onProceedWithoutValidation && (
        <button
          type="button"
          onClick={onProceedWithoutValidation}
          disabled={busy}
          className="self-start text-[11.5px] text-parkingrabbit-primary hover:underline disabled:opacity-50 cursor-pointer"
        >
          {busy ? "Skipping…" : "I can't wait — proceed without validation →"}
        </button>
      )}
    </section>
  );
}
