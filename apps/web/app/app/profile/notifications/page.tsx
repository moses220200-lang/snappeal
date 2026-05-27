"use client";

/**
 * /app/profile/notifications — customer notification + display
 * preferences. v0.3.9: server-backed via `users.notification_prefs`
 * (previously localStorage-only).
 *
 * Six toggles split into two groups:
 *   - Push & email (when the council does something, do we ping you?)
 *   - Display (do you want to watch the agent live, or just see results?)
 *
 * The push permission flow itself runs once when the user first taps
 * Appeal — gate handled by NotificationPromptGate on the ticket card.
 * This page is for fine-grained channel control AFTER the user has
 * subscribed.
 */
import { useEffect, useState } from "react";
import { Bell, Eye, Mail, MessageSquare, Sparkles } from "lucide-react";
import { ProfileSubPage } from "@/components/ProfileSubPage";

interface Prefs {
  pushOnValidation: boolean;
  pushOnSubmission: boolean;
  pushOnCouncilReply: boolean;
  emailOnCouncilReply: boolean;
  emailOnSubmission: boolean;
  showMcpLiveView: boolean;
  hasPushSubscription: boolean;
}

const DEFAULT: Prefs = {
  pushOnValidation: true,
  pushOnSubmission: true,
  pushOnCouncilReply: true,
  emailOnCouncilReply: true,
  emailOnSubmission: true,
  showMcpLiveView: false,
  hasPushSubscription: false,
};

type ToggleKey = Exclude<keyof Prefs, "hasPushSubscription">;

