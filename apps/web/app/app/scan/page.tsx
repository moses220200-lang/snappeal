"use client";

/**
 * /app/scan — the dedicated Scan PCN landing page.
 *
 * Reached by tapping the centre camera button in the bottom nav.
 * Replaces the old behaviour where that button auto-opened the file
 * picker. Now the user always lands here first and chooses one of
 * three explicit paths:
 *
 *   1. Camera         — `<input capture="environment">` to shoot the PCN
 *   2. Upload picture — `<input>` to pick from the photo library
 *   3. Input manually — creates a fresh draft and lands on the smart
 *                       card on /app/tickets with the inline editable
 *                       form pre-expanded (`?inputManual=1`). Replaces
 *                       the old link to /app/manual-entry (deleted
 *                       2026-05-27 — duplicate of the form already on
 *                       the smart ticket).
 *
 * Camera + Upload feed the same `uploadPcn()` pipeline used everywhere
 * else (creates the appeal row, fires background OCR, redirects to
 * `/app/tickets?expand=<id>` where the smart card progressively fills
 * in as OCR settles).
 */
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  Image as ImageIcon,
  Keyboard,
  Loader2,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { readFileAsDataUrl, uploadPcn } from "@/lib/client/uploadPcn";
import { ensureCurrentAppeal } from "@/lib/client/draft";

