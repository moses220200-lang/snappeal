import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { AppealRecord } from "@/lib/server/appeals";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  ready: "Ready to send",
  submitting: "Submitting",
  submitted: "Submitted",
  under_review: "Under review",
  decision_pending: "Decision pending",
  cancelled: "Cancelled",
  rejected: "Rejected",
};

const STATUS_TONE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  ready: "bg-parkingrabbit-primary-100 text-parkingrabbit-primary-700",
  submitting: "bg-parkingrabbit-primary-100 text-parkingrabbit-primary-700",
  submitted: "bg-parkingrabbit-primary-100 text-parkingrabbit-primary-700",
  under_review: "bg-parkingrabbit-primary-100 text-parkingrabbit-primary-700",
  decision_pending: "bg-parkingrabbit-primary-100 text-parkingrabbit-primary-700",
  cancelled: "bg-green-50 text-green-700",
  rejected: "bg-red-50 text-red-700",
};

const fmtPence = (p: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(p / 100);

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export function AppealCard({ appeal }: { appeal: AppealRecord }) {
  const tone = STATUS_TONE[appeal.status] ?? STATUS_TONE.draft;
  return (
    <Link
      href={`/app/tickets/${appeal.id}`}
      className="block rounded-2xl bg-white border border-parkingrabbit-border p-4 hover:border-parkingrabbit-primary transition"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${tone}`}
            >
              {STATUS_LABEL[appeal.status] ?? appeal.status}
            </span>
            {appeal.ticket?.contraventionCode && (
              <span className="text-[11px] text-parkingrabbit-muted">
                Code {appeal.ticket.contraventionCode}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-sm font-semibold text-parkingrabbit-navy truncate">
            {appeal.ticket?.issuer ?? "Draft appeal"}
          </p>
          <p className="text-xs text-parkingrabbit-muted truncate mt-0.5">
            {appeal.ticket?.pcnRef ? `PCN ${appeal.ticket.pcnRef} · ` : ""}
            {appeal.ticket?.vehicleReg ?? ""}
          </p>
          {appeal.ticket?.location && (
            <p className="text-xs text-parkingrabbit-muted truncate">
              {appeal.ticket.location}
            </p>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          {appeal.ticket?.amountPence != null && (
            <p className="text-sm font-semibold text-parkingrabbit-navy">
              {fmtPence(appeal.ticket.amountPence)}
            </p>
          )}
          <p className="text-[11px] text-parkingrabbit-muted mt-0.5">
            {fmtDate(appeal.createdAt)}
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="text-parkingrabbit-muted">
          {appeal.timeline.filter((s) => s.state === "completed").length} of {appeal.timeline.length} steps complete
        </span>
        <ChevronRight className="size-4 text-parkingrabbit-muted" />
      </div>
    </Link>
  );
}
