# v0.1 mockup audit — gaps & refactors

Comparison of the wiki as written against the [v0.1 home screen mockup](mockups.md). Each finding has a severity (🔴 high / 🟡 medium / 🟢 low) and a recommended action.

## Summary

**14 findings. All 5 high-severity decisions are now closed (2026-05-19)** — see ✅ markers in the sections below. Remaining medium / low findings are mechanical refactor work; tracked individually but no longer blocking.

**Decision summary:**

| # | Question | Decision |
|---|---|---|
| A1 | Name | **Snappeal** (canonical domain `snappeal.ai`) |
| A2 | Geographic scope | **London-only** for v0.1 (no UK-wide pivot) |
| B4 | Auth in v0.1 | **Scope down** — Profile tab = Settings/Help/Privacy, no accounts |
| C1 | Voice | **"We draft"** — no "experts" framing |
| C2 | Auto-submit in v0.1 | **Yes** — portal automation + email fallback ship in v0.1 |

---

## A. Brand identity

### A1. ✅ Name decided — **Snappeal**
- **Original wiki working name**: "Appeal".
- **Mockup**: "Park Appeal UK".
- **Decision (2026-05-19)**: **Snappeal** in app chrome and conversation; *"Snappeal — Park Appeal UK"* as the long form for App Store listing and SEO landing page. Global rename completed across `mkdocs.yml`, `index.md`, `brand.md`, `README.md`, `docker-compose.yml`, `logo.svg`, `extra.css` and every product reference in the wiki body.
- **Why Snappeal**: portmanteau of *snap* (photo-first capture) and *appeal* (the delivered service); short, verbable, mobile-native. Carries the entire UX in one word.

### A2. ✅ Geographic scope decided — **London-only for v0.1**
- **Decision (2026-05-19)**: ship London-only. No UK rollout in v0.1, no Scotland/Wales/NI scoping work, no `Park Appeal UK` long form.
- **Mockup consequence**: the `UK` location pill in the mockup header reads **`London`** in our build spec.
- **Wiki consequence**: the current London-shaped content (`market.md`, `councils/`, `legal/`) is correct and stays. No new legal pages for TPT / Scotland / Wales / NI. The mid-tier borough volume data gap stays priority; UK-wide rollout deferred indefinitely.
- **Brand consequence**: drop the "Snappeal — Park Appeal UK" long form. Replaced with "Snappeal — appeal a London parking ticket" as the App Store descriptor.

### A3. 🟡 Brand colour
- **Wiki** (`brand.md`, `extra.css`): single accent — London-blue `#2563eb`.
- **Mockup**: navy primary (`~#0b1f44`) + red/coral CTA (`~#f25d4e`).
- **Action**: Update `brand.md` and `extra.css` tokens. Likely needs three semantic tokens not two:
  - `--brand-primary` (navy, surfaces)
  - `--brand-accent` (red, CTAs)
  - `--brand-link` (blue, in-text links + status)

### A4. 🟡 Logo
- **Wiki**: blue rounded square with white "A" — placeholder.
- **Mockup**: navy shield with white "P".
- **Action**: Replace `wiki/docs/assets/logo.svg`. Decide whether the shield is the brand mark or whether it appears only in-app and the wiki uses a wordmark.

### A5. 🟢 Tagline
- **Wiki**: *"Appeal a London parking ticket in under five taps."*
- **Mockup**: *"Challenge your parking ticket in minutes."*
- **Action**: If we commit to UK scope, drop "London". Reconcile "appeal" vs "challenge" — the mockup uses both ("Challenge your parking ticket" in the header, "Start an Appeal" in the hero). Pick one and use it consistently.

---

## B. Features / UX

### B1. 🔴 Manual PCN entry path
- **Wiki**: the [user flow](user-flow.md) is photo-first ("PCN photo required"). Manual entry is a footnote skip-link.
- **Mockup**: **three peer options** — Scan Ticket / Upload Photos / Enter PCN. Manual entry is a first-class path.
- **Action**: Refactor `user-flow.md` to show three entry routes converging on the same Notes step. Update `architecture/ai-pipeline.md` — the AI call must accept text-only inputs when no photo is supplied.

