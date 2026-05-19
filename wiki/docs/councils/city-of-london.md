# City of London Corporation

!!! info "Verification status"
    **✅ Verified 2026-05-19** against the council's own website.

## Issuer details

- **Authority**: City of London Corporation
- **Issuer type**: corporation (not a London Borough — the Square Mile is governed separately)

## Where to send representations

### Online (preferred)
- **Appeal portal URL**: <https://www.cityoflondon.gov.uk/services/parking/parking-tickets/challenge-a-ticket>
- **Taranto evidence/payment portal**: <https://cityoflondon.tarantoportal.com/PCNs> — for viewing the PCN evidence and starting the challenge.

## Timelines

- **Online informal challenge**: must be made within **14 days** of PCN issue.
- **Postal informal challenge**: City of London accepts up to **21 days** if made by post.
- **Formal representations**: within 28 days of the Notice to Owner.

## Notes

- The City of London Corporation uses the **Taranto** parking system platform — common across several London authorities. Phase B's KB should flag the platform per council so v0.3 automation can re-use selectors across Taranto-backed boroughs.
- The Square Mile has a relatively small residential population but high commercial PCN volume (deliveries, professional drivers). Disputes often involve genuine loading/unloading defences.

## Submission method

- **v0.1 / v0.2**: manual — open the challenge page.
- **v0.3 target**: automated via Playwright MCP — Taranto platform handler will likely serve multiple councils.
- **Automation status**: `manual`

## Sources

- City of London, *Challenge a ticket* — <https://www.cityoflondon.gov.uk/services/parking/parking-tickets/challenge-a-ticket>
- City of London Taranto portal — <https://cityoflondon.tarantoportal.com/PCNs>
