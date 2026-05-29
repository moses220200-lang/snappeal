"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ArrowRight, Loader2, Mail, Lock, Phone, User } from "lucide-react";
import { getOrCreateSessionId } from "@/lib/client/session";
import { ParkingRabbitMark } from "@/components/Logo";
import { OAuthButtons } from "@/components/OAuthButtons";
import {
  AddressAutocomplete,
  type PostalAddress,
} from "@/components/AddressAutocomplete";

function safeNext(raw: string | null): string {
  if (!raw) return "/app/profile";
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded.startsWith("/") && !decoded.startsWith("//")) return decoded;
  } catch {
    /* fall through */
  }
  return "/app/profile";
}

export default function SignUpPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-sm text-parkingrabbit-muted">
          Loading…
        </div>
      }
    >
      <SignUpInner />
    </Suspense>
  );
}

function SignUpInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params?.get("next") ?? null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState<PostalAddress>({
    line1: "",
    line2: "",
    city: "",
    postcode: "",
  });
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const sessionId = getOrCreateSessionId();
      const res = await fetch("/api/auth/sign-up", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-parkingrabbit-session": sessionId,
        },
        body: JSON.stringify({
          email,
          password,
          displayName: fullName || null,
          phone: phone || null,
          addressLine1: address.line1 || null,
          addressLine2: address.line2 || null,
          addressCity: address.city || null,
          addressPostcode: address.postcode || null,
          sessionId,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error?.message ?? `Sign-up failed (${res.status})`);
      }
      const target = params?.get("next")
        ? next
        : json?.user?.role === "admin"
          ? "/admin"
          : "/app/profile";
      router.replace(target);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-up failed");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-parkingrabbit-bg flex flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <Link href="/app" className="flex items-center gap-2.5 mb-6 justify-center">
          <ParkingRabbitMark size={36} variant="dark" />
          <span className="text-xl font-bold text-parkingrabbit-navy tracking-tight">
            ParkingRabbit
          </span>
        </Link>
        <div className="rounded-3xl bg-white border border-parkingrabbit-border p-6">
          <h1 className="text-2xl font-bold text-parkingrabbit-navy">
            Create your account
          </h1>
          <p className="text-sm text-parkingrabbit-muted mt-1">
            Keep your appeals synced across devices and let the AI fill council
            forms with your registered-keeper details.
          </p>

          {/* OAuth providers — branded buttons up top so users with an Apple
              ID or Google account don't have to fill the whole form. */}
          <div className="mt-5">
            <OAuthButtons next={next} />
          </div>

          <div className="flex items-center gap-3 my-5">
            <span className="flex-1 h-px bg-parkingrabbit-border" />
            <span className="text-[11px] uppercase tracking-wider text-parkingrabbit-muted">
              or with email
            </span>
            <span className="flex-1 h-px bg-parkingrabbit-border" />
          </div>

          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <Field
              icon={User}
              type="text"
              autoComplete="name"
              placeholder="Full name"
              value={fullName}
              onChange={setFullName}
              required
            />
            <Field
              icon={Mail}
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={setEmail}
              required
            />
            <Field
              icon={Phone}
              type="tel"
              autoComplete="tel"
              placeholder="Mobile (+44 7…)"
              value={phone}
              onChange={setPhone}
            />

            <div className="rounded-2xl border border-parkingrabbit-border bg-white p-3.5 flex flex-col gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-parkingrabbit-muted">
                Registered keeper address
              </p>
              <AddressAutocomplete value={address} onChange={setAddress} />
            </div>

            <Field
              icon={Lock}
              type="password"
              autoComplete="new-password"
              placeholder="Password (8+ characters)"
              value={password}
              onChange={setPassword}
              required
            />

            {error && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="rounded-2xl bg-parkingrabbit-action text-white font-semibold py-3.5 flex items-center justify-center gap-2 shadow-lg shadow-parkingrabbit-action/40 hover:bg-parkingrabbit-action-600 transition disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Creating account…
                </>
              ) : (
                <>
                  Create account
                  <ArrowRight className="size-4" />
                </>
              )}
            </button>

            <p className="text-[11px] text-parkingrabbit-muted text-center mt-1">
              By creating an account you agree to our{" "}
              <Link href="/terms" className="underline">
                Terms &amp; Conditions
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="underline">
                Privacy Policy
              </Link>
              .
            </p>

            <p className="text-xs text-parkingrabbit-muted text-center mt-2">
              Already have one?{" "}
              <Link
                href={`/sign-in?next=${encodeURIComponent(next)}`}
                className="font-semibold text-parkingrabbit-primary"
              >
                Sign in
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

function Field({
  icon: Icon,
  type,
  autoComplete,
  placeholder,
  value,
  onChange,
  required,
}: {
  icon: React.ComponentType<{ className?: string }>;
  type: string;
  autoComplete: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 rounded-2xl border border-parkingrabbit-border bg-white px-3 py-2.5 focus-within:border-parkingrabbit-primary transition">
      <Icon className="size-4 text-parkingrabbit-muted" />
      <input
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="flex-1 text-sm outline-none bg-transparent placeholder:text-parkingrabbit-muted"
      />
    </label>
  );
}
