# Launch strategy

Last refreshed **2026-05-27 (v0.3.10)**.

**One-sentence positioning.** ParkingRabbit scans your PCN, tells you what stage it's at, and offers two real next steps — appeal it with our paid AI workflow, or settle directly with the council. The free side is the scanner + validate-with-council check + memory. The paid side is the appeal.

**Why this shape.** The earlier "email the council for free" idea was retired in v0.2.12 — free email-the-council appeals devalue the paid product. The paid AI workflow IS the product. The commitment hook is the scan; the upsell is the £2.99 appeal. Pay-on-behalf is a future product (Apple/Google Pay surface, "Coming soon") gated on regulatory work — see [`payment-strategy.md`](payment-strategy.md).

## The funnel

```
Scan PCN  →  Validate (council portal)  →  Status check (stage + canAppeal/canPay)
                                                  │
                                                  ▼
                                    ┌─────────────────────────────────────────────────┐
                                    │  Recommendation card on /app/tickets (smart)    │
                                    │                                                 │
                                    │  PRIMARY (paid):  Appeal with Rabbit            │
                                    │  SECONDARY (free): Pay yourself  ← deep-link    │
                                    │  COMING SOON:     Pay instantly with Rabbit     │
                                    │                   +£1.99 (disabled)             │
                                    └─────────────────────────────────────────────────┘
```

The recommendation card adapts to the appeal-window state derived from the issuer connector's status snapshot:

| Stage                          | What the user sees                                                                                  |
|--------------------------------|-----------------------------------------------------------------------------------------------------|
| `discount_active` / `appeal_open` | **Primary:** Appeal with Rabbit (paid, with deadline countdown). **Secondary:** Pay yourself.       |
| `appeal_expired`               | Amber **"Appeal period expired"** banner; **primary** flips to Pay yourself.                       |
| `charge_certificate_issued`    | Red **"Charge Certificate issued"** escalation banner + current amount (+50%). Pay yourself only.   |
| `order_for_recovery`           | Red **"Order for Recovery filed"** banner. Pay yourself only.                                       |
| `enforcement`                  | Red **"Enforcement stage"** banner. Pay yourself or contact council directly.                       |
| `under_review` / `appeal_submitted` | Calm **"Council reviewing your appeal"** card; no further actions.                              |
| `paid` / `cancelled` / `closed` | Terminal cards — friendly settled / cancelled / closed copy, no actions.                            |
| `status_check_pending`         | Passive "Checking your ticket" banner; the recommendation appears once we have a verdict.           |

## Free vs paid

### Free at launch

- **Scan PCN.** OCR via Claude (a Claude-Sonnet 4.6 pass). Reads issuer + PCN ref + vehicle reg + contravention + amount + date.
- **Extract ticket details.** Auto-confirms or surfaces fields for review.
- **Basic status / stage check.** When the issuer has a connector wired up, we read the council's portal and tell you whether the appeal window is still open, whether the amount has gone up, and whether the PCN has been paid/cancelled/closed. (Mock connector for issuers without a real connector yet — clearly labelled "Preview" in the UI.)
- **Deadline tracking.** Discount window + appeal-deadline countdown.
- **Official payment portal link** ("Pay yourself"). Opens the issuer's own payment page in a new tab. We never touch funds.
- **Ticket memory / history.** Every scanned ticket persists per user; the tickets list is your dashboard.

### Paid at launch (£2.99 per appeal)

- **AI appeal analysis.** Claude reads the PCN photo + your notes + the council-confirmed metadata + warden photos pulled from the council portal, picks the strongest statutory or informal ground.
- **Appeal drafting.** 250–500 word representation letter, addressed to the right council channel.
- **Evidence pack preparation.** Photo carousel + grounds quiz + notes wired into the letter.
- **Guided submission.** Live MCP run against the council's appeals portal (where we have automation for that council) or email fallback for non-automated councils. Customer watches if they want, or stays on the ticket page and waits for the notification.
- **Auto-submit live view.** Optional — admin can hide it; default is background mode with notifications.
- **Appeal tracking.** Council reply lands in your in-app inbox via the inbound webhook; status flips automatically.

### Future (post-launch)

