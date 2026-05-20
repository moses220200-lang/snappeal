"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Search } from "lucide-react";

/**
 * UK postal-address capture with postcode → city autofill via the free
 * public `api.postcodes.io` endpoint (no API key required).
 *
 * Behaviour:
 *   1. User types a postcode → debounced lookup → city + region auto-fill.
 *   2. User types address lines manually (line1 + optional line2). For
 *      full address-line search we'd add a `getaddress.io` lookup behind
 *      `NEXT_PUBLIC_GETADDRESS_API_KEY`; until that key exists we keep it
 *      to a postcode-driven flow which is enough for the portal-automation
 *      agent's needs.
 *
 * Controlled component — parent owns each field. Triggers `onChange`
 * with the merged address whenever any field changes.
 */

export interface PostalAddress {
  line1: string;
  line2: string;
  city: string;
  postcode: string;
}

interface Props {
  value: PostalAddress;
  onChange: (next: PostalAddress) => void;
  /** When true, marks the address as required (visual hint only). */
  required?: boolean;
}

interface PostcodeResult {
  postcode: string;
  admin_district?: string;
  parish?: string | null;
  admin_ward?: string | null;
  region?: string;
}

const POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i;

export function AddressAutocomplete({ value, onChange, required }: Props) {
  const [lookup, setLookup] = useState<"idle" | "loading" | "ok" | "miss">("idle");
  const [hint, setHint] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setField = <K extends keyof PostalAddress>(key: K, next: PostalAddress[K]) => {
    onChange({ ...value, [key]: next });
  };

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const raw = value.postcode.trim();
    if (!raw) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLookup("idle");
       
      setHint(null);
      return;
    }
    if (!POSTCODE_RE.test(raw.toUpperCase())) {
       
      setLookup("idle");
      return;
    }
     
    setLookup("loading");
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://api.postcodes.io/postcodes/${encodeURIComponent(raw)}`,
          { cache: "force-cache" },
        );
        if (!res.ok) {
          setLookup("miss");
          setHint("We couldn't find that postcode. You can still type the city by hand.");
          return;
        }
        const json = (await res.json()) as { result?: PostcodeResult };
        const r = json.result;
        if (!r) {
          setLookup("miss");
          return;
        }
        // Pre-fill city when the user hasn't already typed one.
        const city = (r.admin_district ?? r.region ?? "").trim();
        if (city && !value.city) {
          onChange({ ...value, postcode: r.postcode, city });
        }
        setLookup("ok");
        setHint(`${r.admin_district ?? ""}${r.region ? ` · ${r.region}` : ""}`.trim());
      } catch {
        setLookup("miss");
        setHint("Postcode lookup unavailable — type the city by hand.");
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // We intentionally exclude `value.city`/`onChange` from deps — we only
    // re-fetch when the postcode changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.postcode]);

  return (
    <div className="flex flex-col gap-3">
      <FieldLabel label="Postcode" required={required}>
        <div className="relative">
          <input
            type="text"
            inputMode="text"
            autoComplete="postal-code"
            value={value.postcode}
            onChange={(e) => setField("postcode", e.target.value.toUpperCase())}
            placeholder="e.g. SW1A 2AA"
            className="w-full rounded-xl border border-snappeal-border bg-white px-3.5 py-2.5 pr-10 text-snappeal-navy placeholder:text-snappeal-muted focus:outline-none focus:ring-2 focus:ring-snappeal-primary/40"
            required={required}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-snappeal-muted">
            {lookup === "loading" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Search className="size-4" />
            )}
          </span>
        </div>
        {hint && lookup === "ok" && (
          <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-snappeal-success">
            <MapPin className="size-3" />
            {hint}
          </p>
        )}
        {lookup === "miss" && hint && (
          <p className="mt-1 text-[11px] text-snappeal-muted">{hint}</p>
        )}
      </FieldLabel>

      <FieldLabel label="Address line 1" required={required}>
        <input
          type="text"
          autoComplete="address-line1"
          value={value.line1}
          onChange={(e) => setField("line1", e.target.value)}
          placeholder="House number + street"
          className="w-full rounded-xl border border-snappeal-border bg-white px-3.5 py-2.5 text-snappeal-navy placeholder:text-snappeal-muted focus:outline-none focus:ring-2 focus:ring-snappeal-primary/40"
          required={required}
        />
      </FieldLabel>

      <FieldLabel label="Address line 2 (optional)">
        <input
          type="text"
          autoComplete="address-line2"
          value={value.line2}
          onChange={(e) => setField("line2", e.target.value)}
          placeholder="Flat, building, etc."
          className="w-full rounded-xl border border-snappeal-border bg-white px-3.5 py-2.5 text-snappeal-navy placeholder:text-snappeal-muted focus:outline-none focus:ring-2 focus:ring-snappeal-primary/40"
        />
      </FieldLabel>

      <FieldLabel label="City" required={required}>
        <input
          type="text"
          autoComplete="address-level2"
          value={value.city}
          onChange={(e) => setField("city", e.target.value)}
          placeholder="London"
          className="w-full rounded-xl border border-snappeal-border bg-white px-3.5 py-2.5 text-snappeal-navy placeholder:text-snappeal-muted focus:outline-none focus:ring-2 focus:ring-snappeal-primary/40"
          required={required}
        />
      </FieldLabel>
    </div>
  );
}

function FieldLabel({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-[12px] font-semibold text-snappeal-navy">
      <span>
        {label}
        {required && <span className="text-snappeal-action ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}
