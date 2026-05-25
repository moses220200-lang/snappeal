# User flow

Launch shape (v0.3.3): **Tap BottomNav Scan FAB → `/app/scan` (three buttons: Camera / Upload picture / Input manually) → pick a path → `uploadPcn()` → land on `/app/tickets` with the new card auto-expanded → `<ScanningOverlay>` animates over the image preview while OCR reads it → smart card carries every lifecycle state inline via `<TicketLifecycleTimeline>`**. There is no separate "Add a ticket" page and no per-ticket detail page — `/app/tickets/[id]` is a redirect to `/app/tickets?expand=<id>`. Every state (processing, validating, gathering evidence with the **three-step `<StepBlock>` ladder**, drafting, ready, submitting, submitted, plus the 5 v0.3.3 failure states) renders on the single `<TicketCard>` on `/app/tickets`. Live agent thoughts stream over SSE with v0.3.1's 4 KB-padded Cloudflare-safe delivery (no more 8–20 s clumping); the MCP browser is prewarmed at worker boot so the first submission of a fresh deploy starts in the same ~5 s as the hundredth. v0.3.2 added a background notification system (`<NotificationWatcher>` mounted in `app/app/layout.tsx`, polls `/api/appeals` every 5 s in foreground / 30 s when the tab is hidden) so the user gets a native browser notification + an in-app badge when validation completes, the draft lands, or the submission settles — without keeping the page in front of them.

```mermaid
flowchart TD
    Start([User receives PCN]) --> Home[Home — three tiles: Scan PCN / Challenge / Pay]
    Home -->|tap Scan PCN| Tickets[/app/tickets?scan=1 — picker auto-opens]
    Tickets -->|pick photo| Processing[Card mounts in 'Processing' — image + 3-row pipeline checklist]
    Processing -->|OCR settles| Review[Pending review — image + 3 editable fields + I agree]
    Review -->|tap I agree| Validating[Validating — live agent caption streams on the card]
    Validating -->|verdict open| Recommend[needs_decision — Appeal / Pay yourself / Rabbit Pay Coming Soon]
    Recommend -->|tap Appeal with Rabbit| Grounds[Gathering evidence — inline 75-card grounds picker]
    Grounds -->|pick ≥1 reason| Dictation[DictationPanel — textarea + voice + guidance chips]
    Dictation -->|tap Start drafting + signed in| Review[Step 3 — Review and start drafting]
    Review --> Draft[Drafting — passive 'we'll notify you']
    Dictation -.->|tap Start drafting + guest| SignUpGate[/sign-up?next=...&resumeDraft=1]
    SignUpGate -.->|after sign-up| Dictation
    Draft -->|letter ready| LetterReady[Ready to submit — strength badge + £2.99 CTA]
    LetterReady -->|score < 50| WeakWarn[Red weak-appeal banner above CTA]
    WeakWarn --> Submit[PaymentSheet £2.99]
    LetterReady --> Submit
    Submit -->|/api/submit → submit_appeal job| Filed[Submitting → Submitted — green confirmation]
    Filed --> Done([Council reply lands in inbox])

    Recommend -.->|stage = appeal_expired| Expired[Amber 'Appeal period expired' card + Pay yourself primary]
    Recommend -.->|stage ∈ Charge Cert / Order for Recovery / Enforcement| Escalated[Red escalation card + Pay yourself only]
    Recommend -.->|stage = paid/cancelled/closed| Terminal[Terminal card — no CTAs]

    style Processing fill:#eff6ff,color:#0a1f3a,stroke:#007aff,stroke-width:2px
    style Filed fill:#16a34a,color:#ffffff
    style Expired fill:#fef3c7,color:#92400e
    style Escalated fill:#fee2e2,color:#991b1b
    style Terminal fill:#f4f4f5,color:#52525b
    style SignUpGate fill:#fef3c7,color:#92400e,stroke-dasharray:4 2
```

Every state above renders on the **same smart `<TicketCard>` on `/app/tickets`**. There are no intermediate routes — `/app/validating/[jobId]`, `/app/submitting/[id]`, `/app/capture`, and **`/app/tickets/[id]`** (removed in v0.3.0; now a redirect to `/app/tickets?expand=<id>`) were deleted across v0.2.13–v0.3.0. On mobile UAs hitting `/`, `apps/web/proxy.ts` rewrites the URL to `/app` so users land directly on the Home screen without seeing the marketing landing.

