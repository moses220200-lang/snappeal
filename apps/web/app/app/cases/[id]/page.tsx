import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ExternalLink, FileText, MapPin } from "lucide-react";
import {
  formatDateTime,
  formatPence,
  getAppeal,
  getCouncil,
  statusLabel,
} from "@/lib/mock-data";
import { Timeline } from "@/components/Timeline";

const TONE = {
  cancelled: "bg-green-50 text-green-700 border-green-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  under_review: "bg-snappeal-primary-100 text-snappeal-primary-700 border-snappeal-primary-200",
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  ready: "bg-snappeal-primary-100 text-snappeal-primary-700 border-snappeal-primary-200",
  submitting: "bg-snappeal-primary-100 text-snappeal-primary-700 border-snappeal-primary-200",
  submitted: "bg-snappeal-primary-100 text-snappeal-primary-700 border-snappeal-primary-200",
  decision_pending: "bg-snappeal-primary-100 text-snappeal-primary-700 border-snappeal-primary-200",
} as const;

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const appeal = getAppeal(id);
  if (!appeal) notFound();
  const council = getCouncil(appeal.ticket.councilSlug);

  return (
    <div className="flex flex-col gap-5 pt-6 px-5">
      <header className="flex items-center gap-3">
        <Link
          href="/app/cases"
          aria-label="Back"
          className="size-9 rounded-full border border-snappeal-border flex items-center justify-center text-snappeal-muted"
        >
          <ChevronLeft className="size-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-snappeal-muted">
            Appeal {appeal.id}
          </p>
          <h1 className="text-lg font-bold text-snappeal-navy truncate">
            PCN {appeal.ticket.pcnRef}
          </h1>
        </div>
        <span
          className={`text-[10px] font-bold uppercase tracking-wide rounded-full border px-2.5 py-1 ${TONE[appeal.status]}`}
        >
          {statusLabel[appeal.status]}
        </span>
      </header>

      {/* Ticket summary */}
      <section className="rounded-2xl bg-white border border-snappeal-border p-5">
        <p className="text-sm font-bold text-snappeal-navy">
          {appeal.ticket.issuer}
        </p>
        <p className="text-xs text-snappeal-muted mt-0.5 flex items-center gap-1.5">
          <MapPin className="size-3.5" />
          {appeal.ticket.location}
        </p>
        <div className="mt-3 pt-3 border-t border-snappeal-border grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-snappeal-muted">Vehicle</p>
            <p className="font-semibold text-snappeal-navy">
              {appeal.ticket.vehicleReg}
            </p>
          </div>
          <div>
            <p className="text-snappeal-muted">Code</p>
            <p className="font-semibold text-snappeal-navy">
              {appeal.ticket.contraventionCode}
            </p>
          </div>
          <div>
            <p className="text-snappeal-muted">Issued</p>
            <p className="font-semibold text-snappeal-navy">
              {formatDateTime(appeal.ticket.issuedAt)}
            </p>
          </div>
          <div>
            <p className="text-snappeal-muted">Amount</p>
            <p className="font-semibold text-snappeal-navy">
              {formatPence(appeal.ticket.amountPence)}
            </p>
          </div>
        </div>
        <p className="mt-3 pt-3 border-t border-snappeal-border text-xs text-snappeal-muted leading-relaxed">
          {appeal.ticket.contraventionDescription}
        </p>
      </section>

      {/* Timeline */}
      <section className="rounded-2xl bg-white border border-snappeal-border p-5">
        <p className="text-sm font-bold text-snappeal-navy mb-4">Progress</p>
        <Timeline steps={appeal.timeline} />
      </section>

      {/* Letter quick-link */}
      <Link
        href={`/app/letter/${appeal.id}`}
        className="rounded-2xl bg-white border border-snappeal-border p-4 flex items-center gap-3 hover:border-snappeal-primary transition"
      >
        <span className="size-10 rounded-xl bg-snappeal-primary-100 text-snappeal-primary flex items-center justify-center">
          <FileText className="size-5" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-snappeal-navy">
            Your appeal letter
          </p>
          <p className="text-[11px] text-snappeal-muted">
            {appeal.letter.wordCount} words · {appeal.submission.channel} submission
          </p>
        </div>
        <ExternalLink className="size-4 text-snappeal-muted" />
      </Link>

      {/* Submission card */}
      {appeal.submission.submittedAt && (
        <section className="rounded-2xl bg-white border border-snappeal-border p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-snappeal-muted mb-3">
            Submission
          </p>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-snappeal-muted">Submitted</p>
              <p className="font-semibold text-snappeal-navy">
                {formatDateTime(appeal.submission.submittedAt)}
              </p>
            </div>
            <div>
              <p className="text-snappeal-muted">Channel</p>
              <p className="font-semibold text-snappeal-navy capitalize">
                {appeal.submission.channel}
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-snappeal-muted">Council reference</p>
              <p className="font-semibold text-snappeal-navy font-mono text-[11px]">
                {appeal.submission.councilReference}
              </p>
            </div>
          </div>
          {council?.appealPortalUrl && (
            <a
              href={council.appealPortalUrl}
              target="_blank"
              rel="noopener"
              className="mt-3 pt-3 border-t border-snappeal-border flex items-center justify-between text-xs text-snappeal-primary font-semibold"
            >
              View on {council.name}&apos;s portal
              <ExternalLink className="size-3.5" />
            </a>
          )}
        </section>
      )}
    </div>
  );
}
