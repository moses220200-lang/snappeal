import { inventoryStatus, getSettings } from "@/lib/server/settings";
import { SettingsToggles } from "@/components/SettingsToggles";

export const dynamic = "force-dynamic";

/**
 * /admin/settings — central panel for every env var the app reads and
 * every runtime override the operator can flip.
 *
 *   - Top section: runtime toggles (mcpHeaded, stopAtReview, submissionLive
 *     override, workerDisabled override, fakePayment override,
 *     skipPaymentCheck override). Persisted in-memory only; env is the
 *     source of truth on cold boot.
 *   - Lower section: every env var grouped by category, showing whether
 *     it's set. Secret values are NEVER displayed — just the configured/
 *     missing pill.
 *
 * Editing secret env values from a web UI would require either restarting
 * the process or persisting to a secrets store; both are out of scope for
 * v0.1.5. To change a secret, edit `.env.local` (dev) or the Vercel
 * dashboard (prod) and redeploy.
 */
export default function AdminSettingsPage() {
  const settings = getSettings();
  const inventory = inventoryStatus();

  const grouped = inventory.reduce<Record<string, typeof inventory>>((acc, e) => {
    (acc[e.category] = acc[e.category] ?? []).push(e);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold text-snappeal-navy">Settings</h1>
        <p className="text-sm text-snappeal-muted mt-1 max-w-2xl">
          Runtime toggles (live now) plus every environment variable the
          codebase reads. Editing a secret from a web UI is unsafe — change
          those in <code className="font-mono text-[11px]">.env.local</code> (dev) or your hosting
          provider&apos;s dashboard (prod). The status column tells you
          whether each value is currently configured.
        </p>
      </div>

      <SettingsToggles initial={settings} />

      <div className="flex flex-col gap-5">
        <div>
          <h2 className="text-xl font-bold text-snappeal-navy">
            Environment inventory
          </h2>
          <p className="text-xs text-snappeal-muted mt-1">
            {inventory.filter((e) => e.set).length}/{inventory.length} configured ·{" "}
            {inventory.filter((e) => e.required && !e.set).length} required and missing
          </p>
        </div>

        {Object.entries(grouped).map(([category, entries]) => (
          <div
            key={category}
            className="overflow-hidden rounded-2xl bg-white border border-snappeal-border"
          >
            <div className="px-4 py-3 bg-snappeal-bg/60 border-b border-snappeal-border flex items-center justify-between">
              <h3 className="text-sm font-bold text-snappeal-navy">{category}</h3>
              <span className="text-[11px] text-snappeal-muted">
                {entries.filter((e) => e.set).length}/{entries.length} set
              </span>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-snappeal-bg/30">
                <tr className="text-left text-[10px] uppercase tracking-wide text-snappeal-muted">
                  <th className="px-4 py-2 w-[260px]">Variable</th>
                  <th className="px-4 py-2 w-[110px]">Status</th>
                  <th className="px-4 py-2 w-[90px]">Type</th>
                  <th className="px-4 py-2">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-snappeal-border">
                {entries.map((e) => (
                  <tr key={e.name} className="align-top">
                    <td className="px-4 py-2.5">
                      <code className="font-mono text-[12px] text-snappeal-navy">{e.name}</code>
                      {e.required && (
                        <span className="ml-1.5 text-[10px] uppercase tracking-wider text-snappeal-action font-bold">
                          required
                        </span>
                      )}
                      {e.set && e.value && (
                        <div className="mt-1">
                          <code className="font-mono text-[10px] text-snappeal-muted break-all">
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
                              ? "bg-snappeal-primary-50 text-snappeal-primary"
                              : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {e.sensitivity}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[12px] text-snappeal-muted">
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
