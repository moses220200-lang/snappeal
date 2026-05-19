import Link from "next/link";
import { ChevronLeft, Scan, ShieldCheck } from "lucide-react";
import { CaptureMethods, HeroCameraTrigger } from "@/components/CaptureMethods";

const FIELDS = [
  "Issuer",
  "PCN reference",
  "Vehicle reg",
  "Contravention code",
  "Location",
  "Date & time",
  "Amount",
];

export default function CapturePage() {
  return (
    <div className="flex flex-col gap-5 pt-6 px-5">
      <header className="flex items-center gap-3">
        <Link
          href="/app"
          aria-label="Back"
          className="size-9 rounded-full border border-snappeal-border flex items-center justify-center text-snappeal-muted hover:text-snappeal-navy"
        >
          <ChevronLeft className="size-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-snappeal-navy">
            Add your parking ticket
          </h1>
          <p className="text-xs text-snappeal-muted mt-0.5">
            Step 1 of 4 · Photos
          </p>
        </div>
      </header>

      {/* Viewfinder hero — clicking opens the rear camera via the hidden
       * input mounted by <CaptureMethods /> below. */}
      <div className="relative rounded-3xl overflow-hidden bg-snappeal-navy aspect-[4/3] cursor-pointer active:scale-[0.99]">
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
              Make sure the reference, vehicle reg, code and amount are all in
              shot.
            </p>
          </div>
          <HeroCameraTrigger />
        </div>
      </div>

      {/* 3-up shortcut grid with real native file inputs */}
      <CaptureMethods />

      {/* What we read from the photo */}
      <div className="rounded-2xl bg-white border border-snappeal-border p-4">
        <div className="flex items-start gap-3 mb-3">
          <span className="size-9 rounded-full bg-snappeal-primary-100 text-snappeal-primary flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="size-[1.125rem]" />
          </span>
          <div>
            <p className="text-sm font-semibold text-snappeal-navy">
              What we read from your PCN
            </p>
            <p className="text-xs text-snappeal-muted mt-0.5 leading-relaxed">
              You&apos;ll review everything before we draft your letter — and
              you can edit any field by hand.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FIELDS.map((f) => (
            <span
              key={f}
              className="text-[11px] font-medium rounded-full bg-snappeal-primary-50 text-snappeal-primary-700 px-2.5 py-1"
            >
              {f}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
