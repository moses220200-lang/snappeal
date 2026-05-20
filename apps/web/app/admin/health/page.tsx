import { existsSync } from "node:fs";
import { delimiter as PATH_DELIM, join } from "node:path";
import { env, hasDatabase } from "@/lib/server/env";
import { McpHeadedToggle } from "@/components/McpHeadedToggle";

export const dynamic = "force-dynamic";

function findClaudeBin(): string | null {
  if (process.env.CLAUDE_BIN && existsSync(process.env.CLAUDE_BIN)) return process.env.CLAUDE_BIN;
  const candidates = process.platform === "win32" ? ["claude.exe", "claude.cmd", "claude"] : ["claude"];
  const dirs = (process.env.PATH ?? "").split(PATH_DELIM).filter(Boolean);
  for (const dir of dirs) {
    for (const name of candidates) {
      const c = join(dir, name);
      if (existsSync(c)) return c;
    }
  }
  return null;
}

export default function AdminHealthPage() {
  const checks = [
    { label: "Database (Postgres)", ok: hasDatabase(), detail: env.DATABASE_URL ? "configured" : "missing" },
    { label: "Claude CLI", ok: Boolean(findClaudeBin()), detail: findClaudeBin() ?? "missing" },
    { label: "ANTHROPIC_API_KEY", ok: Boolean(process.env.ANTHROPIC_API_KEY), detail: process.env.ANTHROPIC_API_KEY ? "set" : "absent (using OAuth)" },
    { label: "Stripe", ok: Boolean(env.STRIPE_SECRET_KEY), detail: env.STRIPE_SECRET_KEY ? "configured" : "missing" },
    { label: "Stripe webhook", ok: Boolean(env.STRIPE_WEBHOOK_SECRET), detail: env.STRIPE_WEBHOOK_SECRET ? "configured" : "missing" },
    { label: "AUTH_SECRET", ok: Boolean(process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 32), detail: process.env.AUTH_SECRET ? "set" : "missing" },
    { label: "Submission engine", ok: true, detail: process.env.SNAPPEAL_SUBMISSION_LIVE !== "0" ? "live (Playwright MCP)" : "mock" },
    { label: "Worker in-process", ok: process.env.SNAPPEAL_DISABLE_WORKER !== "1", detail: process.env.SNAPPEAL_DISABLE_WORKER === "1" ? "disabled" : "enabled" },
    { label: "Fake payment", ok: true, detail: process.env.NEXT_PUBLIC_SNAPPEAL_FAKE_PAYMENT === "1" ? "on (dev)" : "off" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-3xl font-bold text-snappeal-navy">System health</h1>
        <p className="text-sm text-snappeal-muted mt-1">
          Snapshot of integrations on this server.
        </p>
      </div>

      <McpHeadedToggle />

      <div className="overflow-hidden rounded-2xl bg-white border border-snappeal-border">
        <table className="w-full text-sm">
          <thead className="bg-snappeal-bg/50">
            <tr className="text-left text-[11px] uppercase tracking-wide text-snappeal-muted">
              <th className="px-4 py-3">Check</th>
              <th className="px-4 py-3">State</th>
              <th className="px-4 py-3">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-snappeal-border">
            {checks.map((c) => (
              <tr key={c.label}>
                <td className="px-4 py-3 text-snappeal-navy font-semibold">{c.label}</td>
                <td className="px-4 py-3">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ${
                      c.ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    }`}
                  >
                    {c.ok ? "OK" : "MISSING"}
                  </span>
                </td>
                <td className="px-4 py-3 text-[11px] text-snappeal-muted font-mono">{c.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
