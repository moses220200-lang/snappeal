# Homepage (desktop / tablet)

The public-facing **marketing homepage** at `snappeal.ai`. What a first-time visitor sees before they install the PWA or open the app. Responsive — designed for desktop, scales down to tablet and mobile via container queries.

Reference: [mockup #1 in mockups.md](../mockups.md#1-marketing-homepage-received-2026-05-19-evening). Implementation copy follows the mockup; brand is rendered as **Snappeal** (the mockup's "AppealMate" wordmark is a designer working name only).

## Layout (desktop, 1280×800+)

```
┌─ NAV ────────────────────────────────────────────────────────────────────────┐
│ Shield-S logo + Snappeal + "We fight your parking tickets"                   │
│                  How it works  Why Snappeal?  Success stories  Pricing  FAQ  │
│                                                          Log in   [Get Started] │
├─ HERO (left col)  ────────────────────────── │ ─ HERO VISUAL (right col) ────┤
│ 🇬🇧 Made for drivers in London  [pill]      │ Phone mockup on PCN photo:    │
│                                              │ • "Hello, Alex 👋"            │
│ Don't pay that **parking ticket** [purple].  │ • Purple in-progress card     │
│ Let us help you appeal.                      │ • 4-step progress timeline    │
│                                              │ • Need help / Contact Support │
│ Snappeal makes it easy to appeal parking     │                               │
│ tickets in London. We guide you step-by-step │ Floating shield badge:        │
│ and create powerful appeals tailored to      │ "Thousands of London drivers  │
│ your case.                                   │  trust Snappeal"              │
│                                              │                               │
│ [Start Your Appeal]  [▶ How It Works]        │                               │
│                                              │                               │
│ ★★★★★ Excellent · 4.7 on Trustpilot ⚠       │                               │
├─ TRUST STRIP (4 cards) ──────────────────────┴──────────────────────────────┤
│ 📄 Expert Appeal   📊 High Success    🛡  No Win,      🔒 Secure &           │
│    Drafters ⚠         Rate ⚠              No Fee ⚠         Private          │
│    (see voice          (no concrete       (CONFLICTS       Data encrypted    │
│     audit notes)        evidence yet)      with £2.99      and never sold.  │
│                                            non-refundable                    │
│                                            — see audit)                      │
├─ HOW IT WORKS (4 steps) ────────────────────────────────────────────────────┤
│ 1. Upload Your Ticket   2. We Build      3. We Submit    4. We Fight.       │
│    Snap or upload          Your Case        Your Appeal    You Win.         │
│    in seconds              We review        We send it     If the council   │
│                            and draft        to the         agrees, the      │
│                                             council ⚠      ticket is        │
│                                             (not "land-    cancelled.       │
│                                             owner")                          │
├─ APP STORE BADGES ──────────────────────────────────────────────────────────┤
│ Download on the App Store ●   Get it on Google Play ●                       │
│ (greyed / "coming soon" until v0.3 native wrappers ship)                    │
├─ FOOTER ────────────────────────────────────────────────────────────────────┤
│ Pricing · FAQ · Privacy · Terms · Contact      © 2026 Snappeal              │
└─────────────────────────────────────────────────────────────────────────────┘
```

⚠ = item conflicts with a locked decision; see [v0-1-mockup-audit.md](../v0-1-mockup-audit.md) section "Homepage mockup conflicts".

## Section specs

### Top nav

- **Identity (left)**: shield-S logo, navy. Wordmark "Snappeal" in Inter 700 navy. Sub-line *"We fight your parking tickets"* in Inter 400 muted — note: this tagline implies a combative "fight" voice that conflicts with the locked "we draft, honest service" voice in [values.md](../../business/values.md). **Pending user reconciliation** — see audit.
- **Centre nav (5 items)**: How it works · Why Snappeal? · Success stories · Pricing · FAQ. Each link is in-page anchor (smooth scroll) or sub-route.
- **Right CTAs**: *Log in* (text-link only on hover; hidden when no accounts shipped — v0.1 has no auth, so this slot becomes empty or moved to v0.2). *Get Started* (filled purple button, deep-links into the install/Camera flow).

### Hero

- **Pill (top of hero)**: 🇬🇧 *Made for drivers in London*. Locked **London-only** per A2 decision — not "the UK" as the mockup shows.
- **Headline (h1)**: *Don't pay that **parking ticket**. Let us help you appeal.* — "parking ticket" rendered in `--snappeal-primary` (purple).
- **Body**: *"Snappeal makes it easy to appeal parking tickets in London. We guide you step-by-step and create powerful appeals tailored to your case."*
- **Primary CTA**: **Start Your Appeal** — filled purple, deep-links into Camera tab in the PWA.
- **Secondary CTA**: **How It Works** with ▶ play icon — outlined purple, scrolls to "How it works" section or opens a 30-second explainer video.
- **Trustpilot block** ⚠: *"Excellent · 4.7 out of 5 on Trustpilot"* with green star block. **Not appropriate at launch** — we have no Trustpilot rating until users review. Mockup shows the long-run target. v0.1 placeholder: omit the Trustpilot block entirely. v0.2+: surface real Trustpilot reviews once we've earned them.
- **Hero visual (right col)**: phone mockup overlaid on the real PCN-on-windscreen photo. Phone shows the in-app home with "Hello, Alex 👋" (placeholder name only — no real account in v0.1), purple "Your appeal is in progress" card, 4-step timeline, "Need help?" support card. Floating shield badge: *"Thousands of London drivers trust Snappeal"* — replace with *"Built for London drivers"* until real volume justifies the claim.

### Trust strip (4 cards)

Below the hero, full-width container with four icon-led cards:

1. **AI-Drafted Appeals** (was "Expert Appeal Writers" ⚠) — *"Snappeal drafts your appeal from your photos and notes — clear, formal, and tailored to the contravention."* Renamed to avoid the "experts" framing locked out by C1.
2. **High Success Rate** ⚠ — *"49.4% of formal appeals in London were upheld in 2024-25\*"* with an asterisk linking to the source (London Councils statistics). **Cannot claim our own success rate until we have outcome data** — use the public benchmark.
3. **No Win, No Fee** ⚠ — **CONFLICTS** with locked £2.99 non-refundable pricing. Either reverse the pricing decision or change this card to *"Pay only £2.99 — one-off, non-refundable"*. **Pending user decision.**
4. **Secure & Private** — *"Your data is encrypted, never sold, and deleted 90 days after your appeal resolves."*

### How it works (4 steps)

Numbered cards, horizontal on desktop, vertical-stacked on mobile:

1. **Upload Your Ticket** — *"Snap a photo of your PCN, or enter it manually."*
2. **We Draft Your Case** (mockup says "We Build Your Case") — *"Our AI reviews the details and writes a clear, formal appeal."*
3. **We Submit Your Appeal** — *"We send your appeal to the issuing council's portal (or by email if their portal's down)."* — **"council"**, not "landowner". The mockup's "landowner" wording is incorrect for the locked council-PCN scope.
4. **We Stay With You** (mockup says "We Fight. You Win.") — *"We notify you when the council responds. If your appeal succeeds, the PCN is cancelled."* — softens "fight/win" to be honest about outcome uncertainty.

### App Store badges

Below How It Works, a centred row with two badges:

- **App Store** — black pill, Apple's official "Download on the App Store" badge ([guidelines](https://developer.apple.com/app-store/marketing/guidelines/)). Asset stored at `public/badges/app-store.svg`.
- **Google Play** — black pill, Google's official "Get it on Google Play" badge ([guidelines](https://play.google.com/intl/en_us/badges/)). Asset at `public/badges/google-play.svg`.

**Status until v0.3**: both badges show with a *"Coming Soon"* ribbon and link to the PWA install prompt. From v0.3 (Capacitor wrappers shipped) they deep-link to the App Store / Play Store listings.

### Footer

Standard: Pricing · FAQ · Privacy · Terms · Contact · *© 2026 Snappeal*. Plus a "Made in London" line and a tiny shield logo.

## Responsive breakpoints

| Breakpoint | Layout |
|---|---|
| `≥ 1280px` (desktop) | Two-column hero, 4-card trust strip horizontal, 4-step how-it-works horizontal |
| `768–1279px` (tablet) | Stacked hero (visual below text), 2×2 trust strip grid, 4-step how-it-works horizontal scroll |
| `≤ 767px` (mobile) | Single column throughout; trust strip becomes vertical cards; how-it-works stacks. CTAs become full-width. The Camera tab is the natural deep-link target on mobile. |

## PWA install prompt

On supported browsers (Chrome / Edge / Safari iOS), the **Get Started** CTA triggers the PWA install prompt rather than opening a separate page. This is the primary distribution mechanism in v0.1/v0.2 — App Store + Play Store come in v0.3.

## Open conflicts pending user reconciliation

The homepage mockup contradicts five locked decisions. Each is captured in [v0-1-mockup-audit.md](../v0-1-mockup-audit.md) as a new finding:

1. *"Expert Appeal Writers"* / *"Our team creates strong, personalised appeals"* — voice conflict with C1.
2. *"No Win, No Fee"* — pricing model conflict.
3. *"We send your appeal to the landowner"* — scope conflict (we do council PCNs, not private parking).
4. *"Made for drivers in the UK"* — scope conflict with A2 (London-only).
5. *"4.7 out of 5 on Trustpilot"* — pre-launch trust signal we haven't earned.

None are blocking the build of the homepage scaffolding — but the user needs to confirm before the copy goes live.
