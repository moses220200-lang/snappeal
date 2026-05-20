"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ArrowRight, Loader2, Mail, Lock } from "lucide-react";
import { getOrCreateSessionId } from "@/lib/client/session";
import { SnappealMark } from "@/components/Logo";
import { OAuthButtons } from "@/components/OAuthButtons";

function safeNext(raw: string | null): string {
  if (!raw) return "/app/profile";
  try {
    const decoded = decodeURIComponent(raw);
    // Only allow same-origin internal paths.
    if (decoded.startsWith("/") && !decoded.startsWith("//")) return decoded;
  } catch {
    /* fall through */
  }
  return "/app/profile";
}

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-snappeal-muted">Loading…</div>}>
      <SignInInner />
    </Suspense>
  );
}

function SignInInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params?.get("next") ?? null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const sessionId = getOrCreateSessionId();
      const res = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-snappeal-session": sessionId,
        },
        body: JSON.stringify({ email, password, sessionId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? `Sign-in failed (${res.status})`);
      // Admins land in the backend by default; ?next= still wins if explicitly set.
      const target =
        params?.get("next")
          ? next
          : json?.user?.role === "admin"
            ? "/admin"
            : "/app/profile";
      router.replace(target);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
      setSubmitting(false);
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to Snappeal to sync your tickets across devices.">
      <OAuthButtons next={next} />
      <div className="flex items-center gap-3 my-5">
        <span className="flex-1 h-px bg-snappeal-border" />
        <span className="text-[11px] uppercase tracking-wider text-snappeal-muted">
          or with email
        </span>
        <span className="flex-1 h-px bg-snappeal-border" />
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <Field icon={Mail} type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={setEmail} required />
        <Field icon={Lock} type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={setPassword} required />

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
              Signing in…
            </>
          ) : (
            <>
              Sign in
              <ArrowRight className="size-4" />
            </>
          )}
        </button>

        <p className="text-xs text-snappeal-muted text-center mt-2">
          No account yet?{" "}
          <Link href={`/sign-up?next=${encodeURIComponent(next)}`} className="font-semibold text-snappeal-primary">
            Create one
          </Link>
        </p>
        <p className="text-xs text-snappeal-muted text-center">
          Or{" "}
          <Link href="/app" className="font-semibold text-snappeal-primary">
            continue as guest
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-snappeal-bg flex flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <Link href="/app" className="flex items-center gap-2.5 mb-6 justify-center">
          <SnappealMark size={36} variant="dark" />
          <span className="text-xl font-bold text-snappeal-navy tracking-tight">Snappeal</span>
        </Link>
        <div className="rounded-3xl bg-white border border-snappeal-border p-6">
          <h1 className="text-2xl font-bold text-snappeal-navy">{title}</h1>
          <p className="text-sm text-snappeal-muted mt-1">{subtitle}</p>
          <div className="mt-5">{children}</div>
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

