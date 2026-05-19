import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, ChevronLeft, Copy, Send, Share2 } from "lucide-react";
import { getAppeal } from "@/lib/mock-data";

export default async function LetterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const appeal = getAppeal(id);
  if (!appeal) notFound();

  return (
    <div className="flex flex-col gap-5 pt-6 px-5 pb-6">
      <header className="flex items-center gap-3">
        <Link
          href="/app"
          aria-label="Back"
          className="size-9 rounded-full border border-snappeal-border flex items-center justify-center text-snappeal-muted"
        >
          <ChevronLeft className="size-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-snappeal-navy">
            Your appeal letter
          </h1>
          <p className="text-xs text-snappeal-muted">
            Step 4 of 4 · Review & submit
          </p>
        </div>
      </header>

      {/* Extracted ticket card */}
      <details className="rounded-2xl bg-white border border-snappeal-border overflow-hidden">
        <summary className="cursor-pointer px-4 py-3 flex items-center justify-between text-sm font-semibold text-snappeal-navy">
          What we read from your PCN
          <span className="text-xs font-normal text-snappeal-primary">
            tap to expand
          </span>
        </summary>
        <dl className="px-4 pb-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          {[
            ["Issuer", appeal.ticket.issuer],
            ["PCN ref", appeal.ticket.pcnRef],
            ["Vehicle", appeal.ticket.vehicleReg],
            ["Code", appeal.ticket.contraventionCode],
            ["Location", appeal.ticket.location],
            ["Amount", `£${(appeal.ticket.amountPence / 100).toFixed(2)}`],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-snappeal-muted">{label}</dt>
              <dd className="font-semibold text-snappeal-navy">{value}</dd>
            </div>
          ))}
        </dl>
      </details>

      {/* Letter */}
      <section className="rounded-2xl bg-white border border-snappeal-border p-5">
        <div className="flex items-center justify-between mb-3 pb-3 border-b border-snappeal-border">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-snappeal-muted">
              Addressed to
            </p>
            <p className="text-xs font-semibold text-snappeal-navy leading-tight mt-1">
              {appeal.letter.addressedTo}
            </p>
          </div>
          <span className="text-[10px] text-snappeal-muted">
            {appeal.letter.wordCount} words
          </span>
        </div>
        <p className="text-xs font-bold text-snappeal-navy mb-2">
          {appeal.letter.subject}
        </p>
        <pre className="whitespace-pre-wrap text-xs text-snappeal-navy leading-relaxed font-sans">
          {appeal.letter.body}
        </pre>
      </section>

      {/* Submission status */}
      {appeal.submission.submittedAt && (
        <section className="rounded-2xl bg-green-50 border border-green-200 p-4 flex items-start gap-3">
          <span className="size-9 rounded-full bg-green-600 text-white flex items-center justify-center flex-shrink-0">
            <Check className="size-[1.125rem]" strokeWidth={3} />
          </span>
          <div>
            <p className="text-sm font-bold text-green-900">
              Submitted via {appeal.submission.channel}
            </p>
            <p className="text-xs text-green-800/80 mt-0.5">
              Council reference {appeal.submission.councilReference}
            </p>
          </div>
        </section>
      )}

      {/* Actions */}
      <section className="grid grid-cols-3 gap-2">
        <button className="rounded-xl bg-white border border-snappeal-border py-3 flex flex-col items-center gap-1 text-xs font-medium text-snappeal-navy hover:border-snappeal-primary transition">
          <Copy className="size-4 text-snappeal-primary" />
          Copy
        </button>
        <button className="rounded-xl bg-white border border-snappeal-border py-3 flex flex-col items-center gap-1 text-xs font-medium text-snappeal-navy hover:border-snappeal-primary transition">
          <Share2 className="size-4 text-snappeal-primary" />
          Share
        </button>
        <Link
          href={`/app/cases/${appeal.id}`}
          className="rounded-xl bg-snappeal-primary text-white py-3 flex flex-col items-center gap-1 text-xs font-semibold hover:bg-snappeal-primary-600 transition"
        >
          <Send className="size-4" />
          Track
        </Link>
      </section>
    </div>
  );
}
