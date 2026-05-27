import { existsSync } from "node:fs";
import { delimiter as PATH_DELIM, join } from "node:path";
import { inventoryStatus, getSettings } from "@/lib/server/settings";
import { SettingsToggles } from "@/components/SettingsToggles";
import { env, hasDatabase } from "@/lib/server/env";

export const dynamic = "force-dynamic";

/**
 * /admin/settings — single admin surface for system health + runtime
 * toggles + every env var the app reads.
 *
 * Sections (top → bottom):
 *   1. System health — boot-time integration checks (DB, Claude CLI,
 *      Stripe, AUTH_SECRET, Submission engine, Worker). Was previously
 *      its own /admin/health page; merged here so there's ONE admin
 *      surface for operator concerns. /admin/health 301-redirects.
 *   2. Runtime toggles — in-memory overrides for `mcpHeaded`,
 *      `stopAtReview`, `mcpCaptureScreenshots`, etc. Survive until the
 *      next process restart, then revert to env / mode defaults.
 *   3. Environment inventory — every env var grouped by category,
 *      showing set/unset. Secret values are NEVER displayed.
 *
 * Editing secret env values from a web UI is unsafe — change those in
 * `.env.local` (dev) or your hosting provider's dashboard (prod) and
 * redeploy.
 */
function findClaudeBin(): string | null {
  if (process.env.CLAUDE_BIN && existsSync(process.env.CLAUDE_BIN))
    return process.env.CLAUDE_BIN;
  const candidates =
    process.platform === "win32" ? ["claude.exe", "claude.cmd", "claude"] : ["claude"];
  const dirs = (process.env.PATH ?? "").split(PATH_DELIM).filter(Boolean);
  for (const dir of dirs) {
    for (const name of candidates) {
      const c = join(dir, name);
      if (existsSync(c)) return c;
    }
  }
  return null;
}

