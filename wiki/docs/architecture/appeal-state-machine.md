# Appeal state machine

How an appeal moves from a draft photo to a closed council outcome — and how that domain status maps onto what the user actually sees on the Tickets list.

## Two layers

There are **two states** to keep separate in your head:

1. **`appeal.status`** — the domain status persisted on the `appeals` row. Eight values, enforced as a Postgres enum:
   ```
   draft  →  ready  →  submitting  →  submitted
          →  under_review  →  decision_pending  →  cancelled | rejected
   ```
2. **`displayState`** — a UI-only derivation used by the Tickets list (`apps/web/app/app/tickets/page.tsx → deriveDisplayState`). Four values:
   ```
   at_risk   →   due   →   appealed   →   resolved
   ```

The domain status is the authoritative thing the backend cares about; `displayState` is a compression of it that gives each ticket card a single legible "what is the user supposed to do about this *right now*?" treatment.

## Domain status transitions

```
draft ───▶ ready ───▶ submitting ───▶ submitted ──┬─▶ under_review ───▶ decision_pending ──┬─▶ cancelled
                  │                               │                                          └─▶ rejected
                  │                               │
                  └─ generation_failed (recoverable; `step` column flags the row, status stays `ready`)
                                                  │
                                                  └─ inbound mail can promote any in-flight status directly to cancelled / rejected
```

| Status | Set by | What it means |
|---|---|---|
| `draft` | `createAppeal()` on first `POST /api/appeals` | Row exists; PCN photo may or may not be uploaded yet. |
| `ready` | `attachDraftToAppeal()` after `/api/generate(-stream)` succeeds | Letter body + grounds persisted; awaiting customer Submit. |
| `submitting` | `recordSubmission()` when the worker claims the `submit_appeal` job | MCP agent is driving the council portal **right now**. |
| `submitted` | `recordSubmission()` when the agent reports back with a council reference | Representation lodged; awaiting council decision. |
| `under_review` | currently unused in the happy path — reserved for council ACK mail that classifies as `acknowledged` | Council has acknowledged receipt but not decided. |
| `decision_pending` | currently unused — reserved for "councils tells us they're considering" replies | Council has indicated a decision is imminent. |
| `cancelled` | `processInboundMessage()` when the classifier returns `cancelled` | The council cancelled the PCN — customer won. |
| `rejected` | `processInboundMessage()` when the classifier returns `rejected` | The council upheld the PCN — customer lost. |

The `step` column on `appeals` is a free-form marker used for sub-states the enum doesn't capture — currently just `"generation_failed"`, which the Letter / Paywall pages use to surface a red retry banner. `attachDraftToAppeal()` resets `step` back to `"ready"` on the next successful generate, so the marker self-clears.

## Display-state derivation

`deriveDisplayState(appeal, now)` is the single function that the Tickets list uses to decide which card variant to render. It lives in `apps/web/app/app/tickets/page.tsx`. Logic, in priority order:

```ts
if (status === "cancelled" || status === "rejected") return "resolved";
if (status in {submitting, submitted, under_review, decision_pending}) return "appealed";
// draft | ready
const daysSinceIssue = floor((now - ticket.issuedAt) / 1 day);
return daysSinceIssue >= 10 ? "due" : "at_risk";  // UK PCN discount window is 14 days
```

A few invariants that make the derivation cheap to reason about:

