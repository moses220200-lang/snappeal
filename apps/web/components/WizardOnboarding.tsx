"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Camera,
  CheckCircle2,
  ChevronRight,
  FileText,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

/**
 * First-launch wizard — short, focused, all-in-one onboarding.
 *
 * Flow: welcome → plan → permissions → auth.
 *
 * The "plan" step is informational under the new pricing model: drafting
 * is always free; £2.99 is only charged at auto-submission time. The
 * selection seeds `snappeal.preferAutoSubmit` so the letter page can
 * default the CTA accordingly. The grounds quiz lives on /app/notes (the
 * `<GroundsCardQuiz>` component) — no need to ask it again here before
 * the user has even captured a PCN.
 */
const STORAGE_KEY = "snappeal.wizardDone";
const PREFERENCE_KEY = "snappeal.preferAutoSubmit";

type Step = "welcome" | "plan" | "permissions" | "auth" | "done";
type Preference = "draft_only" | "auto_submit" | "care_plan";

export function WizardOnboarding() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("welcome");
  const [preference, setPreference] = useState<Preference | null>(null);

  // Decide whether the wizard should ever appear:
  //   1. If the user is signed in → skip immediately and never show.
  //   2. If localStorage flag is set → skip.
  //   3. Otherwise → show the wizard from the welcome step.
  // We start in `"done"` and only flip back to `"welcome"` when both checks
  // confirm it's a fresh guest. That way logged-in users (and returning
  // guests who finished onboarding) never see a flash of the wizard.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let alive = true;

    const reveal = () => {
      if (!alive) return;
       
      setStep("welcome");
    };
    const hide = () => {
      if (!alive) return;
       
      setStep("done");
    };

    hide();

    // Local skip-state takes priority — no network round-trip needed.
    if (window.localStorage.getItem(STORAGE_KEY) === "1") {
      hide();
      return () => {
        alive = false;
      };
    }

    // Otherwise probe /api/auth/me. Signed-in users skip the wizard and we
    // stamp localStorage so the network call doesn't happen again next
    // mount.
    void (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!alive) return;
        if (res.ok) {
          const body = (await res.json()) as { user?: { id?: string } | null };
          if (body.user?.id) {
            window.localStorage.setItem(STORAGE_KEY, "1");
            hide();
            return;
          }
        }
        reveal();
      } catch {
        // Network failed — fall back to showing the wizard since we can't
        // confirm sign-in. localStorage flag still gates returning guests.
        reveal();
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const finish = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, "1");
      if (preference) {
        window.localStorage.setItem(
          PREFERENCE_KEY,
          preference === "auto_submit" ? "1" : "0",
        );
      }
    }
    setStep("done");
    router.refresh();
  };

  if (step === "done") return null;

  return (
    <div className="fixed inset-0 z-[110] bg-snappeal-navy overflow-y-auto">
      <button
        type="button"
        onClick={finish}
        aria-label="Skip onboarding"
        className="fixed top-6 right-5 z-10 size-9 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition"
      >
        <X className="size-4" />
      </button>

      <div className="min-h-full flex flex-col px-6 py-12 max-w-md mx-auto">
        {step === "welcome" && <WelcomeStep onNext={() => setStep("plan")} />}
        {step === "plan" && (
          <PlanStep
            preference={preference}
            onPick={(p) => setPreference(p)}
            onBack={() => setStep("welcome")}
            onNext={() => setStep("permissions")}
          />
        )}
        {step === "permissions" && (
          <PermissionsStep onBack={() => setStep("plan")} onNext={() => setStep("auth")} />
        )}
        {step === "auth" && <AuthStep onFinish={finish} />}
      </div>
    </div>
  );
}