### B2. 🔴 No "evidence photos" surfaced
- **Wiki**: photos step is *"PCN photo + 0–6 evidence photos of the car and scene"*. This is a key product hypothesis (evidence quality drives appeal quality).
- **Mockup**: only "ticket" capture is surfaced on home. No evidence-photo upload is visible.
- **Action**: Two possibilities:
  - **(a)** Evidence photos happen *after* capture (later step) — not contradicted by the home screen, just not shown.
  - **(b)** Evidence photos are dropped from v0.1.
  - **My recommendation**: keep evidence photos but move them to step 2 of the flow (after capture), with a "Skip" affordance. The home screen mockup is consistent with this — capture comes first.

### B3. 🔴 Status / progress tracking is first-class
- **Wiki**: appeal status is `draft` / `ready` / `sent` / `resolved` — a list-card pill. No timeline.
- **Mockup**: prominent 4-step horizontal timeline: **Ticket added → Drafting appeal → Under review → Decision pending**, with dates per step.
- **Action**: Expand the appeal state machine in `architecture/data-model.md`. New states (or sub-states): `ticket_added`, `drafting`, `submitted`, `under_review`, `decision_pending`, `cancelled`, `rejected`. Each has a timestamp. Add a "Status tracking" section to `user-flow.md`.

### B4. ✅ Bottom tab navigation decided — **scope down: no accounts in v0.1**
- **Decision (2026-05-19)**: ship the four-tab nav (Home / Cases / Camera / Profile) but **scope Profile down**. No sign-in, no accounts. The "Profile" tab in v0.1 surfaces only: Settings · Help · Privacy · About · Pricing.
- **State persistence**: anonymous, IndexedDB on the device. No multi-device sync in v0.1. A user who switches phones loses their appeal history (acceptable for v0.1; the appeal *submission* is already delivered to the council before the device ever changes).
- **Stripe**: customer record is anonymous on payment; receipt sent to user's email collected at the paywall, not via an account.
- **Auth moves to v0.2** as originally planned — Clerk via Vercel Marketplace, with migration of local appeals to the user's account on first sign-in.
- **Still to do**: write `product/navigation.md` describing the tab structure and the v0.1 Settings-tab contents.

### B5. 🟡 "Cases" history view
- **Wiki**: appeals list lives on Home screen.
- **Mockup**: dedicated `Cases` tab.
- **Action**: Add a Cases screen spec to `user-flow.md` — list view, filters by status, tap-through to appeal detail with timeline.

### B6. 🟡 Tips library / "Success tips" surface
- **Wiki**: `users/what-good-evidence-looks-like.md` and `users/faq.md` are wiki pages, not in-app content.
- **Mockup**: green "Success tips" banner with **View tips** CTA — implies an in-app tips library, possibly editorial.
- **Action**: Add `product/tips-library.md` describing the in-app tips content surface. Decide whether tips are sourced from the wiki (MDX-rendered in-app) or authored separately.

### B7. 🟡 Pricing absent from home
- **Wiki**: home screen mentions "£2.99" up front.
- **Mockup**: no price anywhere on the home screen.
- **Action**: Confirm with stakeholder where the paywall lives. Current plan is "paywall before generation". Recommendation: home screen stays price-free; price appears on the pay screen (consistent with the [pricing](../business/pricing.md) plan).

---

## C. Voice & positioning

### C1. ✅ Voice decided — **"We draft"** (no "experts" framing)
- **Decision (2026-05-19)**: drop the *"Our experts create a strong, tailored appeal"* line from the mockup. The product is honest about being software, not a panel of lawyers.
- **New v0.1 copy** for the "How it works" step 2: *"We draft your appeal — a clear, formal representation built from your photos and notes."*
- **Brand consequence**: protects us from DoNotPay-style FTC exposure (see [risks](../business/risks.md) R2). Aligns with [values.md](../business/values.md) principle #2 ("Honest evidence, always") and the [pricing](../business/pricing.md) framing ("you're paying for the work we draft and submit").
- **No use of**: "lawyer", "legal advice", "experts", "guaranteed", "win". Anywhere.

