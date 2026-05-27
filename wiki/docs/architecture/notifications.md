# Notifications

Last refreshed **2026-05-27 (v0.3.10)**.

How ParkingRabbit lets users know when something changes — locally (haptics + confetti + in-app store) and remotely (Web Push + transactional email). The v0.3.9 server-side overhaul added a proper dispatcher + audit log; v0.3.10 added the two-moment prompt gate refinement.

## Layers

| Layer | When it fires | Surface | Implementation |
|---|---|---|---|
| **Haptic feedback** | Tap, success, error, warning, select | Vibration API via `lib/client/haptics.ts → haptic(intent)` | One-line call; no-op when unsupported |
| **Confetti burst** | Appeal flips to `cancelled` | Visual overlay via `components/Confetti.tsx` | sessionStorage-gated to fire once per appeal id |
| **In-app notification store** | Portal-lookup verdict, draft letter ready, submission settling | `lib/client/notifications.ts` + bottom-nav Tickets-tab counter badge | localStorage-backed, capped at 50, idempotent on `id`, three `NotificationKind`s aggregated by `TICKETS_BUCKET` |
| **Native browser notifications** | Same three deltas as above | `new Notification("ParkingRabbit", { tag: appealId })` | Only fires when `Notification.permission === "granted"`; `tag` overwrites earlier per-appeal alerts |
| **`<NotificationWatcher>` poller** | Mounted in `app/app/layout.tsx`; polls `/api/appeals` for state transitions | Pure client-side | 5 s foreground / 30 s `visibilityState === "hidden"`; re-ticks on focus regain |
| **`<NotificationPromptGate>`** (v0.3.9) | Two-moment opt-in — `appealTap` + `submitDone` | Bottom-sheet wrapper around server-backed prefs | Skip-once persists server-side via `/api/users/me/notification-prefs/asked` |
| **Web Push dispatcher** (v0.3.9) | Worker hooks on `pcn_lookup` verdict + `submit_appeal` success/failure + inbound mail classification | `dispatchAppealEvent(event, appealId)` in `lib/server/notifications/dispatchAppealEvent.ts` | `web-push` package + VAPID + 410-Gone cleanup |
| **`notification_dispatches` audit table** (v0.3.9) | EVERY dispatch attempt incl. no-ops | Postgres row per attempt | Ops grep for "why wasn't user X notified?" |
| **Transactional email** | Submission receipt, council reply digest | Provider-agnostic via `lib/server/submission/email.ts` | Resend / Postmark / Brevo / SES |

## Server-side dispatcher (v0.3.9)

`dispatchAppealEvent(event, appealId)` in `lib/server/notifications/dispatchAppealEvent.ts` is the single orchestrator. Called from:

- The `pcn_lookup` worker handler on verdict success/failure → `validation_done` / `validation_failed`.
- The `submit_appeal` worker handler on success/failure → `submission_done` / `submission_failed`.
- `/api/inbound` after classifying an inbound council reply → `council_replied`.

Flow:

1. **Load the appeal**. If missing, log `result: 'no_appeal'` and return.
2. **Load the owner**. If guest (no `userId`), log `result: 'no_owner'` and return.
3. **Check notification prefs** (`isTogglePassed(userId, event)`). If toggle is off for this event, log `result: 'toggle_off'` and return.
4. **Check VAPID keys** present. If `NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` aren't configured, log `result: 'no_vapid'` and return.
5. **Check stored subscription**. If the user has no `notification_prefs.push.subscription`, log `result: 'no_subscription'` and return.
6. **Format payload** via the per-event COPY registry (`lib/server/notifications/copy.ts`).
7. **Send** via `sendPush(subscription, payload)` from `lib/server/push.ts`. On 410-Gone (subscription expired), clear it from the user's prefs. On 4xx/5xx, log `result: 'send_failed'`. On success, log `result: 'sent'`.
8. **Log to `notification_dispatches`** in EVERY branch — sent, toggle off, no subscription, no VAPID, send failed, send gone, no owner, no appeal.

The dispatcher is best-effort — it never throws to break the caller's primary work. The audit table is the recovery path.

### COPY registry

`lib/server/notifications/copy.ts` exports one function per event, each returning a `PushPayload`:

```ts
type PushPayload = {
  title: string;     // <55 chars (iOS truncates)
  body: string;      // <110 chars
  url: string;       // deep-link, e.g. /app/tickets?expand=<appealId>
  tag: string;       // appeal:<appealId> — OS-level dedup; same appeal replaces prior push
};
```

Five events:

- `validation_done` — "Council confirmed your PCN" / "PCN already paid" / "PCN not found"
- `validation_failed` — "We couldn't reach the council"
- `submission_done` — "Appeal filed with Westminster · ref RX12345"
- `submission_failed` — "Filing hit a snag — tap to try again"
- `council_replied` — "Westminster cancelled your appeal 🎉" / "Westminster wants more evidence"

Context the COPY functions consume: `appeal.councilSlug` (for council name), `appeal.ticket.pcnRef`, `appeal.ticket.amountPence`, `daysLeftToAppeal`, `inbound.classification`.

### `notification_dispatches` audit

Schema in [`data-model.md`](data-model.md). One row per `dispatchAppealEvent` call, regardless of outcome. The admin notifications page (`/admin/notifications`) reads this with filters (event, result, 7-day stats) so ops can:

