# Archive

!!! warning "Historical — describes pre-v0.3 state"
    Everything below describes earlier shapes of ParkingRabbit that no longer match the running product. Kept for institutional memory and so old wiki links still resolve. **Do not use as a reference for current behaviour** — see [system overview](architecture/system-overview.md), [data model](architecture/data-model.md), and the running [handoff.md](handoff.md) for v0.3.1 truth.

This page consolidates content from four previously-standalone pages that were either superseded or describe ancestor versions of the product:

- `architecture/prototype.md` — file-by-file repo map from the v0.1 → v0.2.18 era.
- `product/mockups.md` — v0.1 designer mockup walkthrough (marketing homepage + in-app home).
- `product/v0-1-mockup-audit.md` — decision log capturing the gaps between the v0.1 wiki and the v0.1 designer mockups, including the rename from "Snappeal" → "ParkingRabbit" (2026-05-21).
- `product/screens/homepage.md` — desktop landing-page spec keyed to the v0.1 mockup.

For the actual git history of any of these pages, run `git log --follow -- wiki/docs/architecture/prototype.md` (or similar) — every revision is recoverable.

---

## Archived: `architecture/prototype.md` (v0.2.18 snapshot)

A file-by-file map of `apps/web/` as it stood in v0.2.18. It pre-dated the v0.3.0 deep-quiz / KB / strength-score work and the v0.3.1 drafting-hang fix. **Out of date in several material ways** — superseded by [system-overview.md](architecture/system-overview.md), [data-model.md](architecture/data-model.md), and [admin.md](architecture/admin.md) which now collectively cover the same ground for v0.3.1.

Useful context the snapshot captured that's worth knowing about as historical record:

- The pre-v0.3.0 route structure included `/app/validating/[jobId]`, `/app/submitting/[id]`, `/app/blocked/[appealId]`, `/app/paywall`, and `/app/capture` as a 1480-LoC live-camera page. **All of these are now deleted** (or are 5-line server-side redirects).
- Components since deleted: `MCPLiveView`, `GeneratingOverlay`, `VerdictReveal`, `PassiveStatusBanner`, `TicketActionPanel`, `ExtractedDataPanel`, the legacy live-camera auto-snap with Sobel edge detection, the v0.1 `<WizardOnboarding>`, and `<WizardSheet>` (the paywall-step UI).
- The pre-v0.3.0 grounds catalog had 6 hard-coded options inside `<GatheringEvidenceCard>`. **v0.3.0 replaced that with the 75-card 12-category catalog in `lib/grounds-catalog.ts`**, surfaced through `<GroundsQuizSheet>`.
- The pre-v0.3.0 drafter took the PCN photo as a required input. **v0.3.1 made `pcnPhoto` optional** in `GenerateRequest` — both `/api/generate` and `/api/generate-stream` now fall back to `appealRow?.ticket` for `confirmedTicket`. `generateDraft()` itself fails fast when neither photo nor complete ticket is available.
- The pre-v0.3.0 SSE delivery used a 1 s poll without padding — fine on Vercel direct, broken behind Cloudflare. **v0.3.1 added 4 KB per-event padding + `cache-control: no-store, no-transform` + `content-encoding: identity` + `x-accel-buffering: no` + 150 ms poll + 3 s keep-alive.**
- The pre-v0.3.0 worker boot order didn't prewarm MCP. **v0.3.1 added `prewarmMcp()` to the boot sequence** so customer #1 of a fresh deploy doesn't pay the 30–60 s `@playwright/mcp` + Chromium cold start.

---

## Archived: `product/mockups.md`

Walkthrough of two v0.1 designer mockups (delivered 2026-05-19):

1. **Marketing homepage** — desktop landing for `parkingrabbit.com`. Hero: phone-on-windscreen with a 4-step "Your Progress" timeline. Trust strip: Expert Appeal Writers · High Success Rate · No Win No Fee · Secure & Private. How-it-works: Upload Your Ticket → We Build Your Case → We Submit Your Appeal → We Fight. You Win.
2. **In-app home screen** — mobile. Greeting (`Hello, Alex 👋`), purple "appeal in progress" card, 4-step progress timeline, support card.

**Why archived.** The product moved well past the 2026-05-19 mockup. The marketing home still loosely follows the mockup's shape; the in-app home is now three navy `ActionHero` tiles (Scan PCN / Challenge it / Pay a ticket) on `/app`, and the appeal lifecycle renders inside one smart `<TicketCard>` on `/app/tickets` — not a separate "your progress" timeline. The shield-with-"P" logo from the mockup was retained.

---

## Archived: `product/v0-1-mockup-audit.md`

Audit comparing the v0.1 wiki against the v0.1 mockup. 14 findings, 5 high-severity decisions closed on 2026-05-19. Key decisions that stuck:

| # | Question | Decision |
|---|---|---|
| A1 | Product name | **ParkingRabbit** (2026-05-21 rename from the engineering codename `Snappeal`). |
| A2 | Geographic scope | **London-only** for v0.1 and v0.2. |
| B4 | Auth in v0.1 | Originally "scope down to Settings tab, no accounts" — **overturned in v0.1.5** when email/password + JWT cookie + OAuth scaffold landed. |
| C1 | Marketing voice | **"We draft"** — no "expert appeal writers" framing. |
| C2 | Auto-submit in v0.1 | **Yes** — portal automation + email fallback ship in v0.1. |

The audit's medium-severity colour and tagline findings drove the iOS System Blue / action red palette change (see commit `a7a9402 Repalette: purple → iOS System Blue + Apple-grade restraint`).

**Why archived.** All decisions are now reflected in code + the current wiki. The audit log itself is no longer load-bearing — it's just a record of how the decisions were made.

---

## Archived: `product/screens/homepage.md`

Desktop landing-page spec for `parkingrabbit.com/` keyed to mockup #1 above. Detailed the nav, hero, trust strip, how-it-works, app store badges, FAQ, and footer layout. Implementation lives at `apps/web/app/page.tsx` and has drifted from the v0.1 spec in several places (no Trustpilot strip; the "We Send to the Landowner" copy was corrected to "council"; the four "Expert Appeal Writers / High Success Rate / No Win No Fee / Secure" cards were trimmed to the ones supported by actual evidence).

**Why archived.** The page exists and works; the spec doc had drifted enough from reality that it was misleading. The canonical reference for the marketing site is the running page itself (`apps/web/app/page.tsx`) — not a wiki spec frozen at v0.1.
