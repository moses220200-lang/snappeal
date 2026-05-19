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
| `--snappeal-primary` | `#6c5ce7` | `#7c6df0` | Primary CTAs, logo fill, in-progress accents |
| `--snappeal-primary-soft` | `rgba(108,92,231,0.12)` | `rgba(124,109,240,0.16)` | Hover wash, soft fills, status pills |
| `--snappeal-navy` | `#0b1f44` | `#f8fafc` | Headings, body text on light; surface in dark |
| `--snappeal-surface` | `#ffffff` | `#0f172a` | Card backgrounds, modal sheets |
| `--snappeal-bg` | `#f6f7fb` | `#020617` | Page background |
| `--snappeal-muted` | `#64748b` | `#94a3b8` | Secondary text, captions |
| `--snappeal-border` | `#e2e8f0` | `#1e293b` | Dividers, input borders |
| `--snappeal-success` | `#16a34a` | `#22c55e` | Completed timeline steps, success states |
| `--snappeal-warning` | `#d97706` | `#f59e0b` | Warnings (rare) |
| `--snappeal-danger` | `#dc2626` | `#ef4444` | Errors, destructive actions |

**Primary is purple `#6c5ce7`** — decided from the homepage mockup, replacing the earlier blue placeholder. Navy `#0b1f44` is the typographic baseline. Red stays out of the brand: the PCN itself is yellow-and-red and we visually distance ourselves from the council's enforcement aesthetic. The legacy `--appeal-*` variables in `extra.css` are kept as aliases for the transition.

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

A **navy shield** containing a white **S** in the same Inter typeface as the wordmark. The shield (rather than a rounded square) gives the brand a "protect / defend" reading, consistent with appealing on the user's behalf. Vector source: `wiki/docs/assets/logo.svg`. Two preferred presentations:

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