- **Pay instantly with Rabbit (+£1.99).** One-tap settlement. Currently disabled in the UI as **Coming soon**. Regulated work to ship — see `payment-strategy.md`.
- **Fleet dashboard.** Multi-tenant `appeals.fleet_id`; ops manager sees every PCN issued against the fleet's VRMs.
- **Employer reimbursement.** Built on top of the fleet dashboard — submit a PCN for reimbursement to your employer, who can approve or push back without leaving the app.
- **Recurring ticket management.** "Watch this VRM" — DVLA-partnered automatic detection of new PCNs against a registered vehicle, automatic classification + recommendation.
- **Automated issuer connectors.** Wave 1 (Westminster, TfL Bus Lane, Camden) → Wave 2 (more London councils) → Wave 3 (private-parking + auth-required) → Wave 4 (rail, airport, out-of-London).
- **Negotiation / advanced dispute workflows.** Witness statements at Order-for-Recovery stage; TPT (Traffic Penalty Tribunal) escalation; private-parking POPLA escalation.

## Strategic positioning

ParkingRabbit is not just an appeal app. It is becoming an **autopilot for UK parking tickets** — scan, classify, check status, decide, appeal, pay, track, remember, manage fleets, reimburse.

| Today | Next 6 months | 12–18 months | 24 months+ |
|---|---|---|---|
| Scan + Recommend + Paid Appeal + Pay-yourself deeplink | Real status connectors for Westminster / Camden / TfL; Rabbit Pay launch on one issuer | Fleet dashboard, employer reimbursement, recurring appeals | Watch-this-VRM autopilot (DVLA partnership), gate-camera OCR for fleets |

## UX copy rules

These came directly from the v0.2.12 brief — keep them when writing customer copy:

- **Don't say "Email it for free".** Free email submission was the v0.2.11 idea; it's gone.
- **Don't encourage irresponsible non-payment.** "You don't have to pay" is bad copy.
- **Use "Review before you pay", "Appeal if eligible", "Pay directly if appeal time has expired".** Reviewing is what the scan + status check IS.
- **Payment is an outcome, not the core product.** We're not a payment processor; we're an appeal-and-management assistant that *can* deep-link the issuer's payment page.

## What ParkingRabbit deliberately is NOT doing at launch

- We are **NOT** holding customer funds (Rabbit Pay stays disabled).
- We are **NOT** offering free email submission as a customer-facing path. (Email submission still survives inside `runSubmission` as a portal-fallback for non-automated councils on the £2.99 path — but it's not a "free" customer choice anymore.)
- We are **NOT** offering POPLA / TPT escalation flows. v0.3+ scope.
- We are **NOT** claiming we automate every UK issuer. Read-side connectors land one issuer at a time; the UI surfaces a "Preview — connector not live yet" pill whenever the mock connector is in use.

## Code anchors

- `apps/web/components/ReviewRecommendation.tsx` — three-action card with `canAppeal`-driven branch.
- `apps/web/components/TicketCard.tsx` + `TicketCardBody.tsx` — smart card on `/app/tickets`. The state machine moved from the deleted `<TicketActionPanel>` into `lib/deriveCardState.ts` (11-state discriminated union) in v0.2.13; the body picks the right surface per `cardState.kind`. (`<ReviewRecommendation>` is mounted by the body for the `needs_decision` state.)
- `apps/web/lib/server/connectors/types.ts` — `TicketStage` enum + the `canAppeal` / `canPay` / `daysLeftToAppeal` shape.
- `apps/web/lib/server/connectors/mock.ts` — deterministic samples per stage.
- `apps/web/app/api/submit/route.ts` — single £2.99 portal path. The previous v0.2.11 free-email branch was removed in v0.2.12.

## Open questions

1. **When do we ship the first real status connector?** Westminster's lookup MCP is reusable; the status connector is a sibling. Aim: pilot Westminster + 1 other London borough within ~6 weeks of launch.
2. **What's the trigger for revisiting Rabbit Pay?** Probably appeal-volume signal + a partnered PSP that can act as the agent of record. See `payment-strategy.md` for the full set of regulatory gates.
3. **Per-issuer payment URL.** Today's "Pay yourself" deep-link reuses `council.appealPortalUrl`. Most councils route appeals + payments through the same portal page; a few don't. When the gap first surfaces in customer feedback, add a dedicated `paymentUrl` column to the councils table.
