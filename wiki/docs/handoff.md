# Context handoff

**Read this first if you're picking up Snappeal cold.** Last refreshed **2026-05-20 (v0.1.6)**.

> **2026-05-20 (later session)** — pricing simplified to **free drafting + £2.99 per auto-submission**; council logos now sourced from Wikipedia thumbs and stored in `councils.logo_url` / `logo_bg` (migration 0009); new `<CouncilBadge>` component renders the logo + name in the tickets list, ticket detail, admin appeals/submissions, and the manual-entry authority picker; homepage now has a "Covering these London authorities" logo strip; hero copy is "Appealing a / PARKING TICKET / Is your right." with a faded Union Jack circle behind the phone mockup; bottom-nav active tab now correctly highlights in `text-snappeal-primary` (a global `a { color: inherit }` rule was beating the Tailwind utility — moved into `@layer base`).

This page exists so a new collaborator (human or Claude) can get to "I know what's shipped and what's next" in 5 minutes. Everything below is current as of the latest commit on `main`.

## TL;DR

Snappeal is a London-only PCN appeal app. The v0.1 prototype frontend + backend are **live end-to-end** in dev:

- **Real Postgres persistence** (Docker locally, Neon planned for prod).
- **All AI piped through the headless Claude CLI** (`lib/server/claude-cli.ts`).
- **Postgres-backed job queue** + in-process worker for portal submission.
- **Email/password auth** with HS256 JWT cookies; admin role gate.
- **Free-to-draft pricing**: AI-drafted appeal letters are FREE and unlimited (saved to the user's inbox). £2.99 is charged only when the user opts to **auto-submit** the letter through the council's portal via the MCP agent. The legacy three-tier model (Buy Time / Full Appeal / Care Plan) is being retired — copy now says "Free to draft, £2.99 to auto-submit". Schema field `appeals.serviceTier` is still present but no longer surfaced in the wizard.
- **Full admin UI** at `/admin` — appeals, councils (with **per-council Playwright MCP automation editor + dry-run**), submissions, inbound mail (with **classifier sandbox**), jobs (retry / cancel), users, health.
- **Westminster portal automation** scaffolded — prompt lives in `council_automation` table, edited via `/admin/councils/westminster/automation`, dry-run-able from the same page.

Not deployed anywhere yet. Architecture is "Vercel for web tier + dedicated worker box" — see `architecture/deployment.md`.

## Where everything lives

| Need this? | Read this |
|---|---|
| File-by-file inventory of the codebase | [architecture/prototype.md](architecture/prototype.md) |
| Schema + ER diagram + migration log | [architecture/data-model.md](architecture/data-model.md) |
| Auth — JWT, sessions, sign-up flow | [architecture/auth.md](architecture/auth.md) |
| How AI is wired (Claude CLI, all three callers, cost) | [architecture/ai-pipeline.md](architecture/ai-pipeline.md) |
| Submission engine (portal + email + per-council prompts) | [architecture/submission-engine.md](architecture/submission-engine.md) |
| Job queue mechanics | [architecture/job-queue.md](architecture/job-queue.md) |
| Admin UI in detail | [architecture/admin.md](architecture/admin.md) |
| Notification layers (haptics / confetti / Web Push) | [architecture/notifications.md](architecture/notifications.md) |
| Production deployment runbook | [architecture/deployment.md](architecture/deployment.md) |
| Pricing model (Free / £2.99 / £9.99) | [business/pricing.md](business/pricing.md) |
| Roadmap + v0.1 status | [business/roadmap.md](business/roadmap.md) |
| Competitor landscape (Resolvo, QuickAppeal, etc.) | [business/competitive-landscape.md](business/competitive-landscape.md) |
| Gamification design (win-rate ring, confetti) | [product/gamification.md](product/gamification.md) |

## What's shipped vs in-flight vs blocked

### ✅ Shipped + working end-to-end

- **Backend**: Postgres schema (11 tables), **9 migrations applied** (`0000…0008`). Email/password auth with JWT. Claude CLI piped headlessly. Job queue with FOR UPDATE SKIP LOCKED + retries + per-job `progress` jsonb event log. Submission engine (portal + email fallback, falls back on both throw AND `success=false`). Inbound mail webhook + Claude classifier. Care Plan subscription scaffold (with dev stub when Stripe price not set). **`users.address_line1/2 + city + postcode + phone` columns** (migration `0008`) loaded into the portal agent prompt by `loadCustomerProfile()` — but the personal-details UI form doesn't yet capture them, so they're effectively NULL in practice.
- **Frontend**: All app pages (Home, Tickets, Inbox, Profile + 6 sub-pages, Capture, Notes, Paywall, Letter, manual-entry wizard, **Submitting live-view**, **Watch redirect**). Sticky glass headers (light variant for app, dark variant available for special pages). 5-tab bottom nav with centered camera. WizardOnboarding + WizardSheet reusable patterns. Pricing tier strip on Home. Real Stripe + fake-pay dev buttons.
- **Admin**: 13 admin pages — Overview, Appeals (list + detail), Councils (list, **create**, edit, **MCP automation editor + dry-run + reset-to-canonical**), Submissions (with **per-row appeal-context dry-run**), Inbound (with **classifier sandbox**), Jobs (with **retry/cancel + per-row appeal-context dry-run**), Users, Health (**+ MCP headed/headless toggle + stop-at-review safety toggle**), Wiki (iframe). Mobile nav drawer. Layout adds `px-5 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-[1400px]` content padding so cards don't press against the sidebar.
- **Westminster MCP automation**: canonical prompt seeded, editable from admin, dry-run-able against the live portal (Variant A/B route detection, 1× retry on transient "service unavailable", stops at review, screenshots every milestone).
- **Live submission UX**: every customer submit fires `submit_appeal` → worker drives Claude+Playwright MCP → screenshots stream to `/app/submitting/<jobId>` via SSE. Ticket card shows a **navy "Snappeal AI is filing your appeal"** strip while `status=submitting`, linking through `/app/watch/<appealId>` to the live job page. Corporate-themed (light glass header, outline icons, milestone ladder).
- **AI features**: Per-field confidence dots on capture, photo coach (sheet on poor photos), Strengthen-my-notes one-tap rewrite (sheet with preview), AI inbox triage (one-line summary per thread), streaming letter SSE endpoint, voice notes (Whisper-compatible transcription endpoint).
- **PWA features**: Web Push service worker (`public/sw.js`), VAPID-ready subscribe button, haptic feedback (Vibration API), confetti on cancelled status, no-zoom viewport, iOS safe-area insets.
- **Docs**: 12 architecture + product + business pages refreshed for the current state.
- **Tests**: `tests/api.spec.ts` + `tests/app.spec.ts` rewritten for the real surface. `scripts/test-e2e-backend.ts` runs full backend audit in ~30 s.

### 🟡 In-flight (scaffolded but not fully wired)

- **Care Plan real Stripe subscription** — UI live + endpoint live + dev stub returns success. Real path needs `STRIPE_CARE_PLAN_PRICE_ID` + the Stripe Subscription product created in the dashboard.
- **Web Push delivery** — service worker + subscribe endpoint live. The sending side (worker reads inbound classification, fires `web-push.send` to stored subscriptions) is not yet wired. Needs `web-push` npm package + `VAPID_PRIVATE_KEY`.
- **Inbound mail DNS/MX** — `/api/inbound` webhook handler is ready. DNS/MX for `appeals.snappeal.ai` + Postmark/Resend pick is open.
- ~~**Streaming letter UI**~~ — done. Paywall consumes `/api/generate-stream` and the Letter page now polls `/api/appeals/[id]` until `letterBody` lands (2 s interval, ~3 min cap). See "Streaming letter hang fix" in today's update log.
- **`public/submissions/<jobId>/` cleanup** — live-submission PNGs accumulate forever. Add a daily cron that wipes anything older than 7 days. Low priority until disk pressure shows.
- **UA rotation for headless Chromium** — deferred. No evidence Westminster blocks on UA (the `WE66452241 / S99SNN` dry-run sailed through). Revisit if/when a portal trips Bot Manager.

### ⛔ Blocked on external accounts

- **Apple OAuth** — Apple Developer Program enrolment (1–4 wk lead time).
- **Google OAuth** — Google Cloud OAuth client.
- **App Store submission** — Apple Developer + Capacitor wrapper (v0.3 scope).
- **Live Stripe** — UK business verification.
- **Live inbound mail** — Postmark / Resend account + DNS.

### ❌ Not started (next session candidates)

- **Defect-type scorecard** — second Claude call returning a 47-point defect check. Beats Parking Mate UK's marketing pitch.
- **POPLA / private parking** — the bigger TAM (~70% of UK appeal volume). Out of v0.1 scope per the locked decision.
- **Council win-rate dashboard** — per-council aggregate "appeals via Snappeal win X%" on the paywall.
- **Apple Wallet pass** for submitted appeals.

## How to run it locally

```bash
docker compose up -d                 # Postgres on 127.0.0.1:5544
cd apps/web
npm install
npm run db:migrate                   # all 9 Drizzle migrations (0000–0008)
npm run db:seed                      # 7 seeded councils
npm run dev                          # http://localhost:3001
```

### Required env (`.env.local`)

```env
DATABASE_URL=postgres://snappeal:snappeal@127.0.0.1:5544/snappeal
AUTH_SECRET=32+ random chars
NEXT_PUBLIC_SNAPPEAL_FAKE_PAYMENT=1   # dev only — bypass Stripe
SNAPPEAL_SKIP_PAYMENT_CHECK=1         # dev only — skip Stripe verification
SNAPPEAL_SUBMISSION_LIVE=1            # default is LIVE; set =0 to mock the engine
# SNAPPEAL_MCP_HEADED=1               # show Chromium window during MCP runs (also togglable at /admin/health)
# ANTHROPIC_API_KEY=sk-ant-...        # else uses CLI OAuth session
# CLAUDE_MODEL=claude-sonnet-4-6
```

The full list is in `apps/web/.env.example`. See `architecture/infra.md` for prod env vars.

### Smoke tests

```bash
npm run test:claude              # CLI wrapper ping, ~9 s
npm run test:e2e:backend         # full backend audit, ~30 s
npm run lint && npx tsc --noEmit && npm run build  # CI parity
npm run test:e2e                 # Playwright UI suite
```

### Admin access

```bash
# Sign up via the UI (/sign-up), then:
npm run admin:promote -- your@email.com
# Sign back in — you'll auto-redirect to /admin
```

## The agentic MCP loop (Westminster)

This is the most differentiating thing in the codebase. Read it once.

1. `lib/server/submission/prompts/westminster.ts` — canonical Claude+Playwright MCP prompt. Now contains explicit **Variant A vs B route detection** ("Challenge / Make a representation" — never "View images" or "Pay"), a 1× retry on transient "service not currently available", and milestone screenshot mandate.
2. Admin opens `/admin/councils/westminster/automation` — prompt auto-seeded into `council_automation` table on first visit.
3. Admin edits the prompt + field hints → **Save**. To revert to canonical, hit **Reset to canonical** (one-click `DELETE` + re-seed).
4. Admin clicks **Dry-run against live portal** → spawns `claude -p` with `@playwright/mcp` attached → agent navigates the real portal, stops at the review page (DOES NOT submit), screenshots every milestone, returns JSON.
5. Trace + cost + screenshot path + `appealId` (if scoped) + tool-call list persist to `council_automation.last_dry_run`.
6. Iterate until dry-run is reliably green. From `/admin/jobs` or `/admin/submissions`, click **Dry-run** on a failed `submit_appeal` row to replay the agent against that appeal's real PCN/reg without resubmitting.
7. **Live customer submit** is on by default (`SNAPPEAL_SUBMISSION_LIVE` flag defaults to LIVE — set `=0` to opt-out and use the mock). `/api/submit` enqueues `submit_appeal` → worker (`instrumentation.ts` boot) claims via `FOR UPDATE SKIP LOCKED` → `runPortalAutomation({jobId, …})` → loads per-council prompt, plumbs `jobId` for live progress emission, watches `process.cwd()` + workDir for PNGs (`@playwright/mcp` ignores `--output-dir` on Windows) → SSE delivers events to `/app/submitting/<jobId>` → ticket card shows the **navy "AI is filing your appeal" strip** linking through `/app/watch/<appealId>`.
8. Admin can flip **MCP browser visibility** (headless ↔ headed) at `/admin/health` to watch Chromium drive the portal in a visible window during the next dry-run or live submission.

## Update log — 2026-05-20 (streaming letter hang fix)

The drafting flow felt hung on the paywall and could dead-end on the letter page. Four small fixes, no schema change.

- **Restored `confirmedTicket` forwarding in `/api/generate-stream` (`app/api/generate-stream/route.ts`)** — the streaming-letter cutover dropped two pieces from the older `/api/generate` route's call to `generateDraft`: the user's already-confirmed ticket fields (`body.confirmedTicket`), and the `generateSemaphore` concurrency wrap. Without `confirmedTicket`, Claude re-OCRed the PCN from scratch on every request even though the user had already extracted+confirmed the fields on `/app/capture` — on real photos that re-OCR pushed the call past the 120 s CLI timeout, the row landed at `step = "generation_failed"`, and admin saw silent dead drafts. **This was the actual root cause of the "drafting hangs / admin drafts silently failing" report.** The route now mirrors `/api/generate` exactly — forwards `confirmedTicket` and acquires the same semaphore so a burst of concurrent SSE requests can't fork unbounded `claude` subprocesses.
- **Paywall phase ladder honest (`app/app/paywall/page.tsx`)** — the SSE `appeal` event used to advance the milestone ladder straight to "ground", which then sat pulsing for the entire ~30 s `generateDraft` call (no further events flow during that window). The ladder now stays on "Reading your PCN photo" until the `ticket` event arrives, then "Identifying the strongest grounds", then "Drafting…" when the `ground` event lands. Matches the canonical event order in `architecture/ai-pipeline.md`.
- **Letter page polls instead of one-shot fetch (`app/app/letter/[id]/page.tsx`)** — was a single `useEffect` fetch; any visit that arrived before `attachDraftToAppeal` committed was stuck on "Refresh in a moment" forever (tickets list → in-flight appeal, direct URL, refresh during chunk stream). Now polls `/api/appeals/<id>` every 2 s with a 90-poll cap (~3 min) until `letterBody` lands or `step === "generation_failed"`. Fallback UI is a spinner ("Snappeal AI is still drafting…") not a refresh nag.
- **Generation failures no longer leave zombie rows (`app/api/generate-stream/route.ts` + `lib/server/appeals.ts`)** — the route's catch block now calls a new `markAppealFailed(appealId)` that flips `step` to `"generation_failed"`. The letter page surfaces a red "We couldn't draft this appeal — Retry drafting" card linking back to `/app/paywall`. The next successful `attachDraftToAppeal` resets `step` to `"ready"`, so the marker self-clears on recovery.

Files touched: `apps/web/app/app/paywall/page.tsx`, `apps/web/app/app/letter/[id]/page.tsx`, `apps/web/app/api/generate-stream/route.ts`, `apps/web/lib/server/appeals.ts`.

Verified via DB inspection: pre-fix the two most recent failed rows (`ap_pwlrtp8fhqzz48lx`, `ap_rn5bej6thyzr6b78`) both terminated at exactly 120.05 s — matching the `generateDraft` CLI `timeoutMs: 120_000`. Older stuck rows from before the `markAppealFailed` catch-handler patch are still at `step = "photos"` (zombie) — they pre-date this fix and are not the streaming route's fault going forward.

## Update log — 2026-05-20 (v0.1.5 — audit + UX bundle)

This pass shipped the system audit, four user-requested UX fixes, and the doc-sync work in one PR. apps/web is now at version `0.1.5`.

**Audit fixes**

- **Health/engine drift** — `/api/health` + `/admin/health/page.tsx` now report the submission engine as LIVE when `SNAPPEAL_SUBMISSION_LIVE !== "0"` (matches `lib/server/submission/index.ts:29`). Previously health said "mock" while the engine was actually live with the env unset.
- **Push subscribe clobber** — `POST /api/push/subscribe` now merges against existing `notificationPrefs` instead of overwriting, so the user's email/push toggles aren't wiped on each subscribe.
- **Worker dead budget** — removed `generate_draft: 4` from the worker's `CONCURRENCY` table; the handler was throwing `not yet implemented` and burning retries.
- **Dead code** — deleted unused `ParkingTicketStub` (landing), `_unused()` + `void readFile` (portal + automation), `void runStructured` (generate-stream).
- **Admin users column leak** — `app/admin/users/page.tsx` now selects only the rendered columns; `passwordHash` no longer rides the RSC payload.

**Security fixes**

- New ownership-check helpers in `lib/server/viewer.ts`: `canViewAppeal()` + `getRequestSessionId()`. Read from JWT cookie OR `x-snappeal-session` header (also accepted as `?session=` query param on the SSE route since EventSource can't send headers).
- `/api/appeals/[id]` (GET + PATCH) — requires ownership.
- `/api/submit` — requires ownership.
- `/api/jobs/[id]` — requires ownership; strips `payload` + `lockedBy` on the wire.
- `/api/submissions/[id]/progress` — requires ownership before opening the SSE stream.
- `/api/auth/sign-up` + `/api/auth/sign-in` — only claim guest appeals when `body.sessionId` matches the `x-snappeal-session` header (defends against guessed-sessionId inheritance).
- `/api/inbound` — `INBOUND_WEBHOOK_SECRET` is now REQUIRED in `NODE_ENV=production`. Without it the endpoint returns 503.
- `/api/care-plan/waitlist` — `GET` is now auth-gated; uses the viewer's email instead of an unauthenticated `?email=` query (removes the enumeration oracle).
- All four guest-scoped client fetches now send `x-snappeal-session` (`/api/appeals/[id]` from letter + ticket pages, `/api/submit` from letter page, `/api/submissions/[id]/progress` from submitting page via `?session=` query).

**PWA overlap fix (capture / notes / manual-entry / submitting)**

- `components/BackHeader.tsx` no longer applies a negative top-margin. The sticky header now reserves its full height (incl. safe-area inset) in normal flow, matching `AppHeader`'s working pattern.
- `app/globals.css` — `.snappeal-content-top` bumped to `1.25rem`; `html { scroll-padding-top }` bumped to `safe-area-inset-top + 76px`.
- `app/app/capture/page.tsx`, `app/app/notes/page.tsx`, `app/app/manual-entry/page.tsx` — appended `snappeal-content-top` to their first content wrappers so the first card has proper headroom under the sticky header on notched iPhones.

**Logo consolidation**

- `components/Logo.tsx` rewritten as the canonical source. Two exports: `SnappealMark` (shield only) and `SnappealLogo` (shield + wordmark). Two variants: `dark` (navy fill, white check, default) and `light` (white fill, navy check, for hero sections). Backward-compat aliases `ShieldLogo` + `Wordmark` retained.
- Shield path: `viewBox="0 0 80 80"`, rounded-square shield with a soft tip, hollow tick inside (stroked, rounded caps).
- `AppHeader.tsx`, `SnappealSplash.tsx`, `app/icon.svg`, `app/apple-icon.tsx`, `app/opengraph-image.tsx`, `app/twitter-image.tsx`, `app/sign-up/page.tsx`, `app/sign-in/page.tsx` — every inline `<svg>` shield was replaced with the canonical mark (or the matching inline path on the OG/apple route handlers where ImageResponse can't import client components).

**Landing headline brush stroke**

- New `public/seconds-underline.svg` — single-path vector brush stroke in brand yellow `#f5b740`.
- `app/page.tsx` — replaced the SVG squiggle under "Appeal it in seconds." with the brush-stroke image positioned under the word "seconds" only. The phrase now has `whitespace-nowrap` so "Appeal it in" and "seconds" stay on one line.

**Signup form: name, phone, address autocomplete, OAuth**

- `components/AddressAutocomplete.tsx` — new client component, postcode-driven city autofill via free public `api.postcodes.io` (no API key required). Optional `NEXT_PUBLIC_GETADDRESS_API_KEY` for full address-line search (unset = postcode + manual line entry, which is enough for the portal agent).
- `components/OAuthButtons.tsx` — branded "Continue with Apple" (black) + "Continue with Google" (white + multi-colour G glyph). Click → `/api/auth/oauth/<provider>?next=…`.
- `app/api/auth/oauth/[provider]/route.ts` — stub returning 503 + "configure these env vars" until OAuth credentials land. Provider-required env vars listed in the response so the operator sees exactly what's missing.
- `lib/server/auth.ts` — `CreateUserInput` + `createUser()` extended for `phone`, `addressLine1`, `addressLine2`, `addressCity`, `addressPostcode`.
- `app/api/auth/sign-up/route.ts` — Zod schema extended; sessionId-claim now verifies the header.
- `app/sign-up/page.tsx` — full rewrite: OAuth buttons up top, divider, then form ordered Full name → Email → Phone → Address (postcode + lines) → Password. Logo uses the canonical `SnappealMark`.
- `app/sign-in/page.tsx` — OAuth buttons added above the email form; logo swapped to canonical mark.
- `components/WizardOnboarding.tsx` — `AuthStep`'s three buttons now wire real flows: Apple/Google → `/api/auth/oauth/<provider>`, Email → `/sign-up`.

**Personal-details: capture phone + address (Task 2 from "what to do next")**

- `/app/profile/personal-details` now captures `displayName`, `phone`, and full UK postal address (line 1, line 2, city, postcode) via the same `AddressAutocomplete` component used on sign-up. The DB columns existed since migration 0008; the profile UI now writes to them.
- `/api/auth/me` GET returns `{ user, profile }` (profile = `{ phone, addressLine1, addressLine2, addressCity, addressPostcode }`); PATCH accepts all five fields. JWT cookie stays small — profile fields are not in the token.

**Streaming letter cutover (Task 5)**

- `/app/paywall` now consumes `/api/generate-stream` via `fetch().body` + a tiny SSE parser at `lib/client/sse.ts` (`EventSource` can't POST a JSON body). The `GeneratingOverlay` accepts new `phase` + `streamedText` props; the milestone ladder advances on real `appeal` / `ticket` / `ground` / `done` events, and the bottom of the overlay renders the letter being typed live as `chunk` events stream in.
- Old synchronous `POST /api/generate` callsite removed. `/api/generate` route stays for backwards-compat; no client uses it now.
- Letter page (`/app/letter/[id]`) unchanged — it still loads the already-persisted appeal; the streaming endpoint calls `attachDraftToAppeal` before emitting any chunks, so the route handler order keeps the DB authoritative.

**Doc sync**

- `.env.example` — rewritten with all 25+ referenced vars grouped (Auth / DB / Claude+AI / Stripe / Submission / Inbound / Push / OAuth / Wiki / Address). Inline comments explain every variable.
- This `handoff.md` — gotcha #6 corrected (`NEXT_PUBLIC_WIKI_URL`, not `WIKI_URL`); migration count fixed in the "How to run it locally" block (was "6", actually 9).
- `architecture/prototype.md` — substantially refreshed (routes + components + migrations + admin-shipped status).
- `architecture/infra.md`, `architecture/system-overview.md` — "11 tables" + `council_automation` added to storage diagrams.
- `architecture/auth.md` — users snippet now lists service_tier, notificationPrefs, address_*, phone.
- `architecture/submission-engine.md` — fallback pseudocode updated, default-LIVE noted.
- `architecture/job-queue.md` — `progress jsonb` added to DDL; shipped items removed from Open work.
- `architecture/notifications.md` — `VAPID_SUBJECT` removed (not referenced in code).
- `business/roadmap.md` — bump migration count; move admin UI to ✅; OAuth scaffold noted.
- `wiki/mkdocs.yml` — `product/gamification.md` added to nav (was orphan).
- Root `README.md` + `apps/web/README.md` — rewritten to point at the wiki handoff as canonical instead of the old "v0.1 prototype mock-data driven" framing.

## Update log — 2026-05-20 (third pass)

- **Card-based grounds quiz** replaces the old free-text + chip UI on `/app/notes` (step 2). Component: `components/GroundsCardQuiz.tsx` + catalogue at `lib/grounds-catalog.ts`. Six categories (Signs & markings, Permits & exemptions, Active use, Necessity & emergency, Wrong vehicle, Council error) covering ~25 customer-facing cards that each map to one of the 11 canonical groundIds. Customer selections persist in sessionStorage (`snappeal.selectedGrounds`) and feed `GenerateRequest.preferredGroundCardIds`. Old textarea demoted to a collapsible "optional note" `<details>` at the bottom of the page.
- **Unified step-1 flow** — `/app/manual-entry` (council → PCN → reg → review) now routes back to `/app/capture?from=manual` instead of skipping straight to `/app/notes`. The capture page detects the manual ticket and renders the same field grid + evidence-upload zone, with a banner explaining the customer can still snap the PCN if they want. `canContinue` accepts EITHER a photo OR a manual ticket. Step-1 subtitle changed from "Photos" → "Ticket details".
- **Tips page got a `BackHeader`** — was the only `/app/*` route still rendering its own bare header. Now matches every other in-app sub-page.
- **WizardOnboarding skipped for signed-in users** — on mount it pings `/api/auth/me`; if a user row comes back, it stamps `snappeal.wizardDone` and hides immediately. Local skip-flag still works for returning guests.
- **OG / Twitter share images + favicon** — `app/icon.svg` (rounded white tile with blue shield), `app/apple-icon.tsx` (180×180 ImageResponse), `app/opengraph-image.tsx` + `app/twitter-image.tsx` (1200×630 ImageResponse with Snappeal mark + headline + yellow PCN). `metadataBase` + `siteName` + `twitter.card` added to root metadata. Manifest refreshed with shortcuts ("New appeal", "Tickets").
- **Hydration mismatch fix** — `<html suppressHydrationWarning>` + `<body suppressHydrationWarning>` covers attributes injected by browser extensions (`__gcrremoteframetoken`, Grammarly, dark-reader, etc.) before React hydrates.
- **Yellow parking-ticket headline** — `ParkingTicketStub` component renders an SVG of the iconic UK PCN ticket on the landing hero: bright `#ffc92a` body, diamond-hatched black/white border (`pattern`) only on the **top + bottom** edges, half-circle perforations on the long sides, "PARKING TICKET" set in Helvetica Neue 900 with `textLength + lengthAdjust` so the full word always fits. Sits flat (no tilt).
- **Production build clean** — `npm run build` passes after fixing one Next.js route-segment-config issue (`twitter-image.tsx` was re-exporting `runtime`; must be inline). All 38 routes compile.

## Update log — 2026-05-20 (later in the day)

Layered on top of the morning's session:

- **Stop-at-review safety mode** — `SNAPPEAL_ALLOW_REAL_SUBMIT` env (default unset) means the agent NEVER clicks Finish on the council portal unless explicitly armed. Defaults to ON in dev/staging. Toggleable from `/admin/health` (red-bordered "Safety mode" panel with confirm dialog). The accidental WE68106503 submission at 17:05 prompted this.
- **Live submission report** for WE68106503 archived in `public/submissions/job_submit-appeal_mpe92yny_846ec412/` — 7 screenshots, including `06-06-confirmation.png` (the council's "Challenge submitted" page).
- **Slideshow controls** on `/app/submitting/[id]` — prev/next arrows + play/pause + step counter + dot indicators. Slideshow auto-advances at 2 s, locks to manual on first click.
- **PWA fixes** — landing-page sticky header now adds `pt-[env(safe-area-inset-top)]` so iOS status bar can't overlap the Snappeal wordmark. `.snappeal-content-top` bumped to `1rem`, `.snappeal-content-bottom` to `6.5rem` so app cards have proper headroom + clear the bottom nav.
- **Brand refresh** —
  - Landing hero "PARKING TICKET." rendered as a yellow ticket-stub with sawtooth/perforated edges (CSS clip-path) and Impact/Anton condensed type. Component: `ParkingTicketStub` in `app/page.tsx`.
  - Hero subtitle: "Challenge your London parking ticket easily. Upload the notice, answer a few questions, and we'll draft the appeal." (replaces older "Snappeal helps London drivers…" copy.)
  - Hero CTAs swapped to App Store + Google Play badges (no "Coming soon" pill, Google Play styled as a light glass outline).
  - Footer download tile uses `variant="on-dark"` — white outlines on transparent.
  - `AppHeader` uses the blue Snappeal "S" shield (replaces the legacy navy "P").
  - `WizardOnboarding` + `SnappealSplash` ticket SVG swapped to the realistic UK PCN-in-plastic-wallet (yellow square, diamond-hatched border, "PENALTY CHARGE NOTICE / WARNING" copy).
- **Bottom nav** — active tab now uses just `text-snappeal-primary` (no pill, no dot, same stroke weight) per the design feedback.
- **Profile page** — login controls (Sign out / Sign in + Create account) moved to the top of the page. Admin badge uses `bg-snappeal-navy` + `!text-white`. "Open admin dashboard" link also gets white text.
- **"Watch the AI submission" CTA** persists on the ticket card + ticket detail page for any appeal that's gone through `submitting` / `submitted` / `under_review` / etc. — not just live. Adds a "SNAPPEAL AI" eyebrow + Live pulse when actively filing.
- **Customer profile plumbing** — `runPortalAutomation` calls `loadCustomerProfile(appeal.userId)` and injects `displayName`, signup `email`, postal address fields, and phone into the agent prompt. Removes the "C/o Snappeal / Foreign address" fallback when fields are present.
- **Migration 0008** — `address_line1`, `address_line2`, `address_city`, `address_postcode`, `phone` on `users`. **UI form to capture these still pending** (personal-details page currently shows displayName + email only).
- **Icon refresh + social share** —
  - `app/icon.svg` for the favicon (blue shield on white rounded background).
  - `app/apple-icon.tsx` — 180×180 ImageResponse so iOS home-screen icon stops 404'ing.
  - `app/opengraph-image.tsx` + `app/twitter-image.tsx` — 1200×630 share-card with Snappeal shield + headline + yellow PCN. `metadataBase` + `siteName` + `twitter.card` added to layout metadata.
  - `manifest.webmanifest` updated with `/icon.svg` + `/apple-icon`, app shortcuts ("New appeal", "Tickets"), `start_url: /app`.
- **Hydration** — `<html suppressHydrationWarning>` added in `app/layout.tsx` so browser extensions (Grammarly, GCR screen recorder, etc.) injecting attributes don't trigger the React mismatch warning. Doesn't suppress mismatches deeper in the tree.

## What landed in this session (2026-05-20)

The headline: the customer Submit button now actually drives an MCP-powered Westminster portal submission, the customer watches it happen live in a corporate-branded `/app/submitting/<jobId>` page, and the admin has fine-grained controls to dry-run / replay / watch the browser drive.

- **Per-row dry-run buttons** on `/admin/submissions` + `/admin/jobs` — joined through `appeals.councilSlug`, scoped to the actual appeal's PCN ref / vehicle reg / grounds / letter. Shared `DryRunButton` modal (lives in `components/DryRunButton.tsx`). Reset-to-canonical button on the automation editor.
- **Live progress streaming** — new `jobs.progress jsonb` column (migration `0007_live_submission_progress.sql`), `JobProgressEvent` discriminated-union type. Helpers in `lib/server/jobs/progress.ts`: `appendProgress`, `readProgress`, `queuePosition`, `watchScreenshots`. SSE endpoint at `/api/submissions/[id]/progress`. `runPortalAutomation` translates MCP tool calls into customer-friendly step events; assistant text becomes `thought` events.
- **`/app/submitting/[id]`** — customer-facing live view of the AI driving the portal. Now light-themed and corporate: `BackHeader` (sticky glass-light, same language as every other in-app page), outline icons, milestone ladder, calmer activity log, no traffic-light browser chrome.
- **`/app/watch/[appealId]`** — convenience server-side redirect to the appeal's latest job. Used by the **navy "AI is filing your appeal" CTA strip** that appears on the ticket card + ticket detail page while `status=submitting`.
- **MCP headless/headed toggle** at `/admin/health` (component `McpHeadedToggle.tsx`, `/api/admin/settings/mcp`, in-memory store in `lib/server/settings.ts`). Flip ON to watch Chromium drive in a visible window for the next dry-run or live submit.
- **Submit-engine LIVE by default** — `runSubmission` now reads `SNAPPEAL_SUBMISSION_LIVE !== "0"` (live unless explicit `=0`). Email fallback fires on **both** thrown errors AND `success: false` returns from `runPortalAutomation`.
- **Westminster prompt rewrite** — explicit "Challenge / Make a representation" route selection (never View / Pay), 1× retry on transient "service not currently available", milestone screenshot mandate. Wrapper-side check that rejects `success=true` if no PNG ever lands.
- **Screenshot pipeline fixed end-to-end** — `@playwright/mcp` ignores `--output-dir` on Windows and writes PNGs to `process.cwd()`. The dry-run wrapper now sweeps cwd post-run; `watchScreenshots` polls cwd every 1s to forward them to `public/submissions/<jobId>/` and emit `screenshot` events.
- **JSON parser hardened** — agent JSON wrapped in ``` ```json ``` ``` fences is now extracted via brace-balance walking, not a greedy regex.
- **Tool-call sniffing** — `DryRunResult.toolCalls` lists every MCP tool the agent called, with inputs. Pinpoints lying / skipped tool calls in seconds.
- **Realistic PCN-in-wallet SVG** — replaced the yellow Westminster mock in the splash + onboarding scan animation with the iconic UK plastic-wallet warning notice (diamond-hatched border, "PENALTY CHARGE NOTICE / WARNING / IT IS AN OFFENCE…"). Files: `components/SnappealSplash.tsx → RealisticPcnInWallet`, `components/WizardOnboarding.tsx → MiniWestminsterPCN`.

## Recent commits (most recent first)

```
(pending — this session's work is staged but unpushed at the time of this doc refresh)
23d8115  Docs: capture the gotchas from this session
56a34bc  Claude CLI: add --verbose flag required by --print + stream-json
ef43dcf  Worker crashloop fix + Claude CLI error transparency
4f969bb  Embed wiki at /admin/wiki via iframe inside the admin shell
a94c8b3  Wiki link: bind wiki container on localhost:8800 + update default URL
b242de6  gitignore: also exclude admin-audit and admin-councils screenshots
ae928e7  Admin build-out: council CRUD, MCP automation editor, mobile nav, wiki link
56e96a8  v0.1 backend live: Claude CLI, queue, auth, admin, gamification + docs refresh
```

## Gotchas you'll hit fast (lessons from the last few hours)

These are real footguns I tripped over. Listing them here so the next person doesn't.

1. **postgres-js + drizzle's raw `sql\`\`` template can't bind a JS `Date`.** Always pre-serialize with `.toISOString()` before interpolating into a `sql\`...\`` template. Drizzle's typed query builder (`db.update(...).set({ ... })`) handles Date fine — the issue is exclusively the raw-SQL path. Bit me in `lib/server/jobs/queue.ts → claimNext()` (worker crashloop) and `app/admin/page.tsx` (dashboard query). Both fixed.

2. **Claude CLI: `--print` + `--output-format stream-json` requires `--verbose`.** Hard CLI requirement, fails with exit code 1 and a clear stderr otherwise. `runAgentic` includes `--verbose` now; the verbose preamble lines aren't JSON so the existing line-parse loop ignores them.

3. **`ClaudeCliError` swallowed stderr** for a while — the error message was the opaque `claude exited with code N` line and the actual cause was on the error object but never made it into the response body. Fixed: the constructor now folds the stderr tail (600 chars) + stdout tail (300 chars) into `.message`.

4. **Next.js `Edit` tool gotcha**: the Write/Edit pair requires you to *re-Read* a file after a Write before the next Edit can apply. A few admin layout edits in this session failed and had to be retried because of that.

5. **`document.cookie = ""` doesn't clear httpOnly cookies.** When testing sign-out via MCP, hit `POST /api/auth/sign-out` instead of trying to wipe `snappeal.token` from JS.

6. **The wiki container had no host port binding.** Default `NEXT_PUBLIC_WIKI_URL` was an unreachable `theailab.dev` subdomain. Fixed by binding the MkDocs container to `127.0.0.1:8800` in `docker-compose.yml` and defaulting the env var to that. (Note: the env var is `NEXT_PUBLIC_WIKI_URL`, read by `app/admin/wiki/page.tsx`. A previous version of this doc called it `WIKI_URL`.)

7. **`@playwright/mcp` first-install takes ~30 s.** First dry-run from `/admin/councils/<slug>/automation` will fetch the package via `npx -y`. Subsequent runs hit the cache.

8. **`@playwright/mcp` ignores `--output-dir` on Windows.** `browser_take_screenshot({filename:"foo.png"})` lands the PNG in `process.cwd()` (typically `apps/web/`) regardless of the flag. `lib/server/submission/automation.ts → rescuePngsFromCwd()` sweeps cwd post-run; `lib/server/jobs/progress.ts → watchScreenshots()` polls cwd every 1s so the live page also gets the screenshots. Don't remove these — without them the live UX shows zero PNGs even when the agent reports success.

9. **The agent prefers `browser_snapshot` (text) over `browser_take_screenshot` (PNG).** Its tool description literally says "this is better than screenshot" — so even an explicit prompt asking for PNGs gets shortcut. The dry-run wrapper now checks `allScreenshots.length > 0` and overrides `ok=false` if the agent lied about taking screenshots. The fix at the model-control surface is the explicit "REQUIRED SCREENSHOTS / wrapper verifies / accessibility snapshots prove nothing" block at the top of the dry-run prompt override.

10. **Agent JSON comes wrapped in ` ```json ... ``` ` fences.** A naive `\{[\s\S]*\}\s*$` regex won't match because of the trailing ` ``` `. The parser now does brace-balance walking and picks the longest balanced object (or falls back to the fenced block). Lives in `automation.ts → extractAgentJson()`.

11. **`SNAPPEAL_SUBMISSION_LIVE` is captured at worker-boot.** The worker singleton is initialised once from `instrumentation.ts`. After changing `.env.local`, HMR may reload route handlers but **not** the worker — every customer submit will keep taking the old mock/live path until you `Ctrl+C` + `npm run dev`. `/api/health` will appear correct (it reads env fresh) while the worker is wrong; that mismatch is the canary.

12. **Onboarding wizard covers the page on first visit.** `localStorage.setItem('snappeal.wizardDone', '1')` skips it. Don't try to drive past the wizard via MCP for non-onboarding flows — it'll wallpaper the target page.

## Open questions / decisions waiting

- **Provider for transactional + inbound mail.** Postmark Inbound is the front-runner. Decision needed before live launch.
- **Worker hosting** — Fly.io vs Railway vs Vercel Sandbox. All work; Fly is cheapest for one always-on machine.
- **POPLA / private parking** — defer past v0.1, or pull forward to capture the bigger TAM?
- **OAuth — Clerk vs hand-rolled.** Hand-rolled is committed; Clerk would be a drop-in replacement and unlock Apple+Google instantly.

## How this doc stays accurate

- It's the **first** doc updated when something major lands.
- All other architecture docs are children of this one; they may go stale but `handoff.md` should not.
- A fresh session should `cat wiki/docs/handoff.md` before doing anything else.
