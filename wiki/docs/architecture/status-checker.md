# Ticket-status checker

Last refreshed **2026-05-27 (v0.3.10)**.

A `TicketStatusSnapshot` is the canonical record of where a PCN sits with the issuer. The status-checker subsystem resolves the right **source** — `fromPortalLookup` (preferred, post-verdict), `fromOcr` (fallback, pre-verdict), or `mock` (last resort) — and returns a typed snapshot that every UI surface consumes.

## Why this layer exists

There is **no central UK database** of parking-ticket status. Every council, every TfL operation, every private parking company, every rail operator, every airport operator runs their own portal with its own auth, anti-bot, and verdict vocabulary. Some have JSON APIs. Most don't. Several use CAPTCHA. A handful use Cloudflare anti-bot.

Promising "AI checks the status of any UK parking ticket" is therefore a lie. What we can promise is "AI checks the status of any ticket from a supported issuer, and we ship more supported issuers every month."

The architecture is built around that honesty:

- The `TicketStatusSnapshot` shape is universal (works for any issuer).
- The **post-verdict source of truth** is `appeal.portalLookup` — written by the lookup worker (deterministic recipe or Claude MCP, see [`submission-engine.md`](submission-engine.md)).
- The **pre-verdict fallback** is the OCR-derived snapshot (`fromOcr`) for automated councils that haven't run the lookup yet, OR for non-automated councils where the OCR is the only signal we have.
- The mock connector is the final fallback — used in dev + when no councilSlug is identified at all.

## The taxonomy

Two enums in `apps/web/lib/server/connectors/types.ts`, intentionally orthogonal:

**`TicketStatus`** — coarse high-level state.

| Status | Meaning | UI tone |
|---|---|---|
| `unpaid` | PCN issued, not paid, not under formal challenge. | Warning (amber). |
| `paid` | Settled in full. | Positive (green). |
| `under_appeal` | Formal representation lodged, awaiting decision. | Info. |
| `cancelled` | Issuer has cancelled the PCN. | Positive (green). |
| `charge_certificate_issued` | London escalation: penalty +50%, appeal window narrowed. | Danger (red). |
| `closed` | Terminal state (Order for Recovery / enforcement / closed). | Neutral. |
| `unknown` | Source ran fine but the verdict didn't fit the enum. | Neutral. |

**`TicketStage`** — fine-grained lifecycle stage. `lib/deriveCardState.ts` branches off this (via `statusSnapshot.stage`) inside the smart `<TicketCard>` to render the right CTA mix — specifically the three `needs_decision` flavors (`recommendation` / `escalated` / `expired`). See [`appeal-state-machine.md`](appeal-state-machine.md).

| Stage | Drives |
|---|---|
| `status_check_pending` | Lookup hasn't returned yet — the card stays in `validating`. **v0.3.10 bridge fix**: the status-snapshot fetch deps include `portalLookup?.status` so this stage clears the instant the verdict lands. |
| `discount_active` | Discount window still open. |
| `appeal_open` | Statutory 28-day appeal window still open. |
| `appeal_expired` | 28-day window has elapsed. |
| `appeal_submitted` | Customer has lodged an appeal; awaiting decision. |
| `under_review` | Council actively reviewing. |
| `charge_certificate_issued` | Penalty +50%; appeal route closed. |
| `order_for_recovery` | Order filed at Northampton TEC; court fee added. |
| `enforcement` | Passed to bailiffs. |
| `paid` / `cancelled` / `closed` | Terminal. |
| `unknown` | Couldn't determine. |

**Derived decision fields** the snapshot also carries:

