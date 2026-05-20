"use client";

import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { ProfileSubPage } from "@/components/ProfileSubPage";
import {
  AddressAutocomplete,
  type PostalAddress,
} from "@/components/AddressAutocomplete";

interface Me {
  id: string;
  email: string;
  displayName: string | null;
  role: "user" | "admin";
}

interface Profile {
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  addressCity: string | null;
  addressPostcode: string | null;
}

const EMPTY_ADDRESS: PostalAddress = { line1: "", line2: "", city: "", postcode: "" };

export default function PersonalDetailsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState<PostalAddress>(EMPTY_ADDRESS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (!alive) return;
      if (res.ok) {
        const json = (await res.json()) as { user: Me | null; profile: Profile | null };
        setMe(json.user);
        setDisplayName(json.user?.displayName ?? "");
        if (json.profile) {
          setPhone(json.profile.phone ?? "");
          setAddress({
            line1: json.profile.addressLine1 ?? "",
            line2: json.profile.addressLine2 ?? "",
            city: json.profile.addressCity ?? "",
            postcode: json.profile.addressPostcode ?? "",
          });
        }
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!me) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: displayName || null,
          phone: phone || null,
          addressLine1: address.line1 || null,
          addressLine2: address.line2 || null,
          addressCity: address.city || null,
          addressPostcode: address.postcode || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `Failed (${res.status})`);
      }
      const json = (await res.json()) as { user: Me; profile: Profile | null };
      setMe(json.user);
      if (json.profile) {
        setPhone(json.profile.phone ?? "");
        setAddress({
          line1: json.profile.addressLine1 ?? "",
          line2: json.profile.addressLine2 ?? "",
          city: json.profile.addressCity ?? "",
          postcode: json.profile.addressPostcode ?? "",
        });
      }
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <ProfileSubPage title="Personal details">
        <div className="flex items-center gap-2 text-sm text-snappeal-muted">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </div>
      </ProfileSubPage>
    );
  }

  if (!me) {
    return (
      <ProfileSubPage title="Personal details" subtitle="Sign in to manage your details.">
        <p className="text-sm text-snappeal-muted">
          You&apos;re using Snappeal as a guest right now. Create an account or sign in to add a display name and lock your appeals to your email.
        </p>
      </ProfileSubPage>
    );
  }

  return (
    <ProfileSubPage
      title="Personal details"
      subtitle="The AI uses these to fill council forms on your behalf."
    >
      <form onSubmit={save} className="flex flex-col gap-5">
        <Field label="Display name" hint="The name we show on Profile and use in letter signatures.">
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            autoComplete="name"
            className="w-full bg-white border border-snappeal-border focus:border-snappeal-primary rounded-xl px-3 py-2.5 text-sm outline-none"
          />
        </Field>

        <Field label="Email address" hint="Used for sign-in and council reply notifications.">
          <input
            value={me.email}
            disabled
            className="w-full bg-snappeal-bg/60 border border-snappeal-border rounded-xl px-3 py-2.5 text-sm text-snappeal-muted cursor-not-allowed"
          />
        </Field>

        <Field
          label="Phone"
          hint="Some council portals require a phone number on the appeal form."
        >
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+44 7…"
            autoComplete="tel"
            inputMode="tel"
            type="tel"
            className="w-full bg-white border border-snappeal-border focus:border-snappeal-primary rounded-xl px-3 py-2.5 text-sm outline-none"
          />
        </Field>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-snappeal-muted">
            Registered keeper address
          </span>
          <div className="rounded-2xl border border-snappeal-border bg-white p-3.5">
            <AddressAutocomplete value={address} onChange={setAddress} />
          </div>
          <span className="text-[11px] text-snappeal-muted">
            Loaded into the portal-automation agent when a council form requires
            it. Postcode lookup uses the free <code className="font-mono text-[10px]">postcodes.io</code>{" "}
            API.
          </span>
        </div>

        <div className="flex items-center gap-2 rounded-xl bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-800">
          <ShieldCheck className="size-4 text-green-700" />
          Signed in · role {me.role}
        </div>

        {error && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="rounded-2xl bg-snappeal-action text-white font-semibold py-3.5 flex items-center justify-center gap-2 shadow-lg shadow-snappeal-action/40 hover:bg-snappeal-action-600 transition disabled:opacity-60"
        >
          {saving ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Saving…
            </>
          ) : savedAt ? (
            "Saved ✓"
          ) : (
            "Save changes"
          )}
        </button>
      </form>
    </ProfileSubPage>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-snappeal-muted">
        {label}
      </span>
      {children}
      {hint && <span className="text-[11px] text-snappeal-muted">{hint}</span>}
    </label>
  );
}
