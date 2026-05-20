"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Sparkles } from "lucide-react";

/**
 * Contextual mini-quiz embedded in /app/notes for users on the
 * `grounds` service tier. Three quick yes/no questions that prime the AI
 * with stronger evidence hooks. Persists answers in sessionStorage so the
 * paywall step can include them in the /api/generate payload.
 *
 * Stays dismissed once answered or skipped. Hidden entirely for users on
 * `buy_time` since that tier is the holding-challenge fast path.
 */
type Quiz = {
  insidePermitArea: boolean | null;
  hasEvidence: boolean | null;
  alreadyPaid: boolean | null;
};

const KEY = "snappeal.groundsQuiz";
const DISMISS_KEY = "snappeal.groundsQuizDismissed";

const QUESTIONS: { key: keyof Quiz; q: string; yes: string; no: string }[] = [
  { key: "insidePermitArea", q: "Were you parked in a controlled / permit area?", yes: "Yes", no: "No / not sure" },
  { key: "hasEvidence", q: "Do you have photos or a note that supports your side?", yes: "Yes", no: "Just the PCN photo" },
  { key: "alreadyPaid", q: "Have you already paid the penalty?", yes: "Yes", no: "No" },
];

export function InlineGroundsQuiz({ tier }: { tier: "buy_time" | "grounds" | "care_plan" }) {
  const [quiz, setQuiz] = useState<Quiz>({
    insidePermitArea: null,
    hasEvidence: null,
    alreadyPaid: null,
  });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      try {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setQuiz({ ...quiz, ...(JSON.parse(raw) as Partial<Quiz>) });
      } catch {
        /* ignore */
      }
    }
    if (window.localStorage.getItem(DISMISS_KEY) === "1") {
       
      setDismissed(true);
    }
    // We intentionally only read once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (tier !== "grounds" || dismissed) return null;

  const update = (key: keyof Quiz, value: boolean) => {
    const next = { ...quiz, [key]: value };
    setQuiz(next);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  };

  const dismiss = () => {
    window.localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  const answered = QUESTIONS.filter((q) => quiz[q.key] !== null).length;

  return (
    <section className="rounded-2xl bg-snappeal-primary-50 border border-snappeal-primary-100 p-4 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className="size-9 rounded-full bg-white text-snappeal-primary flex items-center justify-center flex-shrink-0">
          <Sparkles className="size-[1.125rem]" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-bold text-snappeal-navy">3-question case check</p>
          <p className="text-[11px] text-snappeal-muted leading-relaxed mt-0.5">
            We use these to pick the strongest legal ground for your letter. {answered}/{QUESTIONS.length} answered.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="text-[10px] font-bold uppercase tracking-wide text-snappeal-muted hover:text-snappeal-navy"
        >
          Skip
        </button>
      </div>
      {QUESTIONS.map(({ key, q, yes, no }) => (
        <div key={key} className="rounded-xl bg-white border border-snappeal-border p-3">
          <p className="text-xs font-semibold text-snappeal-navy">{q}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Choice picked={quiz[key] === true} onClick={() => update(key, true)}>
              {yes}
            </Choice>
            <Choice picked={quiz[key] === false} onClick={() => update(key, false)}>
              {no}
            </Choice>
          </div>
        </div>
      ))}
      {answered === QUESTIONS.length && (
        <p className="inline-flex items-center gap-1.5 self-start rounded-full bg-green-100 text-green-700 text-[10px] font-bold uppercase tracking-wide px-2.5 py-1">
          <CheckCircle2 className="size-3" /> Locked in — feeding to the AI
        </p>
      )}
    </section>
  );
}

function Choice({
  picked,
  onClick,
  children,
}: {
  picked: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
        picked
          ? "bg-snappeal-action text-white"
          : "bg-snappeal-bg/60 text-snappeal-navy hover:bg-snappeal-primary-50"
      }`}
    >
      {children}
    </button>
  );
}
