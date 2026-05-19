# Notifications

How Snappeal lets users know when something changes — locally (haptics + confetti) and remotely (Web Push).

## Layers

| Layer | When it fires | Surface | Implementation |
|---|---|---|---|
| **Haptic feedback** | Tap, success, error, warning, select | Vibration API via `lib/client/haptics.ts → haptic(intent)` | One-line call; no-op when unsupported |
| **Confetti burst** | Appeal flips to `cancelled` | Visual overlay via `components/Confetti.tsx` | Pre-computed particles, sessionStorage-gated to fire once per appeal id |
| **In-app toast / overlay** | AI photo coach result, "Strengthen my notes" preview, post-payment generation | `components/WizardSheet.tsx` (reusable bottom-sheet) | Same navy-glass aesthetic as the first-launch wizard |
| **Web Push** | Council reply parsed by `/api/inbound` | Service worker `public/sw.js` + `components/PushPermission.tsx` | VAPID + `PushManager.subscribe`, subscription stored on `users.notificationPrefs` |
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

Used inline through the capture flow (extract success/fail), the paywall (button taps), the notes screen ("Strengthen" + voice note start/stop), and the auth pages (sign-in success/fail).

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
  body: "PCN WC12345678 has been cancelled — full details in your Inbox.",
  url: "/app/inbox",
  tag: "appeal-<id>" }
```

`public/sw.js` handles `push` events and shows a system notification; `notificationclick` focuses an existing tab or opens the URL.

### Env

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Browser-side application server key for `pushManager.subscribe` |
| `VAPID_PRIVATE_KEY` | Server-side, used by `web-push` (TBD) to sign outbound notifications |
| `VAPID_SUBJECT` | `mailto:` URL for the VAPID identity |

Generate a key pair with `npx web-push generate-vapid-keys`.

## Transactional email — pending provider pick

Snappeal sends three transactional email categories:

1. **Submission receipt** — "We submitted your appeal to Westminster" (with council reference + screenshot link).
2. **Council reply digest** — when `/api/inbound` classifies, send a one-line summary email + push.
3. **Care Plan billing events** — Stripe-driven (paid, failed, cancelled).

`lib/server/submission/email.ts` is Resend-compatible; falls back to a stub `<stub-...@appeals.snappeal.ai>` message id in dev. Provider pick is a Phase-C v0.2 deliverable (Postmark Inbound is the front-runner because it also handles the inbound parse).

## In-app toasts

Snappeal doesn't use Sonner / react-hot-toast. The `WizardSheet` covers the "thing happened" UX — full-screen, focused, dismissible. For lighter feedback (network failure, "Saved ✓"), we use inline error/success boxes in each screen rather than a toast layer. Keeps the platform feel.

## Open work

- `web-push` server library wired so `/api/inbound` actually fires notifications.
- Per-user notification prefs editable in `/app/profile/notifications` (UI exists, persistence-to-user-record pending).
- Email provider pick + DNS for `appeals.snappeal.ai`.
- Apple Wallet pass updates (separate channel — see `architecture/apple-wallet.md` TBD).
