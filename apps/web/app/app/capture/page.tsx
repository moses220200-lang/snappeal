"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Camera,
  CheckCircle2,
  CreditCard,
  Image as ImageIcon,
  Keyboard,
  Loader2,
  Plus,
  Scale,
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
  getCurrentAppealId,
  getEvidencePhotos,
  getPcnPhoto,
  getOrCreateSessionId,
  setEvidencePhotos,
  setPcnPhoto,
} from "@/lib/client/session";
import { debouncedPatch, getAppeal, patchCurrentAppeal } from "@/lib/client/draft";
import { haptic } from "@/lib/client/haptics";
import { WizardSheet } from "@/components/WizardSheet";
import { Check } from "lucide-react";

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
  // `?from=review` enters the free "Review my ticket" flow from the home
  // page. The page still captures + OCRs the PCN, but after the scan
  // resolves we show a recommendation panel (pay / challenge / reminders)
  // instead of pushing the user straight into the appeal flow. We read
  // the param via window.location inside an effect so the static prerender
  // doesn't need a Suspense boundary around `useSearchParams`.
  const [fromReview, setFromReview] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    // Read the param via window.location (not useSearchParams) so the static
    // prerender doesn't need a Suspense boundary. Hydration starts with the
    // default `false`; this effect upgrades it once on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFromReview(params.get("from") === "review");
  }, []);
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

  // Debounced PATCH for field edits — typing in the ticket-confirm inputs
  // batches a single trailing write to /api/appeals/[id] rather than firing
  // one PATCH per keystroke.
  const patchTicketDebounced = useMemo(() => debouncedPatch(600), []);

  useEffect(() => {
    // Photos stay client-side for now (large data URLs; Blob storage pending).
    // Ticket fields hydrate from the cloud appeal row if there's an in-flight
    // draft from a previous session — otherwise we start blank.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPcn(getPcnPhoto());
    setEvidence(getEvidencePhotos());

    let alive = true;
    const id = getCurrentAppealId();
    if (!id) return;
    void (async () => {
      const appeal = await getAppeal(id).catch(() => null);
      if (!alive || !appeal?.ticket) return;
      setTicket(appeal.ticket as ConfirmedTicket);
    })();
    return () => {
      alive = false;
    };
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
    // Null out the cloud copy too so re-extraction starts fresh. Fire and
    // forget — the user can't observe this PATCH directly.
    void patchCurrentAppeal({ ticket: null }).catch(() => {});
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
      // Persist immediately — the OCR result is the first piece of customer
      // data worth keeping, so it goes straight to the cloud (creating the
      // draft appeal on first call if one doesn't exist yet).
      void patchCurrentAppeal({ ticket: extracted }).catch(() => {});
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
      // OCR failures (network blip, unreadable image, Claude timeout) are
      // never just a quiet inline error any more — surface the same retake
      // sheet the photo coach uses, so the user always has a clear next step.
      const message = err instanceof Error ? err.message : "Extraction failed";
      setError(message);
      setCoach({
        legible: false,
        quality: "poor",
        issues: [
          "ParkingRabbit couldn't read the PCN from this photo.",
          message,
        ],
        advice:
          "Try retaking the photo with better lighting, less blur, and the whole ticket in frame.",
      });
      setShowCoach(true);
      haptic("error");
    } finally {
      setExtracting(false);
    }
  };

  const updateField = (key: keyof ConfirmedTicket, value: string) => {
    const next: ConfirmedTicket = { ...(ticket ?? {}), [key]: value };
    setTicket(next);
    // Debounced PATCH so each keystroke doesn't fire its own request.
    patchTicketDebounced({ ticket: next });
  };

  // A ticket counts as "manually filled" when we have at least the PCN ref
  // + vehicle reg in session (set by /app/manual-entry). We treat that as
  // satisfying step 1 just like a photo would — evidence photos remain
  // optional in either case.
  const hasManualTicket = Boolean(
    ticket && ticket.pcnRef && ticket.vehicleReg && !pcn,
  );
  const canContinue = Boolean(pcn) || hasManualTicket;

  return (
    <>
      {extracting && <ReadingPcnOverlay />}
      <BackHeader
        title="Add your parking ticket"
        subtitle="Step 1 of 4 · Ticket details"
        back="/app"
      />
      <div className="flex flex-col gap-5 px-5 pt-4 pb-6 snappeal-content-top">

      {hasManualTicket && (
        <div className="rounded-2xl bg-snappeal-primary-50 border border-snappeal-primary-100 p-4 flex items-start gap-3">
          <span className="size-9 rounded-full bg-white text-snappeal-primary flex items-center justify-center flex-shrink-0">
            <Keyboard className="size-[1.125rem]" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-bold text-snappeal-navy">
              Ticket details entered
            </p>
            <p className="text-[11px] text-snappeal-muted mt-0.5">
              Add evidence photos and review the fields below, then continue
              to your notes. You can still <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="underline text-snappeal-primary"
              >snap the PCN</button> if you have it.
            </p>
          </div>
        </div>
      )}

      {/* PCN photo zone — hidden once we have either a photo OR a
          manually-entered ticket. */}
      {!pcn && !hasManualTicket ? (
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
              onClick={() => router.push("/app/manual-entry")}
            />
          </div>
        </>
      ) : (
        <>
          {/* PCN preview — only when we have a real photo. The manual-entry
              path skips this block entirely; the banner above already tells
              the customer their typed details are in. */}
          {pcn && (
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
          )}

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
                      const next = { ...(ticket ?? {}), amountPence: pence };
                      setTicket(next);
                      patchTicketDebounced({ ticket: next });
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

          {/* Review-mode recommendation panel. Shown when the user came in
           *  from the "Review my ticket" home card AND we have OCR data to
           *  reason about. Replaces the linear "Continue to notes" CTA with
           *  three explicit next-step options so the customer never feels
           *  funneled. */}
          {fromReview && canContinue ? (
            <ReviewRecommendation
              onPay={() => router.push("/app/pay")}
              onChallenge={() => router.push("/app/notes")}
            />
          ) : (
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
          )}
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

/**
 * Full-page blocker shown while `/api/extract` is running. Locks out every
 * other tap on the capture page and runs a timer-driven percentage + a
 * field-by-field checklist so the wait feels purposeful. Claude actually
 * returns the whole ticket at once — the per-field ticking is a deliberate
 * UX simulation tuned to the typical ~6 s OCR call. On a poor or failed
 * extraction the WizardSheet ("Let's try again") slides in on top of this
 * once the OCR settles.
 */
function ReadingPcnOverlay() {
  const FIELDS = [
    { label: "PCN reference", hint: "the WE / WC code on top" },
    { label: "Vehicle registration", hint: "the number plate" },
    { label: "Contravention code", hint: "what they fined you for" },
    { label: "Location", hint: "where the ticket was issued" },
    { label: "Issue date & time", hint: "the timestamp on the notice" },
    { label: "Penalty amount", hint: "the £ you'd owe today" },
  ];
  const STEP_MS = 900; // each field becomes "active" then "done" over this
  const TARGET_MS = STEP_MS * FIELDS.length; // ~5.4 s of visible work

  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const id = window.setInterval(() => setElapsed(performance.now() - start), 60);
    return () => window.clearInterval(id);
  }, []);

  // Index of the field currently being "read". Once we run past the list
  // (because the API is taking longer than the simulation budget), park on
  // the last field with a "double-checking" status so it never looks frozen.
  const activeIndex = Math.min(FIELDS.length - 1, Math.floor(elapsed / STEP_MS));
  // Cap at 95 % until the real API returns — the parent will unmount us at
  // that point. The curve is a soft ease so the number doesn't sprint to 95.
  const percent = Math.min(
    95,
    Math.round(95 * (1 - Math.exp(-elapsed / 2200))),
  );

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Reading your PCN — please wait"
      className="fixed inset-0 z-[120] bg-snappeal-navy/95 backdrop-blur-md flex flex-col items-center justify-center overflow-hidden px-6 py-10"
    >
      {/* Subtle dotted grid */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-15"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.35) 1px, transparent 0)",
          backgroundSize: "28px 28px",
        }}
      />
      {/* Soft radial */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 40%, rgba(0,122,255,0.28) 0%, transparent 70%)",
        }}
      />

      <div className="relative w-full max-w-sm flex flex-col items-center text-center gap-6">
        {/* Percentage tile */}
        <div className="relative size-32 rounded-3xl bg-snappeal-primary-100 text-snappeal-primary flex items-center justify-center overflow-hidden shadow-2xl shadow-black/40">
          <span className="text-5xl font-extrabold tabular-nums leading-none relative z-10">
            {percent}
            <span className="text-2xl font-bold align-top ml-0.5">%</span>
          </span>
          {/* Scan line strip — reuses the keyframe from the generating overlay */}
          <span className="absolute inset-x-0 h-1.5 rounded-full snappeal-generating-line bg-gradient-to-b from-transparent via-snappeal-primary to-transparent" />
        </div>

        <div>
          <p className="text-xl font-bold text-white tracking-tight">
            Reading your PCN
          </p>
          <p className="text-[13px] text-white/70 mt-1">
            ParkingRabbit AI is pulling each field from your photo.
          </p>
        </div>

        {/* Field-by-field checklist */}
        <ul className="w-full flex flex-col gap-2 text-left">
          {FIELDS.map((f, i) => {
            const done = i < activeIndex;
            const active = i === activeIndex;
            const lastField = activeIndex === FIELDS.length - 1;
            return (
              <li
                key={f.label}
                className={`flex items-center gap-3 rounded-2xl border px-3.5 py-2.5 transition-colors ${
                  done
                    ? "bg-snappeal-success/15 border-snappeal-success/30"
                    : active
                      ? "bg-snappeal-primary/15 border-snappeal-primary/40"
                      : "bg-white/5 border-white/10"
                }`}
              >
                <span
                  className={`size-7 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                    done
                      ? "bg-snappeal-success text-white"
                      : active
                        ? "bg-snappeal-primary text-white"
                        : "bg-white/10 text-white/40"
                  }`}
                >
                  {done ? (
                    <Check className="size-4" strokeWidth={3} />
                  ) : active ? (
                    <span className="size-2 rounded-full bg-white animate-pulse" />
                  ) : (
                    <span className="size-2 rounded-full bg-white/30" />
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-[13px] font-semibold leading-tight ${
                      done || active ? "text-white" : "text-white/55"
                    }`}
                  >
                    {f.label}
                  </p>
                  <p
                    className={`text-[10.5px] leading-tight mt-0.5 ${
                      active ? "text-snappeal-primary-200" : "text-white/45"
                    }`}
                  >
                    {done
                      ? "captured"
                      : active
                        ? lastField && elapsed > TARGET_MS
                          ? "double-checking…"
                          : "reading…"
                        : f.hint}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/**
 * Recommendation panel shown after a free "Review my ticket" scan has
 * resolved. Three explicit next-step buttons so the customer isn't
 * funnelled into either action — they can pay, challenge, or set
 * deadline reminders. Reminders is intentionally a placeholder for now
 * (no scheduling backend yet) — surfaced via a "Coming soon" badge so
 * we don't promise something we haven't built.
 */
function ReviewRecommendation({
  onPay,
  onChallenge,
}: {
  onPay: () => void;
  onChallenge: () => void;
}) {
  const [remindersOpen, setRemindersOpen] = useState(false);
  return (
    <section className="rounded-3xl bg-white border border-snappeal-border p-5 mt-1 flex flex-col gap-3">
      <div>
        <p className="text-sm font-bold text-snappeal-navy">
          Your ticket is ready — what next?
        </p>
        <p className="text-[11.5px] text-snappeal-muted mt-1 leading-snug">
          The scan is free. Pick the path that suits you — you stay in control,
          nothing is charged unless you opt in.
        </p>
      </div>

      <button
        type="button"
        onClick={onChallenge}
        className="relative rounded-2xl bg-snappeal-primary-50/60 border-2 border-snappeal-primary p-4 flex items-center gap-3 text-left transition active:scale-[0.99] shadow-md shadow-snappeal-primary/15"
      >
        <span className="size-11 rounded-xl bg-snappeal-primary text-white flex items-center justify-center shrink-0">
          <Scale className="size-5" strokeWidth={2} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-bold text-snappeal-navy">
            Challenge this ticket
          </p>
          <p className="text-[11.5px] text-snappeal-muted mt-0.5 leading-snug">
            £2.99 · We draft your appeal and help you submit it
          </p>
        </div>
        <ChevronRightIcon />
      </button>

      <button
        type="button"
        onClick={onPay}
        className="rounded-2xl bg-white border border-snappeal-border p-4 flex items-center gap-3 text-left transition active:scale-[0.99] hover:border-snappeal-primary/40"
      >
        <span className="size-11 rounded-xl bg-snappeal-primary-50 text-snappeal-primary flex items-center justify-center shrink-0">
          <CreditCard className="size-5" strokeWidth={2} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-bold text-snappeal-navy">
            Pay this ticket
          </p>
          <p className="text-[11.5px] text-snappeal-muted mt-0.5 leading-snug">
            From £1.99 · We help you pay your PCN securely
          </p>
        </div>
        <ChevronRightIcon />
      </button>

      <button
        type="button"
        onClick={() => setRemindersOpen((v) => !v)}
        aria-expanded={remindersOpen}
        className="rounded-2xl bg-white border border-snappeal-border p-4 flex items-center gap-3 text-left transition active:scale-[0.99] hover:border-snappeal-primary/40"
      >
        <span className="size-11 rounded-xl bg-snappeal-primary-50 text-snappeal-primary flex items-center justify-center shrink-0">
          <Bell className="size-5" strokeWidth={2} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-bold text-snappeal-navy flex items-center gap-1.5">
            Set deadline reminders
            <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5">
              Coming soon
            </span>
          </p>
          <p className="text-[11.5px] text-snappeal-muted mt-0.5 leading-snug">
            We&apos;ll nudge you before the discount window + final deadline.
          </p>
        </div>
        <ChevronRightIcon />
      </button>

      {remindersOpen && (
        <p className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 text-[11px] text-amber-900 leading-snug">
          Reminders aren&apos;t live yet — we&apos;ll email you when this drops.
          For now your ticket is saved to your inbox so you won&apos;t lose
          track of the deadlines.
        </p>
      )}
    </section>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      className="size-4 text-snappeal-muted shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
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
