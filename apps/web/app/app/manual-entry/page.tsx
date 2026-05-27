"use client";

/**
 * /app/manual-entry — single-page manual PCN entry.
 *
 * Reached from:
 *   1. /app/scan tile ("Input manually") — fresh appeal, no prefill.
 *   2. The failure card's "Enter details manually" button — passes
 *      `?appealId=<id>` and the page pre-fills any fields OCR DID
 *      manage to read (issuer, partial pcnRef, vehicleReg, amount,
 *      date). The customer only fills the gaps.
 *
 * v0.3.10 — collapsed from the old 4-step wizard (council → pcn →
 * vehicle → review) into one form on one page. Reduces taps, makes
 * the prefill obvious, and keeps the customer's mental model intact:
 * they pasted a PCN once; the form looks like a PCN. Required fields
 * are PCN ref + vehicle reg + council; amount + issue date are
 * optional but encouraged.
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Building2,
  Calendar,
  Car,
  CheckCircle2,
  Hash,
  Loader2,
  PoundSterling,
  Search,
  Sparkles,
} from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { CouncilBadge } from "@/components/CouncilBadge";
import {
  ConfirmedTicket,
  getOrCreateSessionId,
} from "@/lib/client/session";
import { patchCurrentAppeal } from "@/lib/client/draft";
import { haptic } from "@/lib/client/haptics";
import type { AppealRecord } from "@/lib/server/appeals";

interface CouncilOption {
  slug: string;
  name: string;
  type: string;
  automationStatus: string;
  logoUrl: string | null;
  logoBg: string | null;
}

interface PrefillFields {
  council: CouncilOption | null;
  pcnRef: string;
  vehicleReg: string;
  issuedAt: string; // yyyy-mm-dd (or "")
  amount: string; // pounds string ("160" / "160.50" / "")
}

const EMPTY_PREFILL: PrefillFields = {
  council: null,
  pcnRef: "",
  vehicleReg: "",
  issuedAt: "",
  amount: "",
};

/** Outer wrapper — `useSearchParams` requires a Suspense boundary on
 *  the page that consumes it under the static-rendering rules of the
 *  app router. The actual form lives in the inner component. */
export default function ManualEntryPage() {
  return (
    <Suspense fallback={<ManualEntryFallback />}>
      <ManualEntryForm />
    </Suspense>
  );
}

function ManualEntryFallback() {
  return (
    <>
      <BackHeader title="Enter PCN manually" back="/app/scan" />
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-5 animate-spin text-parkingrabbit-muted" strokeWidth={2.25} />
      </div>
    </>
  );
}

function ManualEntryForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const appealIdParam = searchParams.get("appealId");

  const [councils, setCouncils] = useState<CouncilOption[] | null>(null);
  const [pastVehicles, setPastVehicles] = useState<string[]>([]);
  const [prefillReady, setPrefillReady] = useState(false);

  // The fields the customer is editing. Pre-populated from the appeal
  // row when `appealId` is supplied (partial OCR data); empty
  // otherwise. The customer can edit anything we pre-filled.
  const [council, setCouncil] = useState<CouncilOption | null>(null);
  const [pcnRef, setPcnRef] = useState("");
  const [vehicleReg, setVehicleReg] = useState("");
  const [issuedAt, setIssuedAt] = useState("");
  const [amount, setAmount] = useState("");

  const [councilSearchOpen, setCouncilSearchOpen] = useState(false);
  const [councilSearch, setCouncilSearch] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch the council list, the user's past vehicle regs, and (when
  // appealId is in the URL) the appeal row to prefill from.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [c, a] = await Promise.all([
        fetch("/api/councils", { cache: "no-store" }),
        fetch(
          `/api/appeals?sessionId=${encodeURIComponent(getOrCreateSessionId())}`,
          { cache: "no-store" },
        ),
      ]);
      if (!alive) return;

      let councilList: CouncilOption[] = [];
      if (c.ok) {
        const j = (await c.json()) as { councils: CouncilOption[] };
        councilList = j.councils;
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

        // Prefill from the named appeal's partial OCR, if any.
        const target = appealIdParam
          ? j.appeals.find((ap) => ap.id === appealIdParam)
          : null;
        if (target) {
          const t = target.ticket ?? null;
          const slug = target.councilSlug ?? t?.councilSlug ?? null;
          const matchedCouncil = slug
            ? (councilList.find((c) => c.slug === slug) ?? null)
            : null;
          if (matchedCouncil) setCouncil(matchedCouncil);
          if (t?.pcnRef) setPcnRef(t.pcnRef);
          if (t?.vehicleReg) setVehicleReg(t.vehicleReg);
          if (t?.issuedAt) setIssuedAt(t.issuedAt.slice(0, 10));
          if (t?.amountPence && t.amountPence > 0) {
            setAmount(String(t.amountPence / 100));
          }
        }
      }
      setPrefillReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [appealIdParam]);

  const filteredCouncils = useMemo(() => {
    if (!councils) return [];
    const q = councilSearch.trim().toLowerCase();
    if (!q) return councils;
    return councils.filter(
      (c) => c.name.toLowerCase().includes(q) || c.slug.includes(q),
    );
  }, [councils, councilSearch]);

  // A field is "prefilled" when it landed via OCR and the customer
  // hasn't touched it — used to render a green chip so the customer
  // knows what came from the photo.
  const [touched, setTouched] = useState({
    council: false,
    pcnRef: false,
    vehicleReg: false,
    issuedAt: false,
    amount: false,
  });
  const wasPrefilled = (field: keyof PrefillFields) =>
    prefillReady && !touched[field as keyof typeof touched] && (
      (field === "council" && !!council) ||
      (field === "pcnRef" && !!pcnRef) ||
      (field === "vehicleReg" && !!vehicleReg) ||
      (field === "issuedAt" && !!issuedAt) ||
      (field === "amount" && !!amount)
    );

  const canSubmit =
    !!council &&
    pcnRef.trim().length > 0 &&
    vehicleReg.trim().length > 0 &&
    !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const amountNumber = Number(amount);
      const amountPence =
        Number.isFinite(amountNumber) && amountNumber > 0
          ? Math.round(amountNumber * 100)
          : 0;
      const issuedAtIso = issuedAt
        ? new Date(`${issuedAt}T00:00:00`).toISOString()
        : "";
      const ticket: ConfirmedTicket = {
        issuer: council?.name ?? "",
        councilSlug: council?.slug ?? "",
        pcnRef: pcnRef.trim().toUpperCase(),
        vehicleReg: vehicleReg.trim().toUpperCase(),
        contraventionCode: "",
        contraventionDescription: "",
        issuedAt: issuedAtIso,
        location: "",
        amountPence,
      };
      await patchCurrentAppeal({ ticket, notes: "" });
      haptic("success");
      // Route into the unified capture page so the customer can add
      // evidence photos and confirm/edit the typed fields. The
      // "from=manual" query tells capture to skip the no-photo error
      // state and show the manual-entry banner.
      router.push("/app/capture?from=manual");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save");
      haptic("error");
    } finally {
      setSubmitting(false);
    }
  };

  const prefillBanner =
    appealIdParam && prefillReady &&
    (council || pcnRef || vehicleReg || issuedAt || amount) ? (
      <div className="rounded-2xl bg-parkingrabbit-primary-50 border border-parkingrabbit-primary/20 px-4 py-3 flex items-start gap-2.5">
        <Sparkles
          className="size-4 text-parkingrabbit-primary mt-0.5 shrink-0"
          strokeWidth={2.25}
        />
        <div className="flex-1 min-w-0">
          <p className="text-[12.5px] font-bold text-parkingrabbit-primary leading-tight">
            We prefilled what Rabbit could read
          </p>
          <p className="text-[11.5px] text-parkingrabbit-primary/80 mt-0.5 leading-snug">
            Fill the missing fields and double-check the rest. The PCN ref
            and registration must match the council's record exactly.
          </p>
        </div>
      </div>
    ) : null;

  return (
    <>
      <BackHeader title="Enter PCN manually" back="/app/scan" />
      <div className="flex flex-col gap-4 px-5 pt-4 pb-32 parkingrabbit-content-top">
        {prefillBanner}

        {/* Council picker — collapsed by default; expands to a search
         *  + list. Shows the selected council inline once picked. */}
        <FieldShell
          label="Issuing council"
          required
          prefilled={wasPrefilled("council")}
          icon={Building2}
        >
          {councilSearchOpen ? (
            <CouncilPickerInline
              councils={filteredCouncils}
              loading={councils === null}
              search={councilSearch}
              onSearch={setCouncilSearch}
              picked={council}
              onPick={(c) => {
                haptic("select");
                setCouncil(c);
                setTouched((t) => ({ ...t, council: true }));
                setCouncilSearchOpen(false);
                setCouncilSearch("");
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setCouncilSearchOpen(true)}
              className="w-full flex items-center justify-between gap-2 text-left"
            >
              {council ? (
                <>
                  <CouncilBadge
                    slug={council.slug}
                    name={council.name}
                    logoUrl={council.logoUrl}
                    logoBg={council.logoBg}
                    size="sm"
                  />
                  <span className="text-[12px] text-parkingrabbit-primary font-semibold">
                    Change
                  </span>
                </>
              ) : (
                <span className="text-[14px] text-parkingrabbit-muted">
                  Pick the council that issued the PCN
                </span>
              )}
            </button>
          )}
        </FieldShell>

        {/* PCN reference */}
        <FieldShell
          label="PCN reference"
          required
          prefilled={wasPrefilled("pcnRef")}
          icon={Hash}
        >
          <input
            value={pcnRef}
            onChange={(e) => {
              setPcnRef(e.target.value.toUpperCase());
              setTouched((t) => ({ ...t, pcnRef: true }));
            }}
            placeholder="WC12345678"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="w-full bg-transparent outline-none text-[16px] font-semibold text-parkingrabbit-navy placeholder:text-parkingrabbit-muted/60 placeholder:font-normal"
          />
        </FieldShell>

        {/* Vehicle registration */}
        <FieldShell
          label="Vehicle registration"
          required
          prefilled={wasPrefilled("vehicleReg")}
          icon={Car}
        >
          <input
            value={vehicleReg}
            onChange={(e) => {
              setVehicleReg(e.target.value.toUpperCase());
              setTouched((t) => ({ ...t, vehicleReg: true }));
            }}
            placeholder="AB12 CDE"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="w-full bg-transparent outline-none text-[16px] font-semibold text-parkingrabbit-navy placeholder:text-parkingrabbit-muted/60 placeholder:font-normal"
          />
          {pastVehicles.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {pastVehicles.map((reg) => (
                <button
                  key={reg}
                  type="button"
                  onClick={() => {
                    setVehicleReg(reg);
                    setTouched((t) => ({ ...t, vehicleReg: true }));
                    haptic("select");
                  }}
                  className="text-[11px] font-semibold bg-parkingrabbit-bg border border-parkingrabbit-border text-parkingrabbit-navy rounded-full px-2.5 py-1 hover:border-parkingrabbit-primary/60 transition"
                >
                  {reg}
                </button>
              ))}
            </div>
          )}
        </FieldShell>

        {/* Issue date (optional) */}
        <FieldShell
          label="Issue date"
          optional
          prefilled={wasPrefilled("issuedAt")}
          icon={Calendar}
        >
          <input
            type="date"
            value={issuedAt}
            onChange={(e) => {
              setIssuedAt(e.target.value);
              setTouched((t) => ({ ...t, issuedAt: true }));
            }}
            className="w-full bg-transparent outline-none text-[16px] font-semibold text-parkingrabbit-navy"
          />
        </FieldShell>

        {/* Amount (optional) */}
        <FieldShell
          label="Amount (full charge, £)"
          optional
          prefilled={wasPrefilled("amount")}
          icon={PoundSterling}
        >
          <div className="flex items-center gap-1.5">
            <span className="text-[16px] font-semibold text-parkingrabbit-muted">£</span>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => {
                const cleaned = e.target.value.replace(/[^\d.]/g, "");
                setAmount(cleaned);
                setTouched((t) => ({ ...t, amount: true }));
              }}
              placeholder="160"
              className="w-full bg-transparent outline-none text-[16px] font-semibold text-parkingrabbit-navy placeholder:text-parkingrabbit-muted/60 placeholder:font-normal"
            />
          </div>
        </FieldShell>

        {error && (
          <p className="text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="button"
          disabled={!canSubmit}
          onClick={submit}
          className={`mt-2 inline-flex items-center justify-center gap-2 rounded-2xl font-semibold text-[14px] px-5 py-4 transition active:scale-[0.99] ${
            canSubmit
              ? "bg-parkingrabbit-primary text-white hover:bg-parkingrabbit-primary-600 shadow-lg shadow-parkingrabbit-primary/30"
              : "bg-parkingrabbit-bg text-parkingrabbit-muted/70 cursor-not-allowed"
          }`}
        >
          {submitting ? (
            <Loader2 className="size-4 animate-spin" strokeWidth={2.25} />
          ) : (
            <CheckCircle2 className="size-4" strokeWidth={2.25} />
          )}
          Continue
        </button>
      </div>
    </>
  );
}