## Step 1 — Add a ticket (via `/app/scan`)

**Screen prompt:** *"Scan PCN — take a photo, upload, or type the details."*

- **BottomNav Scan FAB → `/app/scan`** (v0.3.3). The centre camera FAB is a plain `<Link href="/app/scan" aria-label="Scan a new ticket">`. The v0.3.2 inline-file-picker pattern (FAB owned a hidden `<input type="file">` + opened it inside the same gesture) is retired — tapping a camera icon and getting a system sheet with no context was opaque. Now every Scan tap lands on the same explicit page.
- **`/app/scan` page layout** (`app/app/scan/page.tsx`):
  - **AppHeader** at the top (no back button — top-level destination).
  - **Title + subtitle**: "Scan PCN" + "Take a photo of your parking ticket or choose another method."
  - **Animated scanner preview frame** — `aspect-[4/5]` dark glass card with the `snappeal-hero-scan` keyframe sweep + four corner brackets + radial ambient glow + subtle grid overlay + centre Camera icon + "Position the PCN in the frame" copy. Visual only — actual capture fires when the user taps a button below.
  - **Three explicit buttons** in priority order:
    1. **Camera** (primary, blue) — fires the hidden `<input type="file" capture="environment">` to launch the OS camera.
    2. **Upload picture** (secondary white card) — fires the hidden `<input type="file">` (no `capture`) for library picks.
    3. **Input manually** (secondary white card) — `<Link href="/app/manual-entry">` for the no-photo path.
  - **Inline error pill** below the buttons surfaces a red `text-[12px]` line if the upload throws.
- **Camera + Upload flow** (`lib/client/uploadPcn.ts`): `readFileAsDataUrl(file)` → `POST /api/appeals` (creates a fresh appeal owned by the current session — guests are first-class) → `PATCH /api/appeals/[new-id]` with `pcnImageUrl` → `POST /api/extract` (fire-and-forget) → `router.push("/app/tickets?expand=<appealId>")`. The user lands on the smart card immediately; OCR runs in the background and the `<ScanningOverlay>` animates over the image preview inside the card body until OCR settles.
- **`<ScanningOverlay>` animated veil** (v0.3.3). Replaces v0.3.2's full-page `<UploadingOverlay>`. `absolute inset-0` to the image preview (not `fixed` to the viewport): soft blue veil + vertical sweep scan-line with glow shadow + four white corner brackets + centre-bottom navy pill `<span>Scanning PCN…</span>` with a pulsing primary dot. No full-page chrome, no caption ticker — a tasteful "we're reading this right now" signal that doesn't blackbox the page.
- **`/app/tickets` upload-entry path** (legacy). The list page still reads the `?scan=1` query on mount and auto-triggers a file input for backwards compatibility with the v0.2.18 entry; `history.replaceState` strips the param so a refresh doesn't re-trigger. New users hit `/app/scan` instead.
- **No more separate capture page.** `/app/capture` is a 5-line server-side redirect to `/app/tickets?scan=1` for back-compat links.

## How state renders — `<TicketLifecycleTimeline>` (v0.3.3)

Every state inside the smart card is drawn by `<TicketLifecycleTimeline>` (`components/TicketLifecycleTimeline.tsx`) — a single vertical journey from upload → resolution that replaces v0.3.2's `<TicketJourney>` 3-step stepper (now dead code on disk).

Per-step contract:

