"use client";

/**
 * Council picker modal — 3-column grid of issuing-authority logo tiles
 * that opens from the "Issuing council" row on the smart ticket card.
 *
 * We picked a logo grid over a native <select> because users recognise
 * their council's mark instantly — the Westminster lion / TfL roundel /
 * RBKC crest are the actual identity cues people remember from the PCN
 * envelope. Each tile leads with the logo (~78% of a square brand-bg
 * panel); the council name sits underneath. Selected tile gets the
 * primary-color ring + a check badge in the top-right corner.
 *
 * Backdrop tap + Escape both close. Body scroll is locked while open.
 */
import { useEffect } from "react";
import { Building2, Check, X } from "lucide-react";

export interface CouncilOption {
  slug: string;
  name: string;
  logoUrl?: string | null;
  logoBg?: string | null;
}

interface Props {
  councils: CouncilOption[];
  selectedSlug: string | null;
  onClose: () => void;
  onPick: (slug: string) => void;
}

export function CouncilPickerSheet({
  councils,
  selectedSlug,
  onClose,
  onPick,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-snappeal-navy/40 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Pick the issuing council"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-snappeal-border max-h-[85vh] flex flex-col"
      >
        <div className="px-5 pt-4 pb-3 flex items-start gap-3 border-b border-snappeal-border">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-snappeal-primary">
              Issuing council
            </p>
            <p className="text-[15px] font-bold text-snappeal-navy mt-1 leading-tight">
              Pick the authority on your ticket.
            </p>
            <p className="text-[12px] text-snappeal-muted mt-1 leading-snug">
              The logo on your PCN matches one of these.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close council picker"
            className="size-8 -mt-1 -mr-1 rounded-full text-snappeal-muted hover:bg-snappeal-bg flex items-center justify-center shrink-0"
          >
            <X className="size-4" strokeWidth={2.25} />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto">
          <div className="grid grid-cols-3 gap-3">
            {councils.map((c) => (
              <CouncilTile
                key={c.slug}
                council={c}
                selected={c.slug === selectedSlug}
                onPick={() => onPick(c.slug)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CouncilTile({
  council,
  selected,
  onPick,
}: {
  council: CouncilOption;
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={selected}
      className={`relative rounded-2xl border bg-white p-2.5 flex flex-col items-center text-center gap-2 transition active:scale-[0.97] ${
        selected
          ? "border-snappeal-primary ring-2 ring-snappeal-primary/30 shadow-sm"
          : "border-snappeal-border hover:border-snappeal-primary/50"
      }`}
    >
      {selected && (
        <span className="absolute top-1.5 right-1.5 size-5 rounded-full bg-snappeal-primary text-white flex items-center justify-center shadow">
          <Check className="size-3" strokeWidth={3} />
        </span>
      )}
      <span
        className="w-full aspect-square rounded-xl border border-snappeal-border flex items-center justify-center overflow-hidden"
        style={{ background: council.logoBg || "#ffffff" }}
        aria-hidden
      >
        {council.logoUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={council.logoUrl}
            alt=""
            className="max-w-[78%] max-h-[78%] object-contain"
          />
        ) : (
          <Building2 className="size-7 text-snappeal-muted" strokeWidth={1.75} />
        )}
      </span>
      <span className="text-[11.5px] font-semibold text-snappeal-navy leading-tight line-clamp-2">
        {council.name}
      </span>
    </button>
  );
}
