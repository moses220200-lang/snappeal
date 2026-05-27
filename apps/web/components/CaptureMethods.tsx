"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  Image as ImageIcon,
  Keyboard,
  Loader2,
} from "lucide-react";

const MAX_BYTES = 8 * 1024 * 1024; // 8MB ceiling per photo

/**
 * Three real native capture entries:
 *   1. Scan Ticket   — opens the rear camera via <input capture="environment">
 *   2. Upload Photos — opens the photo library via plain <input type="file">
 *   3. Enter PCN     — goes to the manual /app/notes?from=manual route
 *
 * Photos are read into data URLs and stashed in `sessionStorage` under
 * `parkingrabbit.pcnPhoto` so the next step (/app/notes) can pick them up.
 * Real backend integration replaces this with Vercel Blob signed-URL
 * uploads in v0.2.
 */
export function CaptureMethods() {
  const router = useRouter();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState<"camera" | "library" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = (source: "camera" | "library") => async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setError(null);

    if (file.size > MAX_BYTES) {
      setError(
        `That photo is ${(file.size / 1024 / 1024).toFixed(1)} MB — please pick one under 8 MB.`,
      );
      return;
    }

    setReading(source);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () =>
          reject(reader.error ?? new Error("Couldn't read that file"));
        reader.readAsDataURL(file);
      });
      window.sessionStorage.setItem("parkingrabbit.pcnPhoto", dataUrl);
      router.push(`/app/notes?from=${source}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setReading(null);
    }
  };

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          disabled={reading !== null}
          className="rounded-2xl border bg-parkingrabbit-primary border-parkingrabbit-primary text-white hover:bg-parkingrabbit-primary-600 shadow-lg shadow-parkingrabbit-primary/30 p-3 flex flex-col items-center gap-1.5 text-center transition disabled:opacity-60"
        >
          <span className="size-10 rounded-xl bg-white/20 text-white flex items-center justify-center">
            {reading === "camera" ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <Camera className="size-5" />
            )}
          </span>
          <p className="text-[12px] font-bold text-white leading-tight">
            Scan Ticket
          </p>
          <p className="text-[10px] text-white/80 leading-tight">Use camera</p>
        </button>

        <button
          type="button"
          onClick={() => libraryInputRef.current?.click()}
          disabled={reading !== null}
          className="rounded-2xl border bg-white border-parkingrabbit-border hover:border-parkingrabbit-primary p-3 flex flex-col items-center gap-1.5 text-center transition disabled:opacity-60"
        >
          <span className="size-10 rounded-xl bg-parkingrabbit-primary-100 text-parkingrabbit-primary flex items-center justify-center">
            {reading === "library" ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <ImageIcon className="size-5" />
            )}
          </span>
          <p className="text-[12px] font-bold text-parkingrabbit-navy leading-tight">
            Upload Photos
          </p>
          <p className="text-[10px] text-parkingrabbit-muted leading-tight">
            From library
          </p>
        </button>

        <button
          type="button"
          onClick={() => router.push("/app/notes?from=manual")}
          disabled={reading !== null}
          className="rounded-2xl border bg-white border-parkingrabbit-border hover:border-parkingrabbit-primary p-3 flex flex-col items-center gap-1.5 text-center transition disabled:opacity-60"
        >
          <span className="size-10 rounded-xl bg-parkingrabbit-primary-100 text-parkingrabbit-primary flex items-center justify-center">
            <Keyboard className="size-5" />
          </span>
          <p className="text-[12px] font-bold text-parkingrabbit-navy leading-tight">
            Enter PCN
          </p>
          <p className="text-[10px] text-parkingrabbit-muted leading-tight">
            Type it in
          </p>
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs px-3 py-2">
          {error}
        </div>
      )}

      {/* Hidden native file inputs. `capture="environment"` opens the
       * rear camera on iOS Safari + Android Chrome; the second input
       * omits it so it opens the photo library instead. */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile("camera")}
      />
      <input
        ref={libraryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile("library")}
      />
    </>
  );
}

/**
 * Hero "Open camera" trigger used elsewhere on the page — clicks the
 * same hidden camera input via a custom event so we don't duplicate
 * the file-handling logic.
 */
export function HeroCameraTrigger() {
  return (
    <button
      type="button"
      onClick={() => {
        const input = document.querySelector<HTMLInputElement>(
          "input[type=file][capture=environment]",
        );
        input?.click();
      }}
      className="rounded-full bg-parkingrabbit-primary px-4 py-2 text-xs font-semibold mt-1 inline-flex items-center gap-1.5 shadow-lg shadow-black/30 text-white hover:bg-parkingrabbit-primary-600 transition"
    >
      <Camera className="size-3.5" /> Open camera
    </button>
  );
}
