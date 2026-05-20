"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ChevronLeft, Loader2, RotateCcw, Save } from "lucide-react";
import { DryRunButton } from "@/components/DryRunButton";

interface Automation {
  councilSlug: string;
  agentPrompt: string;
  fieldHints: Record<string, unknown> | null;
  lastDryRun: {
    events: string[];
    finalText: string;
    parsed: unknown;
    durationMs: number;
    costUsd: number | null;
    screenshotPath?: string | null;
    appealId?: string | null;
  } | null;
  lastDryRunAt: string | null;
  lastDryRunOk: string | null;
  updatedAt: string;
}

export default function CouncilAutomationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [automation, setAutomation] = useState<Automation | null>(null);
  const [prompt, setPrompt] = useState("");
  const [hints, setHints] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = async () => {
    setError(null);
    const res = await fetch(`/api/admin/council-automation/${slug}`, { cache: "no-store" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body?.error?.message ?? `Failed (${res.status})`);
      return;
    }
    const json = (await res.json()) as { automation: Automation };
    setAutomation(json.automation);
    setPrompt(json.automation.agentPrompt);
    setHints(JSON.stringify(json.automation.fieldHints ?? {}, null, 2));
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      let parsedHints: Record<string, unknown> | null = null;
      if (hints.trim()) {
        try {
          parsedHints = JSON.parse(hints) as Record<string, unknown>;
        } catch (err) {
          throw new Error(`Field hints isn't valid JSON: ${String(err)}`);
        }
      }
      const res = await fetch(`/api/admin/council-automation/${slug}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentPrompt: prompt, fieldHints: parsedHints }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `Save failed (${res.status})`);
      }
      setSavedAt(Date.now());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/admin/councils" className="text-xs text-snappeal-primary inline-flex items-center gap-1">
          <ChevronLeft className="size-3.5" /> All councils
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-snappeal-navy capitalize">
          {slug.replace(/-/g, " ")} — MCP automation
        </h1>
        <p className="text-sm text-snappeal-muted mt-1">
          The Claude + Playwright MCP recipe used to submit appeals through this council&apos;s portal. Dry-run never submits — it stops at the review page and screenshots it.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
      )}

      {!automation ? (
        <div className="rounded-2xl bg-white border border-snappeal-border p-6 flex items-center gap-2 text-sm text-snappeal-muted">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          <section className="rounded-2xl bg-white border border-snappeal-border p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-snappeal-navy">Agent prompt</p>
              <p className="text-[11px] text-snappeal-muted">{prompt.length} chars</p>
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full h-96 bg-snappeal-bg/50 border border-snappeal-border rounded-xl px-3 py-2.5 text-xs font-mono text-snappeal-navy outline-none focus:border-snappeal-primary"
            />
          </section>

          <section className="rounded-2xl bg-white border border-snappeal-border p-5">
            <p className="text-sm font-bold text-snappeal-navy mb-3">Field hints (JSON)</p>
            <textarea
              value={hints}
              onChange={(e) => setHints(e.target.value)}
              className="w-full h-40 bg-snappeal-bg/50 border border-snappeal-border rounded-xl px-3 py-2.5 text-xs font-mono text-snappeal-navy outline-none focus:border-snappeal-primary"
            />
          </section>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-2xl bg-snappeal-action text-white font-semibold px-5 py-3 shadow-lg shadow-snappeal-action/40 hover:bg-snappeal-action-600 transition disabled:opacity-60"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {savedAt ? "Saved ✓" : "Save prompt"}
            </button>
            <DryRunButton councilSlug={slug} size="lg" onComplete={() => void load()} />
            <button
              type="button"
              onClick={async () => {
                if (!confirm(`Reset the ${slug} prompt to the canonical one shipped in the repo? This discards your DB edits.`)) return;
                setResetting(true);
                setError(null);
                try {
                  const res = await fetch(`/api/admin/council-automation/${slug}`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ action: "reset-to-canonical" }),
                  });
                  if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    throw new Error(body?.error?.message ?? `Reset failed (${res.status})`);
                  }
                  await load();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Reset failed");
                } finally {
                  setResetting(false);
                }
              }}
              disabled={resetting}
              className="inline-flex items-center gap-2 rounded-2xl bg-white border border-snappeal-border text-snappeal-muted font-semibold px-4 py-3 hover:text-snappeal-navy hover:border-snappeal-navy/30 transition disabled:opacity-60"
            >
              {resetting ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
              Reset to canonical
            </button>
          </div>

          <section className="rounded-2xl bg-white border border-snappeal-border p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-snappeal-navy">Last dry-run</p>
              {automation.lastDryRunAt && (
                <span
                  className={`text-[10px] font-bold uppercase tracking-wide rounded-full px-2.5 py-1 ${
                    automation.lastDryRunOk === "true"
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {automation.lastDryRunOk === "true" ? "OK" : "FAILED"}
                </span>
              )}
            </div>
            {!automation.lastDryRun ? (
              <p className="text-xs text-snappeal-muted">Hasn&apos;t been run yet. Hit Dry-run above.</p>
            ) : (
              <div className="flex flex-col gap-3 text-xs">
                <p className="text-snappeal-muted">
                  Ran {new Date(automation.lastDryRunAt!).toLocaleString("en-GB")} · {Math.round(automation.lastDryRun.durationMs / 1000)}s · cost {automation.lastDryRun.costUsd ? `$${automation.lastDryRun.costUsd.toFixed(2)}` : "—"}
                  {automation.lastDryRun.appealId ? (
                    <>
                      {" · "}
                      <Link href={`/admin/appeals/${automation.lastDryRun.appealId}`} className="text-snappeal-primary hover:underline font-mono">
                        appeal {automation.lastDryRun.appealId}
                      </Link>
                    </>
                  ) : (
                    <> · fixture data</>
                  )}
                </p>
                {automation.lastDryRun.screenshotPath && (
                  <p className="text-[11px] text-snappeal-muted break-all">
                    Screenshot: <code className="font-mono">{automation.lastDryRun.screenshotPath}</code>
                  </p>
                )}
                <details>
                  <summary className="cursor-pointer text-snappeal-primary font-semibold">
                    Event trace ({automation.lastDryRun.events.length} events)
                  </summary>
                  <pre className="mt-2 bg-snappeal-bg/50 rounded-lg p-3 text-[11px] text-snappeal-navy overflow-x-auto">
                    {automation.lastDryRun.events.join("\n")}
                  </pre>
                </details>
                <details>
                  <summary className="cursor-pointer text-snappeal-primary font-semibold">Final JSON</summary>
                  <pre className="mt-2 bg-snappeal-bg/50 rounded-lg p-3 text-[11px] text-snappeal-navy overflow-x-auto">
                    {JSON.stringify(automation.lastDryRun.parsed, null, 2)}
                  </pre>
                </details>
                <details>
                  <summary className="cursor-pointer text-snappeal-primary font-semibold">Agent transcript (last 2 KB)</summary>
                  <pre className="mt-2 bg-snappeal-bg/50 rounded-lg p-3 text-[11px] text-snappeal-navy overflow-x-auto whitespace-pre-wrap">
                    {automation.lastDryRun.finalText.slice(-2000)}
                  </pre>
                </details>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
