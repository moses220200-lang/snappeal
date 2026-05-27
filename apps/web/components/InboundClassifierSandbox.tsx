"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

const TONES: Record<string, string> = {
  cancelled: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  acknowledged: "bg-parkingrabbit-primary-100 text-parkingrabbit-primary-700",
  request: "bg-amber-100 text-amber-700",
  unknown: "bg-slate-100 text-slate-700",
};

/**
 * Sandbox for tuning the inbound classifier. Paste a council reply and
 * see the classifier's label + reasoning without firing a real webhook.
 */
export function InboundClassifierSandbox() {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ outcome: string; reasoning: string } | null>(null);
  const [cost, setCost] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (body.trim().length < 5) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/inbound/classify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject, bodyText: body }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? `Failed (${res.status})`);
      setResult(json.classification);
      setCost(json.costUsd ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl bg-white border border-parkingrabbit-border p-5 flex flex-col gap-3">
      <div>
        <p className="text-sm font-bold text-parkingrabbit-navy">Classifier sandbox</p>
        <p className="text-xs text-parkingrabbit-muted mt-0.5">
          Paste a council reply and run it through the classifier. Doesn&apos;t persist anything.
        </p>
      </div>
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Subject (optional) — e.g. Notice of Rejection of Representations"
        className="bg-parkingrabbit-bg/50 border border-parkingrabbit-border rounded-xl px-3 py-2 text-sm outline-none focus:border-parkingrabbit-primary"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Paste the full email body here…"
        rows={8}
        className="bg-parkingrabbit-bg/50 border border-parkingrabbit-border rounded-xl px-3 py-2 text-sm outline-none focus:border-parkingrabbit-primary"
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={busy || body.trim().length < 5}
          className="inline-flex items-center gap-2 rounded-2xl bg-parkingrabbit-action text-white font-semibold px-4 py-2.5 text-sm shadow-md hover:bg-parkingrabbit-action-600 transition disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          Classify
        </button>
        {cost != null && (
          <span className="text-[11px] text-parkingrabbit-muted">cost ${cost.toFixed(4)}</span>
        )}
      </div>
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">{error}</div>
      )}
      {result && (
        <div className="rounded-xl bg-parkingrabbit-bg/40 border border-parkingrabbit-border p-3 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ${TONES[result.outcome] ?? TONES.unknown}`}>
              {result.outcome}
            </span>
          </div>
          <p className="text-xs text-parkingrabbit-navy leading-relaxed">{result.reasoning}</p>
        </div>
      )}
    </section>
  );
}
