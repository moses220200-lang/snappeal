# London Borough of Islington

!!! info "Verification status"
    **✅ Verified 2026-05-19** against the council's own website.

## Issuer details

- **Authority**: London Borough of Islington
- **Issuer type**: borough

## Where to send representations

### Online (preferred)
- **Appeal portal URL**: <https://www.islington.gov.uk/parking/parking-tickets/challenge-a-penalty-charge-notice>

## Timelines

- **Discount window**: 14 days from PCN issue (the standard).
- **Notice to Owner deadline**: 28 days from NtO issue for formal representations.
- **Council response target**: 56 days (statutory) for formal representations.

## Submission method

- **Automation status** lives on `councils.automation_status` — view at `/admin/councils/islington`. Edit + dry-run the per-council MCP recipe at `/admin/councils/islington/automation`.
- Email fallback via `appealEmail` when portal automation throws / returns `success: false`.

## Sources

- Islington, *Challenge a Penalty Charge Notice (PCN)* — <https://www.islington.gov.uk/parking/parking-tickets/challenge-a-penalty-charge-notice>
