# Payment strategy

ParkingRabbit handles three customer-facing payment surfaces — live, planned, or off-limits:

| Surface | Live? | What we charge | What we touch |
|---|---|---|---|
| **Appeal — £2.99 per appeal (AI workflow)** | Live | Customer card via Stripe PaymentIntent. | We're the merchant. Goods = AI review, drafting, evidence pack, guided submission. |
| **Pay yourself** | Live | Nothing. | We open the council's own payment page in a new tab. The customer transacts with the issuer directly. |
| **Pay instantly with Rabbit (+£1.99)** | **Coming soon — disabled** | (Future) Customer card via Stripe; we settle the PCN with the issuer on their behalf and keep the £1.99 fee. | (Future) We briefly hold customer funds, OR route through a partner PSP. **Regulated activity.** |

This doc explains the reasoning behind that table and the work needed before Rabbit Pay can ship.

## Today — the £2.99 paid appeal

- **What we sell.** The AI appeal workflow: review of the PCN photo + council-confirmed metadata + warden photos, drafting of the representation letter, evidence pack preparation, and guided submission (live MCP for automated councils or email fallback for non-automated ones). Customer-facing surface is the smart `<TicketCard>` on `/app/tickets`. The `letter_ready` state shows the strength badge + "Submit appeal for £2.99" CTA (or "Submit anyway for £2.99" when `strengthScore < 50`) → PaymentSheet.
- **PSP.** Stripe. Apple Pay + Google Pay auto-detected. Cards via Stripe Payment Element.
- **Refund policy.** Non-refundable for the appeal service. (We're paid to draft + submit, not for the outcome. Surfaced on the paywall + receipt.)
- **VAT.** Single-currency (GBP) Stripe account; VAT treatment is "out of scope" at launch volume but should be reviewed once monthly turnover crosses the threshold.
- **Server-side gates** (`/api/submit`):
  - **Council-portal verdict gate.** Returns `409 PCN_NOT_APPEALABLE` if the portal lookup says the PCN is paid / closed / not_found and the user hasn't overridden the verdict. Defence in depth against accidentally charging the card for an appeal that can't go anywhere.
  - **PaymentIntent verification.** The submit job is only enqueued after Stripe confirms the PaymentIntent succeeded (skippable with `SNAPPEAL_SKIP_PAYMENT_CHECK=1` in dev).

## Today — Pay yourself (deep-link, free)

The recommendation card's "Pay yourself" action opens `statusSnapshot.paymentUrl ?? council.appealPortalUrl` in a new tab via `target="_blank" rel="noopener noreferrer"`. We never see the card details; the customer settles directly with the issuer.

**Why this is the right launch shape:**

- Zero regulatory exposure for us. We're a recommender + directory, not a payment processor.
- Friction is real but unavoidable — the customer has to navigate the council's portal themselves. They already would have without us; we're just removing the "find the link" step.
- Even Pay-yourself customers stay in the funnel — their PCN data + the eventual status-check outcome (paid, escalated, cancelled) feeds the dataset that powers the future autopilot.

**Open items:**

- Many councils route paying and appealing through the same portal page; some don't. When the gap first surfaces in customer feedback, add a dedicated `paymentUrl` column on `councils` so the deep link lands on the right place.
- Private-parking issuers (ParkingEye, Euro Car Parks, ...) don't expose a stable "payment URL" — they expect login + ticket lookup + card form on the same page. For those issuers the Pay-yourself action degrades to "Go to {issuer}'s site". Per-issuer connector roadmap covers this.

## Coming soon — Pay instantly with Rabbit (+£1.99)

The big bet. Tap once, Rabbit settles the PCN with the issuer, customer gets a receipt. The £1.99 is the convenience fee and the long-term moat (charge a small markup, build a status-checker monopoly, win recurring users).

**Why it stays disabled at launch:**

### 1. Regulatory posture

UK pay-on-behalf is a regulated activity. Two viable paths:

- **a) FCA-authorised Payment Institution / E-Money Institution (PI/EMI).** ParkingRabbit becomes a regulated firm. Application, capital adequacy, ongoing reporting, audit. Lead time: 6–12 months from a clean start.
- **b) Agency model on top of an authorised PSP.** Partner with an existing PSP (Stripe, Modulr, Plaid Pay, etc.) and operate as their agent. ParkingRabbit never touches funds; the PSP holds them in segregated accounts and releases on instruction. Lead time: weeks to months depending on the partner; the contract + commercial terms are non-trivial.

