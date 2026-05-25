# London Borough of Camden

!!! info "Verification status"
    **✅ Verified 2026-05-19** against the council's own website.

## Issuer details

- **Authority**: London Borough of Camden
- **Issuer type**: borough

## Where to send representations

### Online (preferred)
- **Appeal portal URL**: <https://www.camden.gov.uk/challenge-a-pcn>
- Also: <https://www.camden.gov.uk/challenging-on-street-parking-penalty-charge-notices-pcns->
- General PCN help: <https://www.camden.gov.uk/pcn>

### Phone (accessibility)
- `020 7974 4444` — say "PCN" when asked which service you need. Used when a motorist has a condition, disability or access need that prevents online/postal submission.

### Post
```
London Borough of Camden
Parking Operations
PO Box 755
Redhill
RH1 9GQ
```

## Timelines

- **Informal challenge window**: 28 days from PCN issue (Camden allows informal challenges throughout the discount + post-discount period; making one within 14 days preserves the 50% discount if the challenge fails).
- **Formal representation**: After Notice to Owner is issued (~28 days after PCN), within the standard 28-day window.

## Notes

- Camden has publicly acknowledged a **substantial backlog of appeals** as of recent guidance — expect longer response times than the statutory target.
- Camden permits informal challenge **up to 28 days** rather than only 14, which is unusually generous. Phase B's KB should flag this in the `notes` field so the AI letter timestamps the deadline correctly.

## Submission method

- **Automation status** lives on `councils.automation_status` — view at `/admin/councils/camden`.
- When automated (`automated_beta` / `automated_ga`), the engine runs `runPortalAutomation()` against the council portal using the per-council MCP recipe in `council_automation.agent_prompt`. Edit + dry-run at `/admin/councils/camden/automation`.
- When `manual`, the engine routes through the council's `appealEmail` when one is on file; otherwise flags for ops.

## Sources

- Camden, *Challenging a Penalty Charge Notice (PCN)* — <https://www.camden.gov.uk/challenge-a-pcn>
- Camden, *Challenging on-street parking PCNs* — <https://www.camden.gov.uk/challenging-on-street-parking-penalty-charge-notices-pcns->
