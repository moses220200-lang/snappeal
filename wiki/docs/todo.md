---
hide:
  - toc
---

# TODO — external action items

Things outside the codebase that need someone to do them. Each one has an owner (placeholder until claimed), an "earliest start" date, and the reason.

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
- **Why now**: Verification clock starts on submission, not on intended app-submission date. Block: needed before v0.3 native wrapper can ship to App Store.
- **Owner**: 👤 TBD
- **Status**: 🔴 Not started

### Google Play Developer account
- **Where**: <https://play.google.com/console/signup>
- **Cost**: $25 one-off.
- **Lead time**: 1–3 days for individual account; up to 2 weeks for organisation accounts (Google verifies legal entity).
- **Why now**: As above — verification is upstream of the v0.3 native wrapper milestone.
- **Owner**: 👤 TBD
- **Status**: 🔴 Not started

### UK IPO trademark search + filing — "ParkingRabbit"
- **Search**: <https://www.gov.uk/search-for-trademark> (free, ~2 minutes).
- **Filing**: £170 for one class via UK IPO online filing.
- **Why now**: Public repo + GitHub indexing means the name is now discoverable. If clean, file a UK TM application before brand investment scales. Class 9 (mobile apps) and Class 42 (SaaS) are the typical pair for a product like this.
- **Owner**: 👤 TBD
- **Status**: 🔴 Not searched

---

## After v0.1 launch — material follow-ups

These don't need to start today, but should be on someone's list before the public beta hits real users.

### Stripe UK account onboarding
- UK business verification can take several working days. Required for live payments. Use Stripe test mode during v0.1 prototype build.

### Transactional email — `appeals.parkingrabbit.com` MX setup
- Per-user aliases (`<user-id>@appeals.parkingrabbit.com`) for the council email-submission path + inbound reply parsing. Provider candidates: Resend, Postmark, AWS SES. DNS records: MX, SPF, DKIM, DMARC.

### Privacy policy + Terms of Service
- Required for App Store + Stripe + UK GDPR. Drafts live in `wiki/docs/legal/`. Open source template starting point: Termly / Iubenda / GDPR.eu.

### Cookie / consent banner
- For the public PWA. Standard UK cookie law (PECR) + UK GDPR.

### Photo anonymisation policy
- Explicit rule on what gets stripped from images before AI processing: vehicle reg (keep), bystanders' faces (blur), GPS metadata (strip), unique device identifiers in EXIF (strip).

### Council outreach plan
- Top-5 boroughs by volume should hear about ParkingRabbit directly from us before they hear about it via PCN submission volume changes. Tonally: collaborator not adversary. Risks.md R8 mitigation.

### FOI request to London Councils TEC
- Closes the open data gap on % of PCNs paid at discount vs full vs written off. Single request covering 2022-23 → 2024-25. ~20 working days turnaround.

---

## Refactor backlog (from mockup audit)

Tracked from [product/v0-1-mockup-audit.md](product/v0-1-mockup-audit.md), section "Remaining refactor work":

- [ ] **A4** Logo design pass — current navy-shield-with-S is sufficient for the prototype; final pass by a designer in v0.2.
- [ ] **B1** Manual PCN entry as a first-class capture path (refactor `user-flow.md` + `ai-pipeline.md`).
- [ ] **B2** Evidence photos move to step 2 (after capture) in the flow.
- [x] **B3 / D4** Appeal state machine + status timeline — implemented in `apps/web/app/app/tickets/page.tsx → deriveDisplayState` and documented at `architecture/appeal-state-machine.md` (2026-05-21).
- [ ] **B5** Cases screen spec — add to `user-flow.md`.
- [ ] **B6** Tips library content surface — new `product/tips-library.md`.
- [ ] `product/navigation.md` — document the 4-tab structure (Home / Cases / Camera / Profile).
- [ ] **Photo storage off-client** — PCN photo + evidence photos still live in `sessionStorage` as data URLs in `apps/web/lib/client/session.ts`. Ticket/notes/grounds moved to the cloud on 2026-05-21 via `lib/client/draft.ts`; photos are the last client-only payload. Blocker: pick blob storage (Vercel Blob is the obvious fit) + add `POST /api/photos` upload route + swap `getPcnPhoto`/`getEvidencePhotos` callsites to fetch the persisted URL.

---

## How this page is maintained

- Tick items off as they're done; don't delete (history is useful).
- New external action items get added here, not in random other pages.
- The audit page tracks *product decisions*; this page tracks *external coordination*.
