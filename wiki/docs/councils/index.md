# London authorities

The full list of authorities that issue PCNs in London. Each entry below names the issuer, links to the per-borough page on this wiki where filled, and links externally to the council's own appeal portal.

!!! warning "Verification status"
    Entries marked **✅ verified** were checked against the council's own website during Phase A (May 2026). Entries marked **🟡 not yet verified** have a best-effort link but should be re-checked before being used in production submissions.
    The Phase B admin panel will surface each council's `last_verified_at` timestamp and flag entries older than 90 days.

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

Phase B's admin UI will allow an ops user to:

1. Open each council record.
2. Verify the portal URL, postal address, and email by visiting the council's website.
3. Click *Mark verified* — sets `last_verified_at` to now.
4. Re-verify every 90 days.

For Phase A, [the template](_template.md) shows the expected shape of a per-borough page once filled in.
