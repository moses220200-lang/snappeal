"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronRight, FileText, Loader2, MapPin, Plus, Sparkles } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { CouncilBadge } from "@/components/CouncilBadge";
import { getOrCreateSessionId } from "@/lib/client/session";
import type { AppealRecord } from "@/lib/server/appeals";

type DisplayState = "at_risk" | "due" | "appealed" | "resolved";
// "Reviewing" (at_risk) is rolled into the Challenging filter — from the
// customer's POV, choosing to dispute a ticket is one journey that starts
// with reviewing options and ends with a filed appeal. The card visual still
// distinguishes the two states (blue "£X at risk" vs purple "£X appealed");
// the filter just combines them.
type Filter = "all" | "due" | "appealed" | "resolved";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "due", label: "To Pay" },
  { id: "appealed", label: "Challenging" },
  { id: "resolved", label: "Resolved" },
];

// UK PCN 50% discount window is 14 days from issue. Inside the last 4 days
// of that window we promote the ticket from "at risk" to "due".
const DISCOUNT_WINDOW_DAYS = 14;
const TO_PAY_THRESHOLD_DAYS = DISCOUNT_WINDOW_DAYS - 4;
const MS_PER_DAY = 86_400_000;

function daysBetween(fromMs: number, toMs: number): number {
  return Math.floor((toMs - fromMs) / MS_PER_DAY);
}

function deriveDisplayState(a: AppealRecord, now: number): DisplayState {
  if (a.status === "cancelled" || a.status === "rejected") return "resolved";
  if (
    a.status === "submitting" ||
    a.status === "submitted" ||
    a.status === "under_review" ||
    a.status === "decision_pending"
  ) {
    return "appealed";
  }
  const issuedAt = a.ticket?.issuedAt ? new Date(a.ticket.issuedAt).getTime() : null;
  if (issuedAt == null) return "at_risk";
  return daysBetween(issuedAt, now) >= TO_PAY_THRESHOLD_DAYS ? "due" : "at_risk";
}

function formatGBP(pence: number): string {
  const pounds = pence / 100;
  return Number.isInteger(pounds) ? `£${pounds}` : `£${pounds.toFixed(2)}`;
}

function formatLongDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function pluralDays(n: number): string {
  return `${n} day${n === 1 ? "" : "s"}`;
}

