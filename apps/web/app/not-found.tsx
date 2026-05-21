import Link from "next/link";
import { ArrowRight, SearchX } from "lucide-react";
import { SnappealMark } from "@/components/Logo";

/**
 * Global 404. Catches any route that doesn't exist OR any explicit
 * `notFound()` call from a server component. Branded so the user gets
 * a clear path back into the app instead of an unstyled fallback.
 */
export default function NotFound() {
  return (
    <main className="min-h-screen bg-snappeal-bg flex flex-col items-center justify-center px-6 py-20 text-snappeal-navy">
      <div className="w-full max-w-md flex flex-col items-center text-center gap-5">
        <div className="flex items-center gap-2.5">
          <SnappealMark size={32} variant="dark" />
          <span className="text-lg font-bold tracking-tight">ParkingRabbit</span>
        </div>
        <div className="size-14 rounded-full bg-snappeal-primary-50 text-snappeal-primary flex items-center justify-center">
          <SearchX className="size-7" strokeWidth={1.75} />
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Page not found</h1>
          <p className="text-sm text-snappeal-muted leading-relaxed max-w-sm">
            The link you followed might be out of date, or the page may have moved.
            Your tickets are still safe — head back to your list.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full max-w-xs">
          <Link
            href="/app"
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-2xl bg-snappeal-navy text-white font-semibold text-sm px-5 py-3"
          >
            Open the app
            <ArrowRight className="size-4" strokeWidth={2.25} />
          </Link>
          <Link
            href="/"
            className="flex-1 inline-flex items-center justify-center rounded-2xl bg-white border border-snappeal-border text-snappeal-navy font-semibold text-sm px-5 py-3 hover:border-snappeal-primary transition"
          >
            Home page
          </Link>
        </div>
      </div>
    </main>
  );
}
