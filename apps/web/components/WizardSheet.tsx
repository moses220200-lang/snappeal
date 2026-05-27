"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

/**
 * Reusable "wizard sheet" — full-screen on mobile, large modal on desktop.
 * Navy backdrop, dotted pattern, badge + title + subtitle + body + sticky
 * footer, so any moment in the app can pop a contextual mini-wizard.
 *
 * Used for: photo coach feedback, strengthen-my-notes preview, voice
 * notes recording UI, permission asks, post-success upsells.
 */
export function WizardSheet({
  open,
  onClose,
  badge,
  title,
  subtitle,
  children,
  footer,
  dismissible = true,
}: {
  open: boolean;
  onClose?: () => void;
  badge?: string;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  dismissible?: boolean;
}) {
  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Escape to close.
  useEffect(() => {
    if (!open || !dismissible || !onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismissible, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-parkingrabbit-navy/95 backdrop-blur-md overflow-y-auto">
      <div
        aria-hidden
        className="absolute inset-0 opacity-15 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.35) 1px, transparent 0)",
          backgroundSize: "28px 28px",
        }}
      />
      {dismissible && onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="fixed top-5 right-5 z-10 size-9 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition"
        >
          <X className="size-4" />
        </button>
      )}
      <div className="relative min-h-full flex flex-col px-6 py-12 max-w-md mx-auto">
        {badge && (
          <p className="inline-flex self-start items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/80">
            {badge}
          </p>
        )}
        <h2 className="mt-5 text-3xl font-bold tracking-tight text-white leading-tight">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-2 text-sm text-white/70 leading-relaxed">{subtitle}</p>
        )}
        {children && (
          <div className="mt-7 flex-1 flex flex-col gap-3">{children}</div>
        )}
        {footer && <div className="mt-8 flex flex-col gap-2">{footer}</div>}
      </div>
    </div>
  );
}
