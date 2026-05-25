# Ticket-status checker

A `TicketStatusSnapshot` is the canonical record of where a PCN sits with the issuer. The status-checker subsystem resolves the right **issuer connector**, reads the issuer's portal, and returns a typed snapshot that every UI surface consumes.

This doc covers:

1. The canonical status taxonomy.
2. The connector interface + how the registry resolves them.
3. The mock connector (and why it's deliberately not authoritative).
4. The rollout roadmap — which issuers ship in which order, and why.
5. The operational constraints anyone touching connectors needs to know.

## Why this layer exists

There is **no central UK database** of parking-ticket status. Every council, every TfL operation, every private parking company, every rail operator, every airport operator runs their own portal with their own auth, anti-bot, and verdict vocabulary. Some have JSON APIs. Most don't. Several use CAPTCHA. A handful use Cloudflare anti-bot.

Promising "AI checks the status of any UK parking ticket" is therefore a lie. What we can promise is "AI checks the status of any ticket from a supported issuer, and we ship more supported issuers every month."

The architecture is built around that honesty:

- The `TicketStatusSnapshot` shape is universal (works for any issuer).
- The `IssuerConnector` interface is the integration unit (one per issuer).
- The `registry` maps `issuerKey → IssuerConnector`. Unmapped or not-ready issuers fall back to the mock connector, which is clearly labelled in the UI as **"Preview — connector not live yet"** so the customer never sees a fake authoritative verdict.

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
| `unknown` | Connector ran fine but the verdict didn't fit the enum. | Neutral. |

**`TicketStage`** — fine-grained lifecycle stage. `lib/deriveCardState.ts` branches off this (via `statusSnapshot.stage`) inside the smart `<TicketCard>` to render the right CTA mix — specifically the three `needs_decision` flavors (`recommendation` / `escalated` / `expired`). See [appeal-state-machine.md](appeal-state-machine.md) for the full card-state model.

| Stage | Drives                                                                                       |
|---|---|
| `scanned`                     | Just OCR'd, no portal lookup yet.                                                          |
| `validated`                   | Portal lookup confirmed the ticket exists.                                                |
| `status_check_pending`        | Connector hasn't returned a verdict yet (or no connector wired up for this issuer).        |
| `discount_active`             | Discount window still open — pay or appeal at the early-bird half-price.                   |
| `appeal_open`                 | Statutory 28-day appeal window still open.                                                |
| `appeal_expired`              | 28-day window has elapsed; standard appeal path is closed.                                |
| `appeal_submitted`            | Customer has lodged an appeal with the council; awaiting decision.                         |
| `under_review`                | Council actively reviewing.                                                                |
| `charge_certificate_issued`   | Penalty +50%; appeal route closed; "Pay yourself" or future witness-statement workflow.    |
| `order_for_recovery`          | Order filed at Northampton CCBC; court fee added.                                          |
| `enforcement`                 | Passed to bailiffs.                                                                        |
| `paid` / `cancelled` / `closed` | Terminal; recommendation card hidden, friendly settled/cancelled/closed copy.            |
| `unknown`                     | Connector couldn't determine.                                                              |

The two enums are kept separate so the UI can express "status = unpaid, stage = charge_certificate_issued" cleanly without inventing a combined enum.

**Derived decision fields** the connector also returns:

- `canAppeal: boolean` — drives whether the Appeal-with-Rabbit primary CTA shows on the recommendation card. False for any expired / escalated / terminal stage.
- `canPay: boolean` — drives the Pay-yourself CTA. False for terminal-paid/cancelled and edge cases like under-appeal where payment is paused.
- `daysLeftToAppeal: number | null` — countdown surfaced on the Appeal CTA when the appeal window is open.
- `currentDuePence`, `discountedDuePence`, `discountUntil`, `payByDate`, `paidAt` — amount + deadline data.
- `paymentUrl: string | null` — per-PCN deep link when the connector knows one; falls back to `council.appealPortalUrl`.

UI labels + tones are read from the `STATUS_LABEL`, `STAGE_LABEL`, and `STATUS_TONE` maps in `types.ts` so every surface stays consistent.

## The connector interface

```ts
interface IssuerConnector {
  readonly id: ConnectorId;
  readonly displayName: string;
  readonly portalDescription: string;
  readonly ready: boolean;
  check(input: { pcnRef: string; vehicleReg: string }): Promise<TicketStatusSnapshot>;
}
```

The `TicketStatusSnapshot` shape connectors return (v0.2.12):

```ts
{
  status: TicketStatus;                  // coarse: unpaid / paid / under_appeal / cancelled / charge_certificate_issued / closed / unknown
  stage: TicketStage;                    // fine: discount_active / appeal_open / appeal_expired / charge_certificate_issued / order_for_recovery / enforcement / paid / cancelled / closed / ...
  canAppeal: boolean;                    // drives Appeal-with-Rabbit primary CTA
  canPay: boolean;                       // drives Pay-yourself CTA
  daysLeftToAppeal?: number | null;      // countdown copy on the Appeal CTA
  currentDuePence?: number;              // pence; what the portal shows as owed right now
  discountedDuePence?: number;           // pence; early-bird half-price if discount_active
  discountUntil?: string | null;         // ISO date
  payByDate?: string | null;             // ISO date
  paidAt?: string | null;                // ISO date
  paymentUrl?: string | null;            // per-PCN deep link if the issuer exposes one
  detail?: string;                       // human-readable subtitle
  rawVerdict?: string;                   // diagnostics + audit
  fetchedAt: string;
  source: ConnectorId;                   // 'mock' surfaces a "Preview" pill in the UI
}
```

Example outputs (from the mock connector — real connectors map their issuer's native vocabulary into this shape):

```json
{
  "status": "unpaid",
  "stage": "discount_active",
  "detail": "Discount available — pay or appeal within the discount window.",
  "currentDuePence": 13000,
  "discountedDuePence": 6500,
  "discountUntil": "2026-06-01T...",
  "payByDate": "2026-06-15T...",
  "daysLeftToAppeal": 23,
  "canAppeal": true,
  "canPay": true,
  "source": "mock"
}

{
  "status": "charge_certificate_issued",
  "stage": "charge_certificate_issued",
  "detail": "Penalty escalated — the amount has increased by 50%.",
  "currentDuePence": 19500,
  "canAppeal": false,
  "canPay": true,
  "source": "mock"
}
```

**Idempotent.** Re-checking the same PCN must not have side-effects on the issuer (no logging in if a logged-out check works; no submitting forms).

**Per-issuer rate limit.** Connectors share a registry-enforced rate limit so an issuer can't see our IP pool slamming their portal.

**Throws `ConnectorError`, never lies.** A connector that can't read the portal MUST throw with a typed code (`PORTAL_UNREACHABLE`, `PORTAL_BLOCKED`, `INVALID_INPUT`, `RATE_LIMITED`, `NOT_IMPLEMENTED`). It MUST NOT return a fake `unpaid` snapshot to look healthy.

**Tests don't touch the network.** Connectors take their HTTP / Playwright client by dependency injection so unit tests can stub the portal.

## The registry

`apps/web/lib/server/connectors/registry.ts`. Resolution order:

1. Exact match on the issuer key (`westminster`, `camden`, `tfl-congestion`, `parkingeye`, …). The key for council PCNs is the council slug; for private parking it's a stable issuer id.
2. Fallback to the mock connector if the key doesn't resolve OR the connector isn't `ready: true`.

Callers don't need null-checks — the registry always returns a connector. They inspect the returned snapshot's `source` field to know whether the result is authoritative (`source === "westminster"`) or synthetic (`source === "mock"`).

## The mock connector

`apps/web/lib/server/connectors/mock.ts`. Deterministic — returns a rotating sample status based on `hash(${pcnRef}:${vehicleReg}) mod 7`. Used in dev + as the registry fallback for any issuer whose real connector hasn't shipped.

The UI badge component (`TicketStatusBadge`) renders a `"Preview — connector not live yet"` pill whenever `snapshot.source === "mock"`. This is non-negotiable — the customer must never see a fake authoritative verdict.

## API surface

```
GET /api/appeals/[id]/status
```

Ownership-gated. Resolves the connector via the appeal's `councilSlug` (extension point: private-parking heuristic on the PCN ref pattern in v0.3). Returns `{ snapshot: TicketStatusSnapshot }`.

Errors:

- `404` — appeal not found.
- `403` — not the owner.
- `400` — appeal is missing PCN ref / vehicle reg.
- `502` — connector returned `ConnectorError`. The error code is in the body so the UI can render the right fallback.
- `503` — database not configured.

Future:

- **Snapshot caching.** Add `appeals.status_snapshot jsonb` with a short TTL so repeated reads don't hammer the portal.
- **Async connectors.** When a connector needs Playwright MCP it should enqueue a `status_check` job kind (sibling to `pcn_lookup`) rather than blocking the API request. SSE the result.
- **Webhooks.** Issuers that can push updates (very few — TfL has nothing, Westminster has nothing, ParkingEye has nothing) get a `/api/inbound/status/[issuer]` route.

## Rollout roadmap

Shipping connectors is bottlenecked on portal recon + Playwright MCP recipe authoring. Order is by volume × ease.

### Wave 1 (launch + first 3 months)

| Issuer | Type | Why first | Status |
|---|---|---|---|
| Westminster | London borough | Already has full submission automation; lookup connector already lives in `lib/server/submission/lookup.ts`. Status connector reuses the same MCP scaffolding. | Lookup live; status connector queued. |
| TfL Bus Lane | TfL operation | Highest enforcement volume in London; portal is JSON-API-friendly. | Queued. |
| Camden | London borough | Volume + we have the appeal portal recon already. | Queued. |

### Wave 2 (months 3–6)

| Issuer | Type | Notes |
|---|---|---|
| TfL Congestion Charge | TfL operation | Separate portal from Bus Lane. Same auth model. |
| Kensington & Chelsea | London borough | Royal borough — different portal vendor than Westminster. |
| Islington | London borough | Queued by request volume. |
| Lambeth | London borough | ditto. |

### Wave 3 (months 6–12)

| Issuer | Type | Notes |
|---|---|---|
| ParkingEye | Private parking | Largest private-PPC operator. **CAPTCHA-gated** — lookup needs human-in-the-loop or licensed anti-captcha provider. |
| Euro Car Parks | Private parking | Account-required after the appeal window — needs stored-credentials vault. |
| APCOA | Private parking | Mix of council-contracted + private. Two different portal flows. |
| NCP | Private parking | Account-required. |
| Horizon | Private parking | Smaller volume but commonly cited in supermarket complaints. |

### Wave 4+ (year 2)

- National Rail (operator-by-operator).
- Heathrow / Gatwick / Stansted airport parking.
- Out-of-London authorities (Manchester, Birmingham, Bristol, Edinburgh, Glasgow).

## Operational constraints — read this before adding a connector

These notes live in `lib/server/connectors/types.ts` next to the interface. Do not remove them when refactoring; they encode war stories.

### CAPTCHA / anti-bot

Many council portals (Westminster's notably) gate the lookup behind reCAPTCHA v2 or hCaptcha. Solving programmatically is a TOS violation. The two acceptable paths:

- **Human-in-the-loop.** When the connector hits a CAPTCHA, kick the lookup back to the customer with a "please confirm you're a human" handoff. They click through; we resume. Operationally expensive but compliant.
- **Licensed anti-captcha provider.** Per-issuer agreement that explicitly permits machine-solving for ParkingRabbit's traffic. Possible for some councils; impossible for most private operators.

Never bypass without explicit per-issuer authorisation.

### Rate limits

Hammering a portal will get the ParkingRabbit IP pool banned. Every connector call must go through a shared per-issuer rate-limit queue. The registry is the right place to enforce this; the limit per issuer should default to one request per second and be tunable per-connector.

### Session tokens

Some portals (TfL Congestion Charge in particular) issue short-lived session cookies that expire mid-walk. Connectors must:

- Detect session expiry from the portal's response (usually a 302 to the login page).
- Re-acquire the session idempotently.
- Surface the retry in the audit log.

### JS-app portals

Reading raw HTML is not enough — many portals ship a React/Angular SPA. The status only resolves after the SPA has hydrated and made its own XHR calls. Connectors that try to scrape the initial HTML response will get partial data.

The rule: if the portal renders anything to the user via JS, the connector must drive Playwright MCP. There is no "fast path" via fetch.

### Auth-required portals

A handful of private parking companies hide status behind a mandatory account. ParkingEye does this once the appeal window has closed; NCP does it from the start.

Until we have a stored-credentials vault (encrypted at rest, per-user keys, audit logs, breach-disclosure plan), those connectors stay `ready: false` and the registry falls back to the mock. Customers see the Preview pill.

## Code anchors

- `apps/web/lib/server/connectors/types.ts` — interface, taxonomy, error class, UI label maps.
- `apps/web/lib/server/connectors/registry.ts` — resolution + listing.
- `apps/web/lib/server/connectors/mock.ts` — deterministic placeholder.
- `apps/web/components/TicketStatusBadge.tsx` — single-source-of-truth UI badge with mock-pill awareness.
- `apps/web/app/api/appeals/[id]/status/route.ts` — public API surface.
- `apps/web/app/app/tickets/page.tsx` — fetches the snapshot on mount per expanded card, threads it into `deriveCardState`, renders the badge inline. (`/app/tickets/[id]` is a server-side redirect to `/app/tickets?expand=<id>`.)

## How to add a new connector

1. **Recon the portal.** Manually run through a real PCN lookup. Note auth, anti-bot, session, verdict vocabulary.
2. **Build the recipe.** Most new connectors will be Claude + Playwright MCP — extend `lib/server/submission/prompts/` with an `<issuer>_status.ts` prompt similar to `westminster.ts` (submission) and the lookup prompt.
3. **Implement `IssuerConnector`** in `lib/server/connectors/<issuer>.ts`. Wire the MCP run, map verdict strings into the `TicketStatus` enum, throw `ConnectorError` on portal failure.
4. **Register** in `registry.ts`.
5. **Dry-run** from `/admin/connectors` (planned admin surface — exists today as part of `/admin/councils/<slug>/automation`).
6. **Flip `ready: true`** only when the dry-run is green against five real PCNs.
7. **Document** in this file's roadmap section + the council page in `wiki/docs/councils/<slug>.md`.

The mock will keep the UI happy until step 6.
