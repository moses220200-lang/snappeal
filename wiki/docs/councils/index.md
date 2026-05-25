# London authorities

The full list of authorities that issue PCNs in London. Each entry below names the issuer, links to the per-borough page on this wiki where filled, and links externally to the council's own appeal portal.

!!! warning "Verification status"
    Entries marked **✅ verified** were checked against the council's own website. Entries marked **🟡 not yet verified** have a best-effort link but should be re-checked before being used in production submissions.

    **Canonical state** lives in the `councils` Postgres table (`last_verified_at` + `automationStatus` columns) — view + edit via `/admin/councils`. The per-council MCP agent prompt + field hints live in `council_automation` — edit + dry-run via `/admin/councils/[slug]/automation`. The wiki entries here are a static reference, not the source of truth.

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
