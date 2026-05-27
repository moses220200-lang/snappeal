"use client";

/**
 * GroundsQuiz — inline grounds picker embedded directly in the smart
 * ticket card (was a fullscreen sheet in v0.3.0; refactored back to
 * inline at the user's request — design preserved, modal chrome
 * removed). The 75-card catalog needs more affordance than the old
 * accordion, but it doesn't need to leave the card surface.
 *
 *   - Sticky search input (search + clear) — fuzzy match against
 *     label + body + promptHook.
 *   - Sticky category chip row — single-select filter, "All" pill first.
 *   - Scrollable card grid — capped at ~60vh so the card stays usable.
 *   - "Suggested for code N" pills float matching cards to the top
 *     when `appeal.ticket.contraventionCode` is known.
 *
 * State model: controlled. Parent owns `selectedIds` + persists. We
 * never call `onChange` inside a `setState` updater (React will warn
 * about cross-component setState-in-render) — we always derive the
 * next array synchronously in the event handler and dispatch outward.
 */
import { useMemo, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import {
  GROUND_CATEGORIES,
  type GroundCard,
  type GroundCategory,
} from "@/lib/grounds-catalog";

interface Props {
  /** Currently selected card IDs (controlled). */
  selectedIds: readonly string[];
  /** Contravention code from the PCN — floats matching cards to the top. */
  contraventionCode?: string | null;
  /** Called whenever the selection changes. Parent persists. */
  onChange: (selectedIds: string[]) => void;
  /** Hard cap on simultaneously selected cards. Default 8. */
  maxSelected?: number;
  /** Search input state — held by the parent so it survives re-renders. */
  query: string;
  onQueryChange: (q: string) => void;
  /** Category filter — `"all"` or a category id from GROUND_CATEGORIES. */
  categoryId: string | "all";
  onCategoryChange: (id: string | "all") => void;
}

const DEFAULT_MAX = 8;

export function GroundsQuizInline({
  selectedIds,
  contraventionCode,
  onChange,
  maxSelected = DEFAULT_MAX,
  query,
  onQueryChange,
  categoryId,
  onCategoryChange,
}: Props) {
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedCount = selected.size;

  const toggle = (cardId: string) => {
    if (selected.has(cardId)) {
      onChange(selectedIds.filter((id) => id !== cardId));
      return;
    }
    if (selectedCount >= maxSelected) return;
    onChange([...selectedIds, cardId]);
  };

  const filtered = useMemo<FilteredView>(
    () =>
      filterCatalog({
        categoryId,
        query,
        contraventionCode: contraventionCode ?? null,
      }),
    [categoryId, query, contraventionCode],
  );

  // Collapsible category sections — by default everything is collapsed
  // so the mobile picker shows a tight list of category titles + counts
  // rather than 75 cards in one scroll. Users tap a title to expand.
  // When the user runs a search OR has cards selected in a category,
  // we force-open that category so they always see relevant content.
  // `manuallyToggled` tracks user-driven open/close so search expansion
  // doesn't fight the user.
  const [manuallyToggled, setManuallyToggled] = useState<Set<string>>(
    () => new Set<string>(),
  );
  const isOpen = (catId: string): boolean => {
    if (manuallyToggled.has(catId)) return true;
    // Auto-open while the user is searching — the filtered list is
    // usually short and the user expects to see matches.
    if (query.trim().length > 0) return true;
    // Auto-open any category that has at least one selection so the
    // user can see what they've picked.
    const cats = (filtered.categories ?? []).find((b) => b.category.id === catId);
    if (cats && cats.cards.some((c) => selected.has(c.id))) return true;
    return false;
  };
  const toggleCategory = (catId: string) => {
    setManuallyToggled((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {/* ── Search ──────────────────────────────────────────────── */}
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-parkingrabbit-muted"
          strokeWidth={2}
        />
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search — eg blue badge, signage, loading"
          className="w-full rounded-full border-2 border-parkingrabbit-border bg-white pl-9 pr-9 py-2.5 text-sm text-parkingrabbit-navy placeholder:text-parkingrabbit-muted focus:border-parkingrabbit-primary focus:outline-none"
        />
        {query.length > 0 && (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 size-6 rounded-full bg-parkingrabbit-bg text-parkingrabbit-muted flex items-center justify-center hover:bg-parkingrabbit-border transition"
          >
            <X className="size-3" strokeWidth={2.5} />
          </button>
        )}
      </div>

      {/* ── Category chip row ───────────────────────────────────── */}
      <div className="flex gap-2 overflow-x-auto -mx-5 px-5 no-scrollbar">
        <CategoryChip
          label="All"
          active={categoryId === "all"}
          count={null}
          onClick={() => onCategoryChange("all")}
        />
        {GROUND_CATEGORIES.map((cat) => (
          <CategoryChip
            key={cat.id}
            icon={<cat.icon className="size-3.5" strokeWidth={2.25} />}
            label={cat.title}
            active={categoryId === cat.id}
            count={cat.cards.length}
            onClick={() => onCategoryChange(cat.id)}
          />
        ))}
      </div>

      {/* ── Card grid — scrollable inside the card ──────────────── */}
      <div
        className="overflow-y-auto -mx-2 px-2 py-1"
        style={{ maxHeight: "60vh" }}
      >
        {filtered.suggestedCards.length > 0 && (
          <section className="mb-4">
            <header className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wide text-parkingrabbit-primary">
                Suggested for code {contraventionCode}
              </span>
              <span className="h-px flex-1 bg-parkingrabbit-border" />
            </header>
            <CardGrid
              cards={filtered.suggestedCards}
              selected={selected}
              onToggle={toggle}
              maxReached={selectedCount >= maxSelected}
            />
          </section>
        )}

        {filtered.categories.map((bucket) => {
          const open = isOpen(bucket.category.id);
          const pickedInCat = bucket.cards.filter((c) => selected.has(c.id)).length;
          return (
            <section
              key={bucket.category.id}
              className="mb-2 rounded-2xl border border-parkingrabbit-border bg-white overflow-hidden"
            >
              <button
                type="button"
                onClick={() => toggleCategory(bucket.category.id)}
                aria-expanded={open}
                className="w-full px-3 py-2.5 flex items-center gap-2 text-left hover:bg-parkingrabbit-bg/40 transition"
              >
                <bucket.category.icon
                  className="size-4 text-parkingrabbit-primary shrink-0"
                  strokeWidth={2.25}
                />
                <h3 className="text-[13px] font-bold text-parkingrabbit-navy truncate">
                  {bucket.category.title}
                </h3>
                {pickedInCat > 0 && (
                  <span className="inline-flex items-center rounded-full bg-parkingrabbit-primary text-white text-[9.5px] font-bold px-1.5 py-0.5">
                    {pickedInCat}
                  </span>
                )}
                <span className="text-[11px] text-parkingrabbit-muted ml-auto shrink-0">
                  {bucket.cards.length}
                </span>
                <ChevronDown
                  className={`size-3.5 text-parkingrabbit-muted shrink-0 transition-transform ${
                    open ? "rotate-180" : ""
                  }`}
                  strokeWidth={2.25}
                />
              </button>
              {open && (
                <div className="px-3 pb-3 pt-1 border-t border-parkingrabbit-border">
                  <p className="text-[11.5px] text-parkingrabbit-muted mb-2 leading-snug">
                    {bucket.category.blurb}
                  </p>
                  <CardGrid
                    cards={bucket.cards}
                    selected={selected}
                    onToggle={toggle}
                    maxReached={selectedCount >= maxSelected}
                  />
                </div>
              )}
            </section>
          );
        })}

        {filtered.suggestedCards.length === 0 &&
          filtered.categories.length === 0 && (
            <div className="rounded-2xl border border-dashed border-parkingrabbit-border bg-parkingrabbit-bg/40 p-5 text-center">
              <p className="text-[13px] font-bold text-parkingrabbit-navy">
                No reasons match &ldquo;{query}&rdquo;
              </p>
              <p className="text-[11.5px] text-parkingrabbit-muted mt-1 leading-snug">
                Try a shorter word — eg &ldquo;permit&rdquo;, &ldquo;sign&rdquo;,
                &ldquo;loading&rdquo;.
              </p>
              <button
                type="button"
                onClick={() => {
                  onQueryChange("");
                  onCategoryChange("all");
                }}
                className="mt-3 text-[12px] font-semibold text-parkingrabbit-primary hover:underline"
              >
                Clear filters
              </button>
            </div>
          )}
      </div>

      {selectedCount >= maxSelected && (
        <p className="text-[11px] text-parkingrabbit-muted text-center">
          {maxSelected} reasons picked — that&apos;s the max. Deselect one to
          add another.
        </p>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Pieces                                                                */
/* ────────────────────────────────────────────────────────────────────── */

function CategoryChip({
  icon,
  label,
  active,
  count,
  onClick,
}: {
  icon?: React.ReactNode;
  label: string;
  active: boolean;
  count: number | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 inline-flex items-center gap-1.5 rounded-full text-xs font-semibold whitespace-nowrap px-3 py-1.5 transition ${
        active
          ? "bg-parkingrabbit-primary text-white"
          : "bg-parkingrabbit-bg text-parkingrabbit-navy hover:bg-parkingrabbit-border"
      }`}
    >
      {icon}
      {label}
      {count != null && (
        <span
          className={`text-[10px] font-bold rounded-full px-1.5 py-px min-w-[18px] text-center ${
            active ? "bg-white/25 text-white" : "bg-white text-parkingrabbit-muted"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function CardGrid({
  cards,
  selected,
  onToggle,
  maxReached,
}: {
  cards: readonly GroundCard[];
  selected: Set<string>;
  onToggle: (cardId: string) => void;
  maxReached: boolean;
}) {
  return (
    <ul className="grid grid-cols-1 gap-2">
      {cards.map((card) => {
        const isSelected = selected.has(card.id);
        const Icon = card.icon;
        const disabled = !isSelected && maxReached;
        return (
          <li key={card.id}>
            <button
              type="button"
              onClick={() => onToggle(card.id)}
              disabled={disabled}
              aria-pressed={isSelected}
              className={`group w-full h-full rounded-2xl border-2 p-3 flex flex-col gap-1.5 text-left transition disabled:opacity-40 ${
                isSelected
                  ? "border-parkingrabbit-primary bg-parkingrabbit-primary-50"
                  : "border-parkingrabbit-border bg-white hover:border-parkingrabbit-primary/40"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className={`size-9 rounded-xl flex items-center justify-center shrink-0 ${
                    isSelected
                      ? "bg-parkingrabbit-primary text-white"
                      : "bg-parkingrabbit-bg text-parkingrabbit-primary"
                  }`}
                >
                  <Icon className="size-4" strokeWidth={2} />
                </span>
                <span
                  className={`size-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-[1px] ${
                    isSelected
                      ? "border-parkingrabbit-primary bg-parkingrabbit-primary text-white"
                      : "border-parkingrabbit-border bg-white"
                  }`}
                >
                  {isSelected && <Check className="size-3" strokeWidth={3} />}
                </span>
              </div>
              <p
                className={`text-[13px] font-bold leading-tight ${
                  isSelected ? "text-parkingrabbit-primary-700" : "text-parkingrabbit-navy"
                }`}
              >
                {card.label}
              </p>
              <p className="text-[11px] text-parkingrabbit-muted leading-snug">
                {card.body}
              </p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Filtering                                                             */
/* ────────────────────────────────────────────────────────────────────── */

interface FilteredView {
  /** Cards that match the contravention code AND the filters. */
  suggestedCards: GroundCard[];
  /** Remaining categories, after suggested cards are lifted out. */
  categories: Array<{ category: GroundCategory; cards: GroundCard[] }>;
}

function filterCatalog(input: {
  categoryId: string | "all";
  query: string;
  contraventionCode: string | null;
}): FilteredView {
  const q = input.query.trim().toLowerCase();
  const code = input.contraventionCode?.trim() ?? "";

  const matchesQuery = (card: GroundCard): boolean => {
    if (!q) return true;
    return (
      card.label.toLowerCase().includes(q) ||
      card.body.toLowerCase().includes(q) ||
      (card.promptHook?.toLowerCase().includes(q) ?? false)
    );
  };

  const cats =
    input.categoryId === "all"
      ? GROUND_CATEGORIES
      : GROUND_CATEGORIES.filter((c) => c.id === input.categoryId);

  // Find code-suggested cards (across all categories, regardless of the
  // active category filter — they're the most relevant matches and we
  // want to surface them first).
  const suggested: GroundCard[] = [];
  const suggestedIds = new Set<string>();
  if (code) {
    for (const cat of GROUND_CATEGORIES) {
      for (const card of cat.cards) {
        if (
          card.relevantCodes?.includes(code) &&
          matchesQuery(card) &&
          (input.categoryId === "all" || cat.id === input.categoryId)
        ) {
          suggested.push(card);
          suggestedIds.add(card.id);
        }
      }
    }
  }

  const categories: FilteredView["categories"] = [];
  for (const cat of cats) {
    const cards = cat.cards.filter(
      (c) => matchesQuery(c) && !suggestedIds.has(c.id),
    );
    if (cards.length > 0) categories.push({ category: cat, cards });
  }

  return { suggestedCards: suggested, categories };
}

/** Hidden scrollbar helper for the category chip row.
 *  Tailwind doesn't ship a `no-scrollbar` utility by default — uses the
 *  one already in /apps/web/app/globals.css from the tickets page. */
