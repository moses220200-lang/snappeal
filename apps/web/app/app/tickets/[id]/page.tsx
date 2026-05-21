"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  MapPin,
  Sparkles,
  XCircle,
  Zap,
} from "lucide-react";
import { Timeline } from "@/components/Timeline";
import { BackHeader } from "@/components/BackHeader";
import { CouncilBadge } from "@/components/CouncilBadge";
import { LetterActions } from "@/components/LetterActions";
import { PaymentSheet } from "@/components/PaymentSheet";
import type { AppealRecord } from "@/lib/server/appeals";
import { getOrCreateSessionId } from "@/lib/client/session";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  ready: "Ready",
  submitting: "Submitting",
  submitted: "Submitted",
  under_review: "Under review",
  decision_pending: "Decision pending",
  cancelled: "Cancelled",
  rejected: "Rejected",
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPence(p: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(p / 100);
}

export default function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [appeal, setAppeal] = useState<AppealRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [paySheetOpen, setPaySheetOpen] = useState(false);

  // Poll while the draft is still being generated upstream, then settle on
  // a one-shot refresh. Same pattern the standalone /app/letter page used —
  // moved here now that the letter lives on the ticket detail directly.
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let polls = 0;
    const MAX_POLLS = 90;

    const tick = async () => {
      polls += 1;
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
      const json = (await res.json()) as { appeal: AppealRecord };
      setAppeal(json.appeal);
      const stillGenerating =
        !json.appeal.letterBody && json.appeal.step !== "generation_failed";
      if (stillGenerating && polls < MAX_POLLS && alive) {
        timer = setTimeout(tick, 2000);
      }
    };

    void tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [id]);

  const handlePaid = async (paymentIntentId: string) => {
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
          paymentIntentId,
        }),
      });
      const body = (await res.json()) as {
        submissionId?: string;
        error?: { message?: string };
      };
      if (!res.ok) {
        throw new Error(body?.error?.message ?? `Submission failed (${res.status})`);
      }
      if (body.submissionId) {
        router.push(`/app/submitting/${body.submissionId}`);
        return;
      }
      throw new Error("Submission accepted but no job id returned");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
      setPaySheetOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (error && !appeal) {
    // Match the visual language used by /app/submitting/[id] on the same
    // "resource missing" failure mode — branded card, clear reason,
    // single action back to the tickets list.
    return (
      <>
        <BackHeader title="Ticket not found" subtitle="" back="/app/tickets" />
        <div className="flex flex-col gap-4 px-5 pt-4 pb-10 snappeal-content-top">
          <section className="rounded-2xl bg-white border border-snappeal-border p-5 flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <span className="size-10 rounded-xl bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                <XCircle className="size-5" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-base font-bold text-snappeal-navy">
                  We couldn&apos;t find this ticket
                </p>
                <p className="text-xs text-snappeal-muted mt-0.5">
                  {error}. It may have been deleted, or the link may be out of
                  date.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => router.push("/app/tickets")}
              className="self-start inline-flex items-center gap-1.5 rounded-2xl bg-snappeal-navy text-white font-semibold text-sm px-4 py-2.5"
            >
              Back to my tickets
              <ArrowRight className="size-4" />
            </button>
          </section>
        </div>
      </>
    );
  }
  if (!appeal) {
    return (
      <div className="px-5 pt-8 flex items-center gap-2 text-sm text-snappeal-muted">
        <Loader2 className="size-4 animate-spin" />
        Loading…
      </div>
    );
  }
  const ticket = appeal.ticket;
  const submitted =
    appeal.status === "submitted" || appeal.status === "under_review";

  return (
    <>
      <BackHeader
        title={ticket ? `PCN ${ticket.pcnRef}` : "Draft appeal"}
        subtitle={`${STATUS_LABEL[appeal.status] ?? appeal.status} · ${appeal.id}`}
        back="/app/tickets"
      />
      <div className="flex flex-col gap-5 px-5 pt-4 pb-6">

      {ticket && (
        <section className="rounded-2xl bg-white border border-snappeal-border p-5">
          <CouncilBadge
            size="md"
            name={ticket.issuer}
            logoUrl={appeal.councilLogoUrl}
            logoBg={appeal.councilLogoBg}
          />
          <p className="text-xs text-snappeal-muted mt-2 flex items-center gap-1.5">
            <MapPin className="size-3.5" />
            {ticket.location}
          </p>
          <div className="mt-3 pt-3 border-t border-snappeal-border grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-snappeal-muted">Vehicle</p>
              <p className="font-semibold text-snappeal-navy">{ticket.vehicleReg}</p>
            </div>
            <div>
              <p className="text-snappeal-muted">Code</p>
              <p className="font-semibold text-snappeal-navy">{ticket.contraventionCode}</p>
            </div>
            <div>
              <p className="text-snappeal-muted">Issued</p>
              <p className="font-semibold text-snappeal-navy">{formatDateTime(ticket.issuedAt)}</p>
            </div>
            <div>
              <p className="text-snappeal-muted">Amount</p>
              <p className="font-semibold text-snappeal-navy">{formatPence(ticket.amountPence)}</p>
            </div>
          </div>
          {ticket.contraventionDescription && (
            <p className="mt-3 pt-3 border-t border-snappeal-border text-xs text-snappeal-muted leading-relaxed">
              {ticket.contraventionDescription}
            </p>
          )}
        </section>
      )}

      {(() => {
        const aiLive = appeal.status === "submitting";
        const aiReplay =
          appeal.status === "submitted" ||
          appeal.status === "under_review" ||
          appeal.status === "decision_pending" ||
          appeal.status === "cancelled" ||
          appeal.status === "rejected";
        if (!aiLive && !aiReplay) return null;
        return (
          <Link
            href={`/app/watch/${appeal.id}`}
            className="relative block rounded-2xl overflow-hidden bg-gradient-to-r from-snappeal-navy to-[#0c1a3a] text-white p-4 hover:brightness-110 transition"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-snappeal-action mb-1.5 flex items-center gap-1.5">
              <Sparkles className="size-3" />
              ParkingRabbit AI
              {aiLive && (
                <>
                  <span className="ml-1 size-1.5 rounded-full bg-snappeal-action animate-pulse" />
                  <span className="text-snappeal-action/90">Live</span>
                </>
              )}
            </p>
            <div className="flex items-center gap-3">
              <span
                className={`size-11 rounded-full flex items-center justify-center shrink-0 ${
                  aiLive
                    ? "bg-snappeal-action/15 border border-snappeal-action/40"
                    : "bg-white/10 border border-white/15"
                }`}
              >
                <Sparkles
                  className={`size-5 ${aiLive ? "text-snappeal-action" : "text-white"}`}
                />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold">
                  {aiLive ? "Filing your appeal now" : "Watch the AI submission"}
                </p>
                <p className="text-[11px] text-white/70">
                  {aiLive
                    ? "Watch live as the AI operates the council portal on your behalf."
                    : "Replay every step the AI took — screenshots, decisions, council reference."}
                </p>
              </div>
              <ChevronRight className="size-5 text-white/80 shrink-0" />
            </div>
          </Link>
        );
      })()}

      <section className="rounded-2xl bg-white border border-snappeal-border p-5">
        <p className="text-sm font-bold text-snappeal-navy mb-4">Progress</p>
        <Timeline steps={appeal.timeline} />
      </section>

      {/* Appeal letter — inlined here (previously a separate /app/letter/[id]
       *  page). Once the draft lands the user can read it, copy/share it, or
       *  tap Submit to open the PaymentSheet and have the AI Auto-Submit
       *  Agent file it through the council portal. */}
      {appeal.letterBody ? (
        <details className="group rounded-2xl bg-white border border-snappeal-border p-5">
          <summary className="cursor-pointer list-none flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-snappeal-muted">
                Appeal letter · Addressed to
              </p>
              <p className="text-xs font-semibold text-snappeal-navy leading-tight mt-1 truncate">
                {appeal.letterAddressedTo ?? appeal.ticket?.issuer ?? ""}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] text-snappeal-muted">
                {appeal.letterWordCount ?? 0} words
              </span>
              <ChevronDown
                className="size-4 text-snappeal-muted transition-transform duration-200 group-open:rotate-180"
                strokeWidth={2.25}
              />
            </div>
          </summary>
          <div className="mt-3 pt-3 border-t border-snappeal-border">
            <p className="text-xs font-bold text-snappeal-navy mb-2">
              {appeal.letterSubject}
            </p>
            <pre className="whitespace-pre-wrap text-xs text-snappeal-navy leading-relaxed font-sans">
              {appeal.letterBody}
            </pre>
          </div>
        </details>
      ) : appeal.step === "generation_failed" ? (
        <section className="rounded-2xl bg-red-50 border border-red-200 p-5 flex flex-col gap-3">
          <p className="text-sm font-semibold text-red-900">
            We couldn&apos;t draft this appeal
          </p>
          <p className="text-xs text-red-900/80 leading-relaxed">
            Something went wrong while ParkingRabbit was reading your PCN. Your card
            was not charged. You can retry from the paywall — your photos and
            notes are still saved.
          </p>
          <Link
            href="/app/paywall"
            className="self-start rounded-xl bg-red-900 text-white text-xs font-semibold px-4 py-2 hover:bg-red-800 transition"
          >
            Retry drafting
          </Link>
        </section>
      ) : (
        <section className="rounded-2xl bg-white border border-snappeal-border p-5 flex items-center gap-3 text-sm text-snappeal-muted">
          <Loader2 className="size-4 animate-spin text-snappeal-primary" />
          ParkingRabbit AI is still drafting your appeal — this usually takes about
          30 seconds.
        </section>
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
              We&apos;ll notify you the moment a reply lands in your inbox.
            </p>
          </div>
        </section>
      ) : (
        appeal.letterBody && (
          <section className="relative rounded-3xl bg-gradient-to-br from-snappeal-primary-50 via-white to-white border-2 border-snappeal-primary/40 p-5 shadow-xl shadow-snappeal-primary/10">
            <span className="absolute -top-2.5 left-5 inline-flex items-center gap-1 rounded-full bg-snappeal-primary text-white text-[10px] font-bold uppercase tracking-wide px-2.5 py-0.5 shadow-md shadow-snappeal-primary/30">
              <Zap className="size-3" strokeWidth={2.5} fill="white" />
              Recommended
            </span>

            <div className="flex items-start gap-3">
              <span className="size-11 rounded-2xl bg-snappeal-primary text-white flex items-center justify-center shrink-0 shadow-lg shadow-snappeal-primary/40">
                <Sparkles className="size-5" strokeWidth={2.25} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-bold text-snappeal-navy leading-tight">
                  Let our AI file this for you
                </p>
                <p className="text-[11.5px] text-snappeal-muted mt-1 leading-snug">
                  Our <span className="font-semibold text-snappeal-navy">AI Auto-Submit Agent</span> operates the council&apos;s online portal end-to-end on your behalf. You watch it happen live.
                </p>
              </div>
            </div>

            <ul className="grid gap-2 mt-4 pt-4 border-t border-snappeal-primary/15">
              {[
                "Files the appeal via the council's online portal",
                "Live screenshots of every step the AI takes",
                "Captures the official council reference + receipt",
                "Inbox alerts the moment a reply lands",
              ].map((line) => (
                <li key={line} className="flex items-start gap-2 text-[12px] text-snappeal-navy/85 leading-snug">
                  <CheckCircle2 className="size-4 text-snappeal-primary shrink-0 mt-px" strokeWidth={2.25} />
                  <span>{line}</span>
                </li>
              ))}
            </ul>

            <div className="mt-5 flex items-baseline justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-snappeal-muted font-semibold">
                  One-off charge
                </p>
                <p className="text-2xl font-extrabold text-snappeal-navy leading-none mt-1">
                  £2.99
                </p>
              </div>
              <p className="text-[10.5px] text-snappeal-muted text-right leading-snug">
                Non-refundable.
                <br />
                Charged only on submit.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setPaySheetOpen(true)}
              disabled={submitting}
              className="mt-4 w-full rounded-2xl bg-snappeal-primary text-white font-bold py-4 hover:bg-snappeal-primary-600 transition disabled:opacity-60 flex items-center justify-center gap-2 shadow-lg shadow-snappeal-primary/40 active:scale-[0.99]"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Submitting…
                </>
              ) : (
                <>
                  Submit appeal for £2.99
                  <ChevronRight className="size-4" strokeWidth={2.5} />
                </>
              )}
            </button>

            <p className="mt-2.5 text-center text-[10.5px] text-snappeal-muted flex items-center justify-center gap-1.5">
              <span className="inline-flex items-center gap-1">
                <Check className="size-3 text-snappeal-success" strokeWidth={3} />
                Secure payment via Stripe
              </span>
              <span className="text-snappeal-border">·</span>
              <span>Apple Pay · Google Pay · Card</span>
            </p>
          </section>
        )
      )}

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          {error}
        </p>
      )}

      {appeal.letterBody && (
        <LetterActions
          letterBody={appeal.letterBody}
          letterSubject={appeal.letterSubject ?? "ParkingRabbit appeal letter"}
        />
      )}
      </div>

      <PaymentSheet
        open={paySheetOpen}
        onClose={() => setPaySheetOpen(false)}
        appealId={appeal.id}
        onPaid={handlePaid}
        busy={submitting}
        councilName={appeal.ticket?.issuer ?? null}
      />
    </>
  );
}
