"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { LetterActions } from "@/components/LetterActions";
import { BackHeader } from "@/components/BackHeader";
import { getOrCreateSessionId } from "@/lib/client/session";
import type { AppealRecord } from "@/lib/server/appeals";

type AppealView = AppealRecord;

export default function LetterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [appeal, setAppeal] = useState<AppealView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await fetch(`/api/appeals/${id}`, {
        cache: "no-store",
        headers: { "x-snappeal-session": getOrCreateSessionId() },
      });
      if (!alive) return;
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error?.message ?? `Couldn't load appeal (${res.status})`);
        return;
      }
      const json = (await res.json()) as { appeal: AppealView };
      setAppeal(json.appeal);
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  const handleSubmit = async () => {
    if (!appeal) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-snappeal-session": getOrCreateSessionId(),
        },
        body: JSON.stringify({
          sessionId: getOrCreateSessionId(),
          appealId: appeal.id,
          paymentIntentId: "pi_local_dev",
        }),
      });
      const body = (await res.json()) as { submissionId?: string; error?: { message?: string } };
      if (!res.ok) throw new Error(body?.error?.message ?? `Submission failed (${res.status})`);

      // Hand off to the live "watching the AI drive the portal" page, which
      // subscribes to the job's progress SSE stream and renders screenshots
      // + step events as they arrive.
      if (body.submissionId) {
        router.push(`/app/submitting/${body.submissionId}`);
        return;
      }
      throw new Error("Submission accepted but no job id returned");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (error && !appeal) {
    return (
      <div className="px-5 pt-8">
        <Link href="/app" className="text-sm text-snappeal-primary">
          ← Back to home
        </Link>
        <p className="mt-4 text-sm text-red-700">{error}</p>
      </div>
    );
  }
  if (!appeal) {
    return (
      <div className="px-5 pt-8 flex items-center gap-2 text-sm text-snappeal-muted">
        <Loader2 className="size-4 animate-spin" />
        Loading your appeal…
      </div>
    );
  }

  const submitted = appeal.status === "submitted" || appeal.status === "under_review";

  return (
    <>
      <BackHeader title="Your appeal letter" subtitle="Step 4 of 4 · Review & submit" back="/app" />
      <div className="flex flex-col gap-5 px-5 pt-4 pb-6">

      {appeal.ticket && (
        <details className="rounded-2xl bg-white border border-snappeal-border overflow-hidden">
          <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between text-sm font-semibold text-snappeal-navy">
            What we read from your PCN
            <span className="text-xs font-normal text-snappeal-primary">
              tap to toggle
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
      )}

      {appeal.letterBody ? (
        <section className="rounded-2xl bg-white border border-snappeal-border p-5">
          <div className="flex items-center justify-between mb-3 pb-3 border-b border-snappeal-border">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-snappeal-muted">
                Addressed to
              </p>
              <p className="text-xs font-semibold text-snappeal-navy leading-tight mt-1">
                {appeal.letterAddressedTo ?? appeal.ticket?.issuer ?? ""}
              </p>
            </div>
            <span className="text-[10px] text-snappeal-muted">
              {appeal.letterWordCount ?? 0} words
            </span>
          </div>
          <p className="text-xs font-bold text-snappeal-navy mb-2">
            {appeal.letterSubject}
          </p>
          <pre className="whitespace-pre-wrap text-xs text-snappeal-navy leading-relaxed font-sans">
            {appeal.letterBody}
          </pre>
        </section>
      ) : (
        <p className="text-sm text-snappeal-muted">
          The draft is still being generated. Refresh in a moment.
        </p>
      )}

      {submitted ? (
        <section className="rounded-2xl bg-green-50 border border-green-200 p-4 flex items-start gap-3">
          <span className="size-9 rounded-full bg-green-600 text-white flex items-center justify-center flex-shrink-0">
            <Check className="size-[1.125rem]" strokeWidth={3} />
          </span>
          <div>
            <p className="text-sm font-bold text-green-900">
              Submitted to the council
            </p>
            <p className="text-xs text-green-800/80 mt-0.5">
              Check the Tickets tab for the council reference and progress.
            </p>
          </div>
        </section>
      ) : (
        appeal.letterBody && (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-2xl bg-snappeal-primary text-white font-semibold py-4 hover:bg-snappeal-primary-600 transition disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Submitting…
              </>
            ) : (
              "Submit appeal to council"
            )}
          </button>
        )
      )}

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          {error}
        </p>
      )}

      {appeal.letterBody && (
        <LetterActions
          appealId={appeal.id}
          letterBody={appeal.letterBody}
          letterSubject={appeal.letterSubject ?? "Snappeal appeal letter"}
        />
      )}
      </div>
    </>
  );
}
