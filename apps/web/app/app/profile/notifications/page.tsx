"use client";

import { useEffect, useState } from "react";
import { Bell, Mail, MessageSquare } from "lucide-react";
import { ProfileSubPage } from "@/components/ProfileSubPage";

/**
 * Notification prefs. Persisted client-side in localStorage for v0.1 —
 * server-backed prefs land when we add the notifications table.
 */
type Prefs = {
  emailOnCouncilReply: boolean;
  emailOnSubmission: boolean;
  pushOnCouncilReply: boolean;
};

const DEFAULT: Prefs = {
  emailOnCouncilReply: true,
  emailOnSubmission: true,
  pushOnCouncilReply: false,
};

const KEY = "snappeal.notifPrefs";

export default function NotificationsPage() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT);
  const [pushSupported, setPushSupported] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPushSupported(typeof Notification !== "undefined");
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      try {
         
        setPrefs({ ...DEFAULT, ...(JSON.parse(raw) as Partial<Prefs>) });
      } catch {
        /* ignore */
      }
    }
  }, []);

  const update = async (key: keyof Prefs, value: boolean) => {
    if (key === "pushOnCouncilReply" && value && pushSupported) {
      const status = await Notification.requestPermission();
      if (status !== "granted") value = false;
    }
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  };

  return (
    <ProfileSubPage title="Notification preferences" subtitle="Choose how Snappeal pings you about council activity.">
      <div className="flex flex-col gap-3">
        <Toggle
          icon={Mail}
          label="Email when the council replies"
          body="Parsed inbound email with the council's decision."
          on={prefs.emailOnCouncilReply}
          onChange={(v) => void update("emailOnCouncilReply", v)}
        />
        <Toggle
          icon={Mail}
          label="Email when an appeal is submitted"
          body="Receipt of submission, council reference, screenshot."
          on={prefs.emailOnSubmission}
          onChange={(v) => void update("emailOnSubmission", v)}
        />
        <Toggle
          icon={MessageSquare}
          label="Push notification on reply"
          body={pushSupported ? "Web Push from your browser." : "Push not supported in this browser."}
          on={prefs.pushOnCouncilReply}
          onChange={(v) => void update("pushOnCouncilReply", v)}
          disabled={!pushSupported}
        />
      </div>

      <div className="mt-4 rounded-2xl bg-snappeal-primary-50 border border-snappeal-primary-100 p-4 flex items-start gap-3">
        <Bell className="size-4 text-snappeal-primary mt-0.5" />
        <p className="text-xs text-snappeal-navy leading-relaxed">
          We never send marketing email. These prefs only cover transactional alerts about your own appeals.
        </p>
      </div>
    </ProfileSubPage>
  );
}

function Toggle({
  icon: Icon,
  label,
  body,
  on,
  onChange,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  body: string;
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!on)}
      disabled={disabled}
      className="w-full rounded-2xl bg-white border border-snappeal-border p-4 flex items-start gap-3 text-left disabled:opacity-50 transition hover:border-snappeal-primary"
    >
      <span className="size-9 rounded-xl bg-snappeal-primary-100 text-snappeal-primary flex items-center justify-center flex-shrink-0">
        <Icon className="size-[1.125rem]" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-snappeal-navy">{label}</p>
        <p className="text-xs text-snappeal-muted mt-0.5">{body}</p>
      </div>
      <span
        className={`relative w-10 h-6 rounded-full transition flex-shrink-0 ${
          on ? "bg-snappeal-success" : "bg-snappeal-border"
        }`}
        aria-hidden
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${
            on ? "left-[18px]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}
