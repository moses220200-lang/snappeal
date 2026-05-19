# Competitive landscape

The UK PCN-appeal space has three layers: **free DIY**, **paid letter-shops**, and **AI-driven motoring services**. As of **2026-05-20**, the AI tier has gotten noticeably more crowded since the original draft of this doc — at least seven new entrants have launched.

## At a glance

| Competitor | Model | Price | Channel | Position vs Snappeal |
|---|---|---|---|---|
| **Citizens Advice / MoneySavingExpert** | Free DIY guides + Martin Lewis template | £0 | Web | The honest free alternative. We compete on time-to-letter, not price. |
| **Resolvo** | AI assistant via free ChatGPT | £0 | Web | Free; user submits manually. Drafts a letter, doesn't deliver it. |
| **QuickAppeal** | AI letter generator, no account | **£4.99** / appeal | Web | Cites TMA 2004 + POFA 2012 + BPA CoP in letters. No submission. |
| **PCN Beater** | AI letter, 60-second turnaround | **£6.99** digital / **£10.98** print+post | Web | Markets "better than the Martin Lewis template". Letter only. |
| **GL Appeal (GoLitigO)** | AI letters per appeal | **£9.99** / appeal | Web | Same price-point as our **monthly subscription** for unlimited. |
| **Parking Mate UK** | London-focused, AI + specialist team | bespoke | Web/mobile | **"47 defect-type checker"**, claims 70% win rate. Closest functional competitor. |
| **Appealify UK** | AI guidance + ready letters | unknown | Web | "Complete ready-to-use guidance in minutes". |
| **Parking Ticket Appeals (.app)** | AI letters + operator research | unknown | Web | Free vulnerability research on 100+ parking operators. |
| **PELP.ai (Parking Assistant)** | AI dispute/pay/appeal | unknown | Web | Covers PCN + private fines + payments. |
| **PCN Appeal Assistant** | Letter generator | £4.99 / letter | Web | Direct comp; older UX, no vision OCR, no submission. |
| **We Pay Your PCN** | Human-mediated, submission included | £18 one-off / £50/yr | Web | Closest scope match. 6× more expensive per appeal. |
| **AppealNow (Barrie Segal)** | Manual letter + dispatch | **£7.99** | Web | Established brand. Pre-AI workflow. |
| **Appeal PCN** | Templates | Free / freemium | Web | Template-led, no AI, no submission. |
| **DoNotPay** | "AI lawyer" subscription | $36/yr historically | Web + app | **Settled with FTC Jan 2025** for $193k; barred from "AI lawyer" claims without evidence. UK marketing curtailed. |
| **Traditional solicitors** | Bespoke letters | £150–£300/hr | Direct | Economically priced out for £160 PCNs. |

## Price + delivery matrix

| Service | Price | Drafts the letter | Submits the letter | Parses council replies | Mobile-native | London-focused |
|---|---|---|---|---|---|---|
| **Snappeal** | **£2.99 / appeal · £9.99/mo unlimited · Free Buy Time** | ✅ Claude Sonnet 4.6 | ✅ Playwright MCP + email | ✅ Inbox classifier | ✅ PWA + native wrapper | ✅ |
| Citizens Advice | £0 | — | — | — | — | — |
| Resolvo | £0 | ✅ ChatGPT | — | — | — | — |
| QuickAppeal | £4.99 | ✅ | — | — | — | — |
| PCN Beater | £6.99 | ✅ | (print+post for £10.98) | — | — | — |
| GL Appeal | £9.99 | ✅ | — | — | — | — |
| Parking Mate UK | bespoke | ✅ | — | — | partial | ✅ |
| Appealify | ? | ✅ | — | — | — | — |
| Parking Ticket Appeals | ? | ✅ | — | — | — | — |
| We Pay Your PCN | £18 / £50yr | manual | ✅ (manual) | — | — | — |
| AppealNow | £7.99 | manual | ✅ (manual dispatch) | — | — | — |

Three columns are uniquely ours: **submits via portal automation**, **parses council replies**, **mobile-native**. The combination is the moat.

## How we win against each

### vs free DIY guides (Citizens Advice, MoneySavingExpert, Resolvo)
The benchmark for honest free advice is high. We do not pretend to be cheaper than free. We win on:
- **Time**: five taps vs an hour of reading.
- **Specificity**: the right contravention-code defence drawn from the council's actual KB, not a generic template.
- **Submission**: we put the appeal into the council's portal. Free guides hand you a Word document.

For users who'll happily spend an hour writing their own letter, we are the wrong product. For everyone else, we're the only product.

### vs QuickAppeal (£4.99) / GL Appeal (£9.99) / PCN Beater (£6.99) / AppealNow (£7.99)
Same target user, four structural advantages:
- **Vision OCR + capture confirm** — we read the PCN from a photo and **show you what we saw** before you pay. They require typing.
- **Council-specific routing** — we know Westminster vs Camden vs TfL portal flows. They output a generic letter.
- **Auto-submission** — they end at "here is your letter". We end at "your appeal has been received, council reference X".
- **Inbox parsing** — we tell you what the council's reply means. They walk away after delivery.