function StepShell({
  badge,
  title,
  subtitle,
  children,
  footer,
}: {
  badge: string;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="flex-1 flex flex-col">
      <p className="inline-flex self-start items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/80">
        {badge}
      </p>
      <h2 className="mt-5 text-3xl font-bold tracking-tight text-white leading-tight">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-2 text-sm text-white/70 leading-relaxed">{subtitle}</p>
      )}
      <div className="mt-7 flex-1 flex flex-col gap-3">{children}</div>
      <div className="mt-8 flex flex-col gap-2">{footer}</div>
    </div>
  );
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <StepShell
      badge="Welcome"
      title="Snap. Appeal. Done."
      subtitle="The fastest way to challenge a London parking ticket. AI drafts your appeal in under a minute."
      footer={
        <button
          type="button"
          onClick={onNext}
          className="rounded-2xl bg-snappeal-action text-white font-semibold py-4 shadow-lg shadow-snappeal-action/40 hover:bg-snappeal-action-600 transition"
        >
          Get started
        </button>
      }
    >
      <WelcomeAnimation />
      <ul className="mt-3 flex flex-col gap-2.5">
        {[
          { icon: Camera, label: "Snap your PCN" },
          { icon: Sparkles, label: "AI drafts your appeal" },
          { icon: ShieldCheck, label: "We submit it for you" },
        ].map(({ icon: Icon, label }) => (
          <li key={label} className="flex items-center gap-3 text-sm text-white/85">
            <span className="size-9 rounded-xl bg-white/10 text-white flex items-center justify-center">
              <Icon className="size-[1.125rem]" />
            </span>
            {label}
          </li>
        ))}
      </ul>
    </StepShell>
  );
}

function WelcomeAnimation() {
  return (
    <div className="relative rounded-3xl bg-gradient-to-br from-snappeal-navy via-snappeal-primary-800 to-snappeal-primary-700 p-6 overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.4) 1px, transparent 0)",
          backgroundSize: "22px 22px",
        }}
      />
      <div className="absolute inset-4 pointer-events-none">
        <span className="absolute -top-1 -left-1 size-9 border-t-[3px] border-l-[3px] border-white/70 rounded-tl-xl" />
        <span className="absolute -top-1 -right-1 size-9 border-t-[3px] border-r-[3px] border-white/70 rounded-tr-xl" />
        <span className="absolute -bottom-1 -left-1 size-9 border-b-[3px] border-l-[3px] border-white/70 rounded-bl-xl" />
        <span className="absolute -bottom-1 -right-1 size-9 border-b-[3px] border-r-[3px] border-white/70 rounded-br-xl" />
      </div>
      <div className="relative flex items-center justify-center h-52">
        <div className="snappeal-splash-ticket w-32 drop-shadow-[0_12px_24px_rgba(0,0,0,0.45)]">
          <MiniWestminsterPCN />
        </div>
        <span className="snappeal-generating-line absolute left-6 right-6 h-1.5 rounded-full bg-gradient-to-r from-transparent via-snappeal-primary to-transparent shadow-[0_0_18px_rgba(0,122,255,0.85)]" />
      </div>
    </div>
  );
}

/**
 * Real-world UK PCN warning notice in its iconic adhesive plastic wallet —
 * the yellow square with diamond-hatched border that gets slapped on a
 * windshield. Bold "PENALTY CHARGE NOTICE / WARNING" copy matches the
 * actual physical ticket so the scan-line animation lines up with what
 * users actually see in real life.
 */
