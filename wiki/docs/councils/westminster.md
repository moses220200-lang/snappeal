# Westminster City Council

Last refreshed **2026-05-27 (v0.3.10)**.

!!! info "Verification status"
    **✅ Verified 2026-05-19** against the council's own website.

!!! warning "Next to onboard for P11 grounds registry + deterministic recipe"
    Westminster has Claude MCP automation (lookup + submission) but **no deterministic Playwright recipe and no grounds-registry entry**. The portal is the Imperial Civil Enforcement white-label backend (same stack as Lambeth's `pcnevidence.lambeth.gov.uk`) so the Lambeth recipe pattern should fork cleanly. Awaiting portal screenshots from ops to author `lib/server/submission/grounds/westminster.ts` — see [architecture/grounds-registry.md](../architecture/grounds-registry.md).

## Issuer details

- **Authority**: Westminster City Council
- **PCN reference prefix**: PCN numbers begin with `WE`, `WS`, or `WM`
- **Issuer type**: borough

## Where to send representations

### Online (preferred)
- **Appeal portal URL**: <https://appeals.westminster.gov.uk/>
- Also accessible via the help hub at <https://www.westminster.gov.uk/parking/challenge-penalty-charge-notice-pcn>
- **Accepted file formats**: JPG, BMP, PDF, TIF, GIF, PNG
- **Maximum file size**: 5 MB per individual document

### Email
- **Address**: `parkingappeals@westminster.gov.uk`

### Post
```
City of Westminster Parking Services
PO Box 351
Sheffield
S98 1TU
```

## Timelines

- **Discount window**: 14 days from PCN issue date.
- **Council response target**: **10 working days** for representations (per the council; avoid chasing within this window).
- **Statutory maximum** for formal representations: 56 days.

## Notes

- Westminster is the **single largest PCN issuer in England**, generating £75.9m of parking-related income in 2023-24[^1]. High volume → higher likelihood of administrative errors → strong appeal channel.
- Westminster runs an **online evidence viewer** as part of the appeal portal — photos and CCTV/camera footage associated with the PCN are visible to the motorist before submitting a representation. Worth reviewing before drafting.

## Submission method

- **Automation status: `automated_beta`** — both jobs wired via Claude MCP: `runPortalLookup()` (read-only PCN verdict + warden photos via DOM-first URL extraction, fired by the customer's Agree tap under validate-first) and `runPortalAutomation()` (the £2.99 submit). 5-min wall-clock cap, 30-step agent budget. The Westminster prompt is the reference implementation; per-council prompts for the other 26 boroughs are open work — they will fork from Westminster when authored. **No deterministic recipe and no grounds-registry entry yet** — see warning at top of page.
- **Edit the agent prompt + field hints + run dry-runs** from `/admin/councils/westminster/automation`. Reset-to-canonical reverts to the in-code Westminster fallback (`apps/web/lib/server/submission/prompts/westminster_lookup.ts` + the `FALLBACK_LOOKUP_PROMPT` in `lookup.ts`).
- **v0.3.7 photo pipeline**: warden photos are harvested as `<img>` URLs via one `browser_evaluate` (not screenshotted), then `uploadPortalPhotosFromUrls()` fetches each URL server-side and re-hosts the bytes to Blob. Only three milestone screenshots are taken (`01-portal-loaded`, `02-ticket-found`, `03-photos-summary`) — these persist into `jobs.progress` for the legal audit record but are NOT shown to the customer (the `<MCPLiveStrip>` is gated to `submit_appeal` only). See `architecture/submission-engine.md` for the full story.

## Sources

- Westminster, *Challenge a Penalty Charge Notice (PCN)* — <https://www.westminster.gov.uk/parking/challenge-penalty-charge-notice-pcn>
- Westminster appeals portal — <https://appeals.westminster.gov.uk/>

[^1]: RAC Foundation, *Local Authority Parking Finances in England 2023-24* — <https://www.racfoundation.org/research/economy/council-parking-revenue-in-england-2023-24>
