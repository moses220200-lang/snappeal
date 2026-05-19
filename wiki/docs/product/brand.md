# Brand

The visual and verbal system. Used by the wiki, the admin panel, and the customer app — same tokens, same voice, same name.

## Name

**Snappeal.**

One word. Portmanteau of *snap* (capture the ticket in a photo) and *appeal* (what the product delivers). Captures the entire UX in seven letters — photo-first, action-led, mobile-native. Capital S in prose, lowercase in domains and code (`snappeal.ai`, `snappeal`, `snappeal-wiki`, etc.).

The verb framing matters: a user can *snappeal* a ticket the same way they *google* something or *uber* somewhere. Verb-brands compound — every conversation about parking fines becomes a chance for the brand to surface as a verb.

**Canonical domain**: `snappeal.ai`. The `.ai` TLD signals what the app does (AI-drafted appeals) and is short enough to drop into TikTok captions and shareable links. We do not use `.com` / `.app` / `.uk` aliases for the product itself; redirect any incidental traffic to `snappeal.ai`.

For App Store listings and SEO landing pages we may use the longer descriptor *"Snappeal — appeal a London parking ticket"* to capture high-intent searches. In the app chrome itself and in conversation, just **Snappeal**.

## Form factor

Snappeal is a **responsive PWA** — installable on iOS and Android home screens, and also rendered as a desktop / tablet experience for the same domain. The product itself is mobile-first, but the public marketing surface (homepage, pricing, FAQ, success stories) is designed-for-desktop and downsizes responsively. From v0.3 the PWA is wrapped via Capacitor for App Store + Play Store.

See [screens/homepage.md](screens/homepage.md) for the desktop home spec.

## Tagline

**Appeal a London parking ticket in under five taps.**

Use the full tagline on the homepage, app store listings, and the first marketing fold. Shortened forms (*"Appeal in five taps."*, *"Upload. Appeal. Win."*) are permitted for ad creatives where character counts are tight, but never drop "London" — the geography is a credibility signal. (When the v0.1 scope decision moves to UK-wide, the geography token shifts but the tagline shape stays.)

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

A **System Blue shield** containing a white **S** in the same Inter typeface as the wordmark. The shield (rather than a rounded square) gives the brand a "protect / defend" reading, consistent with appealing on the user's behalf. Vector source: `wiki/docs/assets/logo.svg`. Two preferred presentations:

- **App icon** — 1024×1024 master, no padding; OS rounding handles the corner.
- **Wordmark** — shield to the left of "Snappeal" set in Inter 700, navy on light backgrounds.

The shield silhouette matches both mockups (originally with a "P" in the designer's working name; we render the same shield with an "S" for Snappeal).

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

- Home CTA: **Start Your Appeal**
- Photos step CTA: **Continue**
- Notes step CTA: **Generate letter**
- Paywall CTA: **Start Your Appeal — £2.99**
- Letter step actions: **Copy** · **Share** · **Submit**
- Status pills: **Draft** / **Ready to send** / **Sent** / **Resolved**
- Pricing line: **£2.99 — one-off, non-refundable.**
- Pricing rationale line: **You're paying for the appeal we draft and submit, not for the outcome.**
- Disclaimer line: **Snappeal drafts and submits representations. It is not a solicitor and doesn't guarantee an outcome.**