### C2. ✅ Auto-submit decided — **yes, in v0.1**
- **Decision (2026-05-19)**: bring portal automation forward to v0.1. The user is paying £2.99 for *the submission*, not for a copy-and-paste experience.
- **What ships in v0.1**: Vercel Workflow + Vercel Sandbox + Playwright MCP for the **top 7 councils** (Westminster, K&C, Camden, Lambeth, Islington, TfL, City of London) — the same priority order in [submission-engine.md](../architecture/submission-engine.md). All remaining London authorities fall back to **email submission** from day one (no manual-handoff in the user-facing flow).
- **What stays v0.2**: portal automation for the remaining 26 London authorities; the response-tracking system that turns council replies into in-app status updates.
- **Engineering implication**: this is a meaningful v0.1 scope bump — Sandbox + Playwright MCP + per-council form schemas + workflow durability. Worth it: the mockup's "Submit and track" promise is the £2.99 product.

---

## D. Architecture & roadmap

### D1. ✅ Auth in v0.1 decided — **no accounts, anonymous v0.1**
- See B4. Profile tab scoped to Settings/Help/Privacy/About. Clerk integration moves to v0.2 alongside response tracking and multi-device sync.

### D2. ✅ UK rollout architecture — **not needed for v0.1**
- See A2. London-only scope means the KB schema stays England-London-shaped. No `region` / `statutory_framework` / `appeal_body` extensions until the UK rollout becomes a project (no current target date).

### D3. ✅ Council list — **33 London authorities is the v0.1 scope**
- See A2. No Manchester / Birmingham / etc. work in v0.1. Existing per-borough verification queue (27 boroughs still 🟡) is the only outstanding council work.

### D4. 🟡 Status state machine in data model
- Still outstanding refactor work, scoped under B3. Needs documenting in `architecture/data-model.md` + a new `architecture/appeal-state-machine.md`.

---

## E. Things the mockup *confirms* are right

Good to call out — not everything is a gap:

- **Mobile-first** ✅
- **Capture is the primary action** ✅ (Camera tab is centred)
- **One decision per screen** ✅ ("Start an Appeal" is the only CTA on the hero)
- **Plain English** ✅ ("Check your ticket and let us help you fight it")
- **No price on home screen** ✅ (matches "pay before generation, not before capture")
- **Auto-submit as the headline promise** ✅ — now aligned with v0.1 scope per C2

---

## Remaining refactor work (after all 5 decisions closed)

All five high-severity decisions are now made (A1, A2, B4, C1, C2). The remaining items are mechanical refactor work — no further blocking decisions needed:

| ID | Area | Status |
|---|---|---|
| A3 | Brand colour tokens (navy + red CTA) | 🟡 pending — update `extra.css` + `brand.md` |
| A4 | Logo (replace placeholder "A" with finalised "S" mark) | 🟢 placeholder in place, needs design pass |
| A5 | Tagline / voice reconciliation (mockup says "Challenge"; we say "Snappeal") | 🟢 minor |
| B1 | Manual PCN entry as first-class path | 🟡 refactor `user-flow.md` + `ai-pipeline.md` |
| B2 | Evidence photos move to step 2 (post-capture) | 🟡 refactor `user-flow.md` |
| B3/D4 | Appeal state machine + status timeline | 🟡 new `architecture/appeal-state-machine.md` |
| B4 | `product/navigation.md` documenting 4-tab structure | 🟡 new page |
| B5 | Cases screen spec | 🟡 add to `user-flow.md` |
| B6 | Tips library content surface | 🟡 new `product/tips-library.md` |
| B7 | Pricing absent from home (already correct) | ✅ verify only |

---

## F. Homepage mockup (received 2026-05-19 evening) — new conflicts

