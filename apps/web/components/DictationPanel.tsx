"use client";

/**
 * DictationPanel — the post-quiz "tell us what happened" step.
 *
 * Renders an auto-growing notes textarea, a voice button that appends
 * transcribed audio (the user can dictate multiple takes), and a set
 * of guidance chips derived from the selected ground cards that nudge
 * the user towards the facts the drafter + council adjudicator care
 * about.
 *
 * State model: the panel owns its own textarea value. Every change is
 * mirrored upward via `onChange` so the parent can hold the canonical
 * value AND fire a debounced PATCH back to the appeals row. We don't
 * persist directly from this component because the smart card uses a
 * locally-scoped PATCH helper (it patches the appeal it's *mounted*
 * with, not the session's current draft pointer).
 */
import { useEffect, useRef } from "react";
import { Mic, Sparkles } from "lucide-react";
import { VoiceNoteButton, type TranscriptMode } from "@/components/VoiceNoteButton";
import { guidanceForCards } from "@/lib/guidance-chips";

interface Props {
  /** The current notes value (controlled). */
  value: string;
  /** Called on every textarea change, every voice-transcript append, and
   *  every chip tap. Parent debounces / persists. */
  onChange: (next: string) => void;
  /** Selected ground card IDs — drives the guidance chip set. */
  selectedCardIds: readonly string[];
  /** Optional placeholder. */
  placeholder?: string;
  /** When true, the panel is in a read-only state (eg. while the parent
   *  is submitting). */
  disabled?: boolean;
}

const MAX_NOTES_CHARS = 2000; // server schema cap

export function DictationPanel({
  value,
  onChange,
  selectedCardIds,
  placeholder,
  disabled,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-grow — runs on every value change so paste / dictation expand.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 360)}px`;
  }, [value]);

  const chips = guidanceForCards(selectedCardIds, 4);
  const charCount = value.length;
  const nearLimit = charCount > MAX_NOTES_CHARS * 0.85;

  const appendChip = (chip: string) => {
    const next =
      value.length === 0
        ? `${chip} — `
        : value.endsWith(" ") || value.endsWith("\n")
          ? `${value}${chip} — `
          : `${value}\n${chip} — `;
    onChange(truncate(next));
    // Focus the textarea so the user keeps typing right after the chip.
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  };

  const onVoiceTranscript = (text: string, opts: { mode: TranscriptMode }) => {
    if (!text) return;
    if (opts.mode === "replace") {
      onChange(truncate(text));
      return;
    }
    // append mode: separate from previous take with a space (or newline
    // if previous take ended with sentence punctuation, for readability).
    const joiner = value.length === 0
      ? ""
      : /[.!?]\s*$/.test(value)
        ? "\n"
        : " ";
    onChange(truncate(`${value}${joiner}${text}`));
  };

  return (
    <section className="rounded-3xl bg-white border-2 border-parkingrabbit-primary/30 p-5 flex flex-col gap-3 shadow-lg shadow-parkingrabbit-primary/5">
      <header>
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-parkingrabbit-primary">
          Tell us what happened
        </p>
        <p className="text-[15px] font-bold text-parkingrabbit-navy mt-1 leading-tight">
          A few sentences in your own words.
        </p>
        <p className="text-[12px] text-parkingrabbit-muted mt-1 leading-snug">
          Rabbit reads this to write your appeal — the more specific you can be,
          the stronger the letter. You can type or dictate.
        </p>
      </header>

      <div className="relative">
        <textarea
          ref={textareaRef}
          value={value}
          disabled={disabled}
          maxLength={MAX_NOTES_CHARS}
          onChange={(e) => onChange(truncate(e.target.value))}
          placeholder={
            placeholder ??
            "Eg: I parked at about 9.40am to drop off a delivery at number 23. There was scaffolding covering the restriction sign — I have a photo."
          }
          rows={4}
          className="w-full rounded-2xl border-2 border-parkingrabbit-border bg-white px-3.5 py-3 text-[14px] text-parkingrabbit-navy placeholder:text-parkingrabbit-muted focus:border-parkingrabbit-primary focus:outline-none resize-none leading-relaxed"
          style={{ minHeight: 120, maxHeight: 360 }}
        />
        <span
          className={`absolute bottom-2 right-3 text-[10px] font-semibold tabular-nums ${
            nearLimit ? "text-parkingrabbit-action" : "text-parkingrabbit-muted"
          }`}
        >
          {charCount} / {MAX_NOTES_CHARS}
        </span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <VoiceNoteButton onTranscript={onVoiceTranscript} mode="append" />
        {value.length === 0 && (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-parkingrabbit-muted">
            <Mic className="size-3" />
            Tap to dictate — works on most phones.
          </span>
        )}
      </div>

      {chips.length > 0 && (
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-parkingrabbit-muted mb-1.5 flex items-center gap-1.5">
            <Sparkles className="size-3 text-parkingrabbit-primary" strokeWidth={2.5} />
            Things worth mentioning
          </p>
          <div className="flex gap-1.5 flex-wrap">
            {chips.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => appendChip(chip)}
                disabled={disabled || charCount >= MAX_NOTES_CHARS - 20}
                className="rounded-full border border-parkingrabbit-border bg-parkingrabbit-bg text-parkingrabbit-navy text-[11px] font-semibold px-2.5 py-1 hover:border-parkingrabbit-primary hover:bg-white transition disabled:opacity-50"
              >
                {chip}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function truncate(s: string): string {
  return s.length <= MAX_NOTES_CHARS ? s : s.slice(0, MAX_NOTES_CHARS);
}
