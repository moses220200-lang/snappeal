# Progressive ticket creation

**Status:** Shipped in v0.2.15. Entry point consolidated onto
`/app/tickets` in v0.2.18. v0.3.0 removed the
`/app/tickets/[id]` detail route — it's now a redirect to
`/app/tickets?expand=<id>`, so every ticket experience (upload through
auto-submit) renders on the **single list-page surface**. v0.3.1
expanded `gathering_evidence` into a numbered three-step
`<StepBlock>` ladder (grounds → details → review). Latest refresh:
2026-05-23 (v0.3.1).

ParkingRabbit uses **progressive ticket creation** for every PCN intake.
After the customer uploads or scans a parking notice, the ticket record
is created instantly and the user sees their card on `/app/tickets`
**before** OCR, council-portal status checks, or AI appeal analysis
have finished. Every subsequent step reports its own status inline
inside the smart card on the list page. There is no separate "Add a
ticket" page — file pickers live on `/app/tickets` itself.

The only static loading screen the app shows is the initial splash on
first launch. No full-page blockers after that.

## Why we do this

The old flow waited for OCR to return before navigating, behind a
full-screen "Reading your PCN" overlay. This had three problems:

1. **Felt fragile.** On a slow Claude vision pass (~6 s) or a
   transient network hiccup, the customer stared at a dead-end
   animation with nothing else to do. If anything failed mid-call
   the page sometimes never recovered without a manual refresh.
2. **Blocked navigation.** The customer couldn't go look at their
   other tickets, check the inbox, or even back out without first
   waiting for OCR to finish — and OCR has no real "cancel" semantic
   so the only escape was a hard reload.
3. **Hid work that was already real.** By the time the overlay
   appeared, the customer had handed over a ticket photo. The ticket
   exists in their head. The app should show that ticket immediately
   and report what's happening to it, not hide it behind a spinner.

Progressive creation flips the model: the ticket record exists
immediately, every backend step is just one of many things working on
that ticket, and the UI reports each independently.

## What the customer sees

1. Tap **Scan PCN** on the home hero (or the **Scan** bottom-nav tab) →
   navigates to `/app/tickets?scan=1` which auto-clicks the hidden
   library file input. (Tapping the in-page Camera/Library buttons on
   `/app/tickets` does the same thing without any navigation.)
2. Photo selected → `lib/client/uploadPcn.ts` POSTs `/api/appeals`
   (creates a fresh appeal owned by the current session — guests are
   first-class), PATCHes the new row with `pcnImageUrl`, fires
   `/api/extract` fire-and-forget. Stays on `/app/tickets`.