A second mockup arrived: the **desktop marketing homepage** (see [mockups.md](mockups.md) #1). It largely confirms the visual direction (purple brand, shield logo, 4-step "How it works", phone-on-PCN hero, app store badges) but introduces **five fresh conflicts** with locked decisions. Captured here to flag for user reconciliation; the [homepage spec](screens/homepage.md) renders the safe interpretation pending user confirmation.

### F1. ✅ Visual direction — adopted
- **Decision (2026-05-19 evening)**: adopt the homepage mockup's visual structure for `snappeal.ai`.
- Purple primary `#6c5ce7` replaces the earlier blue placeholder ([brand.md](../product/brand.md) updated).
- Navy shield with white **S** is the logo silhouette ([logo.svg](../assets/logo.svg) regenerated).
- Hero structure: 🇬🇧 pill → headline with purple-highlighted noun → body → two CTAs → Trustpilot block.
- 4-card trust strip + 4-step "How it works".
- Phone-on-PCN hero visual that mirrors the in-app home screen.
- Responsive PWA: designed-for-desktop on homepage, mobile-first inside the app.
- App Store + Google Play badges added below "How it works" (greyed/coming-soon until v0.3 native wrappers ship).

### F2. 🔴 *"Expert Appeal Writers"* / *"Our team creates strong, personalised appeals"*
- **Conflict**: Reintroduces the "experts" framing locked out by [C1](#c1-voice-decided--we-draft-no-experts-framing). DoNotPay-style FTC exposure risk.
- **Action**: In the homepage spec we render the trust card as **"AI-Drafted Appeals"** with the body *"Snappeal drafts your appeal from your photos and notes — clear, formal, and tailored to the contravention."*
- **Needs user confirmation** if you want to override C1.

### F3. 🔴 *"No Win, No Fee"*
- **Conflict**: Directly contradicts the locked **£2.99 one-off non-refundable** pricing model. "No Win, No Fee" is an outcome-linked pricing model — the opposite of what we documented and the opposite of what protects us from chargeback liability (risks R9).
- **Action**: In the homepage spec we render the card as **"Pay only £2.99 — one-off, non-refundable"** with the rationale *"You pay for the work we draft and submit, not for the outcome."*
- **Needs user confirmation** if you want to actually pivot to No Win, No Fee — this is a significant business-model change (revenue model becomes outcome-contingent; refund-handling, escrow, KYC obligations all change).

### F4. 🔴 *"We send your appeal to the landowner on your behalf"*
- **Conflict**: "Landowner" implies **private parking operators** (ParkingEye, NCP, retail car parks) — out of scope per `features.md`. Council PCNs are sent to the issuing authority (Westminster, TfL, etc.), not a landowner.
- **Action**: Homepage spec renders step 3 as **"We send your appeal to the issuing council's portal (or by email if their portal's down)."**
- **Needs user confirmation** if you actually want to expand scope to private parking (a meaningfully different product — different statutory regime, different appeal body, different evidence).

### F5. 🔴 *"Made for drivers in the UK"* (hero pill)
- **Conflict**: Reintroduces UK scope, which was locked to London-only in [A2](#a2--geographic-scope-decided--london-only-for-v01).
- **Action**: Homepage spec renders the pill as **🇬🇧 Made for drivers in London**.
- **Needs user confirmation** if you want to reverse A2.

### F6. 🟡 *"Excellent · 4.7 out of 5 on Trustpilot"* (pre-launch trust signal)
- **Conflict**: We can't show a Trustpilot rating before users have rated us. Showing one fabricated is a regulatory + reputational risk (ASA UK rules on misleading claims).
- **Action**: Homepage spec omits the Trustpilot block in v0.1. Re-add in v0.2+ once we have real Trustpilot reviews. *"Thousands of London drivers trust Snappeal"* badge similarly replaced with *"Built for London drivers"* until real volume justifies the claim.
- No user reconciliation needed — this is a compliance call.

### F7. 🟡 *"We Fight. You Win."* / *"We fight your parking tickets"*
- **Conflict (minor)**: Combative "fight/win" framing conflicts with the locked honest "we draft and submit" voice in [values.md](../business/values.md) and [risks.md](../business/risks.md) (R2 SRA risk).
- **Action**: Homepage spec softens step 4 to **"We Stay With You"** with body *"We notify you when the council responds. If your appeal succeeds, the PCN is cancelled."* Top-nav sub-tagline "We fight your parking tickets" softened to **"We draft and submit your parking-ticket appeal."**
- **Open to user input**: the "fight" framing is more emotionally engaging and might convert better; the trade-off is regulatory exposure. Marketing-side decision.
