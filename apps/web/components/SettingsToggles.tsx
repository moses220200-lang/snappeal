"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

interface ResolvedSettings {
  mcpHeaded: boolean;
  stopAtReview: boolean;
  submissionLive: boolean;
  workerDisabled: boolean;
  fakePayment: boolean;
  skipPaymentCheck: boolean;
}

type ToggleKey = keyof ResolvedSettings;

const ITEMS: Array<{
  key: ToggleKey;
  title: string;
  body: string;
  /** Override toggles can be reset to "follow env" (null). */
  hasNullReset?: boolean;
  /** Visual emphasis for safety-critical toggles. */
  danger?: boolean;
}> = [
  {
    key: "stopAtReview",
    title: "Stop at review (safety brake)",
    body: "When ON the portal-automation agent drives the council form up to the review page but NEVER clicks Finish. Leave ON unless you're explicitly testing live submission.",
    danger: true,
  },
  {
    key: "mcpHeaded",
    title: "Show MCP browser window",
    body: "Run Playwright in headed mode so you can watch the agent drive the council portal. Useful for debugging; slower than headless.",
  },
  {
    key: "submissionLive",
    title: "Submission engine LIVE",
    body: "OFF (override) = deterministic mock. ON (override) = real Playwright MCP. Use the env-default option to follow SNAPPEAL_SUBMISSION_LIVE.",
    hasNullReset: true,
  },
  {
    key: "workerDisabled",
    title: "Disable in-process worker",
    body: "ON = the Next.js server won't drain the job queue (use when an external worker box is running). Note: takes effect on next process boot, not immediately.",
    hasNullReset: true,
  },
  {
    key: "fakePayment",
    title: "Fake-payment buttons (dev)",
    body: "Render the Apple/Google/Card fake-pay buttons on /app/paywall so dev work skips Stripe round-trips. Override only affects this process.",
    hasNullReset: true,
  },
  {
    key: "skipPaymentCheck",
    title: "Skip Stripe verification (dev)",
    body: "Skip the PaymentIntent status check on /api/submit. Useful for dev; never enable in prod.",
    hasNullReset: true,
  },
];

export function SettingsToggles({ initial }: { initial: ResolvedSettings }) {
  const [settings, setSettings] = useState<ResolvedSettings>(initial);
  const [pending, setPending] = useState<ToggleKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const patch = async (key: ToggleKey, value: boolean | null) => {
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
    <div className="rounded-2xl bg-white border border-snappeal-border overflow-hidden">
      <div className="px-4 py-3 bg-snappeal-bg/60 border-b border-snappeal-border">
        <h2 className="text-sm font-bold text-snappeal-navy">Runtime toggles</h2>
        <p className="text-[11px] text-snappeal-muted mt-0.5">
          In-memory overrides — survive until the next process restart, then revert to env defaults.
        </p>
      </div>
      <div className="divide-y divide-snappeal-border">
        {ITEMS.map((item) => (
          <div key={item.key} className={`px-4 py-4 flex items-start gap-4 ${item.danger ? "bg-red-50/40" : ""}`}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-snappeal-navy flex items-center gap-2">
                {item.title}
                {item.danger && (
                  <span className="text-[10px] uppercase tracking-wider rounded-full bg-red-100 text-red-700 px-2 py-0.5 font-bold">
                    safety
                  </span>
                )}
              </p>
              <p className="text-[12px] text-snappeal-muted mt-1 leading-relaxed">{item.body}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {pending === item.key ? (
                <Loader2 className="size-4 animate-spin text-snappeal-muted" />
              ) : (
                <>
                  <ToggleSwitch
                    on={settings[item.key]}
                    onChange={(next) => patch(item.key, next)}
                  />
                  {item.hasNullReset && (
                    <button
                      type="button"
                      onClick={() => patch(item.key, null)}
                      className="text-[10px] uppercase tracking-wide text-snappeal-primary font-semibold hover:underline"
                      title="Revert to env default"
                    >
                      env
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
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
        on ? "bg-snappeal-success" : "bg-snappeal-border"
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
