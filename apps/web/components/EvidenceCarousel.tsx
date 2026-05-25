"use client";

import { useRef, useState } from "react";
import { Plus, ShieldCheck, Trash2 } from "lucide-react";
import { getEvidencePhotos, setEvidencePhotos } from "@/lib/client/session";

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_EVIDENCE = 6;

/**
 * User-evidence photo grid — lifted out of `/app/capture/page.tsx` so the
 * new combined evidence/quiz page can embed it without duplicating the
 * UI. Behaviour identical to the previous inline version: up to 6
 * photos, ≤8 MB each, persisted as base64 data URLs in sessionStorage
 * (the long-standing v0.2.5 stash that rides the body of
 * `/api/generate-stream`).
 *
 * Blob-backed evidence storage is on the roadmap — see handoff.md.
 */
export function EvidenceCarousel({
  initial,
  onChange,
}: {
  initial?: string[];
  onChange?: (next: string[]) => void;
}) {
  const [evidence, setEvidence] = useState<string[]>(
    initial ?? getEvidencePhotos(),
  );
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const update = (next: string[]) => {
    setEvidence(next);
    setEvidencePhotos(next);
    onChange?.(next);
  };

  const readFile = (file: File): Promise<string> => {
    if (file.size > MAX_BYTES) {
      return Promise.reject(
        new Error(
          `Photo too large (${(file.size / 1024 / 1024).toFixed(1)} MB) — max 8 MB.`,
        ),
      );
    }
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () =>
        reject(reader.error ?? new Error("Couldn't read that file"));
      reader.readAsDataURL(file);
    });
  };

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setError(null);
    try {
      const newOnes: string[] = [];
      for (const f of files) newOnes.push(await readFile(f));
      const merged = [...evidence, ...newOnes].slice(0, MAX_EVIDENCE);
      update(merged);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const removeAt = (idx: number) => {
    update(evidence.filter((_, i) => i !== idx));
  };

  return (
    <section className="rounded-2xl bg-white border border-snappeal-border p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-start gap-3">
          <span className="size-9 rounded-full bg-snappeal-primary-100 text-snappeal-primary flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="size-[1.125rem]" />
          </span>
          <div>
            <p className="text-sm font-bold text-snappeal-navy">
              Add your own evidence
            </p>
            <p className="text-xs text-snappeal-muted mt-0.5">
              Photos of the scene, signs, blocked notices — anything that
              supports your side.
            </p>
          </div>
        </div>
        <span className="text-[10px] text-snappeal-muted whitespace-nowrap">
          {evidence.length} / {MAX_EVIDENCE}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {evidence.map((src, i) => (
          <div
            key={i}
            className="relative aspect-square rounded-xl overflow-hidden bg-snappeal-bg border border-snappeal-border"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={`Evidence ${i + 1}`}
              className="absolute inset-0 size-full object-cover"
            />
            <button
              type="button"
              onClick={() => removeAt(i)}
              aria-label={`Remove evidence ${i + 1}`}
              className="absolute top-1.5 right-1.5 size-6 rounded-full bg-black/65 text-white flex items-center justify-center hover:bg-black/85 transition"
            >
              <Trash2 className="size-3" />
            </button>
          </div>
        ))}
        {evidence.length < MAX_EVIDENCE && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="aspect-square rounded-xl border-2 border-dashed border-snappeal-border bg-snappeal-bg/40 flex flex-col items-center justify-center gap-1 text-snappeal-muted hover:text-snappeal-primary hover:border-snappeal-primary transition"
          >
            <Plus className="size-5" />
            <span className="text-[10px] font-semibold">Add</span>
          </button>
        )}
      </div>
      {evidence.length === 0 && (
        <p className="mt-3 text-[11px] text-snappeal-muted leading-relaxed">
          Tip: a wide shot showing the bay markings + a close-up of the missing
          or obscured sign is the strongest single piece of evidence.
        </p>
      )}
      {error && (
        <p className="mt-3 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">
          {error}
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFiles}
      />
    </section>
  );
}
