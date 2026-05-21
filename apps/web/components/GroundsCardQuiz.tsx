"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Info } from "lucide-react";
import {
  GROUND_CATEGORIES,
  type GroundCard,
  type GroundCategory,
  getCardById,
} from "@/lib/grounds-catalog";
import { getCurrentAppealId } from "@/lib/client/session";
import { getAppeal, patchCurrentAppeal } from "@/lib/client/draft";
import { haptic } from "@/lib/client/haptics";

/**
 * Card-based "what happened?" quiz for /app/notes (step 2 of the appeal
 * flow). Replaces the previous free-text + chips UI with a structured
 * browse-by-category surface so customers don't need to know UK PCN appeal
 * grounds to pick the right one — the cards do the translation.
 *
 * State is persisted to the appeals row in Postgres (cloud-first) — back
 * navigation hydrates from the DB, and /api/generate-stream reads the
 * canonical ground IDs from the appeal record when drafting the letter.
 */
export function GroundsCardQuiz({
  onChange,
}: {
  /** Fires whenever the selection changes — page can use this to wire its
   *  "Continue" CTA copy or count badges. */
  onChange?: (selectedCardIds: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // All categories collapsed by default — surfacing "Signs & markings" pre-
  // expanded was nudging users to that ground even when it didn't apply.
  const [openCategory, setOpenCategory] = useState<string | null>(null);

  // Hydrate from the cloud appeal row on mount (if a draft already exists).
  useEffect(() => {
    let alive = true;
    void (async () => {
      const id = getCurrentAppealId();
      if (!id) return;
      const appeal = await getAppeal(id).catch(() => null);
      if (!alive || !appeal?.grounds?.length) return;
      setSelected(new Set(appeal.grounds));
    })();
    return () => {
      alive = false;
    };
  }, []);

  const toggle = (cardId: string) => {
    const next = new Set(selected);
    if (next.has(cardId)) {
      next.delete(cardId);
      haptic("select");
    } else {
      next.add(cardId);
      haptic("success");
    }
    setSelected(next);
    const ids = Array.from(next);
    void patchCurrentAppeal({ grounds: ids }).catch(() => {
      /* card stays toggled visually; next interaction will retry */
    });
    onChange?.(ids);
  };

  const selectedCount = selected.size;
  const selectedCards = useMemo(
    () =>
      Array.from(selected)
        .map(getCardById)
        .filter((c): c is GroundCard => Boolean(c)),
    [selected],
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Info banner — frames the task for the customer in plain English. */}
      <div className="rounded-2xl bg-snappeal-primary-50 border border-snappeal-primary-100 p-4 flex items-start gap-3">
        <span className="size-9 rounded-full bg-white text-snappeal-primary flex items-center justify-center flex-shrink-0">
          <Info className="size-[1.125rem]" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-bold text-snappeal-navy">
            Pick the reasons that match your case
          </p>
          <p className="text-xs text-snappeal-muted mt-0.5 leading-relaxed">
            Tap one or more cards. We&apos;ll only put grounds in your appeal
            that your photos + notes actually support — but giving us a head
            start makes the draft stronger.
          </p>
        </div>
      </div>

      {/* Selected-summary chip strip — visible the moment the customer
          picks anything, so they can see + de-select without scrolling. */}
      {selectedCount > 0 && (
        <div className="rounded-2xl bg-white border border-snappeal-border p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-snappeal-muted mb-2">
            {selectedCount} reason{selectedCount === 1 ? "" : "s"} selected
          </p>
          <div className="flex flex-wrap gap-1.5">
            {selectedCards.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => toggle(c.id)}
                className="inline-flex items-center gap-1.5 rounded-full bg-snappeal-primary-100 text-snappeal-primary-700 text-[11px] font-semibold px-2.5 py-1 hover:bg-snappeal-primary-200 transition"
              >
                <span>{c.icon}</span>
                {c.label}
                <span className="text-snappeal-muted">×</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Category accordions */}
      <div className="flex flex-col gap-3">
        {GROUND_CATEGORIES.map((cat) => (
          <CategoryAccordion
            key={cat.id}
            category={cat}
            open={openCategory === cat.id}
            onToggleOpen={() =>
              setOpenCategory((cur) => (cur === cat.id ? null : cat.id))
            }
            selected={selected}
            onToggle={toggle}
          />
        ))}
      </div>
    </div>
  );
}

function CategoryAccordion({
  category,
  open,
  onToggleOpen,
  selected,
  onToggle,
}: {
  category: GroundCategory;
  open: boolean;
  onToggleOpen: () => void;
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const pickedInCategory = category.cards.filter((c) => selected.has(c.id)).length;
  return (
    <section className="rounded-2xl bg-white border border-snappeal-border overflow-hidden">
      <button
        type="button"
        onClick={onToggleOpen}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-snappeal-bg/40 transition"
      >
        <span className="size-9 rounded-xl bg-snappeal-primary-50 text-snappeal-primary flex items-center justify-center flex-shrink-0 text-lg">
          {category.icon}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-snappeal-navy">{category.title}</p>
          <p className="text-[11px] text-snappeal-muted mt-0.5 truncate">
            {category.blurb}
          </p>
        </div>
        {pickedInCategory > 0 && (
          <span className="text-[10px] font-bold uppercase tracking-wide rounded-full bg-snappeal-primary text-white px-2 py-0.5">
            {pickedInCategory}
          </span>
        )}
        <ChevronDown
          className={`size-4 text-snappeal-muted transition ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="border-t border-snappeal-border bg-snappeal-bg/30 p-3 flex flex-col gap-2">
          {category.cards.map((card) => {
            const picked = selected.has(card.id);
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => onToggle(card.id)}
                aria-pressed={picked}
                className={`relative text-left rounded-xl p-3 flex items-start gap-3 transition border ${
                  picked
                    ? "border-snappeal-primary bg-snappeal-primary-50"
                    : "border-snappeal-border bg-white hover:border-snappeal-primary/40"
                }`}
              >
                <span className="size-9 rounded-lg bg-white border border-snappeal-border text-lg flex items-center justify-center flex-shrink-0">
                  {card.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-snappeal-navy leading-snug">
                    {card.label}
                  </p>
                  <p className="text-[11px] text-snappeal-muted mt-1 leading-relaxed">
                    {card.body}
                  </p>
                </div>
                <span
                  className={`size-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 transition ${
                    picked
                      ? "bg-snappeal-primary text-white"
                      : "border border-snappeal-border bg-white"
                  }`}
                >
                  {picked && <Check className="size-3" strokeWidth={3} />}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