export default function ScanPage() {
  const router = useRouter();
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState<"camera" | "gallery" | "manual" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (
    source: "camera" | "gallery",
    file: File | null | undefined,
  ) => {
    if (!file) return;
    setBusy(source);
    setError(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const { appealId } = await uploadPcn(dataUrl);
      router.push(`/app/tickets?expand=${encodeURIComponent(appealId)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't upload");
      setBusy(null);
    }
  };

  return (
    <>
      <AppHeader />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void handleFile("camera", e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handleFile("gallery", e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      <div className="px-5 pt-2 pb-32 flex flex-col gap-5">
        {/* Scanner preview area — dark glass card with corner brackets
         *  and an animated scan line. Visual only; the actual scan
         *  fires when the user taps one of the buttons below. */}
        <div className="relative w-full aspect-[4/5] rounded-[28px] overflow-hidden bg-parkingrabbit-navy shadow-[0_24px_64px_-16px_rgba(0,32,80,0.45)]">
          {/* Ambient glow */}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(60% 50% at 50% 38%, rgba(0,122,255,0.22) 0%, transparent 70%)",
            }}
          />
          {/* Subtle grid overlay */}
          <div
            aria-hidden
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
              backgroundSize: "36px 36px",
            }}
          />

          {/* Frame brackets */}
          <FrameCorner className="top-6 left-6" rotation={0} />
          <FrameCorner className="top-6 right-6" rotation={90} />
          <FrameCorner className="bottom-6 right-6" rotation={180} />
          <FrameCorner className="bottom-6 left-6" rotation={270} />

          {/* Animated scan line */}
          <div className="absolute inset-0 parkingrabbit-hero-scan pointer-events-none">
            <div className="absolute inset-x-10 top-0 h-[3px] bg-gradient-to-r from-transparent via-parkingrabbit-primary to-transparent shadow-[0_0_24px_4px_rgba(0,122,255,0.55)]" />
          </div>

          {/* Centre copy */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8 gap-2">
            <span className="size-12 rounded-2xl bg-white/10 backdrop-blur-sm text-white flex items-center justify-center">
              <Camera className="size-6" strokeWidth={2} />
            </span>
            <p className="text-white text-[16px] font-bold leading-tight">
              Position the PCN in the frame
            </p>
            <p className="text-white/70 text-[12px] leading-snug max-w-[260px]">
              Rabbit will read the reference, registration, amount and
              dates automatically.
            </p>
          </div>
        </div>

        {/* Three action tiles — collapsed to a single row of equal-width
         *  icon-over-label cards. The verbose per-row descriptions that
         *  the stacked layout used to carry are dropped here; the dark
         *  scanner card above already explains what the PCN scan does,
         *  and the icon + label is enough at tile size. Camera stays the
         *  primary visual (blue fill, white icon glyph) so it still
         *  reads as the recommended action even without sitting at the
         *  top of a vertical list. */}
        <div className="grid grid-cols-3 gap-3">
          {/* 1. Camera — primary action */}
          <button
            type="button"
            onClick={() => {
              if (busy) return;
              cameraInputRef.current?.click();
            }}
            disabled={!!busy}
            className="rounded-2xl bg-parkingrabbit-primary text-white px-3 py-4 flex flex-col items-center gap-2 transition active:scale-[0.97] hover:bg-parkingrabbit-primary-600 disabled:opacity-60 shadow-lg shadow-parkingrabbit-primary/30"
          >
            <span className="size-11 rounded-xl bg-white/15 flex items-center justify-center">
              {busy === "camera" ? (
                <Loader2 className="size-5 animate-spin" strokeWidth={2.25} />
              ) : (
                <Camera className="size-5" strokeWidth={2.25} />
              )}
            </span>
            <p className="text-[13px] font-bold leading-tight text-center">
              Camera
            </p>
          </button>

          {/* 2. Upload picture */}
          <button
            type="button"
            onClick={() => {
              if (busy) return;
              galleryInputRef.current?.click();
            }}
            disabled={!!busy}
            className="rounded-2xl bg-white border border-parkingrabbit-border text-parkingrabbit-navy px-3 py-4 flex flex-col items-center gap-2 transition active:scale-[0.97] hover:border-parkingrabbit-primary/60 disabled:opacity-60"
          >
            <span className="size-11 rounded-xl bg-parkingrabbit-bg text-parkingrabbit-navy flex items-center justify-center">
              {busy === "gallery" ? (
                <Loader2 className="size-5 animate-spin" strokeWidth={2.25} />
              ) : (
                <ImageIcon className="size-5" strokeWidth={2.25} />
              )}
            </span>
            <p className="text-[13px] font-bold leading-tight text-center">
              Upload
            </p>
          </button>

          {/* 3. Input manually — creates a fresh draft appeal and
           *  navigates to the smart ticket card on /app/tickets with
           *  the inline editable form pre-expanded. Replaces the
           *  earlier link to /app/manual-entry (deleted 2026-05-27)
           *  so all data entry happens on the smart card. */}
          <button
            type="button"
            onClick={async () => {
              if (busy) return;
              setBusy("manual");
              setError(null);
              try {
                const appealId = await ensureCurrentAppeal();
                router.push(
                  `/app/tickets?expand=${encodeURIComponent(appealId)}&inputManual=1`,
                );
              } catch (err) {
                setError(
                  err instanceof Error ? err.message : "Couldn't start manual entry",
                );
                setBusy(null);
              }
            }}
            disabled={!!busy}
            className="rounded-2xl bg-white border border-parkingrabbit-border text-parkingrabbit-navy px-3 py-4 flex flex-col items-center gap-2 transition active:scale-[0.97] hover:border-parkingrabbit-primary/60 disabled:opacity-60"
          >
            <span className="size-11 rounded-xl bg-parkingrabbit-bg text-parkingrabbit-navy flex items-center justify-center">
              {busy === "manual" ? (
                <Loader2 className="size-5 animate-spin" strokeWidth={2.25} />
              ) : (
                <Keyboard className="size-5" strokeWidth={2.25} />
              )}
            </span>
            <p className="text-[13px] font-bold leading-tight text-center">
              Manual
            </p>
          </button>
        </div>

        {error && (
          <p className="text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {error}
          </p>
        )}
      </div>
    </>
  );
}

function FrameCorner({
  className,
  rotation,
}: {
  className?: string;
  rotation: number;
}) {
  return (
    <span
      className={`absolute size-10 ${className ?? ""}`}
      style={{ transform: `rotate(${rotation}deg)` }}
      aria-hidden
    >
      <span className="absolute left-0 top-0 h-[3px] w-8 bg-parkingrabbit-primary rounded-full shadow-[0_0_8px_rgba(0,122,255,0.5)]" />
      <span className="absolute left-0 top-0 w-[3px] h-8 bg-parkingrabbit-primary rounded-full shadow-[0_0_8px_rgba(0,122,255,0.5)]" />
    </span>
  );
}
