# Notifications

How ParkingRabbit lets users know when something changes — locally (haptics + confetti) and remotely (Web Push).

## Layers

| Layer | When it fires | Surface | Implementation |
|---|---|---|---|
| **Haptic feedback** | Tap, success, error, warning, select | Vibration API via `lib/client/haptics.ts → haptic(intent)` | One-line call; no-op when unsupported |
| **Confetti burst** | Appeal flips to `cancelled` | Visual overlay via `components/Confetti.tsx` | Pre-computed particles, sessionStorage-gated to fire once per appeal id |
| **In-app notification store** (v0.3.2) | Portal-lookup verdict landing, draft letter ready (or failing), submission settling | `lib/client/notifications.ts` + bottom-nav Tickets-tab counter badge | localStorage-backed, capped at 50, idempotent on `id`, three `NotificationKind`s aggregated by `TICKETS_BUCKET` |
| **Native browser notifications** (v0.3.2) | Same three deltas as above | `new Notification("ParkingRabbit", { tag: appealId })` | Only fires when `Notification.permission === "granted"`; `tag` overwrites earlier per-appeal alerts; `onclick` focuses tab + routes to `/app/tickets/<id>` |
| **`<NotificationWatcher>` poller** (v0.3.2) | Mounted in `app/app/layout.tsx`; polls `/api/appeals` for state transitions | Pure client-side, no Web Push provider | 5 s foreground / 30 s `visibilityState === "hidden"`; re-ticks on focus regain; first-poll seed map suppresses backlog on reload |
| **`<NotificationPermissionSheet>`** (v0.3.2) | Context-sensitive opt-in fired at validation / draft / submit kickoff | Bottom-sheet with three benefit bullets | Gated on `nativePermission() === "default"`; "Not now" in sessionStorage (re-asks once per session, never silently suppresses forever) |
| **In-app toast / overlay** | AI photo coach result, "Strengthen my notes" preview | `components/WizardSheet.tsx` (reusable bottom-sheet) | Same navy-glass aesthetic. Post-payment generation no longer uses a full-page overlay — `letter_ready` state on the smart card hosts the strength badge + Pay flow inline. |
| **Web Push** (scaffolded; not load-bearing today) | Future cross-session push channel | Service worker `public/sw.js` + `components/PushPermission.tsx` | VAPID + `PushManager.subscribe`, subscription stored on `users.notificationPrefs`. v0.3.2's in-session polling covers the same UX without requiring the provider; Web Push is the future cross-session play. |
| **Transactional email** | Submission confirmation, council reply summary, password-reset (future) | Resend-compatible via `lib/server/submission/email.ts` | Stub-friendly; real Resend kicks in when `RESEND_API_KEY` is set |

## Haptic grammar (`lib/client/haptics.ts`)

Five named intents map to vibration patterns. Use the intent, not the duration — the patterns can be re-tuned centrally.

```ts
haptic("tap");     // 8 ms — button press
haptic("select");  // 12 ms — option pick
haptic("success"); // 12-40-18 — appeal submitted, draft ready, confidence boost
haptic("warning"); // 20-50-20 — photo coach says "ok, but"
haptic("error");   // 40-60-40-60-40 — network / submission failure
```

Used inline through the smart-card lifecycle (extract success/fail, validating spinner morph, drafting milestones, Pay button taps), the dictation panel ("Strengthen" + voice note start/stop), and the auth pages (sign-in success/fail).

## In-app notification store (v0.3.2)

`lib/client/notifications.ts` is the canonical client-side store. Backs the bell icon in `<AppHeader>` (where wired) and drives the Tickets-tab badge in `<BottomNav>`.

**Three `NotificationKind`s:**

```ts
type NotificationKind = "validation" | "draft" | "submit";
const TICKETS_BUCKET: NotificationKind[] = ["validation", "draft", "submit"];
```

**API:**

| Function | Purpose |
|---|---|
| `addNotification({id, appealId, kind, title, body?})` | Push a new notification. Idempotent on `id` — re-adding updates the existing row in place. Fires the native browser notification as a side effect. Caps the store at 50 most-recent. |
| `listNotifications()` | Read the full list (newest first). |
| `unreadCount()` / `unreadCountForKinds(kinds)` | Counters for the bell + per-tab badge. |
| `markRead(id)` / `dismissNotification(id)` / `clearAllNotifications()` | Mutations. |
| `clearKinds(kinds)` | Bulk-clear by kind. Called when the user opens the relevant tab (`/app/tickets` clears the `TICKETS_BUCKET`). |
| `subscribe(listener)` | React-friendly subscription — fires on every mutation + on cross-tab `storage` events. |
| `nativePermission()` / `requestNotificationPermission()` / `shouldOfferNotificationPermission()` | Native-Notification permission helpers. |

**Persistence:** `localStorage["snappeal.notifications"]`. The store is purely client-side — no server endpoint. Cross-tab sync via the `storage` event.

**Native browser notifications** fire from `fireNativeNotification(record)` inside `addNotification()`:

```ts
new Notification("ParkingRabbit", {
  body: `${n.title}${n.body ? ` — ${n.body}` : ""}`,
  icon: "/icon.png",
  tag: n.appealId,  // overwrites earlier per-appeal alerts to avoid noise
});
```