function MiniWestminsterPCN() {
  return (
    <svg
      viewBox="0 0 220 300"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-auto"
    >
      <defs>
        <pattern
          id="wizardPcnDiamondHatch"
          patternUnits="userSpaceOnUse"
          width="7"
          height="7"
          patternTransform="rotate(45)"
        >
          <rect width="7" height="7" fill="#0a0a0a" />
          <rect x="0.9" y="0.9" width="5.2" height="5.2" fill="#ffffff" />
        </pattern>
        <linearGradient id="wizardPcnWallet" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f4f4f5" />
          <stop offset="40%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e7e7ea" />
        </linearGradient>
        <linearGradient id="wizardPcnSheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.6" />
          <stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect
        width="220"
        height="300"
        rx="8"
        fill="url(#wizardPcnWallet)"
        stroke="#cfcfd4"
        strokeWidth="0.6"
      />

      <rect width="220" height="22" fill="#e6e6ea" />
      <line x1="6" y1="11" x2="214" y2="11" stroke="#bcbcc2" strokeWidth="0.7" strokeDasharray="3 2" />
      <line x1="6" y1="18" x2="214" y2="18" stroke="#cfcfd4" strokeWidth="0.5" strokeDasharray="1 3" />

      <rect width="220" height="300" rx="8" fill="url(#wizardPcnSheen)" />

      <rect x="22" y="42" width="176" height="240" fill="url(#wizardPcnDiamondHatch)" />
      <rect x="29" y="49" width="162" height="226" fill="#fdd420" />

      <text x="110" y="98" textAnchor="middle" fontFamily="Helvetica Neue, Helvetica, Arial, sans-serif" fontSize="20" fontWeight={900} fill="#0a0a0a" letterSpacing={-0.4}>
        PENALTY
      </text>
      <text x="110" y="120" textAnchor="middle" fontFamily="Helvetica Neue, Helvetica, Arial, sans-serif" fontSize="20" fontWeight={900} fill="#0a0a0a" letterSpacing={-0.4}>
        CHARGE
      </text>
      <text x="110" y="142" textAnchor="middle" fontFamily="Helvetica Neue, Helvetica, Arial, sans-serif" fontSize="20" fontWeight={900} fill="#0a0a0a" letterSpacing={-0.4}>
        NOTICE
      </text>
      <text x="110" y="178" textAnchor="middle" fontFamily="Helvetica Neue, Helvetica, Arial, sans-serif" fontSize="13" fontWeight={800} fill="#0a0a0a" letterSpacing={0.6}>
        WARNING
      </text>
      <text x="110" y="206" textAnchor="middle" fontFamily="Helvetica Neue, Helvetica, Arial, sans-serif" fontSize="6.4" fontWeight={700} fill="#0a0a0a">
        IT IS AN OFFENCE FOR ANY
      </text>
      <text x="110" y="220" textAnchor="middle" fontFamily="Helvetica Neue, Helvetica, Arial, sans-serif" fontSize="6.4" fontWeight={700} fill="#0a0a0a">
        PERSON OTHER THAN THE
      </text>
      <text x="110" y="234" textAnchor="middle" fontFamily="Helvetica Neue, Helvetica, Arial, sans-serif" fontSize="6.4" fontWeight={700} fill="#0a0a0a">
        DRIVER TO REMOVE THIS NOTICE
      </text>
    </svg>
  );
}

function PlanStep({
  preference,
  onPick,
  onNext,
  onBack,
}: {
  preference: Preference | null;
  onPick: (p: Preference) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const options: {
    id: Preference;
    icon: typeof FileText;
    title: string;
    pitch: string;
    badge: string;
    comingSoon?: boolean;
  }[] = [
    {
      id: "draft_only",
      icon: FileText,
      title: "Draft only",
      pitch:
        "We AI-draft the full grounds-based appeal and save it to your inbox. You copy/paste or download — submit it yourself.",
      badge: "Free · unlimited",
    },
    {
      id: "auto_submit",
      icon: Send,
      title: "ParkingRabbit submits for me",
      pitch:
        "Same AI draft, plus our AI Auto-Submit Agent files it through your council's portal end-to-end. Pay only when you use it.",
      badge: "£2.99 per submission",
    },
    {
      id: "care_plan",
      icon: Sparkles,
      title: "Care Plan",
      pitch:
        "Unlimited auto-submissions, 90% appeal-rate guarantee, roadside invoice recovery, priority support.",
      badge: "£9.99/mo",
      comingSoon: true,
    },
  ];

  return (
    <StepShell
      badge="Step 1 of 2"
      title="How would you like to appeal?"
      subtitle="Drafting is always free. Choose how you want to submit — you can change this on each appeal."
      footer={
        <>
          <button
            type="button"
            onClick={onNext}
            disabled={!preference || preference === "care_plan"}
            className="rounded-2xl bg-snappeal-action text-white font-semibold py-4 shadow-lg shadow-snappeal-action/40 hover:bg-snappeal-action-600 transition disabled:opacity-40 disabled:shadow-none"
          >
            {preference === "care_plan" ? "Join waitlist (coming soon)" : "Continue"}
          </button>
          <button type="button" onClick={onBack} className="text-xs text-white/60 hover:text-white py-2">
            Back
          </button>
        </>
      }
    >
      {options.map((opt) => {
        const isPicked = preference === opt.id;
        const disabled = opt.comingSoon;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onPick(opt.id)}
            className={`text-left rounded-2xl p-4 flex items-start gap-3 transition border ${
              isPicked
                ? "bg-white text-snappeal-navy border-transparent"
                : disabled
                  ? "bg-white/5 text-white/60 border-white/10"
                  : "bg-white/10 text-white border-white/15 hover:bg-white/15"
            }`}
          >
            <span
              className={`size-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
                isPicked
                  ? "bg-snappeal-primary-100 text-snappeal-primary"
                  : "bg-white/15"
              }`}
            >
              <opt.icon className={`size-5 ${isPicked ? "text-snappeal-primary" : "text-white"}`} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold flex items-center gap-2 flex-wrap">
                {opt.title}
                <span
                  className={`text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ${
                    isPicked
                      ? "bg-snappeal-primary-100 text-snappeal-primary-700"
                      : "bg-white/15 text-white"
                  }`}
                >
                  {opt.badge}
                </span>
                {opt.comingSoon && (
                  <span className="text-[10px] font-bold uppercase tracking-wide rounded-full bg-amber-400/20 text-amber-200 px-2 py-0.5">
                    Coming soon
                  </span>
                )}
              </p>
              <p className={`text-xs mt-1 leading-relaxed ${isPicked ? "text-snappeal-muted" : "text-white/75"}`}>
                {opt.pitch}
              </p>
            </div>
            {isPicked && <CheckCircle2 className="size-5 text-snappeal-success flex-shrink-0" />}
          </button>
        );
      })}
    </StepShell>
  );
}

function PermissionsStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [camera, setCamera] = useState<"unknown" | "granted" | "denied">("unknown");
  const [notif, setNotif] = useState<"unknown" | "granted" | "denied">("unknown");

  const askCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((t) => t.stop());
      setCamera("granted");
    } catch {
      setCamera("denied");
    }
  };
  const askNotif = async () => {
    if (!("Notification" in window)) {
      setNotif("denied");
      return;
    }
    const status = await Notification.requestPermission();
    setNotif(status === "granted" ? "granted" : "denied");
  };

  return (
    <StepShell
      badge="Step 2 of 2"
      title="Get the most from ParkingRabbit"
      subtitle="Two quick permissions. You can change either anytime in your phone settings."
      footer={
        <>
          <button
            type="button"
            onClick={onNext}
            className="rounded-2xl bg-snappeal-action text-white font-semibold py-4 shadow-lg shadow-snappeal-action/40 hover:bg-snappeal-action-600 transition"
          >
            Continue
          </button>
          <button type="button" onClick={onBack} className="text-xs text-white/60 hover:text-white py-2">
            Back
          </button>
        </>
      }
    >
      <PermissionRow
        icon={Camera}
        label="Camera access"
        body="Snap your PCN with the rear camera — no library digging."
        state={camera}
        onAsk={askCamera}
      />
      <PermissionRow
        icon={Bell}
        label="Notifications"
        body="Ping you when the council responds. Nothing else."
        state={notif}
        onAsk={askNotif}
      />
    </StepShell>
  );
}

function PermissionRow({
  icon: Icon,
  label,
  body,
  state,
  onAsk,
}: {
  icon: typeof Camera;
  label: string;
  body: string;
  state: "unknown" | "granted" | "denied";
  onAsk: () => void;
}) {
  return (
    <div className="rounded-2xl bg-white/10 p-4 border border-white/15 flex items-start gap-3">
      <span className="size-11 rounded-xl bg-white/15 text-white flex items-center justify-center flex-shrink-0">
        <Icon className="size-5" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white">{label}</p>
        <p className="text-xs text-white/70 mt-1 leading-relaxed">{body}</p>
      </div>
      <button
        type="button"
        onClick={onAsk}
        disabled={state === "granted"}
        className={`text-xs font-bold uppercase tracking-wide rounded-full px-3 py-1.5 self-center whitespace-nowrap transition ${
          state === "granted"
            ? "bg-snappeal-success text-white"
            : state === "denied"
              ? "bg-white/10 text-white/60"
              : "bg-white text-snappeal-navy hover:bg-white/90"
        }`}
      >
        {state === "granted" ? "On" : state === "denied" ? "Off" : "Tap to allow"}
      </button>
    </div>
  );
}

