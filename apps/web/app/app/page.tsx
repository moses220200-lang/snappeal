import Link from "next/link";
import { Bell, ChevronRight, Lightbulb, Plus } from "lucide-react";
import { appeals, user } from "@/lib/mock-data";
import { AppealCard } from "@/components/AppealCard";
import { Timeline } from "@/components/Timeline";

export default function AppHome() {
  const live = appeals.filter(
    (a) => a.status !== "cancelled" && a.status !== "rejected",
  );
  const resolved = appeals.filter(
    (a) => a.status === "cancelled" || a.status === "rejected",
  );
  const featured = live[0] ?? resolved[0];

  return (
    <div className="flex flex-col gap-5 pt-6 px-5">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-snappeal-navy">
            Hello, {user.displayName} 👋
          </h1>
          <p className="text-sm text-snappeal-muted mt-0.5">
            Here&apos;s your appeal overview
          </p>
        </div>
        <button
          className="size-10 rounded-full bg-white border border-snappeal-border flex items-center justify-center text-snappeal-muted hover:text-snappeal-navy"
          aria-label="Notifications"
        >
          <Bell className="size-5" />
        </button>
      </header>

      {/* Featured live appeal */}
      {featured && (
        <Link
          href={`/app/cases/${featured.id}`}
          className="block rounded-3xl bg-snappeal-primary text-white p-5 hover:bg-snappeal-primary-600 transition"
        >
          <p className="text-sm font-semibold opacity-90">
            Your appeal is in progress
          </p>
          <p className="text-xs/relaxed text-white/85 mt-1.5">
            {featured.ticket.issuer} · PCN {featured.ticket.pcnRef}
          </p>
          <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white text-snappeal-primary text-xs font-semibold px-3.5 py-1.5">
            View My Case
            <ChevronRight className="size-3.5" />
          </div>
        </Link>
      )}

      {/* Progress card */}
      {featured && (
        <section className="rounded-2xl bg-white border border-snappeal-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-snappeal-navy">
              Your Progress
            </h2>
            <span className="text-[11px] text-snappeal-muted">
              Updated {new Date(featured.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            </span>
          </div>
          <Timeline steps={featured.timeline} />
        </section>
      )}

      {/* Quick action */}
      <Link
        href="/app/capture"
        className="flex items-center gap-3 rounded-2xl bg-white border border-snappeal-border p-4 hover:border-snappeal-primary transition"
      >
        <span className="size-11 rounded-full bg-snappeal-primary-100 text-snappeal-primary flex items-center justify-center">
          <Plus className="size-5" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-snappeal-navy">
            Appeal another ticket
          </p>
          <p className="text-xs text-snappeal-muted">
            Five taps to a drafted, submitted appeal
          </p>
        </div>
        <ChevronRight className="size-4 text-snappeal-muted" />
      </Link>

      {/* Recent cases */}
      {appeals.length > 1 && (
        <section>
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-snappeal-muted">
              Recent
            </h2>
            <Link
              href="/app/cases"
              className="text-xs font-semibold text-snappeal-primary"
            >
              See all
            </Link>
          </div>
          <div className="flex flex-col gap-2.5">
            {appeals.slice(0, 2).map((a) => (
              <AppealCard key={a.id} appeal={a} />
            ))}
          </div>
        </section>
      )}

      {/* Tips */}
      <Link
        href="#"
        className="rounded-2xl bg-green-50 p-4 flex items-start gap-3 hover:bg-green-100 transition"
      >
        <span className="size-9 rounded-full bg-green-100 text-green-700 flex items-center justify-center flex-shrink-0">
          <Lightbulb className="size-[1.125rem]" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-bold text-snappeal-navy">Success tips</p>
          <p className="text-xs text-snappeal-muted mt-0.5">
            Appeals are most successful when submitted within 28 days of the
            issue date.
          </p>
          <span className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-green-700">
            View tips <ChevronRight className="size-3" />
          </span>
        </div>
      </Link>
    </div>
  );
}
