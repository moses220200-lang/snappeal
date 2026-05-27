# London authorities

Last refreshed **2026-05-27 (v0.3.10)**.

The full list of authorities that issue PCNs in London. Each entry below names the issuer, links to the per-borough page on this wiki where filled, and links externally to the council's own appeal portal.

!!! warning "Verification status"
    Entries marked **✅ verified** were checked against the council's own website. Entries marked **🟡 not yet verified** have a best-effort link but should be re-checked before being used in production submissions.

    **Canonical state** lives in the `councils` Postgres table (`last_verified_at` + `automationStatus` columns) — view + edit via `/admin/councils`. The per-council MCP agent prompt + field hints live in `council_automation` — edit + dry-run via `/admin/councils/[slug]/automation`. The wiki entries here are a static reference, not the source of truth.

!!! info "Automation status as of v0.3.10"
    **Lambeth** has the most-advanced automation: a deterministic Playwright recipe (Phase 9, ~10–20 s @ $0 vs ~60–120 s @ ~$0.30 for Claude MCP) PLUS a P11 grounds-translation registry entry (canonical-slug → portal-radio-label mapping verified against four portal screenshots). **Westminster** has Claude MCP automation (lookup + submission) but no recipe and no grounds-registry entry — next to onboard. Camden, Kensington & Chelsea, Islington, TfL, and City of London have wiki reference pages and DB rows but their `lookup_agent_prompt` / `agent_prompt` columns are null and no grounds-registry entry exists — those councils run as `manual` until a per-council prompt is authored and the automation flag flipped at `/admin/councils/[slug]/automation`. The other 27 boroughs are tracked in the DB but undocumented on the wiki.

    Onboarding a new council requires THREE artifacts: (1) `council_automation.agent_prompt` (the Claude MCP recipe), (2) optionally a deterministic Playwright recipe at `lib/server/submission/recipes/<slug>.ts` (~$0 lookup path — see [architecture/deterministic-recipes.md](../architecture/deterministic-recipes.md)), (3) a `CouncilGroundsMapping` at `lib/server/submission/grounds/<slug>.ts` (see [architecture/grounds-registry.md](../architecture/grounds-registry.md)). The grounds-registry entry needs four portal screenshots showing each ground option the council exposes.

## 32 London Boroughs

| Authority | Verified | Per-borough page |
|---|---|---|
| Barking and Dagenham | 🟡 | — |
| Barnet | 🟡 | — |
| Bexley | 🟡 | — |
| Brent | 🟡 | — |
| Bromley | 🟡 | — |
| **Camden** | ✅ | [View page](camden.md) |
| Croydon | 🟡 | — |
| Ealing | 🟡 | — |
| Enfield | 🟡 | — |
| Greenwich | 🟡 | — |
| Hackney | 🟡 | — |
| Hammersmith and Fulham | 🟡 | — |
| Haringey | 🟡 | — |
| Harrow | 🟡 | — |
| Havering | 🟡 | — |
| Hillingdon | 🟡 | — |
| Hounslow | 🟡 | — |
| **Islington** | ✅ | [View page](islington.md) |
| **Kensington and Chelsea** | ✅ | [View page](kensington-chelsea.md) |
| Kingston upon Thames | 🟡 | — |
| **Lambeth** | ✅ | [View page](lambeth.md) |
| Lewisham | 🟡 | — |
| Merton | 🟡 | — |
| Newham | 🟡 | — |
| Redbridge | 🟡 | — |
| Richmond upon Thames | 🟡 | — |
| Southwark | 🟡 | — |
| Sutton | 🟡 | — |
| Tower Hamlets | 🟡 | — |
| Waltham Forest | 🟡 | — |
| Wandsworth | 🟡 | — |
| **Westminster** | ✅ | [View page](westminster.md) |

## Other London authorities

| Authority | Verified | Per-borough page |
|---|---|---|
| **City of London Corporation** | ✅ | [View page](city-of-london.md) |
| **Transport for London** (red routes, bus lanes, moving traffic) | ✅ | [View page](tfl.md) |
| The Royal Parks | 🟡 | — |

## How to populate the unverified entries

The live admin UI at `/admin/councils` lets an ops user:

1. Open each council record (`/admin/councils/[slug]`).
2. Verify the portal URL, postal address, and email by visiting the council's website.
3. Update fields + save — sets `last_verified_at` to now.
4. Edit + dry-run the per-council MCP recipe at `/admin/councils/[slug]/automation` — full prompt + field hints + dry-run-against-live-portal button + reset-to-canonical (Westminster fallback).
5. Re-verify every 90 days (the admin dashboard flags entries older than 90 days).

[The template](_template.md) shows the expected shape of a per-borough wiki page; the canonical schema lives in `lib/server/db/schema.ts → councils + council_automation`.