export default function AdminSettingsPage() {
  const settings = getSettings();
  const inventory = inventoryStatus();

  // System-health checks. Derived from getSettings() where possible so
  // env→mode-default→admin-override layering shows through here, not
  // just on the runtime-toggle panel.
  const claudeBin = findClaudeBin();
  const checks: Array<{ label: string; ok: boolean; detail: string }> = [
    {
      label: "Database (Postgres)",
      ok: hasDatabase(),
      detail: env.DATABASE_URL ? "configured" : "missing",
    },
    {
      label: "Claude CLI",
      ok: Boolean(claudeBin),
      detail: claudeBin ?? "missing",
    },
    {
      label: "ANTHROPIC_API_KEY",
      ok: Boolean(process.env.ANTHROPIC_API_KEY),
      detail: process.env.ANTHROPIC_API_KEY ? "set" : "absent (using OAuth)",
    },
    {
      label: "Stripe",
      ok: Boolean(env.STRIPE_SECRET_KEY),
      detail: env.STRIPE_SECRET_KEY ? "configured" : "missing",
    },
    {
      label: "Stripe webhook",
      ok: Boolean(env.STRIPE_WEBHOOK_SECRET),
      detail: env.STRIPE_WEBHOOK_SECRET ? "configured" : "missing",
    },
    {
      label: "AUTH_SECRET",
      ok: Boolean(process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 32),
      detail: process.env.AUTH_SECRET ? "set" : "missing",
    },
    {
      label: "Submission engine",
      ok: true,
      detail: settings.submissionLive ? "live (Playwright MCP)" : "mock",
    },
    {
      label: "Worker in-process",
      ok: !settings.workerDisabled,
      detail: settings.workerDisabled ? "disabled" : "enabled",
    },
    {
      label: "Fake payment",
      ok: true,
      detail: settings.fakePayment ? "on (dev)" : "off",
    },
    {
      label: "Claude mode",
      ok: true,
      detail: `${settings.claudeMode} (${settings.mode === "dev" ? "dev default" : "prod default"})`,
    },
  ];

  const grouped = inventory.reduce<Record<string, typeof inventory>>((acc, e) => {
    (acc[e.category] = acc[e.category] ?? []).push(e);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold text-parkingrabbit-navy">Settings</h1>
        <p className="text-sm text-parkingrabbit-muted mt-1 max-w-2xl">
          Runtime toggles (live now) plus every environment variable the
          codebase reads. Editing a secret from a web UI is unsafe — change
          those in <code className="font-mono text-[11px]">.env.local</code> (dev) or your hosting
          provider&apos;s dashboard (prod). The status column tells you
          whether each value is currently configured.
        </p>
      </div>

      {/* ── System health ── */}
      <div className="overflow-hidden rounded-2xl bg-white border border-parkingrabbit-border">
        <div className="px-4 py-3 bg-parkingrabbit-bg/60 border-b border-parkingrabbit-border">
          <h2 className="text-sm font-bold text-parkingrabbit-navy">System health</h2>
          <p className="text-[11px] text-parkingrabbit-muted mt-0.5">
            Boot-time integration snapshot. Reflects the resolved settings
            after env + mode-default + admin-override layering.
          </p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-parkingrabbit-bg/30">
            <tr className="text-left text-[11px] uppercase tracking-wide text-parkingrabbit-muted">
              <th className="px-4 py-2">Check</th>
              <th className="px-4 py-2">State</th>
              <th className="px-4 py-2">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-parkingrabbit-border">
            {checks.map((c) => (
              <tr key={c.label}>
                <td className="px-4 py-2 text-parkingrabbit-navy font-semibold">{c.label}</td>
                <td className="px-4 py-2">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ${
                      c.ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    }`}
                  >
                    {c.ok ? "OK" : "MISSING"}
                  </span>
                </td>
                <td className="px-4 py-2 text-[11px] text-parkingrabbit-muted font-mono">
                  {c.detail}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SettingsToggles initial={settings} />

      <div className="flex flex-col gap-5">
        <div>
          <h2 className="text-xl font-bold text-parkingrabbit-navy">
            Environment inventory
          </h2>
          <p className="text-xs text-parkingrabbit-muted mt-1">
            {inventory.filter((e) => e.set).length}/{inventory.length} configured ·{" "}
            {inventory.filter((e) => e.required && !e.set).length} required and missing
          </p>
        </div>

        {Object.entries(grouped).map(([category, entries]) => (
          <div
            key={category}
            className="overflow-hidden rounded-2xl bg-white border border-parkingrabbit-border"
          >
            <div className="px-4 py-3 bg-parkingrabbit-bg/60 border-b border-parkingrabbit-border flex items-center justify-between">
              <h3 className="text-sm font-bold text-parkingrabbit-navy">{category}</h3>
              <span className="text-[11px] text-parkingrabbit-muted">
                {entries.filter((e) => e.set).length}/{entries.length} set
              </span>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-parkingrabbit-bg/30">
                <tr className="text-left text-[10px] uppercase tracking-wide text-parkingrabbit-muted">
                  <th className="px-4 py-2 w-[260px]">Variable</th>
                  <th className="px-4 py-2 w-[110px]">Status</th>
                  <th className="px-4 py-2 w-[90px]">Type</th>
                  <th className="px-4 py-2">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-parkingrabbit-border">
                {entries.map((e) => (
                  <tr key={e.name} className="align-top">
                    <td className="px-4 py-2.5">
                      <code className="font-mono text-[12px] text-parkingrabbit-navy">{e.name}</code>
                      {e.required && (
                        <span className="ml-1.5 text-[10px] uppercase tracking-wider text-parkingrabbit-action font-bold">
                          required
                        </span>
                      )}
                      {e.set && e.value && (
                        <div className="mt-1">
                          <code className="font-mono text-[10px] text-parkingrabbit-muted break-all">
                            {e.value}
                          </code>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ${
                          e.set
                            ? "bg-green-100 text-green-700"
                            : e.required
                              ? "bg-red-100 text-red-700"
                              : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {e.set ? "Set" : e.required ? "Missing" : "Unset"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ${
                          e.sensitivity === "secret"
                            ? "bg-amber-100 text-amber-800"
                            : e.sensitivity === "public"
                              ? "bg-parkingrabbit-primary-50 text-parkingrabbit-primary"
                              : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {e.sensitivity}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[12px] text-parkingrabbit-muted">
                      {e.description ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
