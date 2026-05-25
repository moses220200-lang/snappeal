# Brand

The visual and verbal system. Used by the wiki, the admin panel, and the customer app — same tokens, same voice, same name.

## Name

**ParkingRabbit.**

One word, camel-case. *Parking* anchors the category (so the brand never has to spell out what it's for) and *Rabbit* signals speed + agility — hopping past the bureaucratic friction councils throw at PCN recipients. Reads naturally in both customer copy ("ParkingRabbit drafted my appeal in 30 seconds") and code (component prefix `ParkingRabbit*`, CSS tokens stay `snappeal-*` for legacy reasons — see Implementation note below).

> **History.** The brand was renamed from `Snappeal` on 2026-05-21 (v0.2.0 pivot) when the product scope widened from "challenge a ticket" to a parking-ticket management app (pay, challenge, track). Earlier docs may still reference the old name; the rename was repo-wide for user-visible strings but intentionally left CSS tokens (`--color-snappeal-*`), component identifiers (`SnappealMark` / `SnappealLogo` / `SnappealSplash`), and the `snappeal-*` Tailwind aliases in place to keep the diff small.

**Canonical domain**: `parkingrabbit.com`. Inbound mail for per-appeal aliases is `<appeal-id>@appeals.parkingrabbit.com`. DNS provisioning is still pending — see `architecture/deployment.md`.

For App Store listings and SEO landing pages we may use the longer descriptor *"ParkingRabbit — pay or challenge a London parking ticket"* to capture high-intent searches. In the app chrome itself and in conversation, just **ParkingRabbit**.

## Form factor

ParkingRabbit is a **responsive PWA** — installable on iOS and Android home screens, and also rendered as a desktop / tablet experience for the same domain. The product itself is mobile-first, but the public marketing surface (homepage, pricing, FAQ, success stories) is designed-for-desktop and downsizes responsively. From v0.3 the PWA is wrapped via Capacitor for App Store + Play Store.

The marketing landing lives at `apps/web/app/page.tsx` (canonical source) — the previous v0.1 spec doc was folded into the [archive](../archive.md).

## Tagline

**Pay or challenge London parking tickets in minutes.**

Used in the in-app header subtitle and the layout `<meta description>`. Shortened forms (*"Pay or challenge — in minutes."*, *"Don't pay until you've checked."*) are permitted for ad creatives where character counts are tight, but never drop "London" — the geography is a credibility signal. (When the v0.1 scope decision moves to UK-wide, the geography token shifts but the tagline shape stays.)

## Colour

Defined as CSS variables in `wiki/docs/stylesheets/extra.css` — single source of truth.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--snappeal-primary` | `#007AFF` | `#3392FF` | Primary CTAs, logo fill, links, in-progress accents (iOS System Blue) |
| `--snappeal-primary-soft` | `rgba(0,122,255,0.10)` | `rgba(51,146,255,0.16)` | Hover wash, soft fills, status pills |
| `--snappeal-navy` | `#0A1929` | `#FAFAFA` | Headings + body text on light; primary surface in dark |
| `--snappeal-surface` | `#FFFFFF` | `#0F172A` | Card backgrounds, modal sheets |
| `--snappeal-bg` | `#FAFAFA` | `#020617` | Page background (Apple off-white) |
| `--snappeal-muted` | `#6E6E73` | `#94A3B8` | Secondary text (Apple system gray) |
| `--snappeal-border` | `#E5E5EA` | `#1E293B` | Dividers, input borders (Apple system gray 5) |
| `--snappeal-success` | `#34C759` | `#34C759` | Completed states, positive outcomes (iOS Green) |
| `--snappeal-warning` | `#FF9500` | `#FF9500` | Warnings (iOS Orange — rare in product UI) |
| `--snappeal-danger` | `#FF3B30` | `#FF3B30` | Errors, destructive actions (iOS Red) |

**Primary is iOS System Blue `#007AFF`** — decided after a colour-psychology review of the earlier purple. The reasoning, in plain English:

- **Trust + authority + action.** System Blue is the colour the user already reads as financial-services + legal-system competence on their phone (Apple iOS), in their wallet (Stripe, Chase, Monzo), and on every gov.uk page that matters. For a stressed PCN recipient, that recognition equity beats any clever brand-blue we could mint ourselves.
- **Not purple.** Purple reads as luxury / subscription / creativity (Twitch, Yahoo, Asana). Wrong vibe for "I have £160 to lose if this doesn't work".
- **Not the PCN's red+yellow.** We visually distance ourselves from the council's enforcement aesthetic.

System Green `#34C759` is the secondary accent, used for completed states and positive outcomes. Near-black navy `#0a1929` is the typography baseline. Surfaces are pure white on a `#FAFAFA` off-white page; borders are Apple's system grey `#E5E5EA` — the "deference" layer in Steve Jobs's *content over chrome* design principle.

The legacy `--appeal-*` variables in `extra.css` are kept as aliases for the transition.

## Typography

- **UI**: [Inter](https://rsms.me/inter/) — 14/16/18/24/32 px scale, weight 400 / 500 / 600 / 700.
- **Code / monospaced data**: [IBM Plex Mono](https://www.ibm.com/plex/) — used for PCN references, vehicle regs, contravention codes.

Heading scale (MkDocs follows the same):

| Level | Size (mobile) | Weight | Letter-spacing |
|---|---|---|---|
| H1 | 28px | 700 | -0.02em |
| H2 | 22px | 600 | -0.01em |
| H3 | 18px | 600 | 0 |
| Body | 16px | 400 | 0 |
| Caption | 13px | 500 | 0 |

## Logo

A **navy shield containing a white rabbit silhouette**, served as a raster master from `apps/web/public/logo.png` (also reused as `app/icon.png` favicon and `app/apple-icon.png` for iOS home-screen). The shield (rather than a rounded square) gives the brand a "protect / defend" reading, consistent with intervening between the driver and the council on the driver's behalf.

- **App icon** — 1024×1024 master, no padding; OS rounding handles the corner.
- **Wordmark** — shield to the left of "ParkingRabbit" set in Inter 700, navy on light backgrounds. Component: `SnappealLogo` (kept as an identifier alias for the brand pivot — every callsite still resolves).

The earlier System-Blue "S" shield was retired in the v0.2.0 rebrand; legacy assets under `wiki/docs/assets/logo.svg` may still show it.

Never:
- Stretch or skew.
- Place on a red background.
- Add a drop shadow.
- Animate the logo on screen load.

## Voice

A short calm sentence is always better than a long polished one. Three voice rules:

1. **Plain English, no legal vocabulary in user-facing UI.** "The rule the council says you broke" not "the contravention". "Why you think it's wrong" not "your statutory grounds".
2. **Honest, not breezy.** "£2.99 — one-off, non-refundable. You're paying for the appeal we draft and submit, not the outcome." is the right tone. "Beat your ticket — guaranteed!" is the wrong tone.
3. **No emoji in product copy.** Acceptable in marketing channels (TikTok captions) where emoji is the medium. Never in the app itself, never in the letter, never in transactional emails.

Tone references: GOV.UK service writing, Monzo error copy, Apple's pre-2020 product page voice.

## Microcopy library

Reference strings — keep these consistent across surfaces:

- Landing CTAs: **Get Started** (header), **Free Appeal** (hero), **See How It Works** (hero secondary).
- `/app` home action heroes — left to right: **Start now** (Scan PCN → `/app/tickets?scan=1`), **Appeal** (Challenge it → `/app/tickets`), **Pay now** (Pay a ticket → `/app/pay`). The whole card is a `<Link>` — tapping anywhere on the tile navigates. (`/app/capture` is a server-side redirect to `/app/tickets?scan=1` for back-compat.)
- Tickets list filter chips: **All** / **To Pay** / **Challenging** / **Resolved**. (`Challenging` covers both reviewing options and in-flight appeals — one journey.)
- Tickets list amount+state line — one of: **£X at risk** (blue, draft/ready inside the discount window), **£X due** (red, last 4 days of the discount window), **£X appealed** (purple, in-flight with the council), **Cancelled £X** (green, won), **Closed £X** (slate, rejected).
- Tickets list ticket-card primary CTAs — **Review options** (at-risk) / **Pay ticket** (due, *green* button — positive resolution; the red chip + red `DUE / Today` tile carry the urgency) / **Track appeal** (appealed). Secondary on every active card: **View details**.
- Tickets list footer pills (both `min-w-[112px]` so widths match): **View tips** (deadline-tip card, green) / **Contact us** (help card, blue → `/app/profile/help`). Help-card title is **Need help?** with subtitle "See guidance on paying, challenging, and deadlines."
- Capture scanner status pill: **Scanning** → **Hold steady…** → **Captured** (live-camera auto-capture).
- Capture inline manual entry — heading **Enter ticket details manually**, required-fields header **Required to find your PCN**, optional `<details>` summary **More details (optional)**, submit CTA **Continue**.
- Photos step CTA: **Continue**
- Notes step CTA: **Generate letter**
- Paywall CTA: **Generate my appeal** (drafting is free; the £2.99 charge moves to the `PaymentSheet` on Submit).
- Letter step actions: **Copy** · **Share** · **Submit appeal to council** (opens `PaymentSheet`).
- Pricing line (challenge path): **£2.99 — one-off, non-refundable.**
- Pricing line (pay path): **Ticket amount + £1.99 ParkingRabbit service fee.**
- Pricing rationale line: **You're paying for the appeal we draft and submit, not for the outcome.**
- Disclaimer line: **ParkingRabbit drafts and submits representations. It is not a solicitor and doesn't guarantee an outcome.**
