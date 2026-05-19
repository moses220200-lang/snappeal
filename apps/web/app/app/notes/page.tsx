import Link from "next/link";
import { ChevronLeft, Sparkles } from "lucide-react";

const PROMPTS = [
  "The signs were behind a parked truck.",
  "I had a Blue Badge with the clock set.",
  "I was loading the van for ten minutes.",
  "The suspension notice was hidden by scaffolding.",
];

export default function NotesPage() {
  return (
    <div className="flex flex-col gap-5 pt-6 px-5 pb-6">
      <header className="flex items-center gap-3">
        <Link
          href="/app/capture"
          aria-label="Back"
          className="size-9 rounded-full border border-snappeal-border flex items-center justify-center text-snappeal-muted"
        >
          <ChevronLeft className="size-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-snappeal-navy">
            What happened?
          </h1>
          <p className="text-xs text-snappeal-muted">Step 2 of 4 · Notes</p>
        </div>
      </header>

      <div className="rounded-2xl bg-white border border-snappeal-border p-2 focus-within:border-snappeal-primary transition">
        <textarea
          placeholder="In a sentence or two, what happened? (Optional — skip if your photos say enough.)"
          className="w-full min-h-40 resize-none bg-transparent p-3 text-sm placeholder:text-snappeal-muted outline-none"
        />
        <div className="flex items-center justify-between px-3 pb-2">
          <span className="text-[11px] text-snappeal-muted">
            Plain English · no jargon needed
          </span>
          <span className="text-[11px] text-snappeal-muted">0 / 800</span>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-snappeal-muted mb-2">
          Honest examples
        </p>
        <div className="flex flex-wrap gap-2">
          {PROMPTS.map((p) => (
            <button
              key={p}
              className="text-xs rounded-full bg-white border border-snappeal-border px-3 py-1.5 text-snappeal-muted hover:border-snappeal-primary hover:text-snappeal-navy transition"
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-snappeal-primary-100 p-4 flex items-start gap-3">
        <span className="size-9 rounded-full bg-white text-snappeal-primary flex items-center justify-center flex-shrink-0">
          <Sparkles className="size-[1.125rem]" />
        </span>
        <p className="text-xs text-snappeal-navy leading-relaxed">
          <strong>You can skip this step.</strong> Snappeal will draft from
          your photos alone — but a sentence or two of context produces a
          stronger appeal.
        </p>
      </div>

      <div className="mt-auto pt-6 flex flex-col gap-2.5">
        <Link
          href="/app/paywall"
          className="rounded-2xl bg-snappeal-primary text-white font-semibold py-4 text-center hover:bg-snappeal-primary-600 transition"
        >
          Generate letter — £2.99
        </Link>
        <Link
          href="/app/paywall"
          className="text-xs text-snappeal-muted text-center hover:text-snappeal-navy"
        >
          Skip notes and continue
        </Link>
      </div>
    </div>
  );
}
