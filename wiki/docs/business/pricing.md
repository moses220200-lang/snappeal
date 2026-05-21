# Pricing

> **2026-05-21 (v0.2.0) — ParkingRabbit pivot.** The previous three-tier model (Buy Time / Full Appeal / Care Plan) has been retired. The product is now a parking-ticket management app (pay, challenge, track), surfaced as three actions on `/app` home. The "MCP agent" name no longer appears in customer copy; user-facing language is **"AI Auto-Submit Agent"**.

## Headline

**Three actions, two paid lines.**

- **Review my ticket** → Free. Scan the PCN, OCR the fields, see Pay / Challenge / Reminders options. No card.
- **Pay a ticket** (`/app/pay`) → **Ticket amount + £1.99 ParkingRabbit service fee**. The user authorises us via an explicit checkbox; we pay the council on their behalf. Stripe-ready surface, real Stripe keys pending.
- **Challenge a ticket** → **Free to draft. £2.99 per auto-submission. One-off, non-refundable.**
  - Drafting the appeal letter (vision OCR, grounds picker, AI-drafted representation, saved to inbox) → free, unlimited. No card on file.
  - Auto-submitting that letter through the council's portal via the **AI Auto-Submit Agent** → £2.99 per submission, opt-in on the ticket-detail screen via `PaymentSheet`.

£2.99 buys the **submission work** — the AI Auto-Submit Agent operating the council portal on your behalf — not the **outcome**. We're priced like a service, not a wager: you pay for the submission we deliver, not for whether the council says yes.

**One service-failure exception**: if our system fails to deliver the appeal (e.g., AI generation fails on retry, the council portal is unreachable for an extended period, payment is taken but no letter is produced), we issue an exceptional refund. That is a service-quality remedy — not an outcome refund.

## Why £2.99 specifically

Three anchors set the price:

1. **The PCN itself.** A Band A PCN paid at the 14-day discount is £80; the full charge is £160. Appealing must not feel like extra punishment. £2.99 is **1.9% of the discount amount**, **0.9% of the full PCN at Band A** — low enough to be a no-brainer for anyone who feels the ticket is unfair.

2. **What competitors charge.**

   | Service | Price | Notes |
   |---|---|---|
   | PCN Appeal Assistant | £4.99 per letter | DIY letter shop[^1] |
   | AppealNow | £7.99 per parking ticket appeal | Drafts + dispatches[^6] |
   | We Pay Your PCN | £18 one-off / £50/year | Submits on user's behalf[^2] |
   | Citizens Advice template | Free | Pure DIY[^3] |

   £2.99 undercuts the cheapest paid competitor by 40% while doing materially more (vision OCR, AI drafting, eventual auto-submission). The £4.99–£7.99–£18 paid band sits in motorists' minds; we sit just below it.

3. **The price test psychology.** Sub-£3 is the standard "impulse purchase" threshold in UK consumer software — below the friction line where users reach for terms-and-conditions or compare alternatives. £2.99 is the canonical anchor here (apps, in-app upgrades, micro-services).

## Unit economics

For each £2.99 paid:

| Line item | Amount | Notes |
|---|---|---|
| Revenue | **£2.99** | gross |
| Stripe Payment Element (Apple Pay/Google Pay) | -£0.24 | UK card ~1.5% + 20p; Apple/Google Pay no surcharge[^4] |
| AI cost (Claude Sonnet 4.6 via Vercel AI Gateway) | -£0.08 | vision + drafting, ~6 images + 800-word output |
| Hosting & infra (amortised) | -£0.05 | Vercel Pro + Neon Postgres + Blob |
| Chargeback + service-failure refund allowance (~1% of revenue) | -£0.03 | Stripe dispute fees and exceptional service-failure refunds |
| **Net contribution margin** | **£2.59** | per appeal |

**Net margin: 87% per appeal.** Software business with payment-rails costs.

## Why non-refundable

Our deliverable is the **work**, not the **outcome**. We charge for the AI-drafted representation and (from v0.2) its submission to the council. Whether the council cancels the PCN is determined by the facts and the evidence, not by us. This pricing logic is the same one a courier uses: you pay for the delivery, not for the recipient's response.

Three reasons we hold this line:

1. **Honest expectation-setting at point of sale.** A non-refundable price forces the pre-purchase copy to be unambiguous: *"You're paying for the appeal we draft and submit. We can't and don't guarantee the council will cancel your PCN."* Users read this before they tap pay. No-one is surprised after the fact.

2. **No perverse incentive to claim defeat.** With an outcome-linked refund, a user who lost — or worse, lost interest — has reason to argue they did. The arbitration cost (us asking for proof of council response) is high. A flat non-refund eliminates that surface entirely.

3. **Service-failure remedy still exists.** If our system fails to deliver — generation crashes, payment processed but no appeal produced, council portal unreachable for an extended period — we refund. That is a contractual remedy under the Consumer Rights Act 2015 (service not performed with reasonable care and skill). It is not an outcome refund and is administered case-by-case.

We deliberately do **not** offer outcome-linked refunds, even partial ones. We tried that framing in an earlier draft of this doc — it sounded "aligned with the user" but in practice it would mean acting as our own claims adjuster on every lost appeal. That's a different business.

## What we will not do

- **No subscriptions.** A subscription is the wrong shape for an event-driven product. Most users will appeal 1–3 PCNs ever.
- **No premium tier.** The £2.99 product is the whole product. We will not split "basic letter" from "premium-with-tribunal-prep". The full appeal stages are one product.
- **No upsell to legal services.** When an appeal goes to tribunal in person, that's outside our scope. We point the user to the London Tribunals self-representation guidance[^5]. We do not charge for the referral.
- **No "PCN credits" / packs.** Bundling pre-purchased appeals to inflate ARR would mis-signal what the user actually wants.

## When pricing will change

- **Up:** if (a) AI costs unexpectedly rise; (b) the v0.2 auto-submission engine consumes meaningfully more Sandbox compute than projected; (c) data shows users would happily pay £3.99–£4.99 (A/B test in v0.2).
- **Down:** if volume scales beyond ~50k appeals/month, AI per-call cost halves at scale, and competitive pricing pressure emerges.

Either direction is communicated in-app to existing users 14 days ahead.

---

[^1]: PCN Appeal Assistant — <https://pcnappealassistant.co.uk/>
[^2]: We Pay Your PCN — <https://wepayyourpcn.com/appeal-service/>
[^3]: Citizens Advice, *Appealing a parking ticket* — <https://www.citizensadvice.org.uk/law-and-courts/parking-tickets/appealing-a-parking-ticket/>
[^4]: Stripe UK pricing (standard rates) — <https://stripe.com/gb/pricing>
[^5]: London Tribunals — <https://www.londontribunals.gov.uk/>
[^6]: AppealNow services and pricing — <https://appealnow.com/services.html>
