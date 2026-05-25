"use client";

import type { ReactNode } from "react";
import { Check, Loader2 } from "lucide-react";

export type JourneyStepStatus = "done" | "active" | "upcoming";

export interface JourneyStep {
  id: string;
  title: string;
  supporting?: string;
  /** Optional secondary line (e.g. due amount + discount). */
  detail?: ReactNode;
  status: JourneyStepStatus;
  /** Active step only — show a dotted spinner glyph beside the title. */
  busy?: boolean;
}

export interface TicketJourneyProps {
  steps: JourneyStep[];
}

/**
 * Vertical timeline / stepper rendered inside the ticket card. Replaces
 * the legacy `TicketStatusBadge` + passive `InlineStatusRow` pair: one
 * unified surface that communicates where the ticket is in its flow.
 *
 * Visual contract: rail dot at the top of each step's row, connector
 * line down to the next step. Done = green check; active = pulsing
 * primary dot with halo; upcoming = empty outline. The numbered badge
 * sits in the content column so steps are quick to scan even before
 * the rail's colour signal lands.
 */
export function TicketJourney({ steps }: TicketJourneyProps) {
  return (
    <section className="rounded-2xl bg-white border border-snappeal-border p-4">
      <ol className="flex flex-col">
        {steps.map((step, i) => (
          <JourneyRow
            key={step.id}
            step={step}
            index={i}
            isLast={i === steps.length - 1}
          />
        ))}
      </ol>
    </section>
  );
}

function JourneyRow({
  step,
  index,
  isLast,
}: {
  step: JourneyStep;
  index: number;
  isLast: boolean;
}) {
  const isDone = step.status === "done";
  const isActive = step.status === "active";

  // Connector line below this dot — green iff this step is done. The line
  // ALWAYS reflects the lower side of this dot: a done step has a green
  // tail flowing into the next dot; everything else stays muted grey.
  const connectorClass = isDone ? "bg-snappeal-success" : "bg-snappeal-border";

  return (
    <li className="flex gap-3.5">
      {/* Rail column: dot at the top, line filling the rest of the row. */}
      <div className="flex flex-col items-center w-6 shrink-0">
        <RailDot status={step.status} />
        {!isLast && (
          <span
            className={`flex-1 w-0.5 my-1 rounded-full ${connectorClass}`}
            aria-hidden
          />
        )}
      </div>

      {/* Content column: numbered badge + title row, supporting, detail. */}
      <div
        className={`flex-1 min-w-0 ${isLast ? "pb-0" : "pb-5"}`}
      >
        <div className="flex items-center gap-2.5">
          <StepBadge index={index + 1} status={step.status} />
          <p
            className={`text-[14px] font-bold leading-tight ${
              step.status === "upcoming" ? "text-snappeal-navy/80" : "text-snappeal-navy"
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
            className={`mt-1.5 ml-[34px] text-[12px] leading-snug ${
              step.status === "upcoming"
                ? "text-snappeal-muted"
                : "text-snappeal-muted"
            }`}
          >
            {step.supporting}
          </p>
        )}
        {step.detail && (
          <div className="mt-1.5 ml-[34px] text-[12px] leading-snug">
            {step.detail}
          </div>
        )}
      </div>
    </li>
  );
}

function RailDot({ status }: { status: JourneyStepStatus }) {
  if (status === "done") {
    return (
      <span
        className="size-6 rounded-full bg-snappeal-success flex items-center justify-center shadow-sm shadow-snappeal-success/30"
        aria-label="Step complete"
      >
        <Check className="size-3.5 text-white" strokeWidth={3} />
      </span>
    );
  }
  if (status === "active") {
    return (
      <span
        className="relative size-6 flex items-center justify-center"
        aria-label="Step in progress"
      >
        <span className="absolute inset-0 rounded-full bg-snappeal-primary/25 animate-ping" />
        <span className="absolute inset-1 rounded-full bg-snappeal-primary/30" />
        <span className="relative size-2.5 rounded-full bg-snappeal-primary shadow-sm shadow-snappeal-primary/50" />
      </span>
    );
  }
  return (
    <span
      className="size-6 rounded-full border-2 border-snappeal-border bg-white"
      aria-label="Step upcoming"
    />
  );
}

function StepBadge({
  index,
  status,
}: {
  index: number;
  status: JourneyStepStatus;
}) {
  const palette =
    status === "done"
      ? "bg-snappeal-success-soft text-snappeal-success"
      : status === "active"
        ? "bg-snappeal-primary-50 text-snappeal-primary"
        : "bg-snappeal-bg text-snappeal-muted";
  return (
    <span
      className={`size-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${palette}`}
      aria-hidden
    >
      {index}
    </span>
  );
}
