# Product overview

Last refreshed **2026-05-27 (v0.3.10)**.

**ParkingRabbit is a single-card mobile app for appealing a London parking ticket.**

The user opens the app, snaps a photo of their Penalty Charge Notice, picks the situations that match their case from a deep grounds quiz, speaks (or types) a couple of sentences about what happened, pays £2.99, and ParkingRabbit drafts a formal representation letter — citing the correct statutory ground and contravention code, addressed to the right council, framed using a private knowledge base of past wins — and submits it through the council's online portal via a headless Claude + Playwright MCP agent. Email is the fallback channel when a council isn't automated yet.

The whole journey happens on **one page** (`/app/tickets`) on **one card** (`<TicketCard>`). The card morphs through every state — `processing` → `pending_review` → `validating` → `needs_decision` → `gathering_evidence` → `drafting` → `letter_ready` → `submitting` → `submitted` — without a single full-page blocker or route push.

## The five-tap journey

```
TAP 1 — SCAN
    Centre Scan FAB in the bottom nav (or Home "Scan PCN" hero)
    Land on /app/scan — animated scanner preview frame + three buttons:
      Camera (primary) · Upload picture · Input manually
    Pick a path → uploadPcn(dataUrl) → router.push("/app/tickets?expand=<id>")
    Land on /app/tickets with the new card auto-expanded
    <ScanningOverlay> animates over the image preview while OCR reads it
    Smart card renders state via <TicketLifecycleTimeline>:
    Step ✓ Photo uploaded · Step (active) Reading PCN... · Step (upcoming) ...

TAP 2 — VALIDATE
    OCR finishes → card flips to `pending_review` with 3 editable fields
    (PCN ref · vehicle reg · council picker)
    Customer taps "I agree to Terms & Conditions"
    pcn_lookup job fires in parallel — read-only Claude+Playwright MCP agent
    walks the council portal, reads the verdict (open / paid / closed / not_found
    / expired / unknown), uploads warden photos to Vercel Blob
    Card flips to `validating` with a live agent-thought stream (4 KB-padded
    SSE through Cloudflare)

TAP 3 — DECIDE
    Verdict lands → card flips to `needs_decision`
    Recommendation surface: "Appeal £2.99" · "Pay yourself" · "Rabbit Pay (Coming soon)"
    + stage-aware banner if appeal-expired / Charge Certificate / Order for Recovery
    Tap "Appeal with Rabbit" → preferred_method = 'portal' →
    card flips to `gathering_evidence`

TAP 4 — PICK GROUNDS + DICTATE
    Three-step <StepBlock> ladder inside the card body:
      1 · Pick your grounds   — opens fullscreen <GroundsQuizSheet>
                                (75 cards · 12 collapsible categories ·
                                 fuzzy search · "Suggested for code N" pills)
      2 · Add details         — <DictationPanel> with mm:ss timer, pause/resume,
                                guidance chips derived from picked cards
      3 · Review & start drafting

    Guest sign-up gate fires here: tap "Start drafting" as a guest →
    grounds persisted to the appeal row → redirect to /sign-up?next=...

    Signed in → POST /api/generate-stream → card flips to `drafting`
    Letter streams word-by-word; strength score (0–100) lands as a
    separate SSE `event: strength` frame.

TAP 5 — PAY & SUBMIT
    `letter_ready` state. Letter rendered with collapsible <LetterPreview>.
    Strength badge:
        ≥ 80 → green "Strong appeal — N/100"
        50–79 → amber "Solid appeal — N/100"
        < 50  → red <aside> ABOVE the Pay button with rationale +
                up to 3 evidence-improvement asks; button rebrands to
                "Submit anyway for £2.99"
    Tap pay → Stripe PaymentSheet (Apple Pay · Google Pay · card)
    Webhook confirms → POST /api/submit → enqueue submit_appeal job →
    card flips to `submitting` with live "Watch live" disclosure
    (auto-expands; MCP agent already prewarmed at worker boot)
    Portal automation completes → card flips to `submitted` with council
    reference + screenshot
```

That's the whole product. Everything else is implementation detail.

## What it isn't

- **It isn't a chatbot.** There's no "tell us about your case" interview. The card grid + dictation are the input.
- **It isn't a subscription.** £2.99 once, non-refundable — you're paying for the appeal we draft and submit, not for the outcome. (A Care Plan subscription exists for power users with multiple vehicles, but it's opt-in and additive.)
- **It isn't legal advice.** We draft representations and submit them on your behalf; we don't represent users at a tribunal hearing.
- **It isn't a generalist tool.** London PCNs only. Bus lane / moving traffic / ULEZ are on the roadmap, not in v0.3.

## What it must feel like

A user who has just walked back to their car, saw the ticket, took a photo, and is now standing on the kerb in the rain with one hand free — that user must be able to finish the appeal before they get to the Tube station. Every design decision is judged against that scenario:

- **One card, one page.** Nothing routes away. Refreshing the browser or coming back later lands on the same card mid-flow.
- **No full-page blockers.** Every lifecycle state (validating, drafting, submitting) renders inline inside the card; live agent thoughts stream into the card, not over it. OCR uses the v0.3.3 `<ScanningOverlay>` mounted **inside** the image preview (animated scan-line + corner brackets) — `absolute inset-0` to the preview, not `fixed` to the viewport. The v0.3.2 full-page `<UploadingOverlay>` is retired.
- **The grounds quiz is the question.** No free-text "describe your case" box up front — the customer picks situations that match, the drafter does the legal framing.
- **Voice over typing.** A user with one hand free can hold the phone and talk; `<VoiceNoteButton mode="append">` lets multiple takes stack.
- **Honesty over optimism.** A sub-50 strength score gets a red warning above the Pay button, not buried in fine print. The user can still proceed — but eyes open.
- **You don't have to babysit the page.** v0.3.2 added a background notification system (`<NotificationWatcher>` polling `/api/appeals` 5 s / 30 s) that fires native browser notifications + in-app badges when validation / drafting / submission complete. Permission asked context-sensitively at the moment of value, not on app launch.

## The appeal-strength score

Every draft returns a 0–100 score calibrated to the **evidence base**, not abstract merit. The drafter's system prompt enumerates the calibration: a ground with the right contravention code + matching precedent + a photo + ≥ 50 chars of notes hits the 80s; a ground with no photos and a one-line note caps at 45 server-side, with a "we capped this because no evidence was attached" prefix on the rationale. The card surfaces:

- **Green badge (≥ 80)** — "Strong appeal — N/100" with a sparkle icon. Pay button reads "Submit for £2.99".
- **Amber badge (50–79)** — "Solid appeal — N/100". Same pay button.
- **Red `<aside>` above the Pay button (< 50)** — one-sentence rationale + a bullet list of up to 3 actionable evidence asks ("Add a photo of the suspension sign", "Describe what you saw when you returned to the car"). Pay button rebrands to "Submit anyway for £2.99" — not a hard gate.

The score isn't a gimmick — it's how we keep the product honest. The knowledge base is internal context for the drafter (never cited in the letter body); the score is the user-facing signal that we've looked at their case and not just made the optimistic answer up.
