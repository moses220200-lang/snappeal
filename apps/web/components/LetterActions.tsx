"use client";

import { useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";

type Props = {
  letterBody: string;
  letterSubject: string;
};

/**
 * Native action row for the letter screen.
 *   - Copy  → navigator.clipboard.writeText (with a tactile "Copied!" beat)
 *   - Share → Web Share API (navigator.share). Falls back to Copy on
 *             browsers without it (Safari desktop, older Firefox).
 *
 * The primary Submit action lives one row above as the big blue button on
 * the letter page; tracking after submission is handled by the green
 * "Submitted to the council" confirmation card.
 */
export function LetterActions({ letterBody, letterSubject }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`${letterSubject}\n\n${letterBody}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
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
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }
    handleCopy();
  };

  return (
    <section className="grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={handleCopy}
        className="rounded-xl bg-white border border-parkingrabbit-border py-3 flex flex-col items-center gap-1 text-xs font-medium text-parkingrabbit-navy hover:border-parkingrabbit-primary transition"
      >
        {copied ? (
          <>
            <Check className="size-4 text-parkingrabbit-success" strokeWidth={3} />
            Copied
          </>
        ) : (
          <>
            <Copy className="size-4 text-parkingrabbit-primary" />
            Copy
          </>
        )}
      </button>
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
