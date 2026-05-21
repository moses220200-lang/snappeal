# Transport for London (TfL)

!!! info "Verification status"
    **✅ Verified 2026-05-19** against TfL's own website.

## Issuer details

- **Authority**: Transport for London (TfL)
- **Issuer type**: TfL (not a council). TfL issues PCNs for:
  - **Red Route** parking and waiting offences (red lines on TLRN roads).
  - **Bus lane** contraventions on TLRN roads.
  - **Moving traffic** contraventions (e.g. yellow box junctions) where TfL is the enforcement authority.
  - (Separate regime) **Congestion Charge** and **ULEZ** charges — see notes below; **out of scope for ParkingRabbit v0.1**.

## Where to send representations

### Online (preferred)
- **Red Routes — make a representation**: <https://tfl.gov.uk/modes/driving/red-routes/penalty-charge-notices/make-a-representation>
- **Red Routes PCN hub**: <https://tfl.gov.uk/modes/driving/red-routes/penalty-charge-notices>
- **Red Routes how to appeal**: <https://tfl.gov.uk/modes/driving/red-routes/penalty-charge-notices/making-a-representation/how-to-appeal>
- **Grounds for making a representation**: <https://tfl.gov.uk/modes/driving/red-routes/penalty-charge-notices/making-a-representation/grounds-for-making-a-representation>
- **General "Challenge a PCN"**: <https://tfl.gov.uk/modes/driving/challenge-a-pcn>

## Timelines

- **Informal challenge**: within 14 days of PCN date. Submitting an informal challenge **pauses** the 14-day discount clock — the motorist does not lose the 50% reduction while TfL considers the appeal.
- **Formal representation** (after Notice to Owner): 28 days.
- **Tribunal appeal**: 28 days from Notice of Rejection.

## Notes

- TfL is the **second-largest single PCN issuer in London by income** — red-route PCN income alone reached **£83.4m in FY 2023-24**, up 57% over the previous five years[^1].
- TfL also runs the **bus-lane PCN** regime on its roads; in FY 2023-24 it issued 22,604 bus-lane PCNs (FOI-1844-2425)[^2].
- **Congestion Charge** and **ULEZ** appeals use a **different statutory regime** (the Greater London (Central Zone) Congestion Charging Order, separate to TMA 2004). These are out of scope for ParkingRabbit v0.1 and v0.2 — see [feature matrix](../product/features.md). They are on the roadmap for v0.3.

## Submission method

- **v0.1 / v0.2**: manual — open the TfL representation page.
- **v0.3 target**: automated via Playwright MCP, red-route + bus-lane support first; congestion/ULEZ later.
- **Automation status**: `manual`

## Sources

- TfL, *Challenge a Penalty Charge Notice* — <https://tfl.gov.uk/modes/driving/red-routes/penalty-charge-notices/make-a-representation>
- TfL, *How to appeal* — <https://tfl.gov.uk/modes/driving/red-routes/penalty-charge-notices/making-a-representation/how-to-appeal>

[^1]: Regit, *TfL cashes in: red route fines soar by 57% in five years* (citing TfL FY23/24) — <https://www.regit.cars/car-news/tfl-cashes-in-red-route-fines-soar-by-57-in-five-years>
[^2]: TfL FOI-1844-2425, bus-lane PCNs 2023-24 — <https://tfl.gov.uk/corporate/transparency/freedom-of-information/foi-request-detail?referenceId=FOI-1844-2425>
