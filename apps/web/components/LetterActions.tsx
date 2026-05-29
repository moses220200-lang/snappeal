"use client";

import { Share2, Star } from "lucide-react";

/* No props as of 2026-05-28 — the previous "Copy letter body to
 * clipboard" action that consumed `letterBody` + `letterSubject` was
 * removed. The buttons are now about the *app* (Rate us, Share
 * Rabbit's homepage), not the letter, so the per-appeal text doesn't
 * need to be threaded through anymore. */

/**
 * Post-submit action row.
 *
 * 2026-05-28 — replaced the Copy + Share pair (which copied the letter
 * body) with Rate us + Share. The customer has already filed their
 * appeal at this point; surfacing "copy your letter" reads as work
 * still to do. The new pair turns the moment into a thank-you / growth
 * loop instead — invite a rating, invite a friend.
 *
 *   - Rate us → opens the marketing site's review page in a new tab
 *               (target="_blank"). When a native app-store review hook
 *               lands later, swap the href for a `?rate=1` route that
 *               can trigger Apple's `SKStoreReviewController` /
 *               Google Play's in-app review.
 *   - Share   → invokes `navigator.share()` with the app's homepage
 *               URL + a short pitch, so the platform's native share
 *               sheet (the frosted-glass modal on iOS / Android) opens.
 *               Falls back to copying the URL on browsers without the
 *               Web Share API (Safari desktop, older Firefox).
 */
export function LetterActions() {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://parkingrabbit.com";

  const handleShare = async () => {
    const payload = {
      title: "ParkingRabbit",
      text: "ParkingRabbit just filed my parking appeal for me — give it a try.",
      url: appUrl,
    };
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share(payload);
        return;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }
    // Web Share unavailable (Safari desktop / older Firefox) — fall
    // back to copying the URL to clipboard so the customer can paste
    // it manually.
    try {
      await navigator.clipboard.writeText(appUrl);
    } catch {
      window.prompt("Share this link:", appUrl);
    }
  };

  return (
    <section className="grid grid-cols-2 gap-2">
      <a
        href={`${appUrl}/?rate=1`}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-xl bg-white border border-parkingrabbit-border py-3 flex flex-col items-center gap-1 text-xs font-medium text-parkingrabbit-navy hover:border-parkingrabbit-primary transition"
      >
        <Star
          className="size-4 text-parkingrabbit-primary"
          strokeWidth={2}
          fill="currentColor"
        />
        Rate us
      </a>
      <button
        type="button"
        onClick={handleShare}
        className="rounded-xl bg-white border border-parkingrabbit-border py-3 flex flex-col items-center gap-1 text-xs font-medium text-parkingrabbit-navy hover:border-parkingrabbit-primary transition"
      >
        <Share2 className="size-4 text-parkingrabbit-primary" />
        Share
      </button>
    </section>
  );
}