export default function TicketsPage() {
  const [appeals, setAppeals] = useState<AppealRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  // Stamp "now" once at mount so derived deadlines stay stable across
  // re-renders (React purity rules ban Date.now() inside render).
  const [now] = useState<number>(() => Date.now());

  useEffect(() => {
    const sessionId = getOrCreateSessionId();
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(
          `/api/appeals?sessionId=${encodeURIComponent(sessionId)}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { appeals: AppealRecord[] };
        if (alive) setAppeals(json.appeals);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "Failed to load");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!appeals) return [];
    if (filter === "all") return appeals;
    return appeals.filter((a) => {
      const state = deriveDisplayState(a, now);
      // "Challenging" covers both reviewing (at_risk) and in-flight appeals.
      if (filter === "appealed") return state === "at_risk" || state === "appealed";
      return state === filter;
    });
  }, [appeals, filter, now]);

  // Counts power the filter chip badges — one pass, single snapshot.
  const counts = useMemo(() => {
    const base = { all: 0, due: 0, appealed: 0, resolved: 0, atRisk: 0 };
    if (!appeals) return base;
    base.all = appeals.length;
    for (const a of appeals) {
      const s = deriveDisplayState(a, now);
      if (s === "due") base.due++;
      else if (s === "appealed") base.appealed++;
      else if (s === "resolved") base.resolved++;
      else if (s === "at_risk") base.atRisk++;
    }
    return base;
  }, [appeals, now]);

  return (
    <>
      <AppHeader />
      <div className="px-5 pb-6 flex flex-col gap-4 pt-1">
        <div className="flex gap-2 overflow-x-auto -mx-1 px-1 no-scrollbar">
          {FILTERS.map((f) => {
            const active = filter === f.id;
            const count =
              f.id === "all"
                ? counts.all
                : f.id === "appealed"
                  ? counts.appealed + counts.atRisk
                  : counts[f.id];
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`px-3.5 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition inline-flex items-center gap-1.5 ${
                  active
                    ? "bg-snappeal-primary text-white"
                    : "bg-white border border-snappeal-border text-snappeal-muted hover:text-snappeal-navy"
                }`}
              >
                {f.label}
                {appeals && count > 0 && (
                  <span
                    className={`text-[10px] font-bold rounded-full px-1.5 py-px min-w-[18px] text-center ${
                      active ? "bg-white/20 text-white" : "bg-snappeal-bg text-snappeal-navy"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {appeals == null && !error && (
          <div className="rounded-2xl border border-snappeal-border bg-white p-8 flex items-center justify-center gap-2 text-sm text-snappeal-muted">
            <Loader2 className="size-4 animate-spin" />
            Loading your tickets…
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        )}

        {appeals && filtered.length === 0 && (
          <div className="rounded-2xl border border-dashed border-snappeal-border bg-white p-10 text-center">
            <FileText className="size-8 mx-auto text-snappeal-muted" />
            <p className="mt-3 text-sm text-snappeal-muted">
              {appeals.length === 0 ? "No tickets yet." : "No tickets match that filter."}
            </p>
            {appeals.length === 0 && (
              <Link
                href="/app/capture"
                className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-snappeal-primary !text-white text-sm font-semibold px-4 py-2"
              >
                <Plus className="size-4 text-white" strokeWidth={2.5} />
                <span className="text-white">Add your first ticket</span>
              </Link>
            )}
          </div>
        )}

        {appeals && filtered.length > 0 && (
          <ul className="flex flex-col gap-3">
            {filtered.map((a) => (
              <li key={a.id}>
                <TicketCard appeal={a} now={now} />
              </li>
            ))}
          </ul>
        )}

        <Link
          href="/app/tips"
          className="rounded-2xl bg-snappeal-primary-50 border border-snappeal-primary-100 p-4 flex items-center gap-3"
        >
          <span className="size-9 rounded-full bg-white text-snappeal-primary flex items-center justify-center flex-shrink-0">
            <FileText className="size-[1.125rem]" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-snappeal-navy">Need help with a ticket?</p>
            <p className="text-[11px] text-snappeal-muted">
              See guidance on paying, challenging, and deadlines.
            </p>
          </div>
          <span className="text-xs font-semibold text-snappeal-primary whitespace-nowrap rounded-full bg-white border border-snappeal-primary-100 px-3 py-1">
            View guidance
          </span>
        </Link>
      </div>
    </>
  );
}

function TicketCard({ appeal, now }: { appeal: AppealRecord; now: number }) {
  const state = deriveDisplayState(appeal, now);
  if (state === "resolved") return <ResolvedCard appeal={appeal} />;
  return <ActiveCard appeal={appeal} state={state} now={now} />;
}

type ActiveState = Exclude<DisplayState, "resolved">;

function ActiveCard({
  appeal,
  state,
  now,
}: {
  appeal: AppealRecord;
  state: ActiveState;
  now: number;
}) {
  const ticket = appeal.ticket;
  const issuedAtMs = ticket?.issuedAt ? new Date(ticket.issuedAt).getTime() : null;
  const daysSinceIssue =
    issuedAtMs != null ? Math.max(0, daysBetween(issuedAtMs, now)) : 0;
  const daysUntilDiscountEnds = Math.max(0, DISCOUNT_WINDOW_DAYS - daysSinceIssue);
  const discountDeadlineIso =
    issuedAtMs != null
      ? new Date(issuedAtMs + DISCOUNT_WINDOW_DAYS * MS_PER_DAY).toISOString()
      : null;

  const submittedStep = appeal.timeline?.find((s) => s.id === "appeal_submitted");
  const submittedAtMs = submittedStep?.at ? new Date(submittedStep.at).getTime() : null;
  const daysSinceSubmitted =
    submittedAtMs != null ? Math.max(0, daysBetween(submittedAtMs, now)) : 0;

  // Per-state visuals + copy. One branch sets every variable below — no
  // STATUS_PILL-style table because each state has just enough subtle
  // differences (secondary lines, sub-chips, primary CTA routing) that
  // inlining is clearer than a config object with lots of nullable fields.
  let amountLine: ReactNode;
  let amountTone: string;
  let secondaryLine: string | null = null;
  let chipLabel: string;
  let chipTone: string;
  let chipSub: string | null = null;
  let nextStep: string;
  let primaryLabel: string;
  let primaryHref: string;
  let primaryTone: string;
  const detailHref = `/app/tickets/${appeal.id}`;

  if (!ticket) {
    amountLine = "Draft ticket";
    amountTone = "text-snappeal-navy";
    chipLabel = "Add details";
    chipTone = "bg-snappeal-primary-50 text-snappeal-primary-700";
    nextStep = "Snap or enter your PCN to get started.";
    primaryLabel = "Continue";
    primaryHref = `/app/capture?appealId=${appeal.id}`;
    primaryTone = "bg-snappeal-primary text-white hover:bg-snappeal-primary-600";
  } else if (state === "at_risk") {
    amountLine = (
      <>
        {formatGBP(ticket.amountPence)}{" "}
        <span className="text-snappeal-primary">at risk</span>
      </>
    );
    amountTone = "text-snappeal-navy";
    chipLabel = `Decide in ${pluralDays(daysUntilDiscountEnds)}`;
    chipTone = "bg-snappeal-primary-50 text-snappeal-primary-700";
    nextStep = "Review your options: pay, challenge, or set reminders.";
    primaryLabel = "Review options";
    primaryHref = detailHref;
    primaryTone = "bg-snappeal-primary text-white hover:bg-snappeal-primary-600";
  } else if (state === "due") {
    amountLine = (
      <>
        {formatGBP(ticket.amountPence)}{" "}
        <span className="text-snappeal-action">due</span>
      </>
    );
    amountTone = "text-snappeal-navy";
    // Discount = half the full amount, rounded to whole pounds.
    secondaryLine = `${formatGBP(Math.floor(ticket.amountPence / 200) * 100)} if paid by ${formatShortDate(discountDeadlineIso)}`;
    chipLabel = `Discount ends in ${pluralDays(daysUntilDiscountEnds)}`;
    chipTone = "bg-snappeal-action-50 text-snappeal-action-600";
    nextStep = "Pay now to keep the reduced rate.";
    primaryLabel = "Pay ticket";
    primaryHref = detailHref;
    primaryTone = "bg-snappeal-action text-white hover:bg-snappeal-action-600";
  } else {
    amountLine = (
      <>
        {formatGBP(ticket.amountPence)}{" "}
        <span className="text-snappeal-appealed">appealed</span>
      </>
    );
    amountTone = "text-snappeal-navy";
    chipLabel = "Council reply expected";
    chipTone = "bg-snappeal-appealed-50 text-snappeal-appealed-700";
    chipSub =
      submittedAtMs != null ? `Submitted ${pluralDays(daysSinceSubmitted)} ago` : null;
    nextStep =
      "Appeal submitted. We'll notify you when the council responds.";
    primaryLabel = "Track appeal";
    primaryHref =
      appeal.status === "submitting" ? `/app/watch/${appeal.id}` : detailHref;
    primaryTone = "bg-snappeal-appealed text-white hover:bg-snappeal-appealed-700";
  }

  const pcnLabel = ticket ? `PCN #${ticket.pcnRef}` : null;
  const issuedLabel = ticket?.issuedAt ? formatLongDate(ticket.issuedAt) : null;

  return (
    <div className="rounded-2xl bg-white border border-snappeal-border overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <p className={`text-xl font-bold leading-tight ${amountTone}`}>{amountLine}</p>
            {secondaryLine && (
              <p className="text-[12px] text-snappeal-muted mt-1">{secondaryLine}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span
              className={`text-[11px] font-semibold rounded-full px-2.5 py-1 whitespace-nowrap ${chipTone}`}
            >
              {chipLabel}
            </span>
            {chipSub && (
              <span className="text-[10px] text-snappeal-muted">{chipSub}</span>
            )}
          </div>
        </div>

        {ticket && (
          <div className="mb-3">
            {pcnLabel && (
              <p className="text-sm font-semibold text-snappeal-navy">{pcnLabel}</p>
            )}
            <div className="mt-1">
              <CouncilBadge
                size="sm"
                name={ticket.issuer}
                logoUrl={appeal.councilLogoUrl}
                logoBg={appeal.councilLogoBg}
              />
            </div>
            <p className="text-[11px] text-snappeal-muted mt-1 flex items-center flex-wrap gap-x-3 gap-y-1">
              {issuedLabel && <span>Issued {issuedLabel}</span>}
              {ticket.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="size-3" />
                  {ticket.location}
                </span>
              )}
            </p>
          </div>
        )}

        <div className="rounded-xl bg-snappeal-bg px-3 py-2.5 mb-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-snappeal-muted mb-0.5">
            Next step
          </p>
          <p className="text-[13px] text-snappeal-navy leading-snug">{nextStep}</p>
        </div>

        <div className="flex gap-2">
          <Link
            href={primaryHref}
            className={`flex-1 rounded-xl text-center text-sm font-semibold py-2.5 ${primaryTone} transition`}
          >
            {primaryLabel}
          </Link>
          <Link
            href={detailHref}
            className="flex-1 rounded-xl text-center text-sm font-semibold py-2.5 border border-snappeal-border text-snappeal-navy hover:border-snappeal-primary transition"
          >
            View details
          </Link>
        </div>
      </div>

      {state === "appealed" && (
        <Link
          href={`/app/watch/${appeal.id}`}
          className="block px-4 py-3 bg-gradient-to-r from-snappeal-navy to-[#0c1a3a] !text-white hover:brightness-110 transition border-t border-snappeal-border"
        >
          <div className="flex items-center gap-3">
            <span className="size-8 rounded-full flex items-center justify-center shrink-0 bg-white/10 border border-white/15">
              <Sparkles className="size-3.5 text-white" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold text-white">
                {appeal.status === "submitting"
                  ? "Filing your appeal now"
                  : "AI activity available"}
              </p>
              <p className="text-[10px] text-white/70">
                {appeal.status === "submitting"
                  ? "Tap to watch the AI operate the council portal."
                  : "Review the steps ParkingRabbit took."}
              </p>
            </div>
            <ChevronRight className="size-4 text-white/80 shrink-0" />
          </div>
        </Link>
      )}
    </div>
  );
}

function ResolvedCard({ appeal }: { appeal: AppealRecord }) {
  const won = appeal.status === "cancelled";
  const ticket = appeal.ticket;
  const amountPence = ticket?.amountPence ?? 0;
  const decidedOn = formatLongDate(appeal.updatedAt);

  return (
    <Link
      href={`/app/tickets/${appeal.id}`}
      className="block rounded-2xl bg-white border border-snappeal-border p-4 hover:border-snappeal-primary transition"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            className={`text-lg font-bold leading-tight ${
              won ? "text-snappeal-success" : "text-snappeal-muted"
            }`}
          >
            {won ? `Cancelled ${formatGBP(amountPence)}` : `Closed ${formatGBP(amountPence)}`}
          </p>
          {ticket && (
            <>
              <div className="mt-1">
                <CouncilBadge
                  size="sm"
                  name={ticket.issuer}
                  logoUrl={appeal.councilLogoUrl}
                  logoBg={appeal.councilLogoBg}
                />
              </div>
              <p className="text-[11px] text-snappeal-muted mt-1 flex items-center flex-wrap gap-x-3 gap-y-1">
                <span>Issued {formatLongDate(ticket.issuedAt)}</span>
                {ticket.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3" />
                    {ticket.location}
                  </span>
                )}
              </p>
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[11px] text-right text-snappeal-muted whitespace-nowrap leading-tight">
            {won ? "Cancelled" : "Closed"}
            <br />
            <span className="text-[10px]">on {decidedOn}</span>
          </span>
          <ChevronRight className="size-4 text-snappeal-muted" />
        </div>
      </div>
    </Link>
  );
}
