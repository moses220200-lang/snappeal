"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, Play, X, XCircle } from "lucide-react";

type DryRunPayload = {
  events: string[];
  finalText: string;
  parsed: unknown;
  screenshotPath: string | null;
  durationMs: number;
  costUsd: number | null;
  ok: boolean;
};

interface Props {
  councilSlug: string;
  /** When supplied, the agent runs against this real appeal's ticket data instead of a generic fixture. */
  appealId?: string | null;
  /** Visual size — "sm" fits inside table rows, "lg" fits on a settings page. */
  size?: "sm" | "lg";
  /** Override the default label. */
  label?: string;
  /** Called on completion (e.g. to refresh the parent page). */
  onComplete?: (ok: boolean) => void;
}

/**
 * Fire a Claude+Playwright MCP dry-run against the council's portal. Pass
 * `appealId` to run against real ticket data — without it the agent uses a
 * generic fixture and only validates the portal flow, not the per-appeal form.
 *
 * Renders a button + modal. The modal stays open until the run finishes so
 * admins can watch the cost / duration / event count tick up.
 */
export function DryRunButton({ councilSlug, appealId, size = "sm", label, onComplete }: Props) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DryRunPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!running || !startedAt) return;
    const id = setInterval(() => setElapsedMs(Date.now() - startedAt), 250);
    return () => clearInterval(id);
  }, [running, startedAt]);

  const run = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    setStartedAt(Date.now());
    setElapsedMs(0);
    try {
      const res = await fetch(`/api/admin/council-automation/${councilSlug}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "dry-run", appealId: appealId ?? undefined }),
      });
      const body = (await res.json().catch(() => ({}))) as { result?: DryRunPayload; error?: { message?: string } };
      if (!res.ok) throw new Error(body?.error?.message ?? `Dry-run failed (${res.status})`);
      const payload = body.result ?? null;
      setResult(payload);
      onComplete?.(payload?.ok ?? false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dry-run failed");
    } finally {
      setRunning(false);
    }
  };

  const openAndRun = () => {
    setOpen(true);
    if (!running && !result) void run();
  };

  const close = () => {
    if (running) return; // don't let the user close mid-run
    setOpen(false);
    setResult(null);
    setError(null);
    setElapsedMs(0);
    setStartedAt(null);
  };

  const buttonClass =
    size === "lg"
      ? "inline-flex items-center gap-2 rounded-2xl bg-white border border-parkingrabbit-border text-parkingrabbit-navy font-semibold px-5 py-3 hover:border-parkingrabbit-primary transition disabled:opacity-60"
      : "inline-flex items-center gap-1 text-parkingrabbit-primary hover:text-parkingrabbit-primary-700 font-semibold text-[11px] disabled:opacity-60";
  const iconClass = size === "lg" ? "size-4" : "size-3";

  return (
    <>
      <button type="button" onClick={openAndRun} disabled={running} className={buttonClass}>
        {running ? <Loader2 className={`${iconClass} animate-spin`} /> : <Play className={iconClass} />}
        {label ?? (size === "lg" ? "Dry-run against live portal" : "Dry-run")}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm disabled:cursor-not-allowed"
            disabled={running}
          />
          <div className="relative w-full max-w-2xl rounded-3xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <header className="px-5 py-4 border-b border-parkingrabbit-border flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-parkingrabbit-navy">
                  Dry-run · <span className="capitalize">{councilSlug.replace(/-/g, " ")}</span>
                </p>
                <p className="text-[11px] text-parkingrabbit-muted">
                  {appealId
                    ? `Using ticket data from appeal ${appealId}`
                    : "Using generic fixture data (no real appeal selected)"}
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                disabled={running}
                aria-label="Close"
                className="size-8 rounded-full bg-parkingrabbit-bg/50 text-parkingrabbit-muted flex items-center justify-center hover:bg-parkingrabbit-bg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <X className="size-4" />
              </button>
            </header>

            <div className="px-5 py-4 overflow-y-auto flex flex-col gap-4 text-sm">
              {running && (
                <div className="rounded-2xl bg-parkingrabbit-bg/40 border border-parkingrabbit-border p-4 flex items-center gap-3">
                  <Loader2 className="size-5 animate-spin text-parkingrabbit-primary" />
                  <div className="flex-1">
                    <p className="font-semibold text-parkingrabbit-navy">
                      Driving the live portal… ({Math.round(elapsedMs / 1000)}s)
                    </p>
                    <p className="text-[11px] text-parkingrabbit-muted">
                      Stops at the review page — never submits. Can take up to 5 minutes on first run (npx fetches @playwright/mcp).
                    </p>
                  </div>
                </div>
              )}

              {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
              )}

              {result && (
                <>
                  <div
                    className={`rounded-2xl border p-4 flex items-center gap-3 ${
                      result.ok ? "border-green-200 bg-green-50 text-green-900" : "border-red-200 bg-red-50 text-red-900"
                    }`}
                  >
                    {result.ok ? <CheckCircle2 className="size-5" /> : <XCircle className="size-5" />}
                    <div className="flex-1">
                      <p className="font-semibold">
                        {result.ok ? "Reached the review page" : "Did not reach the review page"}
                      </p>
                      <p className="text-[11px] opacity-80">
                        {Math.round(result.durationMs / 1000)}s · {result.events.length} events ·{" "}
                        {result.costUsd ? `$${result.costUsd.toFixed(3)}` : "cost unknown"}
                      </p>
                    </div>
                  </div>

                  {result.screenshotPath && (
                    <p className="text-[11px] text-parkingrabbit-muted break-all">
                      Screenshot saved to <code className="font-mono">{result.screenshotPath}</code>
                    </p>
                  )}

                  <details className="rounded-2xl border border-parkingrabbit-border bg-parkingrabbit-bg/40 p-3">
                    <summary className="cursor-pointer text-[12px] font-semibold text-parkingrabbit-primary">
                      Event trace ({result.events.length})
                    </summary>
                    <pre className="mt-2 text-[11px] text-parkingrabbit-navy overflow-x-auto">
                      {result.events.join("\n")}
                    </pre>
                  </details>

                  <details className="rounded-2xl border border-parkingrabbit-border bg-parkingrabbit-bg/40 p-3">
                    <summary className="cursor-pointer text-[12px] font-semibold text-parkingrabbit-primary">
                      Agent final JSON
                    </summary>
                    <pre className="mt-2 text-[11px] text-parkingrabbit-navy overflow-x-auto">
                      {JSON.stringify(result.parsed, null, 2)}
                    </pre>
                  </details>

                  <details className="rounded-2xl border border-parkingrabbit-border bg-parkingrabbit-bg/40 p-3">
                    <summary className="cursor-pointer text-[12px] font-semibold text-parkingrabbit-primary">
                      Transcript tail (2 KB)
                    </summary>
                    <pre className="mt-2 text-[11px] text-parkingrabbit-navy whitespace-pre-wrap overflow-x-auto">
                      {result.finalText.slice(-2000)}
                    </pre>
                  </details>

                  <a
                    href={`/admin/councils/${councilSlug}/automation`}
                    className="inline-flex items-center gap-1 text-[12px] text-parkingrabbit-primary font-semibold"
                  >
                    Edit prompt for {councilSlug} <ExternalLink className="size-3.5" />
                  </a>
                </>
              )}
            </div>

            {result && !running && (
              <footer className="px-5 py-3 border-t border-parkingrabbit-border flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => void run()}
                  className="rounded-xl bg-white border border-parkingrabbit-border text-parkingrabbit-navy text-[12px] font-semibold px-3 py-2 hover:border-parkingrabbit-primary"
                >
                  Re-run
                </button>
                <button
                  type="button"
                  onClick={close}
                  className="rounded-xl bg-parkingrabbit-navy text-white text-[12px] font-semibold px-3 py-2"
                >
                  Close
                </button>
              </footer>
            )}
          </div>
        </div>
      )}
    </>
  );
}
