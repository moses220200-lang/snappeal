"use client";

/**
 * TicketLifecycleTimeline — ONE timeline per ticket.
 *
 * Replaces the legacy trio of progress surfaces (TicketJourney 3-step,
 * ProcessingCard inline rows, and the Progress Timeline at the bottom
 * of the expanded card). A single vertical journey from upload →
 * resolution. Each step can host inline expanded content (uploaded
 * image preview, "Pick your grounds" quiz, Pay / appeal choice cards,
 * letter preview, etc.) so the body never sprouts a parallel card.
 */
import type { ReactNode } from "react";
import { AlertTriangle, Check, Loader2 } from "lucide-react";

export type LifecycleStepStatus =
  | "done"
  | "active"
  | "upcoming"
  | "failed";

export interface LifecycleStep {
  id: string;
  title: string;
  supporting?: string;
  /** When set, supplements / replaces `supporting` (e.g. due-amount line). */
  detail?: ReactNode;
  /** Inline expanded content. Mounted directly below the title when
   *  the step is active (or done if the consumer wants a sticky panel). */
  children?: ReactNode;
  status: LifecycleStepStatus;
  /** Show a spinner glyph beside the title. */
  busy?: boolean;
  /** Soft yellow / red tint inside this step row. Use for the
   *  "Outstanding" deadline line and the failure rows. */
  tint?: "warn" | "danger";
  /** When true, children escape the rail+gap indent so they render
   *  edge-to-edge inside the card (matching the footer's Delete
   *  button width). Used by Pay / appeal for the choice tiles. */
  childrenFullBleed?: boolean;
}

export function TicketLifecycleTimeline({
  steps,
}: {
  steps: LifecycleStep[];
}) {
  return (
    <ol className="flex flex-col">
      {steps.map((step, i) => (
        <LifecycleRow
          key={step.id}
          step={step}
          isLast={i === steps.length - 1}
        />
      ))}
    </ol>
  );
}

function LifecycleRow({
  step,
  isLast,
}: {
  step: LifecycleStep;
  isLast: boolean;
}) {
  const { status, tint } = step;
  const isDone = status === "done";
  const isActive = status === "active";
  const isFailed = status === "failed";

  // Connector line below this dot — green when this row is done.
  const connectorClass = isDone
    ? "bg-snappeal-success"
    : isFailed
      ? "bg-amber-300"
      : isActive
        ? "bg-snappeal-primary/40"
        : "bg-snappeal-border";

  // Only apply a tinted wrapper when the step is explicitly tinted
  // (warning / danger). For regular active steps we drop the
  // background entirely — the children render their own card surface
  // so the previous blue tint produced a "card-inside-a-card" look.
  const childWrapperClass =
    tint === "warn"
      ? "mt-3 rounded-2xl border p-3 bg-amber-50/80 border-amber-200"
      : tint === "danger"
        ? "mt-3 rounded-2xl border p-3 bg-red-50 border-red-200"
        : "mt-3";

  return (
    <li className="flex gap-3">
      {/* Rail: dot up top, connector down */}
      <div className="flex flex-col items-center w-6 shrink-0">
        <LifecycleDot status={status} />
        {!isLast && (
          <span
            className={`flex-1 w-0.5 my-1 rounded-full min-h-[12px] ${connectorClass}`}
            aria-hidden
          />
        )}
      </div>

      {/* Content */}
      <div className={`flex-1 min-w-0 ${isLast ? "pb-0" : "pb-3"}`}>
        <div className="flex items-center gap-2">
          <p
            className={`text-[13.5px] font-bold leading-tight ${
              status === "upcoming"
                ? "text-snappeal-navy/55"
                : status === "failed"
                  ? "text-amber-900"
                  : "text-snappeal-navy"
            }`}
          >
            {step.title}
          </p>
          {step.busy && isActive && (
            <Loader2
              className="size-3.5 text-snappeal-primary animate-spin"
              strokeWidth={2.5}
            />
          )}
        </div>
        {step.supporting && (
          <p
            className={`mt-0.5 text-[11.5px] leading-snug ${
              status === "upcoming"
                ? "text-snappeal-muted/80"
                : status === "failed"
                  ? "text-amber-900/85"
                  : "text-snappeal-muted"
            }`}
          >
            {step.supporting}
          </p>
        )}
        {step.detail && (
          <div className="mt-1 text-[11.5px] leading-snug">
            {step.detail}
          </div>
        )}
        {step.children && (
          <div
            className={`${childWrapperClass}${
              step.childrenFullBleed ? " -ml-9" : ""
            }`}
          >
            {step.children}
          </div>
        )}
      </div>
    </li>
  );
}

function LifecycleDot({ status }: { status: LifecycleStepStatus }) {
  if (status === "done") {
    return (
      <span
        className="size-5 rounded-full bg-snappeal-success flex items-center justify-center shadow-sm shadow-snappeal-success/30"
        aria-label="Step complete"
      >
        <Check className="size-3 text-white" strokeWidth={3} />
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span
        className="size-5 rounded-full bg-amber-500 flex items-center justify-center shadow-sm shadow-amber-500/30"
        aria-label="Action needed"
      >
        <AlertTriangle className="size-3 text-white" strokeWidth={3} />
      </span>
    );
  }
  if (status === "active") {
    return (
      <span
        className="relative size-5 flex items-center justify-center"
        aria-label="Step in progress"
      >
        <span className="absolute inset-0 rounded-full bg-snappeal-primary/25 animate-ping" />
        <span className="absolute inset-0.5 rounded-full bg-snappeal-primary/30" />
        <span className="relative size-2 rounded-full bg-snappeal-primary shadow-sm shadow-snappeal-primary/60" />
      </span>
    );
  }
  return (
    <span
      className="size-5 rounded-full border-2 border-snappeal-border bg-white"
      aria-label="Step upcoming"
    />
  );
}
