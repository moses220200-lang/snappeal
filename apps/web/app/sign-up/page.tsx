"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

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
import { ArrowRight, Loader2, Mail, Lock, User } from "lucide-react";
import { getOrCreateSessionId } from "@/lib/client/session";

export default function SignUpPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-snappeal-muted">Loading…</div>}>
      <SignUpInner />
    </Suspense>
  );
}

function SignUpInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params?.get("next") ?? null);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/sign-up", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          displayName: displayName || null,
          sessionId: getOrCreateSessionId(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? `Sign-up failed (${res.status})`);
      const target =
        params?.get("next")
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
    <div className="min-h-screen bg-snappeal-bg flex flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <Link href="/app" className="flex items-center gap-2.5 mb-6 justify-center">
          <ShieldGlyph />
          <span className="text-xl font-bold text-snappeal-navy tracking-tight">Snappeal</span>
        </Link>
        <div className="rounded-3xl bg-white border border-snappeal-border p-6">
          <h1 className="text-2xl font-bold text-snappeal-navy">Create your account</h1>
          <p className="text-sm text-snappeal-muted mt-1">
            Keep your appeals synced across devices and get inbox alerts when the council replies.
          </p>
          <form onSubmit={onSubmit} className="flex flex-col gap-3 mt-5">
            <Field icon={User} type="text" autoComplete="name" placeholder="Your name (optional)" value={displayName} onChange={setDisplayName} />
            <Field icon={Mail} type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={setEmail} required />
            <Field icon={Lock} type="password" autoComplete="new-password" placeholder="Password (8+ characters)" value={password} onChange={setPassword} required />

            {error && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="rounded-2xl bg-snappeal-action text-white font-semibold py-3.5 flex items-center justify-center gap-2 shadow-lg shadow-snappeal-action/40 hover:bg-snappeal-action-600 transition disabled:opacity-60"
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

            <p className="text-[11px] text-snappeal-muted text-center mt-1">
              By creating an account you agree to our{" "}
              <Link href="/terms" className="underline">Terms</Link> and{" "}
              <Link href="/privacy" className="underline">Privacy Policy</Link>.
            </p>

            <p className="text-xs text-snappeal-muted text-center mt-2">
              Already have one?{" "}
              <Link href={`/sign-in?next=${encodeURIComponent(next)}`} className="font-semibold text-snappeal-primary">
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
    <label className="flex items-center gap-2 rounded-2xl border border-snappeal-border bg-white px-3 py-2.5 focus-within:border-snappeal-primary transition">
      <Icon className="size-4 text-snappeal-muted" />
      <input
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="flex-1 text-sm outline-none bg-transparent placeholder:text-snappeal-muted"
      />
    </label>
  );
}

function ShieldGlyph() {
  return (
    <svg width="32" height="36" viewBox="0 0 34 38" aria-hidden>
      <path d="M17 1.5 L31.5 6.5 V21 C31.5 29 25 35 17 36.5 C9 35 2.5 29 2.5 21 V6.5 Z" fill="#0a1929" />
      <text x="17" y="24" fontFamily="Inter, system-ui, sans-serif" fontSize="18" fontWeight={800} textAnchor="middle" fill="#fff" letterSpacing={-0.5}>P</text>
    </svg>
  );
}
