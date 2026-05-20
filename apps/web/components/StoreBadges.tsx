import Link from "next/link";

const COMING_SOON = false;

type BadgeVariant = "default" | "on-dark";

/**
 * `variant="on-dark"` is used in the dark navy footer tile — switches the
 * badge to a white outline with a transparent fill so it reads cleanly
 * against the dark background. The default variant is the solid navy /
 * glass pair used in the hero.
 */
export function AppStoreBadge({ variant = "default" }: { variant?: BadgeVariant } = {}) {
  const wrapperClass =
    variant === "on-dark"
      ? "flex items-center gap-2.5 rounded-xl border border-white/70 bg-transparent text-white px-5 py-2.5 hover:bg-white/5 transition"
      : "flex items-center gap-2.5 rounded-xl bg-snappeal-navy text-white px-5 py-2.5 hover:opacity-90 transition";
  return (
    <Link
      href={COMING_SOON ? "#install" : "https://apps.apple.com/gb/app/snappeal"}
      aria-label="Download Snappeal on the App Store"
      className="group relative inline-flex"
    >
      <div className={wrapperClass}>
        <svg
          viewBox="0 0 24 24"
          className="size-7"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M17.05 12.04c-.03-2.74 2.24-4.06 2.34-4.13-1.28-1.87-3.27-2.13-3.97-2.16-1.69-.17-3.3 1-4.17 1-.87 0-2.19-.97-3.6-.95-1.84.03-3.55 1.07-4.5 2.72-1.92 3.33-.49 8.26 1.39 10.96.91 1.32 2 2.81 3.43 2.76 1.38-.06 1.9-.9 3.57-.9 1.66 0 2.13.9 3.59.87 1.48-.03 2.42-1.35 3.32-2.68 1.06-1.55 1.5-3.07 1.52-3.14-.03-.02-2.91-1.12-2.94-4.44zM14.4 4.06c.75-.91 1.26-2.18 1.12-3.44-1.08.04-2.4.72-3.18 1.63-.7.8-1.31 2.08-1.15 3.32 1.21.09 2.45-.61 3.21-1.51z" />
        </svg>
        <div className="text-left leading-tight">
          <div className="text-[10px] opacity-80">Download on the</div>
          <div className="text-base font-semibold tracking-tight">
            App Store
          </div>
        </div>
      </div>
      {COMING_SOON && (
        <span className="absolute -top-2 -right-2 rounded-full bg-snappeal-primary text-white text-[10px] font-bold px-2 py-0.5 shadow-md">
          Coming soon
        </span>
      )}
    </Link>
  );
}

export function GooglePlayBadge({ variant = "default" }: { variant?: BadgeVariant } = {}) {
  const wrapperClass =
    variant === "on-dark"
      ? "flex items-center gap-2.5 rounded-xl border border-white/70 bg-transparent text-white px-5 py-2.5 hover:bg-white/5 transition"
      : "flex items-center gap-2.5 rounded-xl border border-snappeal-border bg-white/60 backdrop-blur text-snappeal-navy px-5 py-2.5 hover:border-snappeal-primary hover:bg-white/80 transition";
  return (
    <Link
      href={
        COMING_SOON
          ? "#install"
          : "https://play.google.com/store/apps/details?id=com.snappeal"
      }
      aria-label="Get Snappeal on Google Play"
      className="group relative inline-flex"
    >
      <div className={wrapperClass}>
        <svg viewBox="0 0 24 24" className="size-7" aria-hidden="true">
          <defs>
            <linearGradient id="play-1" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#00d2ff" />
              <stop offset="100%" stopColor="#3a7bd5" />
            </linearGradient>
            <linearGradient id="play-2" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#ffce00" />
              <stop offset="100%" stopColor="#ffb700" />
            </linearGradient>
            <linearGradient id="play-3" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#ff4081" />
              <stop offset="100%" stopColor="#ff1744" />
            </linearGradient>
            <linearGradient id="play-4" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#00ff7f" />
              <stop offset="100%" stopColor="#00b248" />
            </linearGradient>
          </defs>
          <path
            d="M3.5 1.5v21c0 .55.34 1.02.82 1.21L15.3 12 4.32.29A1.31 1.31 0 0 0 3.5 1.5z"
            fill="url(#play-1)"
          />
          <path
            d="M18.7 8.5l-3.4 3.5 3.4 3.5 4.36-2.5c.91-.52.91-1.85 0-2.37l-4.36-2.13z"
            fill="url(#play-2)"
          />
          <path
            d="M15.3 12L4.32 23.71c.32.13.68.13 1.05-.07L18.7 15.5 15.3 12z"
            fill="url(#play-3)"
          />
          <path
            d="M4.32.29c-.37-.2-.73-.2-1.05-.07L15.3 12l3.4-3.5L5.37.36C5 .16 4.64.16 4.32.29z"
            fill="url(#play-4)"
          />
        </svg>
        <div className="text-left leading-tight">
          <div className={`text-[10px] ${variant === "on-dark" ? "text-white/70" : "text-snappeal-muted"}`}>
            GET IT ON
          </div>
          <div className={`text-base font-semibold tracking-tight ${variant === "on-dark" ? "text-white" : "text-snappeal-navy"}`}>
            Google Play
          </div>
        </div>
      </div>
      {COMING_SOON && (
        <span className="absolute -top-2 -right-2 rounded-full bg-snappeal-primary text-white text-[10px] font-bold px-2 py-0.5 shadow-md">
          Coming soon
        </span>
      )}
    </Link>
  );
}
