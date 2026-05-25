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
 *   3. Input manually — link to `/app/manual-entry`
 *
 * Camera + Upload feed the same `uploadPcn()` pipeline used everywhere
 * else (creates the appeal row, fires background OCR, redirects to
 * `/app/tickets?expand=<id>` where the smart card progressively fills
 * in as OCR settles).
 */
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Camera,
  ChevronRight,
  Image as ImageIcon,
  Keyboard,
  Loader2,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { readFileAsDataUrl, uploadPcn } from "@/lib/client/uploadPcn";

export default function ScanPage() {
  const router = useRouter();
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState<"camera" | "gallery" | null>(null);
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
        {/* Header copy */}
        <div>
          <h1 className="text-[24px] font-extrabold text-snappeal-navy leading-tight">
            Scan PCN
          </h1>
          <p className="text-[13px] text-snappeal-muted mt-1 leading-snug">
            Take a photo of your parking ticket or choose another method.
          </p>
        </div>

        {/* Scanner preview area — dark glass card with corner brackets
         *  and an animated scan line. Visual only; the actual scan
         *  fires when the user taps one of the buttons below. */}
        <div className="relative w-full aspect-[4/5] rounded-[28px] overflow-hidden bg-snappeal-navy shadow-[0_24px_64px_-16px_rgba(0,32,80,0.45)]">
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
          <div className="absolute inset-0 snappeal-hero-scan pointer-events-none">
            <div className="absolute inset-x-10 top-0 h-[3px] bg-gradient-to-r from-transparent via-snappeal-primary to-transparent shadow-[0_0_24px_4px_rgba(0,122,255,0.55)]" />
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

        {/* Three action buttons */}
        <div className="flex flex-col gap-3">
          {/* 1. Camera — primary action */}
          <button
            type="button"
            onClick={() => {
              if (busy) return;
              cameraInputRef.current?.click();
            }}
            disabled={!!busy}
            className="rounded-2xl bg-snappeal-primary text-white px-5 py-4 flex items-center gap-3 transition active:scale-[0.99] hover:bg-snappeal-primary-600 disabled:opacity-60 shadow-lg shadow-snappeal-primary/30"
          >
            <span className="size-12 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              {busy === "camera" ? (
                <Loader2 className="size-5 animate-spin" strokeWidth={2.25} />
              ) : (
                <Camera className="size-5" strokeWidth={2.25} />
              )}
            </span>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-[15px] font-bold leading-tight">Camera</p>
              <p className="text-[12px] text-white/80 mt-0.5 leading-snug">
                Take a photo of the PCN
              </p>
            </div>
            <ChevronRight className="size-4 text-white/80 shrink-0" />
          </button>

          {/* 2. Upload picture */}
          <button
            type="button"
            onClick={() => {
              if (busy) return;
              galleryInputRef.current?.click();
            }}
            disabled={!!busy}
            className="rounded-2xl bg-white border border-snappeal-border text-snappeal-navy px-5 py-4 flex items-center gap-3 transition active:scale-[0.99] hover:border-snappeal-primary/60 disabled:opacity-60"
          >
            <span className="size-12 rounded-xl bg-snappeal-bg text-snappeal-navy flex items-center justify-center shrink-0">
              {busy === "gallery" ? (
                <Loader2 className="size-5 animate-spin" strokeWidth={2.25} />
              ) : (
                <ImageIcon className="size-5" strokeWidth={2.25} />
              )}
            </span>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-[15px] font-bold leading-tight">
                Upload picture
              </p>
              <p className="text-[12px] text-snappeal-muted mt-0.5 leading-snug">
                Choose an existing photo from your library
              </p>
            </div>
            <ChevronRight className="size-4 text-snappeal-muted shrink-0" />
          </button>

          {/* 3. Input manually */}
          <Link
            href="/app/manual-entry"
            className="rounded-2xl bg-white border border-snappeal-border text-snappeal-navy px-5 py-4 flex items-center gap-3 transition active:scale-[0.99] hover:border-snappeal-primary/60"
          >
            <span className="size-12 rounded-xl bg-snappeal-bg text-snappeal-navy flex items-center justify-center shrink-0">
              <Keyboard className="size-5" strokeWidth={2.25} />
            </span>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-[15px] font-bold leading-tight">
                Input manually
              </p>
              <p className="text-[12px] text-snappeal-muted mt-0.5 leading-snug">
                Type in PCN ref, registration, amount and date
              </p>
            </div>
            <ChevronRight className="size-4 text-snappeal-muted shrink-0" />
          </Link>
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
      <span className="absolute left-0 top-0 h-[3px] w-8 bg-snappeal-primary rounded-full shadow-[0_0_8px_rgba(0,122,255,0.5)]" />
      <span className="absolute left-0 top-0 w-[3px] h-8 bg-snappeal-primary rounded-full shadow-[0_0_8px_rgba(0,122,255,0.5)]" />
    </span>
  );
}
