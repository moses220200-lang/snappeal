"use client";

/**
 * Submission-state bits — the "Due: £X · £Y if paid by Z" detail line
 * under the Outstanding step, plus the stuck-submission notice (worker
 * crashed mid-job / clock skew).
 *
 * Extracted out of TicketCard.tsx — pure presentational, no
 * server-state of its own.
 */
import { AlertTriangle, RefreshCw } from "lucide-react";
import { formatGBP, formatShortDate } from "@/lib/format";
import type { AppealRecord } from "@/lib/server/appeals";
import type { TicketStatusSnapshot } from "@/lib/server/connectors/types";

/** Renders the "Due: £X · £Y if paid by Z" line under the Outstanding
 *  step once the council has confirmed the ticket. */
export function OutstandingDetail({
  snapshot,
}: {
  snapshot: TicketStatusSnapshot | null;
}) {
  if (!snapshot) return null;
  if (
    snapshot.status !== "unpaid" &&
    snapshot.status !== "charge_certificate_issued"
  ) {
    return null;
  }
  const due =
    snapshot.currentDuePence != null
      ? formatGBP(snapshot.currentDuePence)
      : null;
  const discounted =
    snapshot.discountedDuePence != null
      ? formatGBP(snapshot.discountedDuePence)
      : null;
  const discountUntil = formatShortDate(snapshot.discountUntil);
  if (!due) return null;
  return (
    <p className="text-amber-900/90">
      <span className="font-bold text-parkingrabbit-navy">
        {snapshot.status === "charge_certificate_issued" ? "Now due: " : "Due: "}
        {due}
      </span>
      {discounted && discountUntil && (
        <span className="text-parkingrabbit-muted">
          {" · "}
          {discounted} if paid by {discountUntil}
        </span>
      )}
    </p>
  );
}

/* ─────────────────────── stuck-submission notice ─────────────────────── */

/** A submission is "stuck" when the appeal has been in `status="submitting"`
 *  longer than the worker's job-level timeout PLUS a small grace window
 *  (worker has 10 min for the submit_appeal kind — see `JOB_TIMEOUT_MS` in
 *  `lib/server/jobs/worker.ts`). The worker bounces the appeal back to
 *  "ready" on timeout, but a worker that's down or a server that crashed
 *  won't run that recovery — so we still need a client-side fallback so
 *  the customer isn't trapped on a permanently-spinning card. 12 minutes
 *  is the worker cap (10) + 2 min of headroom for clock skew + DB write
 *  propagation. */
export const STUCK_THRESHOLD_MS = 12 * 60_000;

export function isSubmissionStuck(appeal: AppealRecord): boolean {
  if (appeal.status !== "submitting") return false;
  if (!appeal.updatedAt) return false;
  const updatedAtMs = new Date(appeal.updatedAt).getTime();
  if (!Number.isFinite(updatedAtMs)) return false;
  return Date.now() - updatedAtMs > STUCK_THRESHOLD_MS;
}

/** Surfaces the stuck-submission state to the customer with a manual
 *  refresh affordance. Deliberately minimal — no destructive actions;
 *  the worker's job timeout is the authoritative recovery mechanism. */
export function StuckSubmittingNotice() {
  return (
    <section className="rounded-2xl bg-amber-50 border-2 border-amber-200 p-4 flex items-start gap-3">
      <span className="size-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
        <AlertTriangle className="size-5" strokeWidth={2.25} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold text-amber-900 leading-tight">
          This is taking longer than expected
        </p>
        <p className="text-[11.5px] text-amber-900/80 mt-1 leading-snug">
          The council portal is slow or our automation hit a snag.
          Refresh to check the latest state — if it stays stuck, the
          system will auto-retry or bounce the appeal back to ready so
          you can try again.
        </p>
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined") window.location.reload();
          }}
          className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white border border-amber-300 text-amber-900 text-[11.5px] font-semibold px-3 py-1.5 hover:bg-amber-100 transition"
        >
          <RefreshCw className="size-3.5" strokeWidth={2.25} />
          Refresh
        </button>
      </div>
    </section>
  );
}
