# Market

## Headline figures

| Metric | Latest year | Source |
|---|---|---|
| London PCNs issued | **9,462,185** (2024-25, +13.5% YoY) | [^1] |
| London PCNs issued previous year | 8,333,486 (2023-24, +9.7% YoY) | [^2] |
| London parking revenue | **£565.7m** (England councils, London share, 2023-24) | [^3] |
| Top single issuer by revenue | **Westminster — £75.9m** (2023-24) | [^3] |
| Top issuer by PCN volume | **Westminster — 469,204 PCNs** (2023-24) | [^7] |
| Formal appeals reaching London Tribunals | **47,935** (2024-25) | [^1] |
| % of PCNs reaching tribunal stage | **0.45%** | calc from [^1] |
| Tribunal success rate (appellant wins) | **49.4%** (2024-25) | [^1] |
| TfL red-route PCN income | £83.4m (2023-24) | [^4] |
| Band A PCN charge | £160 (50% if paid within 14 days) | [^5] |
| Band B PCN charge | £130 (50% if paid within 14 days) | [^5] |

## TAM — Total addressable

The total addressable market for an appeal service is the full population of London PCN recipients each year. Treating one PCN as one potential customer transaction:

**TAM = 9.46 million annual transactions × £2.99 = ~£28.3m/year (London alone)**

Extending to all UK civil parking enforcement (estimated 25–30m PCNs/year nationally, including private parking operators) would multiply this by ~3×. Phase A focuses on London.

## SAM — Serviceable available

Not every PCN recipient is a candidate. We exclude:

- PCNs paid within the 14-day discount window where the recipient never contests (estimated ~60% of issued PCNs — exact figure not published[^1], inferred from council revenue/PCN-volume ratios).
- PCNs where the alleged contravention is clear-cut (parked on a double yellow, blue-badge bay without badge, etc.) and the recipient knows they'll lose.
- PCNs issued to commercial fleets, where the registered keeper is a company and appeals are handled centrally by fleet managers.

A conservative SAM treats the remaining **~30%** of PCNs as potentially appeal-relevant:

**SAM = 9.46m × 30% × £2.99 ≈ £8.5m/year**

## SOM — Serviceable obtainable (3-year)

If Snappeal captures **5% of the SAM** by Year 3:

**SOM (Year 3) = ~£425k ARR**

That is the *floor*. Two leverage points expand it significantly:

1. **Each PCN doesn't have to convert at the time of issue.** A user who appeals once is materially more likely to appeal again. If average user lifetime is 2 PCNs (UK private cars in inner London average more than this), per-user LTV doubles.
2. **The tribunal win rate is the upper bound on demand.** 49.4% of PCNs that reach tribunal are won. If our app can credibly raise the *appeal* rate from 0.5% toward even 5%, the latent demand we're tapping is an order of magnitude larger than the SAM above.

## Why now

Three timing factors favour launching in 2026:

1. **PCN charges rose in January 2025** — the first increase since 2011 (Band A from £130 to £160; Band B from £110 to £130)[^5]. Higher stakes per ticket → more willingness to pay £2.99 to appeal.
2. **AI vision quality crossed a usability threshold in 2024-25.** Reading a smudged hand-written PCN ticket reliably is now an off-the-shelf capability via Claude Sonnet 4.6 + Vercel AI Gateway.
3. **DoNotPay's contraction (FTC settlement January 2025)[^6]** vacated the "consumer AI legal" position. There is no incumbent. The remaining UK competitors are pre-AI letter-template shops.

## Per-borough volumes (2023-24)

Top issuers in London by PCN volume[^7]:

| Borough | PCNs (2023-24) | Notable mix |
|---|---|---|
| Westminster | **469,204** total | Highest single issuer |
| Newham | 439,131 total (**281,037 parking**) | Mix of parking and moving traffic |
| Hammersmith & Fulham | 436,537 total | Over half (273,401) are moving traffic |
| Lewisham | **216,673 parking** | Parking-heavy |
| Islington | **190,918 parking** | |
| Kensington & Chelsea | **184,684 parking** | |