- **Rail dot**: green check (done), pulsing primary dot with halo (active), hollow outline (upcoming), amber `<AlertTriangle>` (failed — new in v0.3.3). All `size-5` (was `size-6` in `<TicketJourney>`).
- **Connector line below the dot**: green when this step is done, amber when failed, muted primary at 40% alpha when active, muted grey when upcoming.
- **Title** + optional `supporting` line + optional `detail` ReactNode (richer single-line content) + optional `busy` spinner on the active step.
- **`children: ReactNode`** (new in v0.3.3) — mounted directly under the title when the step is active. Used to render the uploaded image preview (with `<ScanningOverlay>` inside during OCR), the inline Pick-your-grounds quiz, the Pay / appeal choice tiles, the streaming letter preview, status / error messages.
- **`tint: "warn" | "danger"`** (new in v0.3.3) — wraps `children` in a soft `amber-50` / `red-50` rounded panel for deadline rows + failure rows. Unset → no card background (avoids the "card inside a card" look when the children are themselves a card).
- **`childrenFullBleed: boolean`** (new in v0.3.3) — when true, `children` escape the rail+gap indent (`-ml-9`) so action tiles render edge-to-edge inside the card (matching the footer's width). Used by the Pay / appeal choice surface.

The numbered step badges from `<TicketJourney>` are gone — position in the list is the position, and the numbers were redundant once `children` made each row big.

## Failure states (v0.3.3)

5 new `CardKind`s surface recoverable error states on the same `<TicketLifecycleTimeline>` (typically as `failed`-status steps with `tint: "warn"`):

| CardKind | Trigger | Recovery surface |
|---|---|---|
| `image_issue` | OCR ran but the photo doesn't look like a PCN | Retake / Upload a different photo |
| `image_unclear` | OCR ran but the read was low-confidence | Per-field uncertainty + Retake / Edit manually |
| `info_needed` | OCR succeeded but a required field is missing | Inline editable rows for the missing fields |
| `extraction_failed` | OCR errored or timed out | Retry / Enter manually |
| `council_lookup_failed` | `pcn_lookup` portal check errored or timed out | Retry / Continue without validation |

All five are recoverable in-card — the user never has to navigate away to fix a problem.

## Step 2 — Smart ticket card (state-machine surface)

!!! info "v0.3.1 update — three-step gathering ladder"
    The `gathering_evidence` body is now a numbered **`<StepBlock>` ladder**: **1 · Pick your grounds** (opens `<GroundsQuizSheet>`), **2 · Add details** (`<DictationPanel>` — unlocks after step 1), **3 · Review & start drafting** (unlocks after step 2 has either typed notes or at least one ground picked). Each completed step gets a green check. The smart card carries every lifecycle state — scanning, processing, pending_review, validating, needs_decision, gathering_evidence, drafting, letter_ready, submitting, submitted, terminal — via `lib/deriveCardState.ts`.

The customer's primary surface. The state machine derives from three things: the portal-lookup state, the issuer-connector status snapshot's `stage`, and the appeal record's `preferredMethod`/`letterBody`/`status`. `lib/deriveCardState.ts` is the single pure function; the smart card on `/app/tickets` reads it.

| Stage / state | What renders |
|---|---|
| `portal_lookup.status === "pending"` | Passive **"Validating with the council"** banner. Optional "Watch live →" link if admin has enabled the MCP live view. |
| No status snapshot yet | Passive **"Checking your ticket"** banner. |
| `stage` ∈ `{discount_active, appeal_open}` | `<ReviewRecommendation>` — Appeal with Rabbit (PAID, primary) + Pay yourself (FREE, secondary) + Rabbit Pay (+£1.99, Coming soon). Deadline countdown on the Appeal CTA. |
| `stage` = `appeal_expired` | Same card with the Appeal action hidden and an amber **"Appeal period expired"** banner. Pay yourself promotes to primary. |
| `stage` ∈ `{charge_certificate_issued, order_for_recovery, enforcement}` | Red **escalation card** with the stage title + current amount due (+ council fee where known) + Pay yourself only. Rabbit Pay stays disabled. |
| `stage` ∈ `{appeal_submitted, under_review}` | Calm **"Council reviewing your appeal"** card; no actions. |
| `stage` ∈ `{paid, cancelled, closed}` | Terminal card — green for paid/cancelled, neutral for closed. Hide all CTAs. |
| Method picked, no letter yet | Passive **"Drafting your appeal letter"** banner. |
| Letter ready, method = portal | "Submit appeal for £2.99" CTA → `<PaymentSheet>` → existing MCP submission flow. |
| `appeal.status` is submitting/submitted/etc. | Green **"Filed with the council"** confirmation; optional "Watch live →" link to the live MCP submission view. |

**Recommendation card actions (when stage allows appeal):**

| Action | CTA | Copy | What happens |
|---|---|---|---|
| **Appeal with Rabbit** *(PAID)* | "Start appeal →" | "Rabbit reviews your PCN, drafts the appeal, prepares your evidence, and helps you submit it." | Stamps `preferred_method=portal`, kicks off drafting in the background, surfaces the notification permission sheet. Customer waits on the ticket page for the letter-ready notification. |
| **Pay yourself** *(FREE)* | "Open payment page →" | "Open the official {council} payment page and settle directly." | Opens `statusSnapshot.paymentUrl ?? council.appealPortalUrl` in a new tab. We never touch funds. |
| **Pay instantly with Rabbit (+£1.99)** | — | "Rabbit will pay the ticket for you instantly after confirmation." | **Disabled** `<div aria-disabled>` with dashed border + "Coming soon" pill. No onClick handler. See [`business/payment-strategy.md`](../business/payment-strategy.md). |

**Acceptance criteria:**
- The Appeal with Rabbit CTA is hidden when the connector returns `canAppeal: false`.
- The Pay yourself CTA falls back to a disabled "Pick your council first" state when the council slug is unknown.
- Pay instantly with Rabbit is always disabled at launch.
- Terminal stages (paid/cancelled/closed) hide every CTA — no encouragement to do anything further.
- Mock-connector snapshots surface a "Preview · connector not live yet" pill so the customer never sees a fake authoritative verdict.

## Background notifications (v0.3.2)

ParkingRabbit's background flows (portal-lookup validation, AI drafting, MCP submission) take **30 s – 5 min** of wall-clock. v0.3.2 makes that wait survivable without parking on the page:

- **`<NotificationWatcher>`** is mounted once at the top of `app/app/layout.tsx` and polls `/api/appeals?sessionId=...` every **5 s when the tab is visible / 30 s when hidden**. It fingerprints each appeal as `{ portalStatus, hasLetter, step, appealStatus }` and emits a notification on three deltas: portal-lookup status leaving `pending`, `letterBody` becoming non-null (or `step` becoming `generation_failed`), and `appeal.status` leaving `submitting`. The very first poll seeds the known-state map silently — no backlog dump on reload. Re-ticks immediately when the tab regains focus.
- **`<NotificationPermissionSheet>`** is the bottom-sheet that asks for native-Notification permission. It's **context-sensitive** — fired at the moment the user kicks off validation / drafting / submission, not on app launch (the higher-grant-rate pattern). Three benefit bullets, "Allow notifications" / "Not now". "Not now" persists in sessionStorage so the prompt re-asks once per session rather than silently suppressing forever.
- **Native browser notifications** fire via `new Notification("ParkingRabbit", { body, icon: "/icon.png", tag: appealId })`. The `tag: appealId` overwrites earlier per-appeal alerts so the user doesn't get a stack on a single ticket's transitions. `onclick` focuses the tab and routes to `/app/tickets/<id>` (which redirects to the smart card).
- **In-app notification store** (`lib/client/notifications.ts`) backs the bottom-nav Tickets-tab counter badge. Three `NotificationKind`s — `validation` / `draft` / `submit` — aggregated by `TICKETS_BUCKET`. Store is localStorage-backed, capped at 50 most-recent, idempotent on `id`. Visiting `/app/tickets` calls `clearKinds(TICKETS_BUCKET)`.

The notification system is pure client-side polling — no Web Push provider is required at launch. Web Push (`public/sw.js` + `/api/push/subscribe`) remains scaffolded for a future cross-session push channel; today the polling delivers the same UX while the user is still in a session.

## What's free vs paid

| Free at launch | Paid (£2.99 per appeal) | Future |
|---|---|---|
| Scan, OCR, status check, deadline tracking, Pay-yourself deep-link, ticket memory, background notifications | AI appeal analysis + drafting + evidence pack + guided submission + auto-submit + appeal tracking | Rabbit Pay (+£1.99), fleet dashboard, employer reimbursement, recurring tickets, automated connectors, advanced dispute workflows |

Free email submission was briefly tried in v0.2.11 and removed in v0.2.12 — the paid AI appeal IS the product; email-to-the-council survives only as an internal portal-fallback inside `runSubmission` for non-automated councils.
