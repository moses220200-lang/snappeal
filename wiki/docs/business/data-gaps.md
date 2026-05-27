# Data gaps — open research questions

Last refreshed **2026-05-27 (v0.3.10)**.

Honest list of what the business plan doesn't yet have hard data for. Closed items are kept here for traceability.

## ✅ Closed

### Per-borough PCN volumes
Per-borough PCN volume rankings for the top 6 London issuers found. Westminster 469k, Newham 439k (281k parking), Hammersmith & Fulham 437k, Lewisham 217k parking, Islington 191k parking, K&C 185k parking[^1]. Documented in [market.md](market.md).

### AppealNow pricing
**£7.99 per parking ticket appeal** (£14.99 wheel-clamp / towing)[^2]. Documented in [competitive-landscape.md](competitive-landscape.md) and [pricing.md](pricing.md).

### Adjacent market — private parking
~15.9m private parking tickets (PE / NCP / private operators) issued in UK year to Sept 2025, +17% YoY[^3]. Documented as an adjacent market in [market.md](market.md). Currently out of scope for v0.1/v0.2.

---

## 🟡 Open — needs action

### % paid at discount vs full vs written off
**Status**: Not in any public London Councils report. The TEC committee's underlying breakdown is unpublished.

**Why it matters**: Calibrates our SAM. If 80% of PCNs are paid at discount within 14 days, the addressable window for an appeal app is the remaining ~20%. If only 50% are paid at discount, the window is much larger.

**How to close**: FOI request to [London Councils — Transport and Environment Committee](https://www.londoncouncils.gov.uk/). Single request covering 2022-23, 2023-24, 2024-25. Estimated turnaround: 20 working days.

**Owner**: TBD.

### UK keyword-search volume for PCN-appeal intent
**Status**: Not closeable via public web search. Google Keyword Planner, Ahrefs, SEMrush, and similar tools all require account access.

**Why it matters**: Channel-mix decisions in [go-to-market.md](go-to-market.md) currently rest on intuition + CPC ranges, not on real query volumes. Validates the SEO investment thesis.

**How to close**: Open a Google Ads account (free) and use Keyword Planner to pull monthly UK volumes for:
- "appeal parking ticket"
- "challenge pcn"
- "[borough] pcn appeal" × 33
- "contravention code [N] appeal" × top 10 codes

**Owner**: TBD.

### Mid-tier borough volumes (boroughs ranked 7–20)
**Status**: Public sources surface only the top 6 with full numbers. Boroughs 7–20 require individual borough annual reports (each borough publishes one, but they're not centrally aggregated).

**Why it matters**: Validates the rollout sequencing in [submission-engine.md](../architecture/submission-engine.md) — if Brent or Croydon are top-10, they should be in the v0.2 council-automation cohort.

**How to close**: Visit each borough's "parking annual report" page and extract PCN volumes. ~30 fetches, mechanical.

**Owner**: TBD.

### Tribunal success rate by ground / by contravention code
**Status**: London Tribunals publishes aggregate decisions but not a code-by-code or ground-by-ground breakdown.

**Why it matters**: Trains our model selection. If contravention 24 (badly-parked-in-bay) has a 70% tribunal win rate but contravention 30 (overstayed pay-and-display) has only 30%, our AI should be more confident citing certain defences than others.

**How to close**: (a) FOI to London Tribunals for the breakdown, or (b) scrape published tribunal decisions (legally permitted; public records) and label by code/ground.

**Owner**: TBD.

---

## How this page is maintained

- Update whenever a gap is closed → move from 🟡 to ✅ with the source.
- Update whenever a new gap is identified during product/business work.
- Phase B's admin UI surfaces this list as a dashboard widget for ops.

[^1]: Honest John, *Revealed: The Councils which issue the most parking tickets* — <https://www.honestjohn.co.uk/news/driving/2024-05/revealed-the-councils-who-issue-the-most-parking-tickets/>
[^2]: AppealNow services and pricing — <https://appealnow.com/services.html>
[^3]: Times and Star / Press Association — <https://www.timesandstar.co.uk/news/national/uk-today/25731703.appeal-parking-ticket-15-9-million-issued-2025/>
