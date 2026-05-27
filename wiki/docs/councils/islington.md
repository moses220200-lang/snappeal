# London Borough of Islington

Last refreshed **2026-05-27 (v0.3.10)**.

!!! info "Verification status"
    **✅ Verified 2026-05-19** against the council's own website.

!!! warning "Manual today — needs prompts + grounds-registry entry"
    No `agent_prompt` / `lookup_agent_prompt` and no grounds-registry entry. Runs as `manual` until those land — see [architecture/grounds-registry.md](../architecture/grounds-registry.md).

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