`onclick` focuses the tab and routes to `/app/tickets/<n.appealId>` (which redirects to the smart card on the list).

## `<NotificationWatcher>` (v0.3.2)

Mounted once at the top of `app/app/layout.tsx`. Polls `/api/appeals?sessionId=...` watching for three state transitions per appeal:

| Transition | Notification kind | Title example |
|---|---|---|
| `portalLookup.status` transitions out of `pending` | `validation` | "Council says PCN WE12345678 is paid" / "Validation done — PCN WE12345678" |
| `letterBody` becomes non-null | `draft` | "Your appeal letter is ready — PCN WE12345678" |
| `step` transitions to `generation_failed` | `draft` | "Drafting hit a snag — PCN WE12345678" |
| `appeal.status` transitions out of `submitting` | `submit` | "Appeal filed — PCN WE12345678" / "🎉 PCN cancelled — PCN WE12345678" / "Appeal rejected — PCN WE12345678" |

**Polling cadence:** `FG_INTERVAL_MS = 5_000` while `visibilityState === "visible"`, `BG_INTERVAL_MS = 30_000` when hidden. Re-ticks immediately on `visibilitychange → visible`.

**Backlog suppression:** the very first poll seeds an internal `knownRef: Map<appealId, fingerprint>` without emitting — only deltas observed AFTER the seed pass fire notifications. Prevents a backlog dump every time the user reloads.

**Fingerprint shape:**
```ts
interface AppealFingerprint {
  portalStatus: string;    // appeal.portalLookup?.status ?? "none"
  hasLetter: boolean;      // Boolean(appeal.letterBody)
  step: string;            // appeal.step
  appealStatus: string;    // appeal.status
}
```

## `<NotificationPermissionSheet>` (v0.3.2)

Context-sensitive permission prompt. Asked at the **moment of value** (right after the user kicks off validation / drafting / submission), not on app launch — the higher-grant-rate pattern.

- Bottom-sheet UI: `<Bell>` icon + "Get notified when it's done" headline + three benefit bullets + "Allow notifications" / "Not now".
- Gated on `nativePermission() === "default"` — never double-asks once granted or denied.
- "Not now" persists in **sessionStorage** under `snappeal.notifications.prompt.dismissed`. Re-asks once per session — the prior `localStorage` pattern silently suppressed forever, which broke load-bearing notifications for returning users. Migrates the old localStorage flag on first sight.
- Triggered by callers passing a `trigger` tick counter prop — typically incremented when the user taps "I agree to T&Cs" / "Start drafting" / Pay.

## Web Push

### Subscribe

`components/PushPermission.tsx` renders an inline opt-in button (only when push is supported and permission hasn't been granted yet). On grant:

1. `Notification.requestPermission()` → `granted`.
2. `navigator.serviceWorker.register('/sw.js')` registers the worker.
3. `reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VAPID_PUBLIC_KEY })` produces a subscription.
4. POST the subscription JSON to `/api/push/subscribe` which stores it on `users.notificationPrefs.push`.

### Deliver

Inbound mail webhook (`/api/inbound`) classifies the council reply, updates `appeals.status`, and **(planned)** fires a push to the user whose appeal it was. The payload contract:

```ts
{ title: "Westminster cancelled your appeal 🎉",
  body: "PCN WC12345678 has been cancelled — open to see the full reply.",
  url: "/app/tickets/<id>",
  tag: "appeal-<id>" }
```

(The Inbox tab was retired in v0.3.2; council replies surface inline on the smart card now.)

`public/sw.js` handles `push` events and shows a system notification; `notificationclick` focuses an existing tab or opens the URL.

### Env

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Browser-side application server key for `pushManager.subscribe` |
| `VAPID_PRIVATE_KEY` | Server-side, used by `web-push` (TBD) to sign outbound notifications |

Generate a key pair with `npx web-push generate-vapid-keys`. (Previous versions of this doc listed `VAPID_SUBJECT` — it isn't referenced in the codebase and was removed in v0.1.5.)

## Transactional email — pending provider pick

ParkingRabbit sends three transactional email categories:

1. **Submission receipt** — "We submitted your appeal to Westminster" (with council reference + screenshot link).
2. **Council reply digest** — when `/api/inbound` classifies, send a one-line summary email + push.
3. **Care Plan billing events** — Stripe-driven (paid, failed, cancelled).

`lib/server/submission/email.ts` is Resend-compatible; falls back to a stub `<stub-...@appeals.parkingrabbit.com>` message id in dev. Provider pick is a Phase-C v0.2 deliverable (Postmark Inbound is the front-runner because it also handles the inbound parse).

## In-app toasts

ParkingRabbit doesn't use Sonner / react-hot-toast. The `WizardSheet` covers the "thing happened" UX — full-screen, focused, dismissible. For lighter feedback (network failure, "Saved ✓"), we use inline error/success boxes in each screen rather than a toast layer. Keeps the platform feel.

## Open work

- `web-push` server library wired so `/api/inbound` actually fires notifications.
- Per-user notification prefs editable in `/app/profile/notifications` (UI exists, persistence-to-user-record pending).
- Email provider pick + DNS for `appeals.parkingrabbit.com`.
- Apple Wallet pass updates (separate channel — see `architecture/apple-wallet.md` TBD).
