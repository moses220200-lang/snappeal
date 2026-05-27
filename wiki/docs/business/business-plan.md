# Business plan

Last refreshed **2026-05-27 (v0.3.10)**.

## Executive summary

**ParkingRabbit is a mobile app that turns a Penalty Charge Notice into a five-tap automated appeal.** A Londoner photographs their PCN, takes a few photos of the car and the scene, writes one or two sentences about what happened, pays £2.99, and ParkingRabbit drafts a representation letter citing the correct statutory ground and contravention code — and submits it directly to the council's online portal (or by email when the portal is unavailable).

**The opportunity is large and visibly under-served.** London authorities issued **9,462,185 PCNs in 2024-25**, up 13.5% year-on-year[^1]. Yet only **47,935 — 0.45% — reached the London Tribunals stage**, of which **49.4% were upheld in the motorist's favour**[^1]. Almost half of the PCNs that get formally challenged are wrong, but only one in 200 motorists ever challenges. The friction between "this isn't fair" and "I successfully appealed" is enormous, and it is solvable with software.

**Our position is opinionated and narrow.** We are not "AI lawyer for everything" — we are the fastest honest path to a London PCN appeal, full stop. That focus protects us from the DoNotPay outcome (FTC settlement in January 2025 for unverifiable "AI lawyer" claims[^2]) and lets us go deeper than horizontal players: per-council templates, real contravention-code logic, evidence checklists, and (in v0.2) automated submission via the council's own portal.

**Pricing is £2.99 per automated appeal — one-off, non-refundable.** Existing UK competitors sit between £4.99 per letter and £18 per submitted appeal or £50/year[^3] — we undercut the cheapest of them because our cost structure is software-only after the AI cost. We charge for the work (drafted + submitted appeal), not the outcome.

**Phase A** (wiki + business plan): **shipped**. **Phase B** (admin backend that controls the council knowledge base): **partially live** — 14 pages under `/app/admin/*` cover appeals / councils / submissions / users / jobs / health / settings / wiki / inbound mail. Full CRUD for the wiki editor and bulk-ops on councils remain open work. **Phase C** (customer-facing PWA): **shipped** as `/app/*` at v0.3.7. The Capacitor native wrappers for iOS and Android remain on the roadmap; the PWA is the production surface today.

---

## Problem

PCN recipients face four compounding frictions:

1. **Time pressure.** PCNs offer a 50% discount if paid within 14 days (or 21 if paid by post)[^4]. That clock is the most powerful tool the council has to discourage appeals.
2. **Information asymmetry.** The motorist doesn't know that their contravention code carries specific defences; that signage being obscured is a real ground; that "I parked there last week and nothing happened" isn't a ground. Councils, by definition, know this asymmetry exists.
3. **Channel fragmentation.** Each of London's 33 borough councils — plus TfL, the City of London, and the Royal Parks — has its own portal, address, format and idiosyncrasies. A motorist who lives in Camden and gets ticketed in Westminster has to learn a new system.
4. **Writing intimidation.** A formal representations letter feels like a court filing. Most motorists who try to write one give up and pay.

The net effect: **>99.5% of London PCNs are never formally appealed**[^1]. The current addressable demand — motorists who would appeal if it were easy — is somewhere between the **49.4% tribunal-win rate** and the **0.45% tribunal-appeal rate**: an enormous gap.

## Solution

A mobile app with a single screen for each step:

1. **Photos** — take the PCN photo and 0-6 evidence photos (signs, bay markings, the car in situ).
2. **Notes** — one or two sentences: *what happened?*
3. **Pay** — £2.99 via Apple Pay or Google Pay.
4. **Letter** — AI-drafted representation, editable in place, addressed to the right authority with the right ground and code.
5. **Submit** — auto-submitted via the council portal (LLM + Playwright MCP) or via email fallback when the portal is unavailable. User sees one outcome: "Submitted ✓".

The AI step is **one call**: a vision-capable model receives the photos, the notes, the council knowledge base, and the contravention-code library, and returns the extracted ticket fields + the identified council + the drafted letter together. No multi-step chatbot. No "premium" generation tier.

See [product/user-flow.md](../product/user-flow.md) for screen-level detail.

## Market

See [market.md](market.md) for the full TAM/SAM/SOM analysis. Headline: **~9.5m London PCNs/year, ~£565.7m of London parking revenue/year (Westminster alone £75.9m)**[^1][^5], <0.5% formally challenged.

## Business model

| Line item | Per appeal |
|---|---|
| Revenue | £2.99 |
| Stripe fees (Apple Pay/Google Pay, UK ~1.5% + 20p) | ~£0.24 |
| AI cost (Claude Sonnet 4.6 via Vercel AI Gateway, vision + draft) | ~£0.08 |
| Hosting & infra (amortised) | ~£0.05 |
| Chargeback + service-failure refund allowance | ~£0.03 |
| **Net contribution margin per appeal** | **~£2.59** |

This assumes v0.1 unit economics, which are conservative — Phase B onward we expect AI cost to drop further as we bind model selection to extraction complexity.

## Go-to-market

See [go-to-market.md](go-to-market.md). Three channels at launch: search ("appeal a PCN"-style intent), TikTok (short-form "I got a ticket, here's what I did" content), and council-specific SEO (one ParkingRabbit landing page per borough, ranking for "appeal a Camden PCN" etc).

## Team

To be filled — placeholder for founder bios, advisor list, hiring plan for Phase B and Phase C.

## The ask

Phase A is internally funded. Phase B and Phase C funding decision deferred until v0.1 metrics are live (see [roadmap.md](roadmap.md)).

---

[^1]: London Councils, *Enforcement and appeals statistics 2024-25*. <https://www.londoncouncils.gov.uk/news-and-press-releases/2025/london-councils-enforcement-and-appeals-statistics-2024-25>
[^2]: FTC, *FTC Finalizes Order with DoNotPay…* (Feb 2025). <https://www.ftc.gov/news-events/news/press-releases/2025/02/ftc-finalizes-order-donotpay-prohibits-deceptive-ai-lawyer-claims-imposes-monetary-relief-requires>
[^3]: PCN Appeal Assistant pricing (£4.99/letter) — <https://pcnappealassistant.co.uk/>. We Pay Your PCN pricing (£18 one-off / £50/yr) — <https://wepayyourpcn.com/appeal-service/>.
[^4]: London Councils, *London boroughs raise PCN levels for first time since 2011* — <https://www.londoncouncils.gov.uk/news-and-press-releases/2025/london-boroughs-raise-parking-and-traffic-pcn-levels-first-time-2011-0>.
[^5]: RAC Foundation, *Local Authority Parking Finances in England 2023-24* — <https://www.racfoundation.org/research/economy/council-parking-revenue-in-england-2023-24>.
