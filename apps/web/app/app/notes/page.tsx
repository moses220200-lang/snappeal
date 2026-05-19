"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { InlineGroundsQuiz } from "@/components/InlineGroundsQuiz";
import { getNotes, getServiceTier, setNotes } from "@/lib/client/session";

function ContinueCta() {
  const [tier, setTier] = useState<"buy_time" | "grounds" | "care_plan">("grounds");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTier(getServiceTier());
  }, []);
  const label =
    tier === "buy_time"
      ? "Send holding challenge — Free"
      : "Generate appeal — £2.99";
  return (
    <Link
      href="/app/paywall"
      className="rounded-2xl bg-snappeal-action text-white font-semibold py-4 text-center hover:bg-snappeal-action-600 transition shadow-lg shadow-snappeal-action/40"
    >
      {label}
    </Link>
  );
}

const PROMPTS = [
  "The signs were behind a parked truck.",
  "I had a Blue Badge with the clock set.",
  "I was loading the van for ten minutes.",
  "The suspension notice was hidden by scaffolding.",
];

const MAX = 800;

export default function NotesPage() {
  const [text, setText] = useState("");
  const [tier, setTier] = useState<"buy_time" | "grounds" | "care_plan">("grounds");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setText(getNotes());
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTier(getServiceTier());
  }, []);

  const onChange = (v: string) => {
    setText(v);
    setNotes(v);
  };

  const insertPrompt = (p: string) => {
    const next = text ? `${text.trim()} ${p}` : p;
    onChange(next.slice(0, MAX));
  };

  return (
    <>
      <BackHeader title="What happened?" subtitle="Step 2 of 4 · Notes" back="/app/capture" />
      <div className="flex flex-col gap-5 px-5 pt-4 pb-6">

      <div className="rounded-2xl bg-white border border-snappeal-border p-2 focus-within:border-snappeal-primary transition">
        <textarea
          value={text}
          onChange={(e) => onChange(e.target.value.slice(0, MAX))}
          placeholder="In a sentence or two, what happened? (Optional — skip if your photos say enough.)"
          className="w-full min-h-40 resize-none bg-transparent p-3 text-sm placeholder:text-snappeal-muted outline-none"
        />
        <div className="flex items-center justify-between px-3 pb-2">
          <span className="text-[11px] text-snappeal-muted">
            Plain English · no jargon needed
          </span>
          <span className="text-[11px] text-snappeal-muted">
            {text.length} / {MAX}
          </span>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-snappeal-muted mb-2">
          Honest examples
        </p>
        <div className="flex flex-wrap gap-2">
          {PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => insertPrompt(p)}
              className="text-xs rounded-full bg-white border border-snappeal-border px-3 py-1.5 text-snappeal-muted hover:border-snappeal-primary hover:text-snappeal-navy transition"
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <InlineGroundsQuiz tier={tier} />

      <div className="rounded-2xl bg-snappeal-primary-100 p-4 flex items-start gap-3">
        <span className="size-9 rounded-full bg-white text-snappeal-primary flex items-center justify-center flex-shrink-0">
          <Sparkles className="size-[1.125rem]" />
        </span>
        <p className="text-xs text-snappeal-navy leading-relaxed">
          <strong>You can skip this step.</strong> Snappeal will draft from
          your photos alone — but a sentence or two of context produces a
          stronger appeal.
        </p>
      </div>

      <div className="mt-auto pt-6 flex flex-col gap-2.5">
        <ContinueCta />
        <Link
          href="/app/paywall"
          className="text-xs text-snappeal-muted text-center hover:text-snappeal-navy"
        >
          Skip notes and continue
        </Link>
      </div>
      </div>
    </>
  );
}