The top 6 boroughs alone account for ~24% of total London PCN volume. Concentration matters for v0.3 council automation rollout — investing in the top 5 portals captures the most user-relevant coverage per engineering hour.

For context, the largest UK council issuer outside London is **Brighton and Hove** at 160,162 parking PCNs[^7].

## Adjacent market — private parking tickets

A separate but adjacent market is **private parking operators** (ParkingEye, NCP, etc.) governed by the IAS/POPLA regime rather than TMA 2004:

- **~15.9 million private parking tickets issued in the UK in the year to September 2025** — up 17% YoY from 13.6m[^8].
- Industry-side data sourced via Press Association from DVLA records.
- Currently **out of scope** for Snappeal v0.1/v0.2 (different evidence regime, different appeal body) — revisited post-v0.3 per the [roadmap](roadmap.md).

If we expanded into private parking, the addressable market roughly **doubles** vs councils alone.

## Honest gaps — what's still missing

Closed in this revision:

- ✅ Top-borough PCN volume rankings (above).
- ✅ AppealNow's pricing — **£7.99 per parking ticket appeal**[^9]. Updated in [competitive-landscape.md](competitive-landscape.md).

Still open (tracked in [data-gaps.md](data-gaps.md)):

- **% paid at discount vs full vs written off** — not in public London Councils reports; the relevant TEC committee detail is unpublished. Requires an FOI request to close.
- **UK keyword-search volume for PCN-appeal intent** — Google Keyword Planner / Ahrefs / SEMrush all require account access; not closeable via public web search.
- **Full mid-tier borough volumes** (boroughs ranked 7–20 by PCN volume) — partially available in individual borough annual reports; would require ~30 separate fetches.

These should be closed before any investor conversation.

---

[^1]: London Councils, *Enforcement and appeals statistics 2024-25* — <https://www.londoncouncils.gov.uk/news-and-press-releases/2025/london-councils-enforcement-and-appeals-statistics-2024-25>
[^2]: London Councils, *Enforcement and appeals statistics 2023-24* — <https://www.londoncouncils.gov.uk/news-and-press-releases/2024/london-councils-enforcement-and-appeals-statistics-2023-24>
[^3]: RAC Foundation, *Local Authority Parking Finances in England 2023-24* — <https://www.racfoundation.org/research/economy/council-parking-revenue-in-england-2023-24>
[^4]: Regit, *TfL cashes in: red route fines soar by 57% in five years* (citing TfL FY23/24) — <https://www.regit.cars/car-news/tfl-cashes-in-red-route-fines-soar-by-57-in-five-years>
[^5]: London Councils, *London boroughs raise PCN levels for first time since 2011* — <https://www.londoncouncils.gov.uk/news-and-press-releases/2025/london-boroughs-raise-parking-and-traffic-pcn-levels-first-time-2011-0>
[^6]: FTC, *FTC Finalizes Order with DoNotPay…* — <https://www.ftc.gov/news-events/news/press-releases/2025/02/ftc-finalizes-order-donotpay-prohibits-deceptive-ai-lawyer-claims-imposes-monetary-relief-requires>
[^7]: Honest John, *Revealed: The Councils which issue the most parking tickets* (citing 2023-24 data) — <https://www.honestjohn.co.uk/news/driving/2024-05/revealed-the-councils-who-issue-the-most-parking-tickets/>. Additional totals from Nationwide Vehicle Contracts, *London Parking Fines Rising in 2025* — <https://www.nationwidevehiclecontracts.co.uk/blog/london-parking-fines-rising-in-2025>.
[^8]: Times and Star / Press Association, *How to appeal a parking ticket as 15.9 million issued in 2025* (year to Sept 2025) — <https://www.timesandstar.co.uk/news/national/uk-today/25731703.appeal-parking-ticket-15-9-million-issued-2025/>.
[^9]: AppealNow services and pricing — <https://appealnow.com/services.html> (Parking Ticket Appeal £7.99; Wheel Clamp / Towing £14.99).
