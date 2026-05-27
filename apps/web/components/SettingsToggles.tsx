"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

/** Mirrors `ParkingRabbitSettings` in lib/server/settings.ts — only the
 *  fields the UI surfaces. Operator-only toggles (workerDisabled,
 *  submissionLive's mock path, skipPaymentCheck) are deliberately
 *  NOT on this list; they're env-pinned in prod and unused in dev
 *  now that stopAtReview gives us safety on real MCP. */
interface ResolvedSettings {
  mode: "dev" | "production";
  claudeMode: "cli" | "sdk";
  mcpHeaded: boolean;
  stopAtReview: boolean;
  mcpCaptureScreenshots: boolean;
}

type BoolKey = keyof Pick<
  ResolvedSettings,
  "mcpHeaded" | "stopAtReview" | "mcpCaptureScreenshots"
>;
type ToggleKey = BoolKey | "claudeMode";

/** Mode applicability per toggle:
 *   "dev"   — only meaningful in dev (e.g. stopAtReview keeps prod
 *             submissions from actually filing — flipping it OFF in
 *             prod is the operator's choice).
 *   "prod"  — production-only knob.
 *   "both"  — relevant in both modes.
 *
 * The UI renders a per-toggle badge so the operator sees at a glance
 * whether this knob applies in the current mode. */
type Applicability = "dev" | "prod" | "both";

const ITEMS: Array<{
  key: BoolKey;
  title: string;
  body: string;
  appliesTo: Applicability;
  danger?: boolean;
}> = [
  {
    key: "stopAtReview",
    title: "Stop at review (safety brake)",
    body: "When ON the agent drives the council portal up to the FINAL REVIEW page and stops — never clicks Finish. Use this for dev / staging; leave OFF in production for real submissions. Replaces the legacy 'mock submission engine' option.",
    appliesTo: "both",
    danger: true,
  },
  {
    key: "mcpHeaded",
    title: "Show MCP browser window",
    body: "Run Playwright in headed mode so you can watch the agent drive the council portal. Useful for debugging; slower than headless. Production servers have no display so this is effectively dev-only.",
    appliesTo: "dev",
  },
  {
    key: "mcpCaptureScreenshots",
    title: "Capture MCP screenshots (audit)",
    body: "ON = lookup + dry-run agents take milestone screenshots into the appeal's audit folder. Use this to debug a council portal that's broken, audit a verdict, or sanity-check a new prompt. OFF (default) = HTML-scrape only; lookups run ~3× faster. Same default in both modes.",
    appliesTo: "both",
  },
];

const APPLIES_TO_COPY: Record<Applicability, { label: string; tone: string }> = {
  dev: {
    label: "dev only",
    tone: "bg-amber-100 text-amber-700",
  },
  prod: {
    label: "prod only",
    tone: "bg-red-100 text-red-700",
  },
  both: {
    label: "dev + prod",
    tone: "bg-slate-100 text-slate-600",
  },
};

export function SettingsToggles({ initial }: { initial: ResolvedSettings }) {
  const [settings, setSettings] = useState<ResolvedSettings>(initial);
  const [pending, setPending] = useState<ToggleKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** PATCH a single setting. Accepts boolean|null for boolean toggles
   *  and 'cli'|'sdk'|null for claudeMode. The server normalises both
   *  via the discriminated-union schema in /api/admin/settings. */
  const patch = async (
    key: ToggleKey,
    value: boolean | "cli" | "sdk" | null,
  ) => {
    setPending(key);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? `Save failed (${res.status})`);
      setSettings(json.settings as ResolvedSettings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="rounded-2xl bg-white border border-parkingrabbit-border overflow-hidden">
      <div className="px-4 py-3 bg-parkingrabbit-bg/60 border-b border-parkingrabbit-border">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-bold text-parkingrabbit-navy">Runtime toggles</h2>
            <p className="text-[11px] text-parkingrabbit-muted mt-0.5">
              In-memory overrides — survive until the next process restart, then revert to env defaults.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-1 ${
                settings.mode === "production"
                  ? "bg-red-100 text-red-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              mode: {settings.mode}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-1 bg-parkingrabbit-bg text-parkingrabbit-navy border border-parkingrabbit-border">
              claude: {settings.claudeMode}
            </span>
          </div>
        </div>
      </div>

      {/* Claude mode picker — cli vs sdk. NOT a boolean, so it gets its
       *  own segmented control above the boolean toggle list. */}
      <div className="px-4 py-4 border-b border-parkingrabbit-border flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-parkingrabbit-navy">Claude execution mode</p>
          <p className="text-[12px] text-parkingrabbit-muted mt-1 leading-relaxed">
            <strong>cli</strong> spawns the claude CLI subprocess (current stable path).
            <strong className="ml-1">sdk</strong> uses the Anthropic SDK directly — faster cold start, native streaming, planned for production. MCP support in SDK mode is stub'd today.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {pending === "claudeMode" ? (
            <Loader2 className="size-4 animate-spin text-parkingrabbit-muted" />
          ) : (
            <div className="inline-flex rounded-full bg-parkingrabbit-bg border border-parkingrabbit-border p-0.5">
              {(["cli", "sdk"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => patch("claudeMode", m)}
                  className={`px-3 py-1 text-[11px] font-bold uppercase tracking-wide rounded-full transition ${
                    settings.claudeMode === m
                      ? "bg-white text-parkingrabbit-navy shadow"
                      : "text-parkingrabbit-muted hover:text-parkingrabbit-navy"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="divide-y divide-parkingrabbit-border">
        {ITEMS.map((item) => {
          // A toggle is "demoted" when it doesn't apply to the current
          // mode — still rendered so the operator sees the full
          // surface, but with reduced visual weight + an explanatory
          // hover hint.
          const demoted =
            (item.appliesTo === "dev" && settings.mode === "production") ||
            (item.appliesTo === "prod" && settings.mode === "dev");
          const applies = APPLIES_TO_COPY[item.appliesTo];
          return (
            <div
              key={item.key}
              className={`px-4 py-4 flex items-start gap-4 ${
                item.danger ? "bg-red-50/40" : ""
              } ${demoted ? "opacity-60" : ""}`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-parkingrabbit-navy flex items-center gap-2 flex-wrap">
                  {item.title}
                  {item.danger && (
                    <span className="text-[10px] uppercase tracking-wider rounded-full bg-red-100 text-red-700 px-2 py-0.5 font-bold">
                      safety
                    </span>
                  )}
                  <span
                    className={`text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5 font-bold ${applies.tone}`}
                    title={
                      demoted
                        ? `Doesn't apply in the current mode (${settings.mode})`
                        : undefined
                    }
                  >
                    {applies.label}
                  </span>
                </p>
                <p className="text-[12px] text-parkingrabbit-muted mt-1 leading-relaxed">
                  {item.body}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {pending === item.key ? (
                  <Loader2 className="size-4 animate-spin text-parkingrabbit-muted" />
                ) : (
                  <ToggleSwitch
                    on={settings[item.key]}
                    onChange={(next) => patch(item.key, next)}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
      {error && (
        <p className="px-4 py-2 text-[12px] text-red-700 bg-red-50 border-t border-red-200">{error}</p>
      )}
    </div>
  );
}

function ToggleSwitch({ on, onChange }: { on: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
        on ? "bg-parkingrabbit-success" : "bg-parkingrabbit-border"
      }`}
    >
      <span
        className={`inline-block size-5 transform rounded-full bg-white shadow transition ${
          on ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