- See the full event stream for a specific user (`userId` filter).
- See every notification attempt for a specific appeal (`appealId` filter).
- See per-event success/failure rates (the dashboard).
- Spot regressions (`result='send_failed'` spike).

## Two-moment prompt gate (v0.3.9)

`<NotificationPromptGate>` (`components/NotificationPromptGate.tsx`) wraps the moments where we ask for push permission:

1. **`appealTap`** — fires after the user picks Appeal £2.99 on `needs_decision`. The lookup is in flight; the customer is waiting; this is the right time to offer to ping them when it lands.
2. **`submitDone`** — fires after a successful submission. The council has the letter; the customer is on the confirmation surface; this is the right time to offer to ping them when the council replies.

Skip-once persists **server-side** via `/api/users/me/notification-prefs/asked` (not localStorage like v0.3.2's version). One row per `(userId, moment)`. Re-ask after 30 days or never (per user pref). The pattern: asks at the moment of value, not on app launch — higher grant rate.

Gated on `nativePermission() === "default"` — never double-asks once granted or denied.

## In-app notification store (client)

`lib/client/notifications.ts` is the canonical client-side store. Backs the bell icon in `<AppHeader>` (where wired) and drives the Tickets-tab badge in `<BottomNav>`.

**Three `NotificationKind`s:**

```ts
type NotificationKind = "validation" | "draft" | "submit";
const TICKETS_BUCKET: NotificationKind[] = ["validation", "draft", "submit"];
```

**API:**

| Function | Purpose |
|---|---|
| `addNotification({id, appealId, kind, title, body?})` | Push a new notification. Idempotent on `id`. Fires native browser notification as a side effect. Caps the store at 50 most-recent. |
| `listNotifications()` | Read full list (newest first). |
| `unreadCount()` / `unreadCountForKinds(kinds)` | Counters. |
| `markRead(id)` / `dismissNotification(id)` / `clearAllNotifications()` | Mutations. |
| `clearKinds(kinds)` | Bulk-clear by kind. Called when the user opens the relevant tab. |
| `subscribe(listener)` | React-friendly subscription — fires on mutation + cross-tab `storage` events. |
| `nativePermission()` / `requestNotificationPermission()` | Native permission helpers. |

Persistence: `localStorage["parkingrabbit.notifications"]`. Cross-tab sync via the `storage` event.

## `<NotificationWatcher>`

Mounted once at the top of `app/app/layout.tsx`. Polls `/api/appeals?sessionId=...` watching for three state transitions per appeal:

| Transition | Notification kind |
|---|---|
| `portalLookup.status` transitions out of `pending` | `validation` |
| `letterBody` becomes non-null OR `step === 'generation_failed'` | `draft` |
| `appeal.status` transitions out of `submitting` | `submit` |

Polling cadence: 5 s foreground / 30 s when hidden. Re-ticks on `visibilitychange → visible`. Backlog suppression on first poll (seeds the `knownRef` map without emitting). This is the client-side complement to the server-side dispatcher — the client store + native notification are always-on; Web Push is the cross-session channel.

## Web Push subscribe flow

`components/PushPermission.tsx` renders the inline opt-in (only when push is supported and permission hasn't been granted). On grant:

1. `Notification.requestPermission()` → `granted`.
2. `navigator.serviceWorker.register('/sw.js')`.
3. `reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VAPID_PUBLIC_KEY })`.
4. POST the subscription JSON to `/api/users/me/notification-prefs` which writes it to `users.notification_prefs.push.subscription`.

`public/sw.js` handles `push` events and shows a system notification; `notificationclick` focuses an existing tab or opens the `url` from the payload.

## VAPID env

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Browser-side application server key for `pushManager.subscribe` |
| `VAPID_PRIVATE_KEY` | Server-side, used by `web-push` to sign outbound notifications |

Generate with `npx web-push generate-vapid-keys`. Until both are set, `dispatchAppealEvent` logs every attempt as `result: 'no_vapid'` — the dispatcher still runs (audit row written), nothing is sent.

## Transactional email

Three categories:

1. **Submission receipt** — "We submitted your appeal to Westminster" (with council reference + screenshot link).
2. **Council reply digest** — when `/api/inbound` classifies, send a one-line summary email.
3. **Care Plan billing events** — Stripe-driven.

`lib/server/submission/email.ts` is provider-agnostic; falls back to a stub `<stub-...@appeals.parkingrabbit.com>` message-id in dev. Provider pick is on the external-action TODO list.

## Open work

- Per-user notification prefs are server-backed; the UI at `/app/profile/notifications` lets users flip each toggle.
- Email provider pick + DNS for `appeals.parkingrabbit.com` (see [`../todo.md`](../todo.md)).
- Apple Wallet pass updates — separate channel, not yet built.

## Cross-refs

- The audit-log table: [`data-model.md`](data-model.md) → `notification_dispatches`.
- The admin dashboard for the audit log: [`admin.md`](admin.md) → `/admin/notifications`.
- The events the worker fires from: [`submission-engine.md`](submission-engine.md), [`job-queue.md`](job-queue.md).
- Per-user prefs storage: [`auth.md`](auth.md) → `users.notification_prefs`.