We choose between (a) and (b) when appeal-funnel volume justifies the work. Until then Rabbit Pay stays disabled.

### 2. Per-issuer payment connector

Even once the regulatory side is solved, we still need to actually pay the issuer. There is no central UK payment API:

- **Council PCNs (London boroughs + TfL).** Most expose a card-payment form on their public portal. A few have machine-readable IPRO endpoints (Westminster does); most don't. Where there's no API, we drive Playwright MCP — but that requires storing customer card details (PCI scope) OR routing through a tokenised pre-paid card per payment (operationally expensive).
- **Private parking companies** (ParkingEye, Euro Car Parks, APCOA, NCP, Horizon). All require login or PCN+VRM lookup, most have CAPTCHA, some have anti-bot fingerprinting. Each is its own connector with its own rollout cost.
- **Rail / airport.** Smallest volume, highest variance. Defer.

The roadmap is to launch Rabbit Pay with ONE issuer (Westminster, almost certainly) once the regulatory model is settled, then expand one issuer per month. Status-checker roadmap in `architecture/status-checker.md` runs ahead of Pay-on-behalf rollout.

### 3. Operational risk controls

Before flipping `disabled={false}` on the Rabbit Pay block, the following must exist:

- **Idempotency.** A second tap on the same PCN must not double-pay. Idempotency key = `${appealId}-pay-${attemptNumber}`.
- **Retry policy.** Issuer portals are flaky. Retry on transient errors; do NOT retry on declined cards; surface a friendly retry to the customer on permanent failures.
- **Receipts.** Forward the issuer's confirmation (PDF + reference number). Do NOT mint our own "Paid" badge until the issuer has confirmed clearance.
- **Refunds.** When the issuer rejects the payment after we've taken the card, the customer's card is refunded automatically within 24h. Chargeback playbook for disputed appeal-flow charges.
- **Audit log.** Every Rabbit Pay attempt + its issuer round-trip is recorded in `payments` (existing table) + a new `payment_attempts` table with the issuer's raw response stored read-only after write.
- **Timing safeguard.** Never charge the customer's card before the issuer has accepted the payment, OR hold the funds in a Stripe HOLD and release with delivery-versus-payment (DvP) semantics. Exact wiring depends on the PSP partner.

### 4. UI honesty

When Rabbit Pay launches, we surface ONLY the issuers we've actually wired up. The recommendation card must show a clear pre-state: "Rabbit Pay supports your council" before the action is enabled per-ticket. We never silently fall back to a manual workflow that the customer thought was instant.

## Code anchors

- **Disabled placeholder.** `<TicketCardBody>` in `apps/web/components/TicketCardBody.tsx` renders the Rabbit Pay block as a non-interactive `<div aria-disabled>` with the Coming soon pill inside the `needs_decision` flavored "recommendation" state (and the `escalated` flavor's escalation card). There is no onClick handler.
- **Existing PaymentSheet.** `apps/web/components/PaymentSheet.tsx` handles the £2.99 appeal-flow charge. Its Stripe-Elements wiring is the starting point for Rabbit Pay — same `<PaymentElement>`, different `PaymentIntent` purpose, different post-confirm flow (issuer settle vs job enqueue).
- **Future API surface.** `POST /api/appeals/[id]/rabbit-pay` (not yet built) would mirror `/api/submit` — verify the PaymentIntent, enqueue a `pay_pcn` job kind, return `submissionId`. The `pay_pcn` job kind would replace `submit_appeal` with the issuer-payment connector.

## What we explicitly DON'T do at launch

- We do **not** hold customer funds.
- We do **not** charge for failed appeals. (The £2.99 is for the service. If the appeal can't be submitted at all, no charge fires.)
- We do **not** offer "free email submission" as a customer-facing path. The earlier v0.2.11 idea was rolled back in v0.2.12 — it devalued the paid product. Email submission still survives inside `runSubmission` as a *portal-fallback* on the £2.99 path, for unautomated councils. It's not a separate free button.
- We do **not** auto-pay on the customer's behalf without an explicit tap.
- We do **not** advertise Rabbit Pay as live in any marketing surface. The "Coming soon" pill is the only place the long-term product is named.
