"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy, Send, Share2 } from "lucide-react";

type Props = {
  appealId: string;
  letterBody: string;
  letterSubject: string;
};

/**
 * Native action row for the letter screen.
 *   - Copy   → navigator.clipboard.writeText (with a tactile "Copied!" beat)
 *   - Share  → Web Share API (navigator.share). Falls back to Copy on
 *              browsers without it (Safari desktop, older Firefox).
 *   - Track  → routes to the appeal's case-detail page.
 */
export function LetterActions({ appealId, letterBody, letterSubject }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`${letterSubject}\n\n${letterBody}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback for browsers blocking clipboard
      window.prompt("Copy your letter:", letterBody);
    }
  };

  const handleShare = async () => {
    const payload = {
      title: letterSubject,
      text: letterBody,
    };
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share(payload);
        return;
      } catch (err) {
        // User cancelled or share failed — fall through to clipboard
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }
    handleCopy();
  };

  return (
    <section className="grid grid-cols-3 gap-2">
      <button
        type="button"
        onClick={handleCopy}
        className="rounded-xl bg-white border border-snappeal-border py-3 flex flex-col items-center gap-1 text-xs font-medium text-snappeal-navy hover:border-snappeal-primary transition"
      >
        {copied ? (
          <>
            <Check className="size-4 text-snappeal-success" strokeWidth={3} />
            Copied
          </>
        ) : (
          <>
            <Copy className="size-4 text-snappeal-primary" />
            Copy
          </>
        )}
      </button>
      <button
        type="button"
        onClick={handleShare}
        className="rounded-xl bg-white border border-snappeal-border py-3 flex flex-col items-center gap-1 text-xs font-medium text-snappeal-navy hover:border-snappeal-primary transition"
      >
        <Share2 className="size-4 text-snappeal-primary" />
        Share
      </button>
      <Link
        href={`/app/tickets/${appealId}`}
        className="rounded-xl bg-snappeal-primary text-white py-3 flex flex-col items-center gap-1 text-xs font-semibold hover:bg-snappeal-primary-600 transition shadow-lg shadow-snappeal-primary/30"
      >
        <Send className="size-4" />
        Track
      </Link>
    </section>
  );
}