3. The list refreshes; the new card appears at the top, auto-expanded
   by the page's `isInFlight()` detection. Opens in the **Processing**
   state with all three pipeline rows visible as a live checklist
   (v0.3.0 — earlier versions hid rows 2/3 until OCR was done):
   - The photo is pinned to the top of the card.
   - Row 1: **Reading PCN details…** — running spinner. Reflects
     `appeal.processing.ocr.status`.
   - Row 2: **Checking issuer portal** — muted "Up next" until OCR
     finishes, then reflects `appeal.portalLookup.status`.
   - Row 3: **Generating recommendation** — muted "Up next" until the
     portal check completes, then reflects
     `appeal.processing.analysis.status`.
   - Once OCR completes, the card body transitions to **Confirm your
     ticket** (the pending-review surface with three editable rows —
     PCN reference + vehicle registration text inputs + council
     `<select>` — each with a confidence pill, plus the "I agree to
     T&Cs" button).
4. After confirm: **Checking issuer portal…** runs (background MCP
   job; the card's status pill morphs to "Validating"). Council-
   confirmed metadata streams in below as the agent reads it.
5. After lookup: the card surfaces the **needs_decision**
   recommendation with three actions: **Appeal with Rabbit** (paid),
   **Pay yourself** (free council deep-link), **Pay instantly with
   Rabbit (+£1.99) — Coming soon**.
6. Tap "Appeal with Rabbit" → card flips to **Tell us more**
   (`gathering_evidence` state). **v0.3.1 surfaces this as a numbered
   three-step `<StepBlock>` ladder inside the card body**:
   - **Step 1 · Pick your grounds.** Opens the fullscreen
     `<GroundsQuizSheet>` (75 cards / 12 collapsible categories /
     lucide outline icons / sticky search with clear / horizontally
     scrollable category chips / single-column scrollable card grid /
     "Suggested for code N" pills floating matching cards when
     `appeal.ticket.contraventionCode` is known). Tap as many cards
     as apply (drafter caps at 6 canonical grounds via `mapsTo`
     flattening).
   - **Step 2 · Add details.** Unlocks after step 1. The
     `<DictationPanel>` mounts below the chip strip showing the
     selected card labels. Auto-grow textarea (2000 char hard cap), a
     `<VoiceNoteButton mode="append">` with a live `mm:ss` timer +
     pause/resume that **appends** transcribed audio (multiple takes
     accumulate), and up to 4 guidance chips derived from the
     selected card IDs (eg `sign-obscured` → *"Describe what was
     blocking the sign"*, *"Say when you first noticed"*).
   - **Step 3 · Review & start drafting.** Unlocks once step 2 has
     either typed notes ≥ 1 char or at least one ground picked. Tap
     **Start drafting**. The card forwards `{grounds, notes}` to
     `confirmEvidenceAndDraft()` in `<TicketCard>` which PATCHes
     both fields + `step=EVIDENCE_DONE_STEP` in ONE write — no race
     between debounced notes save and the transition — then fires
     `/api/generate-stream`.
   - Each completed step shows a green check. The visual ladder makes
     progress legible at a glance; the previous single-shot UI
     conflated all three concerns.
7. **Sign-in gate (v0.2.18):** if the viewer is a guest, the card
   stashes both the chosen grounds AND the dictated notes via PATCH
   and redirects to `/sign-up?next=/app/tickets?expand=<id>&resumeDraft=1`.
   After sign-up they land back on the same card with everything
   saved — they re-tap "Start drafting".
8. Card flips to **Drafting** with a passive "we'll notify you when
   the draft is ready" footer. Once the letter lands the card moves
   to **Ready to submit**:
   - **Strength badge (v0.3.0).** The drafter returns a 0–100
     `strength.score`. Score ≥ 80 → green "Strong appeal" pill.
     50–79 → amber "Solid appeal" pill. Less than 50 → red
     `<aside>` rendered ABOVE the Pay £2.99 card with rationale +
     bullet list of evidence improvements + the Pay button label
     flips to "Submit anyway for £2.99" (not a hard gate — the user
     can still proceed).
   - Tap **Submit £2.99** → `<PaymentSheet>` → on success the card
     carries the customer through **Submitting** → **Submitted**.
     Every state on the same card.

Each step persists its own status + error on the appeal row, so:
- If the customer closes the tab, the work continues server-side and
  reappears with the right state on reload.
- If a step fails, only that step's row flips to error with a
  retry — the rest of the card stays usable.
- If the customer opens the ticket from a different device, the
  card picks up wherever the backend got to.

## What the code does

### Server side

- `appeals.processing` is a `jsonb` column carrying the per-step
  status (`{ ocr: { status, error?, completedAt? }, analysis: {…} }`).
  Each backend step writes only its own key, so steps can run in
  parallel without clobbering each other. (See migration
  `drizzle/0012_processing_status.sql`.)
- `appeals.pcn_image_url` stores the uploaded photo (Blob URL once
  Vercel Blob is wired; data URL in dev) so the smart card can show
  the image even after a refresh or on another device.
- `setProcessingStep(appealId, step, status, error?)` in
  `lib/server/appeals.ts` is the atomic merge helper. It reads the
  existing `processing` object, sets the named step, and writes back.
- `/api/extract` accepts an optional `appealId`; when present, it
  PATCHes the ticket fields on the appeal row when OCR succeeds
  and marks `processing.ocr.status = "done"`. On failure it stamps
  `processing.ocr = { status: "failed", error }` instead.
- `portal_lookup.status` continues to live on its own column (set
  by the `pcn_lookup` job). It's logically the same shape as a
  processing step, just kept separate because the job queue owns
  the lifecycle.

### Client side

- `lib/deriveCardState.ts` exposes a `processing` card state. Branch
  conditions:
  - `appeal.status === "draft"` AND
  - no portal lookup, no preferred method, no letter, AND
  - either OCR is running/failed/pending OR the ticket has no
    pcnRef/vehicleReg yet.
- `<TicketCardBody>` renders the `ProcessingCard` component for
  that state — three inline status rows (Reading PCN / Checking
  portal / Generating recommendation), the photo at the top, and
  a Try-again retry link if OCR specifically failed.
- The card polls `/api/appeals/[id]` every 2 s while in the
  processing state, until either ticket fields arrive or
  `processing.ocr.status` flips to `"failed"`. Then it transitions
  to the next state via `deriveCardState`.

### Why polling and not SSE for OCR

The pcn_lookup and submit_appeal jobs run through the in-process
job queue and stream per-event progress via SSE
(`/api/jobs/[id]/progress`). OCR is a single ~6 s Claude vision
call with no per-step progress — there's nothing to stream — and
the simplest way for the smart card to pick up the result is to
poll the appeal row at ~2 s cadence. Once OCR settles the polling
stops; the rest of the lifecycle uses SSE.

## Acceptance tests (Playwright)

- Tapping Scan PCN on `/app` lands on `/app/tickets?scan=1` and the
  file picker opens automatically (no intermediate "Add a ticket"
  page).
- The ticket appears in `/app/tickets` immediately with a "Confirm"
  or "Processing" badge, auto-expanded at the top of the list.
- The smart card body shows the uploaded image at the top, three
  editable confirmation rows (PCN ref text input / vehicle reg text
  input / council `<select>`), and the "I agree to T&Cs" button.
- Closing the tab during OCR / lookup / drafting / submitting and
  reopening the page still picks up the right state — every step
  persists on the appeal row.
- A guest who taps "Start drafting" in the gathering-evidence card
  is redirected to `/sign-up?next=...` with their grounds saved;
  signed-in users go straight to drafting.
- `/app/capture` returns a 307 redirect to `/app/tickets?scan=1`.
  `/app/validating/[jobId]` and `/app/submitting/[id]` return the
  branded 404 (those routes were deleted in v0.2.13).
- `tsc --noEmit && eslint . && next build` all exit 0.
