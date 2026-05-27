/**
 * Canonical shape of the `users.notification_prefs` JSONB column.
 *
 * One single source of truth for what fields exist + their defaults.
 * Every reader (API routes, worker, /api/health) imports `mergePrefs`
 * to coerce a partial blob into a full `NotificationPrefs` with
 * defaults filled in — so a freshly-created user with NULL prefs and
 * a long-time user with a half-populated blob both read the same.
 *
 * No SQL migration: the JSONB stays open; we just standardise reads.
 * If a field is removed later (e.g. we deprecate email pushes), the
 * key stays in old rows but no consumer references it — natural decay.
 */

/** Push subscription persisted by `/api/push/subscribe`. The browser's
 *  PushSubscription serializes into this shape. */
export interface StoredPushSubscription {
  endpoint: string;
  /** ECDH + auth keys produced by the browser. */
  keys: {
    p256dh: string;
    auth: string;
  };
  /** ISO timestamp the user granted permission + subscribed. */
  subscribedAt: string;
  /** Optional — when the dispatcher last got a 410 Gone for this
   *  endpoint. Surfaced in admin so we can spot a user who keeps
   *  re-revoking. NULL while the sub is healthy. */
  lastGoneAt?: string | null;
}

/** Per-channel "ask once" tracker. Each moment is the moment we showed
 *  the prompt; presence means "don't re-prompt at this moment". */
export interface PushAskedAt {
  /** First-time prompt on Appeal-tap (user committed to action). */
  appealTap?: string;
  /** Second-time prompt on submission success (user just paid £2.99). */
  submitDone?: string;
}

/** The full preferences object. Every field has a default; partial
 *  blobs from old DB rows get the defaults via `mergePrefs`. */
export interface NotificationPrefs {
  /** Push subscription — present after the user grants permission. */
  push: StoredPushSubscription | null;

  /** Push dispatch toggles (per-event). Default true so a new user who
   *  granted permission gets the full feedback loop; can disable any
   *  individual category from /app/profile/notifications. */
  pushOnValidation: boolean;
  pushOnSubmission: boolean;
  pushOnCouncilReply: boolean;

  /** Email channel toggles. Default to "yes for transactional" — the
   *  council reply is the moment that matters most. */
  emailOnCouncilReply: boolean;
  emailOnSubmission: boolean;

  /** Customer display preference: when true, the ticket card opens
   *  the "Watch live" disclosure during PCN validation + council
   *  submission. When false (default), the card stays calm — the
   *  agent runs in the background and a push notification lands when
   *  work finishes. Does NOT affect OCR or letter drafting (always
   *  inline). Used by `/api/health` to populate the client `useFlags()`
   *  hook. */
  showMcpLiveView: boolean;

  /** Skip-once tracker for the NotificationPromptGate moments. The
   *  presence of a key means "we already asked; don't re-prompt". */
  pushAskedAt: PushAskedAt;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  push: null,
  pushOnValidation: true,
  pushOnSubmission: true,
  pushOnCouncilReply: true,
  emailOnCouncilReply: true,
  emailOnSubmission: true,
  showMcpLiveView: false,
  pushAskedAt: {},
};

/** Merge a (possibly partial / unknown-shape) JSONB blob with the
 *  defaults. Tolerates legacy fields by ignoring them. Used by every
 *  reader — guarantees the same shape regardless of when the row was
 *  written. */
export function mergePrefs(raw: unknown): NotificationPrefs {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_NOTIFICATION_PREFS };
  const r = raw as Partial<NotificationPrefs> & Record<string, unknown>;
  const push = isPushSub(r.push) ? r.push : null;
  return {
    push,
    pushOnValidation:
      typeof r.pushOnValidation === "boolean"
        ? r.pushOnValidation
        : DEFAULT_NOTIFICATION_PREFS.pushOnValidation,
    pushOnSubmission:
      typeof r.pushOnSubmission === "boolean"
        ? r.pushOnSubmission
        : DEFAULT_NOTIFICATION_PREFS.pushOnSubmission,
    pushOnCouncilReply:
      typeof r.pushOnCouncilReply === "boolean"
        ? r.pushOnCouncilReply
        : DEFAULT_NOTIFICATION_PREFS.pushOnCouncilReply,
    emailOnCouncilReply:
      typeof r.emailOnCouncilReply === "boolean"
        ? r.emailOnCouncilReply
        : DEFAULT_NOTIFICATION_PREFS.emailOnCouncilReply,
    emailOnSubmission:
      typeof r.emailOnSubmission === "boolean"
        ? r.emailOnSubmission
        : DEFAULT_NOTIFICATION_PREFS.emailOnSubmission,
    showMcpLiveView:
      typeof r.showMcpLiveView === "boolean"
        ? r.showMcpLiveView
        : DEFAULT_NOTIFICATION_PREFS.showMcpLiveView,
    pushAskedAt:
      r.pushAskedAt && typeof r.pushAskedAt === "object"
        ? {
            appealTap:
              typeof (r.pushAskedAt as PushAskedAt).appealTap === "string"
                ? (r.pushAskedAt as PushAskedAt).appealTap
                : undefined,
            submitDone:
              typeof (r.pushAskedAt as PushAskedAt).submitDone === "string"
                ? (r.pushAskedAt as PushAskedAt).submitDone
                : undefined,
          }
        : {},
  };
}

function isPushSub(v: unknown): v is StoredPushSubscription {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  if (typeof s.endpoint !== "string" || !s.endpoint) return false;
  const k = s.keys as Record<string, unknown> | undefined;
  if (!k || typeof k.p256dh !== "string" || typeof k.auth !== "string") return false;
  return true;
}

/** Boolean-only subset — the fields a customer can flip from
 *  `/app/profile/notifications`. Used to validate PATCH bodies. */
export type CustomerToggleKey =
  | "pushOnValidation"
  | "pushOnSubmission"
  | "pushOnCouncilReply"
  | "emailOnCouncilReply"
  | "emailOnSubmission"
  | "showMcpLiveView";

export const CUSTOMER_TOGGLE_KEYS: CustomerToggleKey[] = [
  "pushOnValidation",
  "pushOnSubmission",
  "pushOnCouncilReply",
  "emailOnCouncilReply",
  "emailOnSubmission",
  "showMcpLiveView",
];

/** Moments the NotificationPromptGate fires. Each maps to a key in
 *  `pushAskedAt`. */
export type PromptMoment = keyof PushAskedAt;
