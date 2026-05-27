"use client";

/**
 * Client-side notification store.
 *
 * Backs the bell icon in `<AppHeader>` and the watcher that polls
 * `/api/appeals` for status transitions. Two layers:
 *
 *   1. **In-app notifications** — a localStorage-backed list of
 *      `Notification` records the user sees in the bell dropdown. Tap to
 *      route to the relevant ticket; clears on tap.
 *   2. **Native browser notifications** — fire via `new Notification(...)`
 *      when permission has been granted, so the alert lands even if the
 *      tab is in the background.
 *
 * Permission is requested lazily via `requestNotificationPermission()` —
 * called from a contextual pre-prompt at the moment the user kicks off
 * the first job that would eventually fire a notification.
 */

const STORAGE_KEY = "parkingrabbit.notifications";
const PERM_CACHED_KEY = "parkingrabbit.notifications.permission";
const SUBSCRIBE_EVENT = "parkingrabbit:notifications:changed";

export type NotificationKind = "validation" | "draft" | "submit";

/** UI buckets — drive the per-tab counters on the bottom nav.
 *
 *   tickets → validation / draft / submit  (anything tied to an appeal's
 *             progression — surfaces above the Tickets tab; cleared when
 *             the user opens /app/tickets) */
export const TICKETS_BUCKET: NotificationKind[] = ["validation", "draft", "submit"];

export interface AppNotification {
  /** Stable per-event id (e.g. `${appealId}-validation-2026-05-23T...`). */
  id: string;
  appealId: string;
  kind: NotificationKind;
  /** One-line title used by both the in-app list AND the native notification. */
  title: string;
  /** Optional secondary line. */
  body?: string;
  /** ISO timestamp of when the event was raised. */
  createdAt: string;
  /** Whether the user has tapped/dismissed this one. */
  read: boolean;
}

function loadAll(): AppNotification[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AppNotification[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function persist(items: AppNotification[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent(SUBSCRIBE_EVENT));
  } catch {
    /* quota or private-mode — silently drop */
  }
}

/** Push a new notification. Idempotent on `id` — re-adding the same id
 *  updates the existing row in place (lets the watcher recover from
 *  re-renders without duplicating entries). */
export function addNotification(input: Omit<AppNotification, "createdAt" | "read"> & { createdAt?: string }): AppNotification {
  const all = loadAll();
  const createdAt = input.createdAt ?? new Date().toISOString();
  const existingIdx = all.findIndex((n) => n.id === input.id);
  const record: AppNotification = {
    id: input.id,
    appealId: input.appealId,
    kind: input.kind,
    title: input.title,
    body: input.body,
    createdAt,
    read: false,
  };
  if (existingIdx >= 0) {
    all[existingIdx] = { ...all[existingIdx], ...record, read: all[existingIdx].read };
  } else {
    all.unshift(record);
  }
  // Cap at 50 most-recent to keep storage bounded.
  persist(all.slice(0, 50));

  // Try to fire a native browser notification — silent no-op if permission
  // hasn't been granted (the contextual pre-prompt asks at kickoff time).
  fireNativeNotification(record);

  return record;
}

export function listNotifications(): AppNotification[] {
  return loadAll();
}

export function unreadCount(): number {
  return loadAll().filter((n) => !n.read).length;
}

/** Unread count restricted to a set of kinds — used by the bottom-nav
 *  tab badges (tickets vs inbox). */
export function unreadCountForKinds(kinds: NotificationKind[]): number {
  const set = new Set(kinds);
  return loadAll().filter((n) => !n.read && set.has(n.kind)).length;
}

/** Bulk-clear notifications whose kind is in the given set. Used when a
 *  user opens the tab whose counter aggregates those kinds. */
export function clearKinds(kinds: NotificationKind[]): void {
  const set = new Set(kinds);
  persist(loadAll().filter((n) => !set.has(n.kind)));
}

/** Mark a single notification as read. */
export function markRead(id: string): void {
  const all = loadAll();
  const idx = all.findIndex((n) => n.id === id);
  if (idx < 0) return;
  all[idx] = { ...all[idx], read: true };
  persist(all);
}

/** Remove a single notification entirely. */
export function dismissNotification(id: string): void {
  persist(loadAll().filter((n) => n.id !== id));
}

/** Clear everything (used by "Clear all" in the dropdown). */
export function clearAllNotifications(): void {
  persist([]);
}

/** Subscribe to store changes — drives the bell counter re-render. */
export function subscribe(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => listener();
  window.addEventListener(SUBSCRIBE_EVENT, handler);
  // Cross-tab: storage event also fires.
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(SUBSCRIBE_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

/* ───── browser-native Notification API ───── */

/**
 * Returns the current native-Notification permission state.
 * "default" means it hasn't been asked yet.
 */
export function nativePermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined") return "unsupported";
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

/** Ask the browser for native-Notification permission. Returns the resulting
 *  permission. Idempotent — repeated calls after grant/deny just return
 *  the cached state. Caches the result so the contextual pre-prompt only
 *  shows once. */
export async function requestNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  const current = nativePermission();
  if (current === "unsupported" || current !== "default") return current;
  try {
    const result = await Notification.requestPermission();
    if (typeof window !== "undefined") {
      window.localStorage.setItem(PERM_CACHED_KEY, result);
    }
    return result;
  } catch {
    return "denied";
  }
}

/** True only if we've never asked AND the env supports it — i.e. the
 *  contextual pre-prompt should appear. */
export function shouldOfferNotificationPermission(): boolean {
  const p = nativePermission();
  if (p === "unsupported") return false;
  return p === "default";
}

function fireNativeNotification(n: AppNotification): void {
  if (typeof window === "undefined") return;
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  try {
    const native = new Notification("ParkingRabbit", {
      body: `${n.title}${n.body ? ` — ${n.body}` : ""}`,
      icon: "/icon.png",
      tag: n.appealId, // overwrite earlier per-appeal alerts to avoid noise
    });
    native.onclick = () => {
      window.focus();
      window.location.href = `/app/tickets/${encodeURIComponent(n.appealId)}`;
      native.close();
    };
  } catch {
    /* permissions can be revoked mid-session — silently drop */
  }
}
