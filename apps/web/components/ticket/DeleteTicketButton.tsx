"use client";

/**
 * Two-tap delete affordance for a ticket card. First tap arms the button
 * (it changes copy + colour to red), second tap within 4 s fires
 * `onConfirm`. Reset timer fires if the user looks away.
 *
 * Extracted out of TicketCard.tsx — self-contained, no external state.
 */
import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";

export function DeleteTicketButton({ onConfirm }: { onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleClick = () => {
    if (confirming) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setConfirming(false);
      onConfirm();
      return;
    }
    setConfirming(true);
    timerRef.current = setTimeout(() => {
      setConfirming(false);
      timerRef.current = null;
    }, 4000);
  };

  if (confirming) {
    return (
      <button
        type="button"
        onClick={handleClick}
        autoFocus
        className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-red-600 text-white border border-red-700 hover:bg-red-700 transition py-3 text-[12px] font-bold shadow-sm active:scale-[0.99]"
      >
        <Trash2 className="size-4" strokeWidth={2.25} />
        Tap again to confirm
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-white border border-parkingrabbit-border text-parkingrabbit-muted hover:text-red-700 hover:border-red-200 hover:bg-red-50/40 transition py-3 text-[12px] font-semibold"
    >
      <Trash2 className="size-4" strokeWidth={2} />
      Delete
    </button>
  );
}
