"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, ShieldAlert, ShieldOff } from "lucide-react";

/**
 * Admin-only switch that flips @playwright/mcp between headless and headed
 * mode for the very next submission. When ON, the agent's Chromium window
 * pops up on the dev server so you can watch it click through the council
 * portal in real time. Useful for debugging why a customer submission gets
 * stuck.
 *
 * The setting is process-scope and reverts to the PARKINGRABBIT_MCP_HEADED env
 * default on dev-server restart — by design.
 */
export function McpHeadedToggle() {
  const [headed, setHeaded] = useState<boolean | null>(null);
  const [stopAtReview, setStopAtReviewState] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<"headed" | "stop" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/settings/mcp", { cache: "no-store" });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const body = (await res.json()) as { mcpHeaded: boolean; stopAtReview: boolean };
        if (alive) {
          setHeaded(body.mcpHeaded);
          setStopAtReviewState(body.stopAtReview);
        }
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "load failed");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const toggle = async () => {
    if (headed === null || busy) return;
    setBusy("headed");
    setError(null);
    try {
      const res = await fetch("/api/admin/settings/mcp", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mcpHeaded: !headed }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `status ${res.status}`);
      }
      const next = (await res.json()) as { mcpHeaded: boolean };
      setHeaded(next.mcpHeaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : "update failed");
    } finally {
      setBusy(null);
    }
  };

  const toggleStopAtReview = async () => {
    if (stopAtReview === null || busy) return;
    if (
      stopAtReview &&
      !confirm(
        "Disable safety mode? After this, ANY customer Submit on a real appeal will actually lodge it with the council. Are you sure?",
      )
    ) {
      return;
    }
    setBusy("stop");
    setError(null);
    try {
      const res = await fetch("/api/admin/settings/mcp", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stopAtReview: !stopAtReview }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `status ${res.status}`);
      }
      const next = (await res.json()) as { stopAtReview: boolean };
      setStopAtReviewState(next.stopAtReview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "update failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* SAFETY MODE — stop-at-review guard. Defaults ON. Coloured red when
       *  OFF so the operator can never miss that real submissions are armed. */}
      <div
        className={`rounded-2xl border p-5 flex items-center gap-4 ${
          stopAtReview === false
            ? "bg-red-50 border-red-300"
            : "bg-white border-parkingrabbit-border"
        }`}
      >
        <span
          className={`size-10 rounded-full flex items-center justify-center shrink-0 ${
            stopAtReview === false
              ? "bg-red-100 text-red-700"
              : "bg-green-100 text-green-700"
          }`}
        >
          {stopAtReview === false ? (
            <ShieldOff className="size-5" />
          ) : (
            <ShieldAlert className="size-5" />
          )}
        </span>
        <div className="flex-1">
          <p className="text-sm font-bold text-parkingrabbit-navy">
            Safety mode — stop at review
          </p>
          <p className="text-[12px] text-parkingrabbit-muted mt-0.5">
            {stopAtReview === null
              ? "loading…"
              : stopAtReview
                ? "ON — the agent drives the council portal up to the final review page and STOPS. No real submission will be sent. Dev / staging default."
                : "⚠️ OFF — the agent WILL click Finish and lodge a real PCN appeal with the council on the next Submit. Only enable this in production."}
          </p>
          {error && <p className="text-[11px] text-red-700 mt-1">{error}</p>}
        </div>
        <button
          type="button"
          onClick={toggleStopAtReview}
          disabled={stopAtReview === null || busy !== null}
          aria-pressed={stopAtReview ?? false}
          className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition disabled:opacity-50 ${
            stopAtReview ? "bg-green-500" : "bg-red-500"
          }`}
        >
          <span
            className={`inline-block size-5 rounded-full bg-white shadow transform transition ${
              stopAtReview ? "translate-x-6" : "translate-x-1"
            }`}
          />
          {busy === "stop" && (
            <Loader2 className="absolute inset-0 m-auto size-3 animate-spin text-white" />
          )}
        </button>
      </div>

      {/* MCP browser visibility — Headless ↔ Headed. */}
      <div className="rounded-2xl bg-white border border-parkingrabbit-border p-5 flex items-center gap-4">
        <span
          className={`size-10 rounded-full flex items-center justify-center shrink-0 ${
            headed ? "bg-amber-100 text-amber-700" : "bg-parkingrabbit-bg text-parkingrabbit-muted"
          }`}
        >
          {headed ? <Eye className="size-5" /> : <EyeOff className="size-5" />}
        </span>
        <div className="flex-1">
          <p className="text-sm font-bold text-parkingrabbit-navy">MCP browser visibility</p>
          <p className="text-[12px] text-parkingrabbit-muted mt-0.5">
            {headed === null
              ? "loading…"
              : headed
                ? "Headed — Chromium window pops up on the dev server during every dry-run and live submission."
                : "Headless — Chromium runs invisibly (production-like). Toggle on to watch the agent drive the portal."}
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={headed === null || busy !== null}
          aria-pressed={headed ?? false}
          className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition disabled:opacity-50 ${
            headed ? "bg-amber-500" : "bg-parkingrabbit-border"
          }`}
        >
          <span
            className={`inline-block size-5 rounded-full bg-white shadow transform transition ${
              headed ? "translate-x-6" : "translate-x-1"
            }`}
          />
          {busy === "headed" && (
            <Loader2 className="absolute inset-0 m-auto size-3 animate-spin text-white" />
          )}
        </button>
      </div>
    </div>
  );
}