export default function NotificationsPage() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState<ToggleKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch server-backed prefs on mount.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/users/me/notification-prefs", {
          cache: "no-store",
        });
        if (!alive) return;
        if (res.ok) {
          const json = (await res.json()) as { prefs: Prefs };
          setPrefs({ ...DEFAULT, ...json.prefs });
        }
      } catch {
        // Stay on DEFAULT; the user can still flip toggles and the
        // PATCH will create the row on first save.
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const update = async (key: ToggleKey, value: boolean) => {
    // Optimistic — flip locally, then PATCH. Roll back on error.
    const before = prefs[key];
    setPrefs((p) => ({ ...p, [key]: value }));
    setPending(key);
    setError(null);
    try {
      const res = await fetch("/api/users/me/notification-prefs", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(
          json?.error?.message ?? `Save failed (${res.status})`,
        );
      }
      const json = (await res.json()) as { prefs: Prefs };
      setPrefs({ ...DEFAULT, ...json.prefs });
    } catch (err) {
      setPrefs((p) => ({ ...p, [key]: before }));
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setPending(null);
    }
  };

  return (
    <ProfileSubPage
      title="Notifications & display"
      subtitle="Choose how ParkingRabbit pings you about council activity and how much of the agent's work you want to see."
    >
      {!loaded && (
        <p className="text-xs text-parkingrabbit-muted px-1">Loading preferences…</p>
      )}

      {/* ── Section 1: notification channels ── */}
      <Section title="When the council does something">
        <Toggle
          icon={MessageSquare}
          label="Push: PCN verified"
          body="System notification the moment the council confirms your PCN amount + due date."
          on={prefs.pushOnValidation}
          onChange={(v) => void update("pushOnValidation", v)}
          pending={pending === "pushOnValidation"}
          disabledHint={
            prefs.hasPushSubscription
              ? null
              : "Enable browser notifications first (we ask when you tap Appeal)"
          }
        />
        <Toggle
          icon={MessageSquare}
          label="Push: appeal submitted"
          body="Pings you when Rabbit finishes filing the appeal with the council."
          on={prefs.pushOnSubmission}
          onChange={(v) => void update("pushOnSubmission", v)}
          pending={pending === "pushOnSubmission"}
          disabledHint={
            prefs.hasPushSubscription
              ? null
              : "Enable browser notifications first"
          }
        />
        <Toggle
          icon={MessageSquare}
          label="Push: council replies"
          body="The moment the council's decision lands in our inbox."
          on={prefs.pushOnCouncilReply}
          onChange={(v) => void update("pushOnCouncilReply", v)}
          pending={pending === "pushOnCouncilReply"}
          disabledHint={
            prefs.hasPushSubscription
              ? null
              : "Enable browser notifications first"
          }
        />
        <Toggle
          icon={Mail}
          label="Email: council replies"
          body="Forward the council's decision to your inbox."
          on={prefs.emailOnCouncilReply}
          onChange={(v) => void update("emailOnCouncilReply", v)}
          pending={pending === "emailOnCouncilReply"}
        />
        <Toggle
          icon={Mail}
          label="Email: appeal submitted"
          body="Receipt of submission, council reference, screenshot."
          on={prefs.emailOnSubmission}
          onChange={(v) => void update("emailOnSubmission", v)}
          pending={pending === "emailOnSubmission"}
        />
      </Section>

      {/* ── Section 2: display preference ── */}
      <Section title="How much do you want to watch?">
        <Toggle
          icon={Eye}
          label="Watch the agent live"
          body="Show the live screenshot strip + thought bubble while the agent reads the council portal or submits your appeal. Off (default) = calm card with a push notification when each step finishes."
          on={prefs.showMcpLiveView}
          onChange={(v) => void update("showMcpLiveView", v)}
          pending={pending === "showMcpLiveView"}
        />
      </Section>

      <div className="mt-4 rounded-2xl bg-parkingrabbit-primary-50 border border-parkingrabbit-primary-100 p-4 flex items-start gap-3">
        <Bell className="size-4 text-parkingrabbit-primary mt-0.5" />
        <p className="text-xs text-parkingrabbit-navy leading-relaxed">
          We never send marketing email. These prefs only cover transactional
          alerts about your own appeals.
        </p>
      </div>

      {error && (
        <div className="mt-3 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}
    </ProfileSubPage>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4 first:mt-0">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-parkingrabbit-muted px-1 mb-2">
        {title}
      </p>
      <div className="flex flex-col gap-2.5">{children}</div>
    </div>
  );
}

function Toggle({
  icon: Icon,
  label,
  body,
  on,
  onChange,
  pending,
  disabledHint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  body: string;
  on: boolean;
  onChange: (v: boolean) => void;
  pending?: boolean;
  disabledHint?: string | null;
}) {
  const interactive = !disabledHint && !pending;
  return (
    <button
      type="button"
      onClick={() => interactive && onChange(!on)}
      disabled={!interactive}
      className={`w-full rounded-2xl bg-white border border-parkingrabbit-border p-4 flex items-start gap-3 text-left transition ${
        interactive ? "hover:border-parkingrabbit-primary" : "opacity-60 cursor-default"
      }`}
    >
      <span className="size-9 rounded-xl bg-parkingrabbit-primary-100 text-parkingrabbit-primary flex items-center justify-center flex-shrink-0">
        <Icon className="size-[1.125rem]" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-parkingrabbit-navy">{label}</p>
        <p className="text-xs text-parkingrabbit-muted mt-0.5 leading-snug">{body}</p>
        {disabledHint && (
          <p className="text-[10.5px] text-amber-700 mt-1.5 font-medium">
            {disabledHint}
          </p>
        )}
      </div>
      <span
        className={`relative w-10 h-6 rounded-full transition flex-shrink-0 ${
          pending
            ? "bg-parkingrabbit-border"
            : on
              ? "bg-parkingrabbit-success"
              : "bg-parkingrabbit-border"
        }`}
        aria-hidden
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${
            on ? "left-[18px]" : "left-0.5"
          } ${pending ? "animate-pulse" : ""}`}
        />
      </span>
    </button>
  );
}
// Suppress unused-import lint for the type-only marker icon.
void Sparkles;