- `canAppeal: boolean` — drives whether the Appeal-with-Rabbit primary CTA shows.
- `canPay: boolean` — drives the Pay-yourself CTA.
- `daysLeftToAppeal: number | null` — countdown surfaced on the Appeal CTA when the appeal window is open.
- `currentDuePence`, `discountedDuePence`, `discountUntil`, `payByDate`, `paidAt` — amount + deadline data. All dates are ISO 8601 (normalised at `persistPortalLookup`'s write boundary — see [`date-handling.md`](date-handling.md)).
- `paymentUrl: string | null` — per-PCN deep link when known; falls back to `council.paymentPortalUrl` (separate from `council.appealPortalUrl` — Lambeth uses a different host for payments).

UI labels + tones are read from `STATUS_LABEL`, `STAGE_LABEL`, and `STATUS_TONE` maps in `types.ts`.

## Source resolution (v0.3.9 dispatch)

`/api/appeals/[id]/status` resolves the snapshot in this order:

1. **`snapshotFromPortalLookup(appeal)`** — if `appeal.portalLookup` is non-null AND `status` is `verified` or `invalid` (settled, trustworthy), build a snapshot from `portalLookup.metadata` + `portalLookup.verdict`. This is the post-validate-first source of truth.
2. **Automated council, no portal_lookup yet** — return a validating stub `{stage: 'status_check_pending'}` so the card stays in `validating`. The lookup is in flight (or about to be — `useAutoValidate` is the backstop for old tickets).
3. **`snapshotFromOcr(appeal)`** — for non-automated councils where no lookup is going to happen, the OCR ticket fields are the only signal. Returns `source: "mock"` (honest about not being verified) + computes stage from `issuedAt` + 28-day appeal window.
4. **Mock fallback** — used when no councilSlug is identified at all. Deterministic rotation by `hash(pcnRef:vehicleReg) mod 7`. UI surfaces a **"Preview — connector not live yet"** pill.

```
appeal.portalLookup verified/invalid  →  snapshotFromPortalLookup        (source: portal_lookup)
automated council, no portal_lookup    →  validating stub                  (source: portal_lookup, awaiting)
non-automated council                  →  snapshotFromOcr                  (source: mock, OCR-derived)
no council, no signal                   →  mock connector                   (source: mock, rotating)
```

## API surface

```
GET /api/appeals/[id]/status
```

Ownership-gated. Returns `{ snapshot: TicketStatusSnapshot }`.

Errors:

- `404` — appeal not found.
- `403` — not the owner.
- `400` — appeal is missing PCN ref / vehicle reg.
- `502` — connector threw `ConnectorError`.
- `503` — database not configured.

The smart card's `useEffect` to fetch this snapshot has deps `[appeal.id, ticket.pcnRef, ticket.vehicleReg, portalLookup?.status, portalLookup?.fetchedAt]` (v0.3.10) so it re-fetches the moment the worker writes the verdict — the previous version's stale snapshot trapped the card in `validating` until manual refresh.

## Why the registry indirection

`apps/web/lib/server/connectors/registry.ts` exists for future direct-connector implementations (when a council exposes a JSON API and we don't need the lookup-MCP pipeline). The status endpoint today dispatches via the source-resolution logic above; the registry is the extension point for "this issuer has a real read-only API we can hit synchronously".

The mock connector (`apps/web/lib/server/connectors/mock.ts`) is the deterministic fallback. The UI's `<TicketStatusBadge>` renders a `"Preview"` pill whenever `snapshot.source === "mock"`.

## Future direction

The status-checker's long-term home is **probably one job kind per issuer** (`status_check`) that the worker drains the same way `pcn_lookup` does today — but a `status_check` is materially different from a `pcn_lookup`. Lookup = "what does the portal say about this PCN", run once per appeal. Status = "what does the portal NOW say about this PCN", run on demand by the customer / admin / scheduled cron. Until that need is real (probably when we ship Care Plan and want to push customers an update if their PCN cancels mid-month), the current implementation is good enough.

## Operational constraints — read this before adding a real connector

These notes live in `lib/server/connectors/types.ts` next to the interface.

### CAPTCHA / anti-bot

Many council portals (Westminster's notably) gate the lookup behind reCAPTCHA v2 or hCaptcha. Solving programmatically is a TOS violation. Two acceptable paths:

- **Human-in-the-loop.** Hand the lookup back to the customer with a "please confirm you're a human" handoff. Operationally expensive but compliant.
- **Licensed anti-captcha provider.** Per-issuer agreement permitting machine-solving for ParkingRabbit's traffic.

Never bypass without explicit per-issuer authorisation.

### Rate limits

Hammering a portal will get the ParkingRabbit IP pool banned. Connectors must go through a shared per-issuer rate-limit queue. Default one request per second, tunable per-connector.

### Session tokens

Some portals (TfL Congestion Charge) issue short-lived session cookies that expire mid-walk. Connectors must detect session expiry from the portal's response, re-acquire the session idempotently, and surface the retry in the audit log.

### JS-app portals

Reading raw HTML is not enough — many portals ship a React/Angular SPA. The status only resolves after hydration. Connectors that try to scrape the initial HTML response will get partial data. **The rule**: if the portal renders anything via JS, the connector must drive Playwright MCP (or use a deterministic Playwright recipe — see [`deterministic-recipes.md`](deterministic-recipes.md)).

### Auth-required portals

A handful of private parking companies hide status behind a mandatory account (ParkingEye post-appeal-window, NCP from the start). Until we have a stored-credentials vault (encrypted at rest, per-user keys, audit logs, breach-disclosure plan), those connectors stay `ready: false` and the registry falls back to the mock.

## Rollout roadmap

Shipping connectors is bottlenecked on portal recon + Playwright recipe authoring. Order by volume × ease.

### Wave 1 (launch + first 3 months)

| Issuer | Status |
|---|---|
| Lambeth | ✅ Submission + lookup prompts + **deterministic recipe** + **grounds-registry entry** all live. |
| Westminster | 🟡 Submission + lookup prompts live (Claude MCP). No recipe or grounds-registry entry yet. |
| Camden | ⏳ Knowledge brief; no prompts/recipe yet. |
| TfL Bus Lane | ⏳ Knowledge brief; no prompts/recipe yet. |

### Wave 2 (months 3–6)

Royal Borough of Kensington & Chelsea · Islington · TfL Congestion Charge (separate from Bus Lane).

### Wave 3 (months 6–12)

Private-parking operators: ParkingEye (CAPTCHA-gated), Euro Car Parks (account-required), APCOA, NCP (account-required), Horizon. Each needs the credentials vault + per-issuer anti-captcha agreement before shipping.

### Wave 4+ (year 2)

National Rail, Heathrow / Gatwick / Stansted, out-of-London councils.

## Code anchors

- `apps/web/lib/server/connectors/types.ts` — interface, taxonomy, error class, UI label maps.
- `apps/web/lib/server/connectors/registry.ts` — resolution + listing.
- `apps/web/lib/server/connectors/mock.ts` — deterministic placeholder.
- `apps/web/lib/server/connectors/fromPortalLookup.ts` — post-verdict source of truth.
- `apps/web/lib/server/connectors/fromOcr.ts` — pre-verdict OCR fallback.
- `apps/web/components/TicketStatusBadge.tsx` — single-source-of-truth UI badge.
- `apps/web/app/api/appeals/[id]/status/route.ts` — public API surface.
- `apps/web/components/TicketCard.tsx` — the status-snapshot fetch + deps fix.

## How to add a new connector

1. **Recon the portal.** Manually run through a real PCN lookup. Note auth, anti-bot, session, verdict vocabulary.
2. **Decide path**: deterministic Playwright recipe (faster, $0) or Claude MCP (more drift-tolerant, ~$0.30). See [`deterministic-recipes.md`](deterministic-recipes.md).
3. **Author the lookup prompt or recipe**. Recipe goes in `lib/server/submission/recipes/<slug>.ts`; Claude prompt in `lib/server/submission/prompts/<slug>_lookup.ts`.
4. **Author the submission prompt** when the council is ready to be automated_beta. Plus a `grounds/<slug>.ts` entry — see [`grounds-registry.md`](grounds-registry.md).
5. **Dry-run** via `/admin/councils/[slug]/automation`.
6. **Flip `automation_status`** to `automated_beta` when the dry-run is green against five real PCNs.
7. **Document** in the per-council wiki page (`wiki/docs/councils/<slug>.md`).

The mock + OCR fallback keeps the UI honest until step 6.

## Cross-refs

- The submission engine that writes the authoritative snapshot: [`submission-engine.md`](submission-engine.md).
- Deterministic recipes (Lambeth shipped, more planned): [`deterministic-recipes.md`](deterministic-recipes.md).
- Per-council grounds-translation registry: [`grounds-registry.md`](grounds-registry.md).
- The state machine that consumes the snapshot: [`appeal-state-machine.md`](appeal-state-machine.md).
- Date normalisation that all snapshot dates pass through: [`date-handling.md`](date-handling.md).
