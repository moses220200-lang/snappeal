"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, FileText, Loader2, MapPin, Plus, Star } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { HorizontalTimeline } from "@/components/HorizontalTimeline";
import { getOrCreateSessionId } from "@/lib/client/session";
import type { AppealRecord } from "@/lib/server/appeals";

type Filter = "all" | "in_progress" | "awaiting" | "won" | "lost";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "in_progress", label: "In Progress" },
  { id: "awaiting", label: "Awaiting Decision" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
];

const STATUS_PILL: Record<string, { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "bg-slate-100 text-slate-700" },
  ready: { label: "Ready", tone: "bg-snappeal-primary-100 text-snappeal-primary-700" },
  submitting: { label: "Submitting", tone: "bg-snappeal-primary-100 text-snappeal-primary-700" },
  submitted: { label: "Appeal in progress", tone: "bg-snappeal-primary-100 text-snappeal-primary-700" },
  under_review: { label: "Awaiting decision", tone: "bg-amber-100 text-amber-700" },
  decision_pending: { label: "Awaiting decision", tone: "bg-amber-100 text-amber-700" },
  cancelled: { label: "Won", tone: "bg-green-100 text-green-700" },
  rejected: { label: "Lost", tone: "bg-red-100 text-red-700" },
};

function matchesFilter(appeal: AppealRecord, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "in_progress") {
    return ["draft", "ready", "submitting", "submitted"].includes(appeal.status);
  }
  if (filter === "awaiting") {
    return ["under_review", "decision_pending"].includes(appeal.status);
  }
  if (filter === "won") return appeal.status === "cancelled";
  if (filter === "lost") return appeal.status === "rejected";
  return false;
}

export default function TicketsPage() {
  const [appeals, setAppeals] = useState<AppealRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

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

  const filtered = useMemo(() => (appeals ?? []).filter((a) => matchesFilter(a, filter)), [appeals, filter]);
  const mostRecentId = filtered[0]?.id ?? null;

  return (
    <>
      <AppHeader title="Your Tickets" subtitle="Track and manage your parking ticket appeals" />
      <div className="px-5 pb-6 flex flex-col gap-4">
        <Link
          href="/app/capture"
          className="rounded-2xl bg-snappeal-action !text-white font-semibold px-5 py-3.5 flex items-center justify-between shadow-lg shadow-snappeal-action/40 hover:bg-snappeal-action-600 transition"
        >
          <span className="flex items-center gap-2 text-white">
            <Plus className="size-5 text-white" strokeWidth={2.5} />
            <span className="text-white">Start New Appeal</span>
          </span>
          <ChevronRight className="size-5 text-white" strokeWidth={2.5} />
        </Link>

        <div className="flex gap-2 overflow-x-auto -mx-1 px-1 no-scrollbar">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition ${
                filter === f.id
                  ? "bg-snappeal-primary text-white"
                  : "bg-white border border-snappeal-border text-snappeal-muted hover:text-snappeal-navy"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {appeals == null && !error && (
          <div className="rounded-2xl border border-snappeal-border bg-white p-8 flex items-center justify-center gap-2 text-sm text-snappeal-muted">
            <Loader2 className="size-4 animate-spin" />
            Loading your appeals…
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
              {appeals.length === 0
                ? "No appeals yet."
                : "No appeals match that filter."}
            </p>
            {appeals.length === 0 && (
              <Link
                href="/app/capture"
                className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-snappeal-action !text-white text-sm font-semibold px-4 py-2"
              >
                <Plus className="size-4 text-white" strokeWidth={2.5} />
                <span className="text-white">Start your first appeal</span>
              </Link>
            )}
          </div>
        )}

        {appeals && filtered.length > 0 && (
          <ul className="flex flex-col gap-3">
            {filtered.map((a) => (
              <li key={a.id}>
                <TicketCard appeal={a} isMostRecent={a.id === mostRecentId} />
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
            <p className="text-sm font-semibold text-snappeal-navy">Need help with your appeal?</p>
            <p className="text-[11px] text-snappeal-muted">
              Check our guidance and tips to improve your chances
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

function TicketCard({ appeal, isMostRecent }: { appeal: AppealRecord; isMostRecent: boolean }) {
  const pill = STATUS_PILL[appeal.status] ?? STATUS_PILL.draft;
  const issued = appeal.ticket?.issuedAt
    ? new Date(appeal.ticket.issuedAt).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;
  return (
    <Link
      href={`/app/tickets/${appeal.id}`}
      className="block rounded-2xl bg-white border border-snappeal-border p-4 hover:border-snappeal-primary transition"
    >
      {isMostRecent && (
        <span className="inline-flex items-center gap-1 rounded-full bg-snappeal-primary-50 text-snappeal-primary-700 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 mb-2">
          <Star className="size-3 fill-current" /> Most Recent
        </span>
      )}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-snappeal-navy">
            {appeal.ticket ? `PCN #${appeal.ticket.pcnRef}` : "Draft appeal"}
          </p>
          <p className="text-xs text-snappeal-muted mt-0.5">
            {appeal.ticket?.issuer ?? "Awaiting capture"}
          </p>
          <p className="text-[11px] text-snappeal-muted mt-1 flex items-center flex-wrap gap-x-3 gap-y-1">
            {issued && <span>📅 Issued {issued}</span>}
            {appeal.ticket?.location && (
              <span className="flex items-center gap-1">
                <MapPin className="size-3" />
                {appeal.ticket.location}
              </span>
            )}
          </p>
        </div>
        <span className={`text-[10px] font-bold uppercase tracking-wide rounded-full px-2.5 py-1 whitespace-nowrap ${pill.tone}`}>
          {pill.label}
        </span>
      </div>
      <div className="mt-3">
        <HorizontalTimeline steps={appeal.timeline} />
      </div>
    </Link>
  );
}
