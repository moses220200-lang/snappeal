"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  CheckCircle2,
  Image as ImageIcon,
  Keyboard,
  Loader2,
  Plus,
  Scan,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import {
  ConfirmedTicket,
  clearEvidencePhotos,
  clearPcnPhoto,
  getConfirmedTicket,
  getEvidencePhotos,
  getPcnPhoto,
  getOrCreateSessionId,
  setConfirmedTicket,
  setEvidencePhotos,
  setPcnPhoto,
} from "@/lib/client/session";
import { haptic } from "@/lib/client/haptics";
import { WizardSheet } from "@/components/WizardSheet";

interface PhotoCoachResult {
  legible: boolean;
  quality: "good" | "ok" | "poor";
  issues: string[];
  advice: string;
}
interface FieldConfidence {
  issuer?: number;
  councilSlug?: number;
  pcnRef?: number;
  vehicleReg?: number;
  contraventionCode?: number;
  location?: number;
  issuedAt?: number;
  amountPence?: number;
}

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_EVIDENCE = 6;

const FIELDS: Array<{ key: keyof ConfirmedTicket; label: string; placeholder: string }> = [
  { key: "issuer", label: "Issuer", placeholder: "Westminster City Council" },
  { key: "pcnRef", label: "PCN reference", placeholder: "WC12345678" },
  { key: "vehicleReg", label: "Vehicle reg", placeholder: "AB12 CDE" },
  { key: "contraventionCode", label: "Code", placeholder: "12" },
  { key: "location", label: "Location", placeholder: "Marylebone High St, W1U" },
  { key: "issuedAt", label: "Issued", placeholder: "12 May 2026 09:14" },
];

