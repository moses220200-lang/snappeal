# Competitive landscape

The UK PCN-appeal space has three layers: **free DIY**, **paid letter/template shops**, and **horizontal AI legal players**. Each has a flaw Snappeal exploits.

## At a glance

| Competitor | Model | Price | Channel | Position vs Snappeal |
|---|---|---|---|---|
| **Citizens Advice / MoneySavingExpert** | Free DIY guides | £0 | Web | The honest free alternative. We compete on time-to-letter, not price. |
| **PCN Appeal Assistant** | Letter generator | £4.99 per letter[^1] | Web | Direct competitor; older UX, no auto-submission, no vision OCR. |
| **We Pay Your PCN** | Submitted appeals + membership | £18 one-off / £50 per year[^2] | Web | Closest in scope. We're 6× cheaper per appeal and mobile-first. |
| **AppealNow** (Barrie Segal) | Letter-drafting + dispatch | **£7.99** per parking ticket appeal[^4] (£14.99 wheel-clamp / towing) | Web | Established brand. Drafts a customised letter and dispatches on the user's behalf. |
| **Appeal PCN** (appealpcn.co.uk) | Templates | Free / freemium | Web | Template-led, no AI, no auto-submission. |
| **DoNotPay** | "AI lawyer" subscription | $36/yr historically | Web + app | **Settled with FTC January 2025** for $193k; barred from "AI lawyer" claims without evidence[^3]. UK marketing curtailed. |
| **Traditional solicitor** | Bespoke | £150–£300/hr | Direct | Economically irrelevant for a £160 PCN — solicitor minimum engagement exceeds the fine. |

## How we win against each

**vs free DIY guides (Citizens Advice, MoneySavingExpert)**
The benchmark for honest free advice is high. We do not pretend to be cheaper than free. We win on **time** (five taps vs an hour of reading), **specificity** (the right contravention-code defence, not a generic template), and **submission** (we actually put the appeal into the council's portal). For users who'll happily spend an hour writing their own letter, we are the wrong product. For everyone else, we're the only product.

**vs PCN Appeal Assistant (£4.99/letter)**
Same target user. Three structural advantages:
- **Vision OCR** — we read the PCN from a photo; they require the user to type the fields in.
- **Council-specific routing** — we know that Camden uses one portal flow and Westminster another; they output a generic letter.
- **Auto-submission (v0.2)** — they end at "here is your letter". We end at "your appeal has been received, reference number X".

We also undercut on price by 40%.

**vs We Pay Your PCN (£18 / £50yr)**
Closest scope competitor (they submit on the user's behalf). We are **6× cheaper per appeal** and **mobile-native**. Their model is human-mediated; ours is AI-mediated with human-edit-in-place. They are a candidate for partnership or acquisition if the markets converge.

**vs AppealNow (£7.99)**
The closest direct competitor by service shape — they draft and dispatch a letter, like we do. They charge **£7.99 per parking ticket appeal**[^4]. We sit at **£2.99**, a 63% undercut. Their service is presumed manual / template-led (Barrie Segal's brand has a long history pre-AI); ours is AI-vision + AI-drafted + (v0.2) auto-submitted. The unit-economics gap is structural: a manual service can't reach £2.99 profitably.

**vs DoNotPay**
The interesting one. DoNotPay's UK exit-by-attrition (FTC settlement plus brand damage) vacated the "AI legal for consumers" position. The mistake to avoid: DoNotPay tried to be horizontal — claims, parking, refunds, breach-of-contract letters, all under one chatbot. The FTC found they couldn't deliver "like a lawyer" across that surface. **Our defence is to stay narrow.** Snappeal is one product (London PCN appeals), one outcome (cancelled or refunded), one price (£2.99). We do not bolt on "appeal your council tax" or "draft a divorce filing." Vertical depth is our moat.

**vs traditional solicitors**
Solicitors are economically priced out. For PCN appeals specifically, the market price for a solicitor letter exceeds the PCN value, so solicitors do not pursue this market. We do not compete with them; we serve the market they cannot.

## Where we are vulnerable

- **Council in-housing.** If a borough adds a one-tap "appeal" flow to its own portal — citing AI-generated reasons — we lose that borough. Mitigation: stay faster and better than any council-built tool, and lean on cross-borough consistency (one app for all of London).
- **Free DIY tools getting AI.** Citizens Advice could ship an AI letter generator at zero cost. Mitigation: own the submission step. A letter is the easy part; submission and tracking are the hard parts.
- **A horizontal AI legal player succeeding where DoNotPay failed.** Unlikely in the 2026–2027 window but possible. Mitigation: vertical depth and council partnerships.

[^1]: PCN Appeal Assistant — <https://pcnappealassistant.co.uk/>
[^2]: We Pay Your PCN — <https://wepayyourpcn.com/appeal-service/>
[^3]: FTC, *FTC Finalizes Order with DoNotPay…* — <https://www.ftc.gov/news-events/news/press-releases/2025/02/ftc-finalizes-order-donotpay-prohibits-deceptive-ai-lawyer-claims-imposes-monetary-relief-requires>
[^4]: AppealNow services and pricing — <https://appealnow.com/services.html> (verified 2026-05-19).
