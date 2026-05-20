"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BackHeader } from "@/components/BackHeader";
import { GroundsCardQuiz } from "@/components/GroundsCardQuiz";
import { getNotes, setNotes } from "@/lib/client/session";

function ContinueCta() {
  return (
    <Link
      href="/app/paywall"
      className="rounded-2xl bg-snappeal-action !text-white font-semibold py-4 text-center hover:bg-snappeal-action-600 transition shadow-lg shadow-snappeal-action/40"
    >
      <span className="text-white">Draft my appeal — Free</span>
    </Link>
  );
}

const MAX_NOTES = 600;

export default function NotesPage() {
  const [text, setText] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setText(getNotes());
  }, []);

  const onChange = (v: string) => {
    setText(v);
    setNotes(v);
  };

  return (
    <>
      <BackHeader
        title="What happened?"
        subtitle="Step 2 of 4 · Pick your reasons"
        back="/app/capture"
      />
      <div className="flex flex-col gap-5 px-5 pt-4 pb-6 snappeal-content-top">
        {/* Card-based grounds quiz — replaces the old free-text + prompt-
            chip UI. Customer browses categories of UK PCN appeal reasons
            and taps the cards that match their case. Selections map to
            canonical groundIds and are persisted in sessionStorage. */}
        <GroundsCardQuiz />

        {/* Optional extra notes — small, demoted, no longer the primary
            input on this page. Used to give the AI any context the cards
            can't capture (e.g. "I was at a funeral" / specific times). */}
        <details className="rounded-2xl bg-white border border-snappeal-border overflow-hidden">
          <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between text-sm font-semibold text-snappeal-navy">
            <span>Add an optional note (rarely needed)</span>
            <span className="text-xs font-normal text-snappeal-primary">
              {text ? `${text.length}/${MAX_NOTES}` : "tap to open"}
            </span>
          </summary>
          <div className="px-3 pb-3">
            <textarea
              value={text}
              onChange={(e) => onChange(e.target.value.slice(0, MAX_NOTES))}
              placeholder="Anything specific the cards above don't capture — times, conditions, who was with you."
              className="w-full min-h-28 resize-none bg-snappeal-bg/40 border border-snappeal-border rounded-xl p-3 text-sm placeholder:text-snappeal-muted outline-none focus:border-snappeal-primary transition"
            />
            <p className="text-[11px] text-snappeal-muted mt-2">
              Plain English — the AI rewrites it.
            </p>
          </div>
        </details>

        <div className="mt-2 flex flex-col gap-2.5">
          <ContinueCta />
          <Link
            href="/app/paywall"
            className="text-xs text-snappeal-muted text-center hover:text-snappeal-navy"
          >
            Skip and continue
          </Link>
        </div>
      </div>
    </>
  );
}
