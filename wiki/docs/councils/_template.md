# [Council name]

!!! info "Verification status"
    **Status:** [✅ Verified YYYY-MM-DD] / [🟡 Not yet verified]

## Issuer details

- **Authority**: [Council legal name]
- **PCN reference prefix**: [e.g. `WE…` for Westminster]
- **Issuer type**: borough / corporation / TfL / Royal Parks

## Where to send representations

### Online (preferred)
- **Appeal portal URL**: [URL]
- **Accepted file formats**: [list]
- **Maximum file size**: [N MB per file]

### Email
- **Address**: [if listed]

### Post
```
[Address line 1]
[Address line 2]
[City, Postcode]
```

## Timelines specific to this council

- **Discount window**: 14 days from PCN issue date (the standard).
- **Council response target**: [e.g. "10 working days" for Westminster, "56 days (statutory)" elsewhere].
- **Phone for accessibility**: [if available].

## Common contraventions in this borough

[Top 3 by volume, if known.]

## Common defences that succeed in this borough

[Notes from past appeals — added to over time.]

## Submission method

- **Automation status** (one of `manual` / `automated_beta` / `automated_ga`) lives on `councils.automation_status` — edit via `/admin/councils/[slug]`.
- **Deterministic recipe** (Phase 9): does `lib/server/submission/recipes/<slug>.ts` exist? If yes, lookup runs through the recipe first (~$0, ~10–20 s) with Claude MCP as fallback on drift. See [architecture/deterministic-recipes.md](../architecture/deterministic-recipes.md).
- **Grounds-registry entry** (P11): does `lib/server/submission/grounds/<slug>.ts` exist and is it registered in `grounds/registry.ts`? Required for the Build-appeal step to translate canonical-slug → portal-radio-label. See [architecture/grounds-registry.md](../architecture/grounds-registry.md).
- When status is `automated_beta` or `automated_ga`, the [submission engine](../architecture/submission-engine.md) runs the per-council Claude + Playwright MCP recipe stored in `council_automation.agent_prompt` (edit + dry-run via `/admin/councils/[slug]/automation`); falls back to email when the council has an `appeal_email` and portal automation throws / returns success=false.
- When status is `manual`, the engine routes through `sendCouncilEmail()` if `appeal_email` is set; otherwise records a mock submission and flags the appeal for ops review.

## Sources

- [council website link]
- [last verified date]