/* ─────────────────────── field shell ─────────────────────── */

/**
 * Card-style field row. Renders the label, an optional/required
 * marker, a "Prefilled" green chip when OCR provided the value, and
 * the icon + child input.
 */
function FieldShell({
  label,
  icon: Icon,
  required,
  optional,
  prefilled,
  children,
}: {
  label: string;
  icon: typeof Building2;
  required?: boolean;
  optional?: boolean;
  prefilled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block rounded-2xl bg-white border border-parkingrabbit-border px-4 py-3 focus-within:border-parkingrabbit-primary/60 focus-within:shadow-sm transition">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-bold uppercase tracking-wide text-parkingrabbit-muted flex items-center gap-1.5">
          <Icon className="size-3.5 text-parkingrabbit-muted" strokeWidth={2} />
          {label}
          {required && (
            <span className="text-parkingrabbit-action font-bold">*</span>
          )}
          {optional && (
            <span className="text-parkingrabbit-muted/70 font-normal normal-case tracking-normal">
              optional
            </span>
          )}
        </span>
        {prefilled && (
          <span className="text-[10px] font-bold rounded-full bg-parkingrabbit-success/15 text-parkingrabbit-success px-2 py-0.5 flex items-center gap-1">
            <Sparkles className="size-3" strokeWidth={2.5} />
            Prefilled
          </span>
        )}
      </div>
      {children}
    </label>
  );
}

