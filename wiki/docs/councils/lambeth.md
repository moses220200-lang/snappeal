# London Borough of Lambeth

!!! info "Verification status"
    **✅ Verified 2026-05-19** against the council's own website.

## Issuer details

- **Authority**: London Borough of Lambeth
- **Issuer type**: borough

## Where to send representations

### Online (preferred)
- **PCN hub**: <https://www.lambeth.gov.uk/parking/parking-fines-and-penalty-charge-notices-pcns/appeal-penalty-charge-notice-pcn-or-removal-your-vehicle>
- **Informal challenge form**: <https://www.lambeth.gov.uk/parking/parking-fines-and-penalty-charge-notices-pcns/appeal-penalty-charge-notice-pcn-or-removal-your-vehicle/make-informal-challenge>
- **Formal appeal (representation)**: <https://www.lambeth.gov.uk/parking/parking-fines-and-penalty-charge-notices-pcns/appeal-penalty-charge-notice-pcn-or-removal-your-vehicle/make-formal-appeal-representation>

## Timelines

- **Discount window**: 14 days from PCN issue. Informal challenge **within the first 14 days** preserves the 50% discount even if the challenge fails.
- **Informal challenge after 14 days**: full PCN amount applies if rejected.
- **Formal representation**: after the council issues a Notice to Owner.
- **Council response target (formal)**: **56 days** (statutory) — Lambeth confirms this on its own page.
- **Tribunal appeal window**: 28 days from Notice of Rejection.

## Notes

- Lambeth helpfully separates the **informal challenge** and **formal appeal** routes as different pages with different forms. Phase B's KB needs distinct portal URLs for each stage.
- Lambeth's PCN volume is consistently in the top 5 London boroughs, so this is an early-priority council for v0.3 automated submission.

## Submission method

- **Automation status** lives on `councils.automation_status` — view at `/admin/councils/lambeth`. The stage-aware informal-vs-formal split is handled by the per-council `agent_prompt`; edit + dry-run at `/admin/councils/lambeth/automation`.
- Email fallback via `appealEmail` when portal automation throws / returns `success: false`.

## Sources

- Lambeth, *Appeal a PCN or the removal of your vehicle* — <https://www.lambeth.gov.uk/parking/parking-fines-and-penalty-charge-notices-pcns/appeal-penalty-charge-notice-pcn-or-removal-your-vehicle>
- Lambeth, *Make an informal challenge* — <https://www.lambeth.gov.uk/parking/parking-fines-and-penalty-charge-notices-pcns/appeal-penalty-charge-notice-pcn-or-removal-your-vehicle/make-informal-challenge>
- Lambeth, *Make a formal appeal (representation)* — <https://www.lambeth.gov.uk/parking/parking-fines-and-penalty-charge-notices-pcns/appeal-penalty-charge-notice-pcn-or-removal-your-vehicle/make-formal-appeal-representation>
