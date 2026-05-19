import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Appeal } from "@/lib/mock-data";
import {
  formatDate,
  formatPence,
  statusLabel,
  statusTone,
} from "@/lib/mock-data";

const TONE_CLASSES = {
  muted: "bg-slate-100 text-slate-600",
  accent: "bg-snappeal-primary-100 text-snappeal-primary-700",
  success: "bg-green-50 text-green-700",
  danger: "bg-red-50 text-red-700",
} as const;

export function AppealCard({ appeal }: { appeal: Appeal }) {
  const tone = statusTone[appeal.status];
  return (
    <Link
      href={`/app/tickets/${appeal.id}`}
      className="block rounded-2xl bg-white border border-snappeal-border p-4 hover:border-snappeal-primary transition"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${TONE_CLASSES[tone]}`}
            >
              {statusLabel[appeal.status]}
            </span>
            <span className="text-[11px] text-snappeal-muted">
              Code {appeal.ticket.contraventionCode}
            </span>
          </div>
          <p className="mt-1.5 text-sm font-semibold text-snappeal-navy truncate">
            {appeal.ticket.issuer}
          </p>
          <p className="text-xs text-snappeal-muted truncate mt-0.5">
            PCN {appeal.ticket.pcnRef} · {appeal.ticket.vehicleReg}
          </p>
          <p className="text-xs text-snappeal-muted truncate">
            {appeal.ticket.location}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-semibold text-snappeal-navy">
            {formatPence(appeal.ticket.amountPence)}
          </p>
          <p className="text-[11px] text-snappeal-muted mt-0.5">
            {formatDate(appeal.createdAt)}
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="text-snappeal-muted">
          {appeal.timeline.filter((s) => s.state === "completed").length} of{" "}
          {appeal.timeline.length} steps complete
        </span>
        <ChevronRight className="size-4 text-snappeal-muted" />
      </div>
    </Link>
  );
}
