---
hide:
  - toc
---

# TODO — external action items

Things outside the codebase that need someone to do them. Each one has an owner (placeholder until claimed), an "earliest start" date, and the reason. **Code-side TODOs live in the running [handoff.md](handoff.md)** under the "Pickup-here items" + "Open work" sections.

Last refreshed **2026-05-27 (v0.3.10)**.

## 🚨 Before the public beta — start the clocks now

These have wall-clock waiting periods (DNS propagation, app-store account verification, trademark applications). Earlier-start = earlier-finish.

### Domain — register `parkingrabbit.com`
- **Where**: Namecheap or Cloudflare Registrar.
- **Cost**: ~£10/year for `.com`.
- **Why now**: The public GitHub repo means the brand is searchable. Risk of a squatter grabbing it.
- **Owner**: 👤 TBD
- **Status**: 🔴 Not registered

### Apple Developer Program enrolment
- **Where**: <https://developer.apple.com/programs/enroll/>
- **Cost**: £79/year.
- **Lead time**: 1–4 weeks (UK business verification by Apple).
- **Why now**: Verification clock starts on submission, not on intended app-submission date. Block: needed before native wrapper can ship to App Store, and gates the live Apple OAuth provider on `/sign-in` / `/sign-up`.
- **Owner**: 👤 TBD
- **Status**: 🔴 Not started

### Google Play Developer account + Google Cloud OAuth client
- **Where**: <https://play.google.com/console/signup> + <https://console.cloud.google.com/>
- **Cost**: $25 one-off for Play; OAuth client is free.
- **Lead time**: 1–3 days for individual; up to 2 weeks for organisation.
- **Why now**: Verification is upstream of the native wrapper milestone AND gates the live Google OAuth provider (`/api/auth/oauth/google` returns 503 until `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` land).
- **Owner**: 👤 TBD
- **Status**: 🔴 Not started

### UK IPO trademark search + filing — "ParkingRabbit"
- **Search**: <https://www.gov.uk/search-for-trademark> (free, ~2 minutes).
- **Filing**: £170 for one class via UK IPO online filing.
- **Why now**: Public repo + the v0.3.10 full rename means the name is now discoverable. If clean, file a UK TM application before brand investment scales. Class 9 (mobile apps) + Class 42 (SaaS).
- **Owner**: 👤 TBD
- **Status**: 🔴 Not searched

### Council portal-grounds screenshots (P11 onboardings)
- **Six councils still need grounds-page screenshots** before their `grounds/<slug>.ts` files can be written: Westminster, Camden, Kensington & Chelsea, Islington, TfL, City of London. Each needs three screenshots: step 1 (the grounds radio list), step 2 (details / textarea), step 3 (contact form).
- **Why now**: Without the screenshots the per-council radio-label mapping is guesswork. Lambeth shipped first because we had verified screenshots — see [`architecture/grounds-registry.md`](architecture/grounds-registry.md) for the onboarding checklist. Each new council unlocks accurate submission filing for that authority.
- **Owner**: 👤 TBD
- **Status**: 🔴 None captured

---

## After v0.1 launch — material follow-ups

These don't need to start today, but should be on someone's list before the public beta hits real users.

### Stripe live keys
- UK business verification can take several working days. The £2.99 PaymentSheet currently runs in test mode (or the fake-payment stub when `NEXT_PUBLIC_PARKINGRABBIT_FAKE_PAYMENT=1`). Live keys land at `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` + `STRIPE_CARE_PLAN_PRICE_ID`.

### Transactional email — `appeals.parkingrabbit.com` MX + DKIM
- Per-appeal aliases (`<appeal-id>@appeals.parkingrabbit.com`) for the inbound council reply parsing (`/api/inbound`). Provider candidates: Postmark Inbound (front-runner), Resend, Brevo, AWS SES. DNS: MX, SPF, DKIM, DMARC. `INBOUND_WEBHOOK_SECRET` is REQUIRED in `NODE_ENV=production`.

