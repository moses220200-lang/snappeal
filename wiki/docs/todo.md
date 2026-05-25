---
hide:
  - toc
---

# TODO — external action items

Things outside the codebase that need someone to do them. Each one has an owner (placeholder until claimed), an "earliest start" date, and the reason. **Code-side TODOs live in the running [handoff.md](handoff.md)** and the architecture pages' "Open work" sections.

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
- **Why now**: Verification clock starts on submission, not on intended app-submission date. Block: needed before v0.3 native wrapper can ship to App Store, and gates the live Apple OAuth provider on `/sign-in` / `/sign-up`.
- **Owner**: 👤 TBD
- **Status**: 🔴 Not started

### Google Play Developer account + Google Cloud OAuth client
- **Where**: <https://play.google.com/console/signup> + <https://console.cloud.google.com/>
- **Cost**: $25 one-off for Play; OAuth client is free.
- **Lead time**: 1–3 days for individual; up to 2 weeks for organisation.
- **Why now**: Verification is upstream of the v0.3 native wrapper milestone AND gates the live Google OAuth provider (`/api/auth/oauth/google` returns 503 until `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` land).
- **Owner**: 👤 TBD
- **Status**: 🔴 Not started

### UK IPO trademark search + filing — "ParkingRabbit"
- **Search**: <https://www.gov.uk/search-for-trademark> (free, ~2 minutes).
- **Filing**: £170 for one class via UK IPO online filing.
- **Why now**: Public repo + GitHub indexing means the name is now discoverable. If clean, file a UK TM application before brand investment scales. Class 9 (mobile apps) + Class 42 (SaaS).
- **Owner**: 👤 TBD
- **Status**: 🔴 Not searched

---

## After v0.1 launch — material follow-ups

These don't need to start today, but should be on someone's list before the public beta hits real users.

### Stripe live keys
- UK business verification can take several working days. The £2.99 PaymentSheet currently runs in test mode (or the fake-payment stub when `NEXT_PUBLIC_SNAPPEAL_FAKE_PAYMENT=1`). Live keys land at `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` + `STRIPE_CARE_PLAN_PRICE_ID`.

### Transactional email — `appeals.parkingrabbit.com` MX + DKIM
- Per-appeal aliases (`<appeal-id>@appeals.parkingrabbit.com`) for the inbound council reply parsing (`/api/inbound`). Provider candidates: Postmark Inbound (front-runner), Resend, Brevo, AWS SES. DNS: MX, SPF, DKIM, DMARC. `INBOUND_WEBHOOK_SECRET` is REQUIRED in `NODE_ENV=production`.

### Privacy policy + Terms of Service hardening
- Drafts live at `/privacy` + `/terms`. Required-content checks for App Store + Stripe + UK GDPR before live launch.

### Cookie / consent banner
- For the public PWA. Standard UK cookie law (PECR) + UK GDPR.

### Photo anonymisation policy
- Explicit rule on what gets stripped from images before AI processing: vehicle reg (keep), bystanders' faces (blur), GPS metadata (strip), unique device identifiers in EXIF (strip).

### Council outreach plan
- Top-5 boroughs by volume should hear about ParkingRabbit directly from us before they hear about it via PCN submission volume changes. Tonally: collaborator not adversary. See `risks.md` R8 mitigation.

### FOI request to London Councils TEC
- Closes the open data gap on % of PCNs paid at discount vs full vs written off. Single request covering 2022-23 → 2024-25. ~20 working days turnaround.

### Web Push send-side wiring
- Service worker + `/api/push/subscribe` are live; the worker reading inbound classification → firing `web-push.send` against stored subscriptions still needs writing. Needs the `web-push` package + `VAPID_PRIVATE_KEY`.

### Vercel deploy
- Local-only today. Deploy runbook in [architecture/deployment.md](architecture/deployment.md). Web tier on Vercel with `SNAPPEAL_DISABLE_WORKER=1`; worker tier on Fly.io / Railway / Vercel Sandbox with the `claude` CLI binary + `@playwright/mcp` + Chromium baked in. Don't forget `outputFileTracingIncludes` for `apps/web/knowledge/*` so the markdown KB ships in the function bundles.

---

## Already shipped (struck through for clarity)

- ~~Smart-card consolidation onto `/app/tickets`~~ — v0.2.13–v0.3.0 (the whole post-scan flow now lives on one card).
- ~~Deep grounds quiz (75 cards / 12 categories) + voice dictation + knowledge base + appeal-strength score~~ — v0.3.0.
- ~~Drafting-hang root-cause fix~~, ~~three-step `<StepBlock>` ladder~~, ~~Cloudflare-grade SSE (4 KB padding + identity encoding + no-store)~~, ~~`prewarmMcp()` on worker boot~~, ~~`showMcpLiveView` runtime flag~~ — v0.3.1.
- ~~Photo storage off-client for warden + portal photos~~ — Vercel Blob via `uploadPortalPhotos()` (v0.2.6). User-evidence photos still ride sessionStorage data URLs — last client-only payload, on the backlog.

---

## How this page is maintained

- Tick items off as they're done; don't delete (history is useful).
- New external action items get added here, not in random other pages.
- Code-side TODOs go in [handoff.md](handoff.md) "Open work" sections, not here.
- The audit page tracks *product decisions*; this page tracks *external coordination*.