export default function CapturePage() {
  const router = useRouter();
  const [pcn, setPcn] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<string[]>([]);
  const [ticket, setTicket] = useState<ConfirmedTicket | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [reading, setReading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<FieldConfidence>({});
  const [coach, setCoach] = useState<PhotoCoachResult | null>(null);
  const [showCoach, setShowCoach] = useState(false);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const evidenceInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Hydrate from sessionStorage so navigating away/back is non-destructive.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPcn(getPcnPhoto());
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEvidence(getEvidencePhotos());
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTicket(getConfirmedTicket());
  }, []);

  const readFile = async (file: File): Promise<string> => {
    if (file.size > MAX_BYTES) {
      throw new Error(`Photo too large (${(file.size / 1024 / 1024).toFixed(1)} MB) — max 8 MB.`);
    }
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error("Couldn't read that file"));
      reader.readAsDataURL(file);
    });
  };

  const handlePcnFile = (source: "camera" | "library") => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setReading(source);
    try {
      const dataUrl = await readFile(file);
      setPcnPhoto(dataUrl);
      setPcn(dataUrl);
      // Auto-run extract so user can confirm metadata immediately.
      void runExtract(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setReading(null);
    }
  };

  const handleEvidenceFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setError(null);
    try {
      const newOnes: string[] = [];
      for (const f of files) {
        newOnes.push(await readFile(f));
      }
      const merged = [...evidence, ...newOnes].slice(0, MAX_EVIDENCE);
      setEvidencePhotos(merged);
      setEvidence(merged);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const removeEvidence = (idx: number) => {
    const next = evidence.filter((_, i) => i !== idx);
    setEvidencePhotos(next);
    setEvidence(next);
  };

  const removePcn = () => {
    clearPcnPhoto();
    setPcn(null);
    setTicket(null);
    setConfirmedTicket({} as ConfirmedTicket);
  };

  const runExtract = async (photo: string) => {
    setExtracting(true);
    setError(null);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: getOrCreateSessionId(), pcnPhoto: photo }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? `Extract failed (${res.status})`);
      const extracted = json.ticket as ConfirmedTicket;
      setTicket(extracted);
      setConfirmedTicket(extracted);
      setConfidence(json.confidence ?? {});
      if (json.coach) {
        setCoach(json.coach as PhotoCoachResult);
        if (json.coach.quality !== "good") {
          setShowCoach(true);
          haptic("warning");
        } else {
          haptic("success");
        }
      } else {
        haptic("success");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extraction failed");
      haptic("error");
    } finally {
      setExtracting(false);
    }
  };

  const updateField = (key: keyof ConfirmedTicket, value: string) => {
    const next: ConfirmedTicket = { ...(ticket ?? {}), [key]: value };
    setTicket(next);
    setConfirmedTicket(next);
  };

  const canContinue = Boolean(pcn);

  return (
    <>
      <BackHeader title="Add your parking ticket" subtitle="Step 1 of 4 · Photos" back="/app" />
      <div className="flex flex-col gap-5 px-5 pt-4 pb-6">

      {/* PCN photo zone */}
      {!pcn ? (
        <>
          <div
            onClick={() => cameraInputRef.current?.click()}
            className="relative rounded-3xl overflow-hidden bg-snappeal-navy aspect-[4/3] cursor-pointer active:scale-[0.99]"
          >
            <div
              aria-hidden
              className="absolute inset-0 opacity-20"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(255,255,255,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.18) 1px, transparent 1px)",
                backgroundSize: "40px 40px",
              }}
            />
            <div className="absolute inset-8 pointer-events-none">
              <span className="absolute -top-2 -left-2 size-8 border-t-2 border-l-2 border-white rounded-tl-xl" />
              <span className="absolute -top-2 -right-2 size-8 border-t-2 border-r-2 border-white rounded-tr-xl" />
              <span className="absolute -bottom-2 -left-2 size-8 border-b-2 border-l-2 border-white rounded-bl-xl" />
              <span className="absolute -bottom-2 -right-2 size-8 border-b-2 border-r-2 border-white rounded-br-xl" />
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white text-center px-6 gap-3">
              <span className="size-14 rounded-full bg-white/15 backdrop-blur flex items-center justify-center">
                <Scan className="size-6 text-white" />
              </span>
              <div>
                <p className="text-base font-bold">Frame your PCN here</p>
                <p className="text-xs text-white/75 mt-1 max-w-[220px]">
                  Make sure the reference, vehicle reg, code and amount are all in shot.
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  cameraInputRef.current?.click();
                }}
                className="rounded-full bg-snappeal-action px-4 py-2 text-xs font-semibold mt-1 inline-flex items-center gap-1.5 shadow-lg shadow-snappeal-action/40 text-white hover:bg-snappeal-action-600 transition"
              >
                <Camera className="size-3.5" /> Open camera
              </button>
            </div>
          </div>

          {/* 3-up shortcut grid */}
          <div className="grid grid-cols-3 gap-2">
            <CaptureTile
              icon={Camera}
              title="Scan Ticket"
              sub="Use camera"
              variant="primary"
              loading={reading === "camera"}
              onClick={() => cameraInputRef.current?.click()}
            />
            <CaptureTile
              icon={ImageIcon}
              title="Upload Photos"
              sub="From library"
              loading={reading === "library"}
              onClick={() => libraryInputRef.current?.click()}
            />
            <CaptureTile
              icon={Keyboard}
              title="Enter PCN"
              sub="Type it in"
              onClick={() => router.push("/app/notes?from=manual")}
            />
          </div>
        </>
      ) : (
        <>
          {/* PCN preview + remove */}
          <div className="relative rounded-3xl overflow-hidden bg-snappeal-navy aspect-[4/3]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pcn} alt="Your PCN" className="absolute inset-0 size-full object-cover" />
            <button
              type="button"
              onClick={removePcn}
              aria-label="Remove PCN photo"
              className="absolute top-3 right-3 size-9 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/75 transition"
            >
              <X className="size-4" />
            </button>
            <div className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-snappeal-success/95 text-white text-[10px] font-bold uppercase tracking-wide px-2.5 py-1">
              <CheckCircle2 className="size-3" /> PCN captured
            </div>
          </div>

          {/* Extracted metadata for confirmation */}
          <section className="rounded-2xl bg-white border border-snappeal-border p-4">
            <div className="flex items-start gap-3 mb-3">
              <span className="size-9 rounded-full bg-snappeal-primary-100 text-snappeal-primary flex items-center justify-center flex-shrink-0">
                <Sparkles className="size-[1.125rem]" />
              </span>
              <div>
                <p className="text-sm font-bold text-snappeal-navy flex items-center gap-2">
                  What we read from your PCN
                  {extracting && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-snappeal-primary">
                      <Loader2 className="size-3 animate-spin" /> reading…
                    </span>
                  )}
                </p>
                <p className="text-xs text-snappeal-muted mt-0.5 leading-relaxed">
                  Tap any field to edit it. We&apos;ll use these in your appeal.
                </p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-3 text-xs">
              {FIELDS.map(({ key, label, placeholder }) => {
                const c = (confidence as Record<string, number | undefined>)[key];
                const conf = typeof c === "number" ? c : null;
                const dot =
                  conf == null
                    ? null
                    : conf >= 0.85
                      ? { color: "bg-snappeal-success", title: "High confidence" }
                      : conf >= 0.5
                        ? { color: "bg-amber-400", title: "Medium — please review" }
                        : { color: "bg-snappeal-action", title: "Low — please correct" };
                return (
                  <div key={key} className="flex flex-col gap-1">
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-snappeal-muted flex items-center gap-1.5">
                      {label}
                      {dot && (
                        <span
                          className={`size-2 rounded-full ${dot.color}`}
                          title={dot.title}
                        />
                      )}
                    </dt>
                    <dd>
                      <input
                        value={String(ticket?.[key] ?? "")}
                        onChange={(e) => updateField(key, e.target.value)}
                        placeholder={extracting ? "…" : placeholder}
                        className="w-full bg-snappeal-bg/60 border border-transparent focus:border-snappeal-primary focus:bg-white rounded-lg px-2 py-1.5 text-snappeal-navy font-semibold outline-none transition text-xs"
                      />
                    </dd>
                  </div>
                );
              })}
              <div className="col-span-2 flex flex-col gap-1">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-snappeal-muted">Amount (£)</dt>
                <dd>
                  <input
                    type="number"
                    step="0.01"
                    value={ticket?.amountPence ? (ticket.amountPence / 100).toFixed(2) : ""}
                    onChange={(e) => {
                      const pence = Math.round(parseFloat(e.target.value || "0") * 100);
                      updateField("amountPence" as unknown as keyof ConfirmedTicket, String(pence));
                      const next = { ...(ticket ?? {}), amountPence: pence };
                      setTicket(next);
                      setConfirmedTicket(next);
                    }}
                    placeholder={extracting ? "…" : "160.00"}
                    className="w-full bg-snappeal-bg/60 border border-transparent focus:border-snappeal-primary focus:bg-white rounded-lg px-2 py-1.5 text-snappeal-navy font-semibold outline-none transition text-xs"
                  />
                </dd>
              </div>
            </dl>
            {error && (
              <p className="mt-3 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">
                {error}
              </p>
            )}
          </section>

          {/* Evidence photo grid */}
          <section className="rounded-2xl bg-white border border-snappeal-border p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-start gap-3">
                <span className="size-9 rounded-full bg-snappeal-primary-100 text-snappeal-primary flex items-center justify-center flex-shrink-0">
                  <ShieldCheck className="size-[1.125rem]" />
                </span>
                <div>
                  <p className="text-sm font-bold text-snappeal-navy">Add evidence</p>
                  <p className="text-xs text-snappeal-muted mt-0.5">
                    Photos of the scene, signs, blocked notices — anything that supports your side.
                  </p>
                </div>
              </div>
              <span className="text-[10px] text-snappeal-muted whitespace-nowrap">
                {evidence.length} / {MAX_EVIDENCE}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {evidence.map((src, i) => (
                <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-snappeal-bg border border-snappeal-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`Evidence ${i + 1}`} className="absolute inset-0 size-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeEvidence(i)}
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
                  onClick={() => evidenceInputRef.current?.click()}
                  className="aspect-square rounded-xl border-2 border-dashed border-snappeal-border bg-snappeal-bg/40 flex flex-col items-center justify-center gap-1 text-snappeal-muted hover:text-snappeal-primary hover:border-snappeal-primary transition"
                >
                  <Plus className="size-5" />
                  <span className="text-[10px] font-semibold">Add</span>
                </button>
              )}
            </div>
            {evidence.length === 0 && (
              <p className="mt-3 text-[11px] text-snappeal-muted leading-relaxed">
                Tip: a wide shot showing the bay markings + a close-up of the missing or obscured sign is the strongest single piece of evidence.
              </p>
            )}
          </section>

          <div className="flex flex-col gap-2.5 mt-1">
            <button
              type="button"
              onClick={() => router.push("/app/notes")}
              disabled={!canContinue}
              className="rounded-2xl bg-snappeal-action text-white font-semibold py-4 shadow-lg shadow-snappeal-action/40 hover:bg-snappeal-action-600 transition disabled:opacity-40 disabled:shadow-none"
            >
              Continue to notes
            </button>
            <button
              type="button"
              onClick={() => {
                clearPcnPhoto();
                clearEvidencePhotos();
                setPcn(null);
                setEvidence([]);
                setTicket(null);
              }}
              className="text-xs text-snappeal-muted hover:text-snappeal-navy py-2"
            >
              Start over
            </button>
          </div>
        </>
      )}

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handlePcnFile("camera")}
      />
      <input
        ref={libraryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePcnFile("library")}
      />
      <input
        ref={evidenceInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleEvidenceFiles}
      />
      </div>

      {coach && (
        <WizardSheet
          open={showCoach}
          onClose={() => setShowCoach(false)}
          badge={coach.quality === "poor" ? "Retake?" : "Photo check"}
          title={
            coach.quality === "good"
              ? "Looks great"
              : coach.quality === "ok"
                ? "Usable — but worth a tweak"
                : "Let's try again"
          }
          subtitle={coach.advice}
          footer={
            <>
              {coach.quality !== "good" && (
                <button
                  type="button"
                  onClick={() => {
                    setShowCoach(false);
                    removePcn();
                    cameraInputRef.current?.click();
                  }}
                  className="rounded-2xl bg-snappeal-action text-white font-semibold py-3.5 hover:bg-snappeal-action-600 transition"
                >
                  Retake photo
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowCoach(false)}
                className="rounded-2xl bg-white/10 border border-white/20 text-white font-semibold py-3.5 hover:bg-white/15 transition"
              >
                {coach.quality === "good" ? "Continue" : "Use this anyway"}
              </button>
            </>
          }
        >
          {coach.issues.length > 0 && (
            <ul className="flex flex-col gap-2">
              {coach.issues.map((i) => (
                <li key={i} className="rounded-xl bg-white/10 border border-white/15 px-3 py-2 text-sm text-white/85">
                  {i}
                </li>
              ))}
            </ul>
          )}
        </WizardSheet>
      )}
    </>
  );
}

function CaptureTile({
  icon: Icon,
  title,
  sub,
  variant,
  loading,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  sub: string;
  variant?: "primary";
  loading?: boolean;
  onClick: () => void;
}) {
  const isPrimary = variant === "primary";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`rounded-2xl border p-3 flex flex-col items-center gap-1.5 text-center transition disabled:opacity-60 ${
        isPrimary
          ? "bg-snappeal-action border-snappeal-action text-white hover:bg-snappeal-action-600 shadow-lg shadow-snappeal-action/30"
          : "bg-white border-snappeal-border hover:border-snappeal-primary"
      }`}
    >
      <span
        className={`size-10 rounded-xl flex items-center justify-center ${
          isPrimary ? "bg-white/20 text-white" : "bg-snappeal-primary-100 text-snappeal-primary"
        }`}
      >
        {loading ? <Loader2 className="size-5 animate-spin" /> : <Icon className="size-5" />}
      </span>
      <p className={`text-[12px] font-bold leading-tight ${isPrimary ? "text-white" : "text-snappeal-navy"}`}>
        {title}
      </p>
      <p className={`text-[10px] leading-tight ${isPrimary ? "text-white/80" : "text-snappeal-muted"}`}>
        {sub}
      </p>
    </button>
  );
}
