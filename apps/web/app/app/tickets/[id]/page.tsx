"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  ExternalLink,
  FileText,
  Loader2,
  MapPin,
  Sparkles,
} from "lucide-react";
import { Timeline } from "@/components/Timeline";
import { BackHeader } from "@/components/BackHeader";
import { CouncilBadge } from "@/components/CouncilBadge";
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
  const [appeal, setAppeal] = useState<AppealRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await fetch(`/api/appeals/${id}`, {
        cache: "no-store",
        headers: { "x-snappeal-session": getOrCreateSessionId() },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (alive) setError(body?.error?.message ?? `Couldn't load (${res.status})`);
        return;
      }
      const json = (await res.json()) as { appeal: AppealRecord };
      if (alive) setAppeal(json.appeal);
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  if (error) {
    return (
      <div className="px-5 pt-8">
        <Link href="/app/tickets" className="text-sm text-snappeal-primary">
          ← Back to tickets
        </Link>
        <p className="mt-4 text-sm text-red-700">{error}</p>
      </div>
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
              Snappeal AI
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

      {appeal.letterBody && (
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
              {appeal.letterWordCount ?? 0} words
            </p>
          </div>
          <ExternalLink className="size-4 text-snappeal-muted" />
        </Link>
      )}
      </div>
    </>
  );
}
