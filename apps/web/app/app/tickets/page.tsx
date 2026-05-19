import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { appeals } from "@/lib/mock-data";
import { AppealCard } from "@/components/AppealCard";

export default function TicketsPage() {
  const live = appeals.filter(
    (a) => a.status !== "cancelled" && a.status !== "rejected",
  );
  const resolved = appeals.filter(
    (a) => a.status === "cancelled" || a.status === "rejected",
  );

  return (
    <div className="flex flex-col gap-5 pt-6 px-5">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-snappeal-navy">Tickets</h1>
        <Link
          href="/app/capture"
          aria-label="New appeal"
          className="size-10 rounded-full bg-snappeal-primary text-white flex items-center justify-center hover:bg-snappeal-primary-600 transition"
        >
          <Plus className="size-5" />
        </Link>
      </header>

      {appeals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-snappeal-border bg-white p-10 text-center">
          <FileText className="size-8 mx-auto text-snappeal-muted" />
          <p className="mt-3 text-sm text-snappeal-muted">No appeals yet.</p>
          <Link
            href="/app/capture"
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-snappeal-primary text-white text-sm font-semibold px-4 py-2"
          >
            <Plus className="size-4" /> Start your first appeal
          </Link>
        </div>
      ) : (
        <>
          {live.length > 0 && (
            <section>
              <p className="text-xs font-semibold uppercase tracking-wide text-snappeal-muted mb-2">
                Live ({live.length})
              </p>
              <div className="flex flex-col gap-2.5">
                {live.map((a) => (
                  <AppealCard key={a.id} appeal={a} />
                ))}
              </div>
            </section>
          )}

          {resolved.length > 0 && (
            <section>
              <p className="text-xs font-semibold uppercase tracking-wide text-snappeal-muted mb-2">
                Resolved ({resolved.length})
              </p>
              <div className="flex flex-col gap-2.5">
                {resolved.map((a) => (
                  <AppealCard key={a.id} appeal={a} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