- **Resolved trumps everything.** Once `status` lands on `cancelled` / `rejected`, the discount window is irrelevant.
- **`appealed` is the in-flight bucket.** Anything in the submission funnel (between `submitting` and `decision_pending`) is one state from the user's POV — "we filed it; the council is the bottleneck now."
- **`at_risk` vs `due` is purely time-based.** A `draft` or `ready` ticket promotes from `at_risk` (blue) to `due` (red) when it crosses the 10-days-since-issue threshold — the last 4 days of the standard UK PCN 14-day discount window. The user is allowed to either pay or appeal in either bucket; the colour just escalates as the deadline approaches.
- **Pre-capture drafts.** If `ticket.issuedAt` is null (the customer scanned the PCN but the AI couldn't extract anything legible), the function returns `at_risk` so the card renders with a "Draft ticket" amount line + "Add details" chip.

## Display-state UI mapping

Defined inline in `ActiveCard` and `ResolvedCard`:

| displayState | Amount + state line | Tone | Right-side chip | NEXT STEP copy | Primary CTA |
|---|---|---|---|---|---|
| `at_risk` | `£X at risk` (blue "at risk") | `snappeal-primary-50` chip | `Decide in N days` | "Review your options: pay, challenge, or set reminders." | **Review options** → `/app/tickets/[id]` |
| `due` | `£X due` (red "due") + secondary `£X/2 if paid by …` | `snappeal-action-50` chip | `Discount ends in N days` | "Pay now to keep the reduced rate." | **Pay ticket** → `/app/tickets/[id]` |
| `appealed` | `£X appealed` (purple) | `snappeal-appealed-50` chip | `Council reply expected` + "Submitted N days ago" sub-line | "Appeal submitted. We'll notify you when the council responds." | **Track appeal** → `/app/watch/[id]` (live) or `/app/tickets/[id]` |
| `resolved` (cancelled) | `Cancelled £X` (green) | — | — (compact card; date stamp + chevron only) | — | (whole card links to `/app/tickets/[id]`) |
| `resolved` (rejected) | `Closed £X` (slate) | — | — | — | (whole card links to `/app/tickets/[id]`) |

The `appealed` card variant also keeps the navy **"ParkingRabbit AI — Watch the AI submission"** strip below the buttons; that strip is the entry point to the live SSE-driven `/app/submitting/[jobId]` slideshow.

## Filter chips → displayState

The `/app/tickets` filter row is a thin lens on `displayState`:

| Filter chip | Predicate |
|---|---|
| `All` | (no filter) |
| `To Pay` | `displayState === "due"` |
| `Challenging` | `displayState === "at_risk" \|\| displayState === "appealed"` |
| `Resolved` | `displayState === "resolved"` |

**Note on the merged `Challenging` filter.** From the user's mental model, deciding to dispute a ticket is one journey that begins with reviewing options and ends with a filed appeal. The card visual still distinguishes the two states (blue `£X at risk` vs purple `£X appealed`) so the user knows *where* in the journey a given ticket is — but the filter consolidates them under "Challenging" because that's the action category from their POV. Earlier versions of the page exposed a separate `Reviewing` chip; it was removed 2026-05-21 (post-audit).

Both `cancelled` and `rejected` collapse into the single `Resolved` filter — the card visuals differentiate them, but the count is shared.

## Why not first-class `to_pay` status?

The "To Pay" bucket isn't a real status on the appeals row — it's a UI lens over `draft`/`ready` rows that are close to the 14-day discount cliff. Two reasons we left it that way:

1. **Source of truth stays simple.** Adding a `to_pay` enum value would mean writing a periodic job to promote rows on the right day, plus dealing with what happens if the user re-engages on day 11 ("revert to `ready`?"). Compressing the time-axis into `displayState` keeps the persisted state stable and the UI honest.
2. **The user's intent isn't disclosed.** A draft might become a paid ticket OR a challenged ticket — the customer hasn't picked yet. Promoting to a paid-specific status would lie about that.

If product later wants the user to *commit* to paying (e.g. a "remind me to pay" action) — that's the time to add a `to_pay` status. Until then, the time-window derivation is the right primitive.

## Stamping `now` once

`deriveDisplayState` takes `now` as an explicit argument because React's purity rules (lint: `react-hooks/set-state-in-effect`) ban `Date.now()` inside the render body. The Tickets page stamps `now` once at mount via `useState(() => Date.now())` and threads it through both the filter `useMemo` and every `TicketCard`. This keeps deadline math stable across re-renders so a card can't flicker from "Decide in 8 days" to "Decide in 9 days" mid-session.

## Error UX

Three failure modes get distinct, branded surfaces so the user is never staring at an eternal spinner or a stack trace:

| Failure mode | Where surfaced | Trigger |
|---|---|---|
| **Resource not found** (bad id / not your appeal / job vanished) | `/app/tickets/[id]` and `/app/submitting/[id]` each render an inline "We couldn't find this ticket/submission" card with `XCircle` icon + reason + `Back to my tickets` button. `/app/letter/[id]` and `/app/watch/[appealId]` 307-redirect into the ticket-detail card, so they share the same UX. | `/api/appeals/[id]` returns 404/403; `/api/submissions/[id]/progress` sends a server-sent `event: error` over a 200-status one-shot stream (EventSource discards the body of non-2xx responses, so the route returns 200 with the error frame and closes — the client's `error` listener parses the payload, sets `status: "failed"`, and `es.close()`s). |
| **Mid-run agent failure** | The full submitting page renders with the live progress + an "Agent halted" status; the run halts but the customer's draft is preserved. | Worker reports `status: "failed"` mid-stream after one or more progress events. |
| **Unexpected render exception** | Top-level `app/error.tsx` boundary — branded "Something went wrong" card with `Try again` (calls `reset()`) + `Back to the app`. Stack trace is logged to `console.error`, never shown to the user. `error.digest` is rendered as a `Reference:` so support can correlate. | Any uncaught JS error in any segment under `app/`. |
| **Unmatched route** | Top-level `app/not-found.tsx` — branded "Page not found" with `Open the app` / `Home page` buttons. | Hitting a URL with no matching route, or any `notFound()` call from a server component. |

The "resource not found" SSE path is the load-bearing piece — see `apps/web/app/api/submissions/[id]/progress/route.ts` (the `sseError()` helper at the top) and the matching client handler in `apps/web/app/app/submitting/[id]/page.tsx` (`addEventListener("error", …)` plus the `status === "failed" && events.length === 0` render branch).

## Files

- `apps/web/app/app/tickets/page.tsx` — `deriveDisplayState`, `ActiveCard`, `ResolvedCard`, filter chip definitions.
- `apps/web/app/app/tickets/[id]/page.tsx` — branded "ticket not found" card on 404/403 from `/api/appeals/[id]`.
- `apps/web/app/app/submitting/[id]/page.tsx` — SSE error listener (closes the stream, sets `status: "failed"`) + "submission not found" render branch.
- `apps/web/app/api/submissions/[id]/progress/route.ts` — `sseError()` helper returns 200 + one-shot SSE error frame (so EventSource actually delivers it client-side).
- `apps/web/app/not-found.tsx` — global 404.
- `apps/web/app/error.tsx` — global error boundary.
- `apps/web/app/globals.css` — `--color-snappeal-appealed-*` token set (purple, scoped to ticket-list state semantics).
- `apps/web/lib/server/appeals.ts` — status transitions (`createAppeal`, `attachDraftToAppeal`, `recordSubmission`, `markAppealFailed`).
- `apps/web/lib/server/inbound.ts` — `processInboundMessage()` flips status to `cancelled` / `rejected` based on the classifier verdict.
- `apps/web/lib/server/db/schema.ts` — `appeals.status` enum + `step` column definitions.
