"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Car,
  CheckCircle2,
  ChevronRight,
  Hash,
  Loader2,
  Search,
  Sparkles,
} from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import {
  ConfirmedTicket,
  getOrCreateSessionId,
  setConfirmedTicket,
  setNotes as setSessionNotes,
} from "@/lib/client/session";
import { haptic } from "@/lib/client/haptics";
import type { AppealRecord } from "@/lib/server/appeals";

interface CouncilOption {
  slug: string;
  name: string;
  type: string;
  automationStatus: string;
}

type Step = "council" | "pcn" | "vehicle" | "review";

/**
 * Manual-entry wizard for users who don't have (or can't get) a photo of
 * their PCN. Three steps mirror the auto-extract output:
 *
 *   1. Pick the issuing authority (the 7 v0.1 councils, with "Other" link
 *      that drops the user to the camera path).
 *   2. Enter the PCN reference.
 *   3. Enter the vehicle registration — or pick a previously-used one if
 *      the user has appealed before from this device/account.
 *
 * On submit, the typed fields are persisted to sessionStorage as the
 * confirmedTicket payload and the user is routed into the normal /app/notes
 * → /app/paywall → /app/letter flow.
 */
export default function ManualEntryPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("council");
  const [councils, setCouncils] = useState<CouncilOption[] | null>(null);
  const [search, setSearch] = useState("");
  const [pickedCouncil, setPickedCouncil] = useState<CouncilOption | null>(null);
  const [pcnRef, setPcnRef] = useState("");
  const [vehicleReg, setVehicleReg] = useState("");
  const [pastVehicles, setPastVehicles] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [c, a] = await Promise.all([
        fetch("/api/councils", { cache: "no-store" }),
        fetch(`/api/appeals?sessionId=${encodeURIComponent(getOrCreateSessionId())}`, {
          cache: "no-store",
        }),
      ]);
      if (!alive) return;
      if (c.ok) {
        const j = (await c.json()) as { councils: CouncilOption[] };
         
        setCouncils(j.councils);
      }
      if (a.ok) {
        const j = (await a.json()) as { appeals: AppealRecord[] };
        const regs = new Set<string>();
        for (const ap of j.appeals) {
          const r = ap.ticket?.vehicleReg?.trim().toUpperCase();
          if (r) regs.add(r);
        }
         
        setPastVehicles(Array.from(regs));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const filteredCouncils = useMemo(() => {
    if (!councils) return [];
    const q = search.trim().toLowerCase();
    if (!q) return councils;
    return councils.filter(
      (c) => c.name.toLowerCase().includes(q) || c.slug.includes(q),
    );
  }, [councils, search]);

  const proceedToNotes = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const ticket: ConfirmedTicket = {
        issuer: pickedCouncil?.name ?? "",
        councilSlug: pickedCouncil?.slug ?? "",
        pcnRef: pcnRef.trim().toUpperCase(),
        vehicleReg: vehicleReg.trim().toUpperCase(),
        contraventionCode: "",
        contraventionDescription: "",
        issuedAt: "",
        location: "",
        amountPence: 0,
      };
      setConfirmedTicket(ticket);
      setSessionNotes("");
      haptic("success");
      // Route into the unified step-1 capture page so the customer can add
      // evidence photos and confirm/edit the typed fields before moving on
      // to step 2 (notes). The "from=manual" query tells capture to skip
      // the no-photo error state and show the manual-entry banner.
      router.push("/app/capture?from=manual");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save");
      haptic("error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <BackHeader
        title="Enter PCN manually"
        subtitle={`Step ${["council", "pcn", "vehicle", "review"].indexOf(step) + 1} of 4 · ${
          step === "council" ? "Authority" : step === "pcn" ? "PCN ref" : step === "vehicle" ? "Vehicle" : "Review"
        }`}
        back="/app/capture"
      />

      <div className="flex flex-col gap-5 px-5 pt-4 pb-6 snappeal-content-top">
        <StepDots step={step} />

        {step === "council" && (
          <CouncilStep
            councils={filteredCouncils}
            loading={councils === null}
            search={search}
            onSearch={setSearch}
            picked={pickedCouncil}
            onPick={(c) => {
              haptic("select");
              setPickedCouncil(c);
              setStep("pcn");
            }}
          />
        )}

        {step === "pcn" && (
          <PcnStep
            council={pickedCouncil}
            value={pcnRef}
            onChange={setPcnRef}
            onBack={() => setStep("council")}
            onNext={() => {
              haptic("tap");
              setStep("vehicle");
            }}
          />
        )}

        {step === "vehicle" && (
          <VehicleStep
            value={vehicleReg}
            onChange={setVehicleReg}
            past={pastVehicles}
            onBack={() => setStep("pcn")}
            onNext={() => {
              haptic("tap");
              setStep("review");
            }}
          />
        )}

        {step === "review" && pickedCouncil && (
          <ReviewStep
            council={pickedCouncil}
            pcnRef={pcnRef}
            vehicleReg={vehicleReg}
            submitting={submitting}
            error={error}
            onEditCouncil={() => setStep("council")}
            onEditPcn={() => setStep("pcn")}
            onEditVehicle={() => setStep("vehicle")}
            onConfirm={proceedToNotes}
          />
        )}
      </div>
    </>
  );
}

