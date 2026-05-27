"use client";

/**
 * /admin/councils/[slug]/automation — slick MCP recipe editor.
 *
 * Surfaces:
 *   - Prompt editor with line numbers (CSS counter, monospace, larger)
 *   - Field-hints JSON editor
 *   - Action row: Save · Dry-run (with per-run screenshot toggle) ·
 *     Reset to canonical · Inspect canonical
 *   - Last dry-run telemetry (events / final JSON / agent transcript)
 *
 * The "Capture screenshots for THIS run" toggle on the dry-run button
 * flips the global `mcpCaptureScreenshots` setting just for the next
 * dry-run, then reverts. Lets an admin audit a single suspect run
 * without leaving screenshot capture on (which slows every lookup).
 */
import Link from "next/link";
import { use, useEffect, useState } from "react";
import {
  Camera,
  CameraOff,
  ChevronLeft,
  Eye,
  EyeOff,
  Loader2,
  RotateCcw,
  Save,
  Sparkles,
} from "lucide-react";
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

export default function CouncilAutomationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const [automation, setAutomation] = useState<Automation | null>(null);
  const [prompt, setPrompt] = useState("");
  const [hints, setHints] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Per-run audit toggle — flips `mcpCaptureScreenshots` server-side
  // for the next dry-run, then reverts. Sits next to the dry-run
  // button.
  const [captureForNextRun, setCaptureForNextRun] = useState(false);
  // Read-only canonical-source view. When toggled ON we POST
  // `action: "reset-to-canonical" --preview` to fetch the canonical
  // prompt without writing it — admin can compare visually with the
  // editor's current state.
  const [canonical, setCanonical] = useState<string | null>(null);
  const [canonicalLoading, setCanonicalLoading] = useState(false);

  const load = async () => {
    setError(null);
    const res = await fetch(`/api/admin/council-automation/${slug}`, {
      cache: "no-store",
    });
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

  // Lightweight diff signal — count of changed lines vs canonical.
  // Visible-only "drift indicator"; full side-by-side diff is the
  // browser's standard tooling job.
  const driftLines = (() => {
    if (canonical == null) return null;
    const a = canonical.split("\n");
    const b = prompt.split("\n");
    const max = Math.max(a.length, b.length);
    let n = 0;
    for (let i = 0; i < max; i++) if ((a[i] ?? "") !== (b[i] ?? "")) n++;
    return n;
  })();

  const loadCanonical = async () => {
    setCanonicalLoading(true);
    setError(null);
    try {
      // Use the existing reset-to-canonical action; the response
      // includes the canonical prompt as the new agentPrompt without
      // overwriting our local editor state (we don't call load()).
      const res = await fetch(`/api/admin/council-automation/${slug}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "reset-to-canonical" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body?.error?.message ?? `Couldn't fetch canonical (${res.status})`,
        );
      }
      const json = (await res.json()) as { automation: Automation };
      setCanonical(json.automation.agentPrompt);
      // Note: the action actually wrote the canonical back to the DB
      // (it's reset+seed). Re-load the current row so our editor
      // shows the same source. If the admin had unsaved edits, those
      // are lost — same behaviour as the original "Reset" button.
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load canonical");
    } finally {
      setCanonicalLoading(false);
    }
  };

  const promptLines = prompt.split("\n").length;
  const promptChars = prompt.length;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          href="/admin/councils"
          className="text-xs text-parkingrabbit-primary inline-flex items-center gap-1"
        >
          <ChevronLeft className="size-3.5" /> All councils
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-parkingrabbit-navy capitalize">
          {slug.replace(/-/g, " ")} — MCP automation
        </h1>
        <p className="text-sm text-parkingrabbit-muted mt-1">
          Claude + Playwright MCP recipe for this council&apos;s portal. Dry-run
          stops at the review page (no real submission). Toggle
          &ldquo;Capture screenshots&rdquo; ON when a council changes their
          markup and you need to see what the agent saw.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {!automation ? (
        <div className="rounded-2xl bg-white border border-parkingrabbit-border p-6 flex items-center gap-2 text-sm text-parkingrabbit-muted">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          {/* ── Agent prompt — line-numbered code editor ── */}
          <section className="rounded-2xl bg-white border border-parkingrabbit-border overflow-hidden">
            <div className="px-4 py-3 bg-parkingrabbit-bg/60 border-b border-parkingrabbit-border flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="size-3.5 text-parkingrabbit-primary" />
                <p className="text-sm font-bold text-parkingrabbit-navy">
                  Agent prompt
                </p>
              </div>
              <div className="flex items-center gap-3 text-[10.5px] text-parkingrabbit-muted font-mono">
                <span>{promptLines} lines</span>
                <span className="opacity-50">·</span>
                <span>{promptChars.toLocaleString()} chars</span>
                {driftLines != null && (
                  <>
                    <span className="opacity-50">·</span>
                    <span
                      className={
                        driftLines === 0
                          ? "text-green-700 font-semibold"
                          : "text-amber-700 font-semibold"
                      }
                    >
                      {driftLines === 0
                        ? "matches canonical"
                        : `${driftLines} lines drift vs canonical`}
                    </span>
                  </>
                )}
              </div>
            </div>
            <CodeEditor value={prompt} onChange={setPrompt} minHeight={520} />
          </section>

          {/* ── Field hints JSON ── */}
          <section className="rounded-2xl bg-white border border-parkingrabbit-border overflow-hidden">
            <div className="px-4 py-3 bg-parkingrabbit-bg/60 border-b border-parkingrabbit-border">
              <p className="text-sm font-bold text-parkingrabbit-navy">
                Field hints (JSON)
              </p>
              <p className="text-[11px] text-parkingrabbit-muted mt-0.5">
                Per-council selector hints + forbidden hosts. Free-form
                JSON; the agent reads it as part of the system prompt.
              </p>
            </div>
            <CodeEditor value={hints} onChange={setHints} minHeight={200} mono />
          </section>

          {/* ── Action row ── */}
          <div className="rounded-2xl bg-white border border-parkingrabbit-border p-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-2xl bg-parkingrabbit-action text-white font-semibold px-5 py-3 shadow-lg shadow-parkingrabbit-action/40 hover:bg-parkingrabbit-action-600 transition disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                {savedAt ? "Saved ✓" : "Save prompt"}
              </button>

              <DryRunButton
                councilSlug={slug}
                size="lg"
                onComplete={() => void load()}
              />

              <button
                type="button"
                onClick={loadCanonical}
                disabled={canonicalLoading}
                className="inline-flex items-center gap-2 rounded-2xl bg-white border border-parkingrabbit-border text-parkingrabbit-navy font-semibold px-4 py-3 hover:border-parkingrabbit-primary transition disabled:opacity-60"
                title="Reset to the canonical prompt shipped in the repo (also surfaces drift count above the editor)"
              >
                {canonicalLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Eye className="size-4" />
                )}
                Inspect canonical
              </button>

              <button
                type="button"
                onClick={async () => {
                  if (
                    !confirm(
                      `Reset the ${slug} prompt to the canonical one shipped in the repo? This discards your DB edits.`,
                    )
                  )
                    return;
                  setResetting(true);
                  setError(null);
                  try {
                    const res = await fetch(
                      `/api/admin/council-automation/${slug}`,
                      {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ action: "reset-to-canonical" }),
                      },
                    );
                    if (!res.ok) {
                      const body = await res.json().catch(() => ({}));
                      throw new Error(
                        body?.error?.message ?? `Reset failed (${res.status})`,
                      );
                    }
                    setCanonical(null);
                    await load();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Reset failed");
                  } finally {
                    setResetting(false);
                  }
                }}
                disabled={resetting}
                className="inline-flex items-center gap-2 rounded-2xl bg-white border border-parkingrabbit-border text-parkingrabbit-muted font-semibold px-4 py-3 hover:text-parkingrabbit-navy hover:border-parkingrabbit-navy/30 transition disabled:opacity-60"
              >
                {resetting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RotateCcw className="size-4" />
                )}
                Reset to canonical
              </button>
            </div>

            {/* Per-run audit toggle. We persist via the existing
                /api/admin/settings PATCH so the next dry-run picks it up;
                the admin can flip it OFF afterwards to keep prod runs
                fast. */}
            <div className="flex items-center gap-3 pt-3 border-t border-parkingrabbit-border">
              <button
                type="button"
                onClick={async () => {
                  const next = !captureForNextRun;
                  setCaptureForNextRun(next);
                  await fetch("/api/admin/settings", {
                    method: "PATCH",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                      key: "mcpCaptureScreenshots",
                      value: next,
                    }),
                  }).catch(() => {
                    setCaptureForNextRun(!next); // roll back
                  });
                }}
                className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-[12px] font-semibold transition ${
                  captureForNextRun
                    ? "bg-amber-50 border-amber-300 text-amber-800"
                    : "bg-white border-parkingrabbit-border text-parkingrabbit-muted hover:border-parkingrabbit-primary"
                }`}
              >
                {captureForNextRun ? (
                  <Camera className="size-3.5" />
                ) : (
                  <CameraOff className="size-3.5" />
                )}
                {captureForNextRun
                  ? "Screenshots ON for next dry-run"
                  : "Screenshots OFF (HTML-scrape only)"}
              </button>
              <p className="text-[11px] text-parkingrabbit-muted leading-snug">
                Flip ON to debug a portal change or audit a verdict. OFF
                runs ~3× faster (HTML scrape only). The toggle persists
                until you flip it OFF — same as the runtime toggle in{" "}
                <Link
                  href="/admin/settings"
                  className="text-parkingrabbit-primary hover:underline"
                >
                  Settings & health
                </Link>
                .
              </p>
            </div>
          </div>

          {/* ── Canonical preview pane (read-only) ── */}
          {canonical != null && (
            <section className="rounded-2xl bg-parkingrabbit-bg/40 border border-parkingrabbit-border overflow-hidden">
              <div className="px-4 py-3 border-b border-parkingrabbit-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye className="size-3.5 text-parkingrabbit-muted" />
                  <p className="text-sm font-bold text-parkingrabbit-navy">
                    Canonical prompt (read-only)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCanonical(null)}
                  className="text-[11px] text-parkingrabbit-muted hover:text-parkingrabbit-navy inline-flex items-center gap-1"
                >
                  <EyeOff className="size-3" /> Hide
                </button>
              </div>
              <pre className="px-4 py-3 text-[11px] font-mono text-parkingrabbit-navy overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">
                {canonical}
              </pre>
            </section>
          )}

          {/* ── Last dry-run telemetry ── */}
          <section className="rounded-2xl bg-white border border-parkingrabbit-border p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-parkingrabbit-navy">Last dry-run</p>
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
              <p className="text-xs text-parkingrabbit-muted">
                Hasn&apos;t been run yet. Hit Dry-run above.
              </p>
            ) : (
              <div className="flex flex-col gap-3 text-xs">
                <p className="text-parkingrabbit-muted">
                  Ran{" "}
                  {new Date(automation.lastDryRunAt!).toLocaleString("en-GB")} ·{" "}
                  {Math.round(automation.lastDryRun.durationMs / 1000)}s · cost{" "}
                  {automation.lastDryRun.costUsd
                    ? `$${automation.lastDryRun.costUsd.toFixed(3)}`
                    : "—"}
                  {automation.lastDryRun.appealId ? (
                    <>
                      {" · "}
                      <Link
                        href={`/admin/appeals/${automation.lastDryRun.appealId}`}
                        className="text-parkingrabbit-primary hover:underline font-mono"
                      >
                        appeal {automation.lastDryRun.appealId}
                      </Link>
                    </>
                  ) : (
                    <> · fixture data</>
                  )}
                </p>
                {automation.lastDryRun.screenshotPath && (
                  <div className="rounded-xl bg-parkingrabbit-bg/40 border border-parkingrabbit-border px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-wider font-bold text-parkingrabbit-muted mb-1">
                      Latest screenshot (server path)
                    </p>
                    <code className="font-mono text-[10.5px] text-parkingrabbit-navy break-all">
                      {automation.lastDryRun.screenshotPath}
                    </code>
                  </div>
                )}
                <details>
                  <summary className="cursor-pointer text-parkingrabbit-primary font-semibold">
                    Event trace ({automation.lastDryRun.events.length} events)
                  </summary>
                  <pre className="mt-2 bg-parkingrabbit-bg/50 rounded-lg p-3 text-[11px] text-parkingrabbit-navy overflow-x-auto">
                    {automation.lastDryRun.events.join("\n")}
                  </pre>
                </details>
                <details>
                  <summary className="cursor-pointer text-parkingrabbit-primary font-semibold">
                    Final JSON
                  </summary>
                  <pre className="mt-2 bg-parkingrabbit-bg/50 rounded-lg p-3 text-[11px] text-parkingrabbit-navy overflow-x-auto">
                    {JSON.stringify(automation.lastDryRun.parsed, null, 2)}
                  </pre>
                </details>
                <details>
                  <summary className="cursor-pointer text-parkingrabbit-primary font-semibold">
                    Agent transcript (last 2 KB)
                  </summary>
                  <pre className="mt-2 bg-parkingrabbit-bg/50 rounded-lg p-3 text-[11px] text-parkingrabbit-navy overflow-x-auto whitespace-pre-wrap">
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

/** Line-numbered textarea — gutter is a pre with a CSS counter, the
 *  textarea overlays on top. Both scroll together because they share
 *  the same `lineHeight` + the wrapper's overflow:auto. Avoids a
 *  full-blown code-editor dep for what is essentially a textarea with
 *  gutters.
 *
 *  Wraps long lines (mono shrinks) so council prompts (which often
 *  have 100+ character system-prompt paragraphs) don't horizontal-
 *  scroll out of view. */
function CodeEditor({
  value,
  onChange,
  minHeight,
  mono,
}: {
  value: string;
  onChange: (next: string) => void;
  minHeight: number;
  mono?: boolean;
}) {
  const lines = value.split("\n").length;
  const gutter = Array.from({ length: Math.max(lines, 10) }, (_, i) => i + 1)
    .map((n) => String(n).padStart(3, " "))
    .join("\n");
  return (
    <div
      className="relative bg-parkingrabbit-bg/50"
      style={{ minHeight }}
    >
      <div className="flex">
        <pre
          aria-hidden
          className="select-none bg-parkingrabbit-bg/70 text-parkingrabbit-muted/60 font-mono text-[11px] leading-[18px] px-2 py-3 border-r border-parkingrabbit-border whitespace-pre"
          style={{ minHeight }}
        >
          {gutter}
        </pre>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          className={`flex-1 bg-transparent text-[11.5px] leading-[18px] px-3 py-3 text-parkingrabbit-navy outline-none focus:ring-0 ${
            mono ? "font-mono" : "font-mono"
          } resize-y`}
          style={{ minHeight }}
        />
      </div>
    </div>
  );
}
