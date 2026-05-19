"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronRight, Loader2, MessageSquare, Sparkles } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { getOrCreateSessionId } from "@/lib/client/session";

interface ThreadEvent {
  id: string;
  type: "draft" | "sent" | "received";
  at: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  meta?: { classification?: string; method?: string; status?: string; councilReference?: string | null };
}

interface Thread {
  appealId: string;
  pcnRef: string | null;
  council: string | null;
  status: string;
  events: ThreadEvent[];
  summary?: string | null;
}

const CLASSIFICATION_TONE: Record<string, string> = {
  cancelled: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  acknowledged: "bg-snappeal-primary-100 text-snappeal-primary-700",
  request: "bg-amber-100 text-amber-700",
  unknown: "bg-slate-100 text-slate-700",
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function InboxPage() {
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const sessionId = getOrCreateSessionId();
      const res = await fetch(`/api/inbox?sessionId=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (alive) setError(body?.error?.message ?? `Failed to load inbox (${res.status})`);
        return;
      }
      const json = (await res.json()) as { threads: Thread[] };
      if (alive) setThreads(json.threads);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const active = useMemo(() => threads?.find((t) => t.appealId === activeId) ?? null, [threads, activeId]);

  return (
    <>
      <AppHeader title="Inbox" subtitle="Every message between you and the council, all in one place." />

      <div className="px-5 pb-6">
        {threads == null && !error && (
          <div className="rounded-2xl border border-snappeal-border bg-white p-8 flex items-center justify-center gap-2 text-sm text-snappeal-muted">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        )}
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
        )}

        {threads && threads.length === 0 && (
          <div className="rounded-2xl border border-dashed border-snappeal-border bg-white p-10 text-center">
            <MessageSquare className="size-8 mx-auto text-snappeal-muted" />
            <p className="mt-3 text-sm text-snappeal-muted">No messages yet.</p>
            <p className="mt-1 text-xs text-snappeal-muted">
              Once you submit an appeal, your conversation with the council shows up here.
            </p>
            <Link
              href="/app/capture"
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-snappeal-action text-white text-sm font-semibold px-4 py-2"
            >
              <Sparkles className="size-4" /> Start an appeal
            </Link>
          </div>
        )}

        {threads && threads.length > 0 && !active && (
          <ul className="flex flex-col gap-2.5">
            {threads.map((t) => {
              const lastEvent = t.events[t.events.length - 1];
              const lastInbound = [...t.events].reverse().find((e) => e.type === "received");
              return (
                <li key={t.appealId}>
                  <button
                    type="button"
                    onClick={() => setActiveId(t.appealId)}
                    className="w-full text-left rounded-2xl bg-white border border-snappeal-border p-4 hover:border-snappeal-primary transition"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-snappeal-navy truncate">
                          {t.council ?? "Draft appeal"}
                        </p>
                        {t.pcnRef && (
                          <p className="text-[11px] text-snappeal-muted">PCN {t.pcnRef}</p>
                        )}
                        <p className="text-xs text-snappeal-navy mt-1.5 font-semibold truncate">
                          {t.summary ?? "—"}
                        </p>
                        {lastEvent && (
                          <p className="text-[11px] text-snappeal-muted truncate">
                            {lastEvent.type === "received" ? "← " : "→ "}{lastEvent.subject}
                          </p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        {lastInbound?.meta?.classification && (
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ${
                              CLASSIFICATION_TONE[lastInbound.meta.classification] ?? CLASSIFICATION_TONE.unknown
                            }`}
                          >
                            {lastInbound.meta.classification}
                          </span>
                        )}
                        <p className="text-[10px] text-snappeal-muted mt-1">
                          {lastEvent ? formatTime(lastEvent.at) : "—"}
                        </p>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {active && <ThreadView thread={active} onBack={() => setActiveId(null)} />}
      </div>
    </>
  );
}

function ThreadView({ thread, onBack }: { thread: Thread; onBack: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onBack}
        className="self-start inline-flex items-center gap-1.5 text-xs font-semibold text-snappeal-primary"
      >
        ← Back to inbox
      </button>
      <header className="rounded-2xl bg-white border border-snappeal-border p-4">
        <p className="text-sm font-bold text-snappeal-navy">{thread.council ?? "Council"}</p>
        {thread.pcnRef && <p className="text-[11px] text-snappeal-muted">PCN {thread.pcnRef}</p>}
        <Link
          href={`/app/tickets/${thread.appealId}`}
          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-snappeal-primary"
        >
          View ticket detail
          <ChevronRight className="size-3.5" />
        </Link>
      </header>
      <ol className="flex flex-col gap-3">
        {thread.events.map((e) => (
          <li
            key={e.id}
            className={`rounded-2xl border p-4 ${
              e.type === "received"
                ? "bg-white border-snappeal-border self-start max-w-[90%]"
                : "bg-snappeal-primary-50 border-snappeal-primary-100 self-end max-w-[90%]"
            }`}
          >
            <p className="text-[10px] font-bold uppercase tracking-wide text-snappeal-muted flex items-center gap-1.5">
              {e.type === "received" ? (
                <>
                  <ArrowDown className="size-3" /> from {e.from}
                </>
              ) : (
                <>
                  <ArrowUp className="size-3" /> to {e.to}
                </>
              )}
              <span className="ml-auto">{formatTime(e.at)}</span>
            </p>
            <p className="text-sm font-bold text-snappeal-navy mt-1.5">{e.subject}</p>
            <pre className="mt-2 text-xs text-snappeal-navy whitespace-pre-wrap font-sans leading-relaxed">
              {e.body}
            </pre>
            {e.meta?.classification && (
              <span
                className={`mt-2 inline-flex text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ${
                  CLASSIFICATION_TONE[e.meta.classification] ?? CLASSIFICATION_TONE.unknown
                }`}
              >
                {e.meta.classification}
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