function StepDots({ step }: { step: Step }) {
  const steps: Step[] = ["council", "pcn", "vehicle", "review"];
  return (
    <div className="flex items-center gap-1.5">
      {steps.map((s, i) => {
        const passed = steps.indexOf(step) > i;
        const active = step === s;
        return (
          <span
            key={s}
            className={`h-1.5 rounded-full transition-all ${
              passed
                ? "w-6 bg-snappeal-success"
                : active
                  ? "w-6 bg-snappeal-action"
                  : "w-1.5 bg-snappeal-border"
            }`}
          />
        );
      })}
    </div>
  );
}

function CouncilStep({
  councils,
  loading,
  search,
  onSearch,
  picked,
  onPick,
}: {
  councils: CouncilOption[];
  loading: boolean;
  search: string;
  onSearch: (s: string) => void;
  picked: CouncilOption | null;
  onPick: (c: CouncilOption) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-2xl font-bold text-snappeal-navy">Which authority?</h2>
        <p className="text-sm text-snappeal-muted mt-1">
          Pick the council or transport authority that issued your PCN. It&apos;s usually printed on the top of the ticket.
        </p>
      </div>

      <div className="rounded-2xl bg-white border border-snappeal-border px-3 py-2.5 flex items-center gap-2">
        <Search className="size-4 text-snappeal-muted flex-shrink-0" />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search councils…"
          className="flex-1 text-sm outline-none bg-transparent placeholder:text-snappeal-muted"
        />
      </div>

      {loading && (
        <div className="rounded-2xl bg-white border border-snappeal-border p-6 flex items-center justify-center gap-2 text-sm text-snappeal-muted">
          <Loader2 className="size-4 animate-spin" /> Loading councils…
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {councils.map((c) => (
          <li key={c.slug}>
            <button
              type="button"
              onClick={() => onPick(c)}
              className={`w-full text-left rounded-2xl border p-4 flex items-center gap-3 transition active:scale-[0.99] ${
                picked?.slug === c.slug
                  ? "bg-snappeal-primary-50 border-snappeal-primary"
                  : "bg-white border-snappeal-border hover:border-snappeal-primary"
              }`}
            >
              <span className="size-10 rounded-xl bg-snappeal-primary-100 text-snappeal-primary flex items-center justify-center flex-shrink-0">
                <Building2 className="size-5" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-snappeal-navy">{c.name}</p>
                <p className="text-[11px] text-snappeal-muted capitalize mt-0.5">
                  {c.type.replace("_", " ")}
                  {c.automationStatus !== "manual" && (
                    <span className="ml-2 inline-flex items-center gap-1 text-snappeal-success font-semibold">
                      <Sparkles className="size-3" /> auto-submit ready
                    </span>
                  )}
                </p>
              </div>
              <ChevronRight className="size-4 text-snappeal-muted" />
            </button>
          </li>
        ))}
      </ul>

      <Link
        href="/app/capture"
        className="text-xs text-snappeal-muted text-center hover:text-snappeal-navy mt-2"
      >
        Can&apos;t find your authority? Try snapping the PCN instead →
      </Link>
    </div>
  );
}

function PcnStep({
  council,
  value,
  onChange,
  onBack,
  onNext,
}: {
  council: CouncilOption | null;
  value: string;
  onChange: (v: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const ok = value.trim().length >= 4;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-2xl font-bold text-snappeal-navy">PCN reference</h2>
        <p className="text-sm text-snappeal-muted mt-1">
          The alphanumeric reference printed near the top of {council?.name ?? "your PCN"}. Usually 8–12 characters.
        </p>
      </div>

      <label className="flex items-center gap-2 rounded-2xl border border-snappeal-border bg-white px-4 py-3 focus-within:border-snappeal-primary transition">
        <Hash className="size-4 text-snappeal-muted" />
        <input
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          placeholder="e.g. WC12345678"
          className="flex-1 text-base font-mono tracking-wide text-snappeal-navy outline-none bg-transparent placeholder:text-snappeal-muted"
        />
      </label>

      <div className="flex flex-col gap-2 mt-2">
        <button
          type="button"
          onClick={onNext}
          disabled={!ok}
          className="rounded-2xl bg-snappeal-action text-white font-semibold py-4 shadow-lg shadow-snappeal-action/40 hover:bg-snappeal-action-600 transition disabled:opacity-40 disabled:shadow-none"
        >
          Continue
        </button>
        <button type="button" onClick={onBack} className="text-xs text-snappeal-muted hover:text-snappeal-navy py-2">
          Back
        </button>
      </div>
    </div>
  );
}

function VehicleStep({
  value,
  onChange,
  past,
  onBack,
  onNext,
}: {
  value: string;
  onChange: (v: string) => void;
  past: string[];
  onBack: () => void;
  onNext: () => void;
}) {
  const ok = value.trim().length >= 3;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-2xl font-bold text-snappeal-navy">Vehicle registration</h2>
        <p className="text-sm text-snappeal-muted mt-1">
          The reg plate of the vehicle that got the PCN.
        </p>
      </div>

      {past.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-snappeal-muted mb-2">
            Previously appealed
          </p>
          <div className="flex flex-wrap gap-2">
            {past.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onChange(r)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-mono font-bold tracking-wide transition ${
                  value.toUpperCase() === r
                    ? "bg-snappeal-primary-50 border-snappeal-primary text-snappeal-navy"
                    : "bg-white border-snappeal-border text-snappeal-navy hover:border-snappeal-primary"
                }`}
              >
                <Car className="size-3.5 text-snappeal-primary" />
                {r}
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="flex items-center gap-2 rounded-2xl border border-snappeal-border bg-white px-4 py-3 focus-within:border-snappeal-primary transition">
        <Car className="size-4 text-snappeal-muted" />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          placeholder="e.g. AB12 CDE"
          className="flex-1 text-base font-mono tracking-wider text-snappeal-navy outline-none bg-transparent placeholder:text-snappeal-muted"
        />
      </label>

      <div className="flex flex-col gap-2 mt-2">
        <button
          type="button"
          onClick={onNext}
          disabled={!ok}
          className="rounded-2xl bg-snappeal-action text-white font-semibold py-4 shadow-lg shadow-snappeal-action/40 hover:bg-snappeal-action-600 transition disabled:opacity-40 disabled:shadow-none"
        >
          Continue
        </button>
        <button type="button" onClick={onBack} className="text-xs text-snappeal-muted hover:text-snappeal-navy py-2">
          Back
        </button>
      </div>
    </div>
  );
}

function ReviewStep({
  council,
  pcnRef,
  vehicleReg,
  submitting,
  error,
  onEditCouncil,
  onEditPcn,
  onEditVehicle,
  onConfirm,
}: {
  council: CouncilOption;
  pcnRef: string;
  vehicleReg: string;
  submitting: boolean;
  error: string | null;
  onEditCouncil: () => void;
  onEditPcn: () => void;
  onEditVehicle: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-2xl font-bold text-snappeal-navy">Look right?</h2>
        <p className="text-sm text-snappeal-muted mt-1">
          We&apos;ll use these details to draft the appeal. Tap any row to edit.
        </p>
      </div>

      <ul className="rounded-2xl bg-white border border-snappeal-border overflow-hidden divide-y divide-snappeal-border">
        <ReviewRow icon={Building2} label="Authority" value={council.name} onEdit={onEditCouncil} />
        <ReviewRow icon={Hash} label="PCN reference" value={pcnRef} mono onEdit={onEditPcn} />
        <ReviewRow icon={Car} label="Vehicle reg" value={vehicleReg} mono onEdit={onEditVehicle} />
      </ul>

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>
      )}

      <button
        type="button"
        onClick={onConfirm}
        disabled={submitting}
        className="rounded-2xl bg-snappeal-action text-white font-semibold py-4 flex items-center justify-center gap-2 shadow-lg shadow-snappeal-action/40 hover:bg-snappeal-action-600 transition disabled:opacity-60"
      >
        {submitting ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Saving…
          </>
        ) : (
          <>
            <CheckCircle2 className="size-5" />
            Looks good — continue
          </>
        )}
      </button>
    </div>
  );
}

function ReviewRow({
  icon: Icon,
  label,
  value,
  mono,
  onEdit,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  mono?: boolean;
  onEdit: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onEdit}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-snappeal-bg/40 transition"
      >
        <span className="size-9 rounded-xl bg-snappeal-primary-100 text-snappeal-primary flex items-center justify-center flex-shrink-0">
          <Icon className="size-[1.125rem]" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-snappeal-muted">{label}</p>
          <p className={`text-sm font-semibold text-snappeal-navy mt-0.5 ${mono ? "font-mono tracking-wider" : ""}`}>
            {value}
          </p>
        </div>
        <span className="text-xs font-semibold text-snappeal-primary">Edit</span>
      </button>
    </li>
  );
}