We also undercut on price by 40-67%.

### vs Parking Mate UK
The closest functional competitor. They claim 70% win rate and check **47 defect types**. We need to ship our own visible defect-checker (currently Claude finds defects implicitly inside the letter — see roadmap #1) to match the perceived rigour. Their advantage today: explicit checklist UX. Our advantages: price, submission automation, reply parsing.

### vs We Pay Your PCN (£18 / £50yr)
They submit on the user's behalf — closest scope match. We are **6× cheaper per appeal** and **mobile-native**. Their model is human-mediated; ours is AI-mediated with human-edit-in-place. Their per-year £50 is still 25× our annual cost at our **Care Plan** subscription rate (£9.99/mo unlimited) for a heavy user. Acquisition candidate if markets converge.

### vs DoNotPay
The interesting one. DoNotPay's UK exit-by-attrition (FTC settlement Jan 2025 + brand damage) vacated the "AI legal for consumers" position. The mistake to avoid: they tried to be horizontal — claims, parking, refunds, breach-of-contract letters under one chatbot. The FTC found they couldn't deliver "like a lawyer" across that surface. **Our defence is to stay narrow.** Snappeal is one product (London PCN appeals), one outcome (cancelled / refunded), one price (£2.99 / Free / £9.99). We do not bolt on "appeal your council tax" or "draft a divorce filing". Vertical depth is our moat.

### vs traditional solicitors
Economically priced out — solicitor minimum engagement exceeds the £160 PCN value. We don't compete; we serve the market they cannot.

## Where the market is shifting (post the 2026 wave of AI entrants)

1. **AI letter generation is table-stakes.** Five new entrants in 12 months. "We use AI to write your appeal" is no longer differentiating.
2. **POPLA / private parking is the bigger TAM** — Parking Ticket Appeals (.app) leads with **operator vulnerability research on 100+ private operators**. We deferred POPLA in v0.1; the market is moving without us.
3. **Win-rate claims are inflating** (Parking Mate's 70%, GL Appeal's 42% POPLA). We need data to publish our own honest number.
4. **Subscription is unclaimed.** Every competitor charges per-appeal. Our **Care Plan £9.99/mo unlimited** has no peer.
5. **Mobile is unclaimed.** Most competitors are still web-only forms. Snappeal is the only true PWA + camera-native product in this list.

## Where we are vulnerable

- **Council in-housing.** If a borough adds a one-tap "appeal" flow to its own portal — citing AI-generated reasons — we lose that borough. Mitigation: stay faster and better than any council-built tool; lean on cross-borough consistency.
- **Free DIY tools getting AI.** Citizens Advice could ship an AI letter generator at zero cost. Mitigation: own the submission step. A letter is the easy part.
- **Parking Mate UK's defect checker.** A visible "47-point check" is a strong trust signal we currently lack. Mitigation: ship our own defect scorecard (see [roadmap](./roadmap.md) — coming v0.2).
- **POPLA / private parking gap.** ~70% of UK PCN appeal volume is private parking. We deferred this; competitors haven't. Mitigation: roadmap v0.3 covers POPLA + IAS.
- **A horizontal AI legal player succeeding where DoNotPay failed.** Unlikely in the 2026–2027 window but possible. Mitigation: vertical depth and council partnerships.

## Sources (verified 2026-05-20)

- [Resolvo](https://resolvo.uk/) — free, ChatGPT-backed
- [QuickAppeal](https://www.quickappeal.co.uk/) — £4.99
- [PCN Beater](https://www.pcnbeater.co.uk/) — £6.99 digital / £10.98 print+post
- [GL Appeal (GoLitigO)](https://appeal.golitigo.ai/) — £9.99 per appeal
- [Parking Mate UK](https://parkingmateuk.com/) — London-focused, 47 defect-type checker
- [Appealify UK](https://www.appealify.uk/) — AI guidance
- [Parking Ticket Appeals (.app)](https://parkingticketappeals.app/) — operator research
- [PELP.ai (Parking Assistant)](https://www.pelp.ai/) — covers PCN + private parking
- [PCN Appeal Assistant](https://pcnappealassistant.co.uk/) — £4.99
- [We Pay Your PCN](https://wepayyourpcn.com/appeal-service/) — £18 / £50yr
- [AppealNow (Barrie Segal)](https://appealnow.com/services.html) — £7.99
- [Citizens Advice — appealing a parking ticket](https://www.citizensadvice.org.uk/law-and-courts/parking-tickets/appealing-a-parking-ticket/) — free DIY baseline
- [FTC settlement with DoNotPay (Jan 2025)](https://www.ftc.gov/news-events/news/press-releases/2025/02/ftc-finalizes-order-donotpay-prohibits-deceptive-ai-lawyer-claims-imposes-monetary-relief-requires)
