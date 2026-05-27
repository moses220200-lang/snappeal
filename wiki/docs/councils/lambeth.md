# London Borough of Lambeth

Last refreshed **2026-05-27 (v0.3.10)**.

!!! info "Verification status"
    **✅ Verified 2026-05-26** — separated the appeal portal (Imperial Civil
    Enforcement stack at `pcnevidence.lambeth.gov.uk`) from the payment portal
    (`lambethparking.paypcn.com`). The MCP agent and the deterministic recipe
    both drive challenge.php directly; the customer's Pay-yourself tile opens
    paypcn.com.

!!! success "Automation: deterministic recipe + grounds registry"
    Lambeth has the most-advanced automation stack of any council today.

    - **Deterministic Playwright recipe** (`lib/server/submission/recipes/lambeth.ts`) — ~10–20 s @ $0 lookup path; drift detection falls back to Claude MCP automatically. See [architecture/deterministic-recipes.md](../architecture/deterministic-recipes.md).
    - **Grounds-translation registry entry** (`lib/server/submission/grounds/lambeth.ts`) — full `CouncilGroundsMapping` for the 11 canonical `CanonicalGroundId`s → Lambeth's portal radio labels, verified against four portal screenshots captured 2026-05-26. See [architecture/grounds-registry.md](../architecture/grounds-registry.md).
    - **Claude MCP automation** (`council_automation.agent_prompt` + `lookup_agent_prompt`) — still authoritative for submission today; deterministic submission recipe is roadmap.

## Issuer details

- **Authority**: London Borough of Lambeth
- **Issuer type**: borough

## Where to send representations

### Online (preferred — Imperial Civil Enforcement "Online Services" stack)
- **Appeal / challenge portal** (MCP agent drives this): <https://pcnevidence.lambeth.gov.uk/pcnonline/challenge.php>
- **Payment portal** (customer Pay-yourself tile, **never** touched by the agent): <https://lambethparking.paypcn.com/default.aspx>
- **Council guidance hub** (human-readable explainer, not the form itself): <https://www.lambeth.gov.uk/parking/parking-fines-and-penalty-charge-notices-pcns/appeal-penalty-charge-notice-pcn-or-removal-your-vehicle>

## Timelines

- **Discount window**: 14 days from PCN issue. Informal challenge **within the first 14 days** preserves the 50% discount even if the challenge fails.
- **Informal challenge after 14 days**: full PCN amount applies if rejected.
- **Formal representation**: after the council issues a Notice to Owner.
- **Council response target (formal)**: **56 days** (statutory) — Lambeth confirms this on its own page.
- **Tribunal appeal window**: 28 days from Notice of Rejection.

## Notes

- The Lambeth challenge.php page is a single-step PCN lookup (ref + VRM, no spaces). The challenge wizard then runs in three steps: grounds → contact details → statement. The agent prompt at `apps/web/lib/server/submission/prompts/lambeth.ts` maps our internal grounds slugs to Lambeth's checkbox labels.
- **VRM format**: the Imperial form silently rejects whitespace — type `PN65LBU`, not `PN65 LBU`. The prompt enforces this; the OCR pipeline normalises both shapes on intake.
- **Payment hostname split**: `pcnevidence.lambeth.gov.uk` ≠ `lambethparking.paypcn.com`. If the agent ever finds itself on a `paypcn.com` host it aborts as "hit payment portal — wrong route". The customer-facing Pay-yourself tile reads `councils.payment_portal_url` (v0.3.5 schema change).
- Lambeth's PCN volume is consistently in the top 5 London boroughs, so this is an early-priority council for v0.3 automated submission.

## Submission method

- **Automation status** lives on `councils.automation_status` — view at `/admin/councils/lambeth`. The stage-aware informal-vs-formal split is handled by the per-council `agent_prompt`; edit + dry-run at `/admin/councils/lambeth/automation`.
- **Deterministic recipe** drives PCN lookup at $0 cost (`lib/server/submission/recipes/lambeth.ts`). Submission still goes through Claude MCP.
- **Grounds registry** maps the user's selected `CanonicalGroundId` to Lambeth's portal radio label at submit time (`lib/server/submission/grounds/lambeth.ts`).
- Email fallback via `appealEmail` when portal automation throws / returns `success: false`.

## Sources

- Lambeth, *Appeal a PCN or the removal of your vehicle* — <https://www.lambeth.gov.uk/parking/parking-fines-and-penalty-charge-notices-pcns/appeal-penalty-charge-notice-pcn-or-removal-your-vehicle>
- Lambeth, *Make an informal challenge* — <https://www.lambeth.gov.uk/parking/parking-fines-and-penalty-charge-notices-pcns/appeal-penalty-charge-notice-pcn-or-removal-your-vehicle/make-informal-challenge>
- Lambeth, *Make a formal appeal (representation)* — <https://www.lambeth.gov.uk/parking/parking-fines-and-penalty-charge-notices-pcns/appeal-penalty-charge-notice-pcn-or-removal-your-vehicle/make-formal-appeal-representation>
