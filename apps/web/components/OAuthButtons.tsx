"use client";

import { useState } from "react";

/**
 * Branded "Continue with Apple" + "Continue with Google" buttons used by
 * the wizard signup step, the dedicated `/sign-up`, and `/sign-in`. They
 * hit `/api/auth/oauth/<provider>?next=<path>` which today returns 503
 * with a helpful "configure these env vars" message — the UI surface is
 * the same once the credentials land.
 */
export function OAuthButtons({ next = "/app" }: { next?: string }) {
  const [pending, setPending] = useState<"apple" | "google" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = async (provider: "apple" | "google") => {
    setPending(provider);
    setError(null);
    try {
      const res = await fetch(
        `/api/auth/oauth/${provider}?next=${encodeURIComponent(next)}`,
        { redirect: "manual" },
      );
      if (res.type === "opaqueredirect" || res.status === 302) {
        const location = res.headers.get("location");
        if (location) {
          window.location.href = location;
          return;
        }
      }
      const body = (await res.json().catch(() => ({}))) as {
        error?: { message?: string; code?: string };
      };
      setError(body?.error?.message ?? `Sign-in with ${provider} isn't available yet.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Sign-in with ${provider} failed`);
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      <button
        type="button"
        onClick={() => start("apple")}
        disabled={pending !== null}
        className="inline-flex items-center justify-center gap-2.5 w-full rounded-xl bg-black !text-white text-[15px] font-semibold py-3 hover:bg-neutral-800 transition disabled:opacity-60"
        aria-label="Continue with Apple"
      >
        <AppleGlyph />
        <span className="text-white">
          {pending === "apple" ? "Opening Apple…" : "Continue with Apple"}
        </span>
      </button>
      <button
        type="button"
        onClick={() => start("google")}
        disabled={pending !== null}
        className="inline-flex items-center justify-center gap-2.5 w-full rounded-xl bg-white border border-parkingrabbit-border text-parkingrabbit-navy text-[15px] font-semibold py-3 hover:bg-parkingrabbit-bg transition disabled:opacity-60"
        aria-label="Continue with Google"
      >
        <GoogleGlyph />
        <span>{pending === "google" ? "Opening Google…" : "Continue with Google"}</span>
      </button>
      {error && (
        <p className="text-[11px] text-parkingrabbit-action text-center">{error}</p>
      )}
    </div>
  );
}

function AppleGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="currentColor">
      <path d="M16.365 1.43c0 1.14-.464 2.252-1.227 3.057-.83.872-2.165 1.557-3.275 1.469-.149-1.118.443-2.296 1.182-3.07.83-.87 2.25-1.519 3.32-1.456zM20.34 17.06c-.51 1.182-.756 1.71-1.413 2.755-.917 1.455-2.211 3.265-3.816 3.281-1.427.014-1.795-.913-3.732-.903-1.937.011-2.343.913-3.77.9-1.605-.016-2.832-1.661-3.749-3.116C1.43 16.93.59 12.5 2.49 9.485c1.35-2.142 3.48-3.4 5.482-3.4 2.04 0 3.32 1.106 5.005 1.106 1.635 0 2.628-1.108 4.99-1.108 1.785 0 3.685.97 5.046 2.65-4.434 2.408-3.713 8.694-2.673 8.327z" />
    </svg>
  );
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303C33.972 32.91 29.418 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.385 0-9.93-3.072-11.282-7.358l-6.518 5.022C9.49 39.556 16.146 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.002-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}