/* ─────────────────────── council picker (inline) ─────────────────────── */

function CouncilPickerInline({
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
    <div className="flex flex-col gap-2">
      <div className="rounded-xl bg-parkingrabbit-bg/60 border border-parkingrabbit-border px-3 py-2 flex items-center gap-2">
        <Search className="size-4 text-parkingrabbit-muted" />
        <input
          autoFocus
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search councils…"
          className="flex-1 bg-transparent outline-none text-[14px]"
        />
      </div>
      <div className="max-h-64 overflow-y-auto rounded-xl border border-parkingrabbit-border">
        {loading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="size-4 animate-spin text-parkingrabbit-muted" strokeWidth={2.25} />
          </div>
        )}
        {!loading && councils.length === 0 && (
          <p className="text-[12px] text-parkingrabbit-muted py-6 text-center">
            No councils match — try a different search.
          </p>
        )}
        {!loading &&
          councils.map((c) => (
            <button
              key={c.slug}
              type="button"
              onClick={() => onPick(c)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition hover:bg-parkingrabbit-primary-50 ${
                picked?.slug === c.slug
                  ? "bg-parkingrabbit-primary-50"
                  : ""
              }`}
            >
              <CouncilBadge
                slug={c.slug}
                name={c.name}
                logoUrl={c.logoUrl}
                logoBg={c.logoBg}
                size="sm"
              />
              {picked?.slug === c.slug && (
                <CheckCircle2 className="size-4 text-parkingrabbit-primary ml-auto" strokeWidth={2.25} />
              )}
            </button>
          ))}
      </div>
    </div>
  );
}