function AuthStep({ onFinish }: { onFinish: () => void }) {
  const router = useRouter();
  const markDoneAnd = (fn: () => void) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("snappeal.wizardDone", "1");
    }
    fn();
  };
  const goToSignUp = () => markDoneAnd(() => router.push("/sign-up"));
  const startOAuth = (provider: "apple" | "google") => {
    markDoneAnd(() => {
      window.location.href = `/api/auth/oauth/${provider}?next=${encodeURIComponent("/app/profile")}`;
    });
  };
  return (
    <StepShell
      badge="Almost there"
      title="Sign in or stay a guest"
      subtitle="Sign in for cross-device sync, reply tracking, and inbox parsing of council replies."
      footer={
        <>
          <button
            type="button"
            onClick={onFinish}
            className="rounded-2xl bg-white/10 border border-white/20 text-white font-semibold py-3.5 hover:bg-white/15 transition"
          >
            Continue as guest
          </button>
          <p className="text-[11px] text-white/55 text-center mt-1">
            Your appeals stay on this device. You can sign in any time later.
          </p>
        </>
      }
    >
      <OAuthButton
        kind="apple"
        title="Continue with Apple"
        subtitle="Sign in instantly with your Apple ID."
        onClick={() => startOAuth("apple")}
      />
      <OAuthButton
        kind="google"
        title="Continue with Google"
        subtitle="Sign in instantly with your Google account."
        onClick={() => startOAuth("google")}
      />
      <OAuthButton
        kind="email"
        title="Continue with email"
        subtitle="Create an account with name, address & phone."
        onClick={goToSignUp}
      />
    </StepShell>
  );
}

function OAuthButton({
  kind,
  title,
  subtitle,
  onClick,
}: {
  kind: "apple" | "google" | "email";
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  const palette =
    kind === "apple"
      ? "bg-black text-white border-black hover:bg-black/90"
      : kind === "google"
        ? "bg-white text-snappeal-navy border-snappeal-border hover:bg-white/95"
        : "bg-snappeal-primary text-white border-snappeal-primary hover:bg-snappeal-primary-600";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-2xl p-4 flex items-center gap-3 border transition ${palette}`}
    >
      <span className="size-10 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
        <OAuthGlyph kind={kind} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold">{title}</p>
        <p className={`text-xs mt-0.5 leading-relaxed ${kind === "google" ? "text-snappeal-muted" : "text-white/75"}`}>
          {subtitle}
        </p>
      </div>
      <ChevronRight className={`size-4 ${kind === "google" ? "text-snappeal-muted" : "text-white/70"}`} />
    </button>
  );
}

function OAuthGlyph({ kind }: { kind: "apple" | "google" | "email" }) {
  if (kind === "apple") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.234-.01-.317-.03-.013-.1-.027-.21-.027-.32 0-1.13.524-2.27 1.158-2.97.804-.95 2.13-1.65 3.222-1.7.014.13.028.26.028.37zM21 17.42c-.49 1.09-1.04 2.18-1.7 3.27-.88 1.45-2.05 3.26-3.5 3.28-1.3.02-1.62-.84-3.36-.83-1.75 0-2.1.85-3.39.85-1.45-.05-2.56-1.7-3.44-3.15-2.46-4.06-2.71-8.83-1.2-11.37C5.36 7.62 6.94 6.7 8.42 6.7c1.32 0 2.16.71 3.27.71 1.07 0 1.72-.71 3.25-.71 1.16 0 2.4.63 3.27 1.72-2.88 1.58-2.41 5.7.79 9z"/>
      </svg>
    );
  }
  if (kind === "google") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.07 5.07 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.24 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.11A6.62 6.62 0 0 1 5.5 12c0-.73.12-1.44.34-2.11V7.05H2.18A11 11 0 0 0 1 12c0 1.77.42 3.45 1.18 4.95l3.66-2.84z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.46 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
      </svg>
    );
  }
  return <FileText className="size-5" />;
}