### Privacy policy + Terms of Service hardening
- Drafts live at `/privacy` + `/terms`. Required-content checks for App Store + Stripe + UK GDPR before live launch.

### Cookie / consent banner
- For the public PWA. Standard UK cookie law (PECR) + UK GDPR.

### Photo anonymisation policy
- Explicit rule on what gets stripped from images before AI processing: vehicle reg (keep), bystanders' faces (blur), GPS metadata (strip), unique device identifiers in EXIF (strip).

### Council outreach plan
- Top-5 boroughs by volume should hear about ParkingRabbit directly from us before they hear about it via PCN submission volume changes. Tonally: collaborator not adversary. See `business/risks.md` R8 mitigation.

### FOI request to London Councils TEC
- Closes the open data gap on % of PCNs paid at discount vs full vs written off. Single request covering 2022-23 → 2024-25. ~20 working days turnaround.

### VAPID keypair for push
- `npx web-push generate-vapid-keys` once; commit the public key to `NEXT_PUBLIC_VAPID_PUBLIC_KEY` env, the private to `VAPID_PRIVATE_KEY` env. Until these are set, every push dispatch attempt logs `result='no_vapid'` to `notification_dispatches` (server still functions; nothing is sent).

### Vercel deploy
- Local-only today. Deploy runbook in [architecture/deployment.md](architecture/deployment.md). Web tier on Vercel with `PARKINGRABBIT_DISABLE_WORKER=1`; worker tier on Fly.io / Railway / Vercel Sandbox with the `claude` CLI binary + `@playwright/mcp` + Chromium baked in. Don't forget `outputFileTracingIncludes` for `apps/web/knowledge/*` so the markdown KB ships in the function bundles.

---

## Already shipped (struck through for clarity)

- ~~Brand rename: `Snappeal` → `ParkingRabbit`~~ — v0.3.10 (full codebase pass, 273 files, env vars + cookies + CSS tokens all renamed). The 2026-05-21 brand pivot was customer-facing-strings-only; the 2026-05-26 pass finished the job.
- ~~Single combined OCR + photo-coach Claude call~~ — v0.3.10 (drops per-upload cost ~$0.13 → ~$0.075).
- ~~Per-council grounds-translation registry pattern~~ — v0.3.10 (Lambeth shipped; the other six councils need portal screenshots before their entries can be authored).
- ~~Deterministic Lambeth Playwright recipe~~ — Phase 9 (drives challenge.php at ~$0; falls back to Claude on drift).
- ~~Per-stage cost telemetry (`ai_calls` table + helpers)~~ — v0.3.9.
- ~~Validate-first flow with Confirm gate~~ — v0.3.9 (the dam against burning MCP tokens on unverified OCR).
- ~~`notification_dispatches` audit log~~ — v0.3.9 (one row per dispatch attempt incl. no-ops).
- ~~Smart-card consolidation onto `/app/tickets`~~ — v0.2.13–v0.3.0 (the whole post-scan flow now lives on one card).
- ~~Deep grounds quiz (75 cards / 12 categories) + voice dictation + knowledge base + appeal-strength score~~ — v0.3.0.
- ~~Drafting-hang root-cause fix~~, ~~three-step `<StepBlock>` ladder~~, ~~Cloudflare-grade SSE (4 KB padding + identity encoding + no-store)~~, ~~`prewarmMcp()` on worker boot~~ — v0.3.1.
- ~~Photo storage off-client for warden + portal photos~~ — Vercel Blob via `uploadPortalPhotos()` (v0.2.6). User-evidence photos still ride sessionStorage data URLs — last client-only payload, on the backlog.

---

## How this page is maintained

- Tick items off as they're done; don't delete (history is useful).
- New external action items get added here, not in random other pages.
- Code-side TODOs go in [handoff.md](handoff.md) "Pickup-here items" / "Open work" / "Hardening epics" sections, not here.
