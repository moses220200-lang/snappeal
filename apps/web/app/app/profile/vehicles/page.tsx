"use client";

import { useEffect, useMemo, useState } from "react";
import { Car, Loader2 } from "lucide-react";
import { ProfileSubPage } from "@/components/ProfileSubPage";
import { getOrCreateSessionId } from "@/lib/client/session";
import type { AppealRecord } from "@/lib/server/appeals";

/**
 * Lists every vehicle reg the user has appealed for, grouped with appeal
 * counts. Pulled live from /api/appeals — there's no separate vehicles
 * table; vehicle reg lives on the appeal's ticket jsonb.
 */
export default function VehiclesPage() {
  const [appeals, setAppeals] = useState<AppealRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(
          `/api/appeals?sessionId=${encodeURIComponent(getOrCreateSessionId())}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { appeals: AppealRecord[] };
        if (alive) setAppeals(json.appeals);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "Failed to load");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const vehicles = useMemo(() => {
    if (!appeals) return [];
    const map = new Map<string, { reg: string; count: number; lastAppealAt: string }>();
    for (const a of appeals) {
      const reg = a.ticket?.vehicleReg?.trim().toUpperCase();
      if (!reg) continue;
      const existing = map.get(reg);
      if (existing) {
        existing.count += 1;
        if (a.createdAt > existing.lastAppealAt) existing.lastAppealAt = a.createdAt;
      } else {
        map.set(reg, { reg, count: 1, lastAppealAt: a.createdAt });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.lastAppealAt.localeCompare(a.lastAppealAt));
  }, [appeals]);

  return (
    <ProfileSubPage title="Vehicles" subtitle="Every reg you've appealed a ticket for.">
      {appeals == null && !error && (
        <div className="rounded-2xl border border-parkingrabbit-border bg-white p-6 flex items-center justify-center gap-2 text-sm text-parkingrabbit-muted">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
      )}
      {appeals && vehicles.length === 0 && (
        <div className="rounded-2xl border border-dashed border-parkingrabbit-border bg-white p-10 text-center">
          <Car className="size-8 mx-auto text-parkingrabbit-muted" />
          <p className="mt-3 text-sm text-parkingrabbit-muted">No vehicles yet.</p>
          <p className="mt-1 text-xs text-parkingrabbit-muted">
            Once you appeal a ticket, the vehicle reg from the PCN photo lands here.
          </p>
        </div>
      )}
      {appeals && vehicles.length > 0 && (
        <ul className="flex flex-col gap-2.5">
          {vehicles.map((v) => (
            <li key={v.reg} className="rounded-2xl bg-white border border-parkingrabbit-border p-4 flex items-center gap-3">
              <span className="size-11 rounded-xl bg-parkingrabbit-primary-100 text-parkingrabbit-primary flex items-center justify-center">
                <Car className="size-5" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-base font-bold text-parkingrabbit-navy tracking-wide font-mono">{v.reg}</p>
                <p className="text-xs text-parkingrabbit-muted">
                  {v.count} appeal{v.count === 1 ? "" : "s"} · last on{" "}
                  {new Date(v.lastAppealAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </ProfileSubPage>
  );
}
