# Managing subscriptions

Last refreshed **2026-05-27 (v0.3.10)**.

> **Status as of v0.3.10: scaffold only.** The Care Plan (£9.99/mo unlimited appeals) is NOT yet billable. The schema exists, a waitlist captures intent, and a Stripe Subscription scaffold is present at `/api/subscriptions/care-plan/route.ts`, but the webhook wiring + admin CRUD pages are not built. This doc describes the surface that does exist so the next engineer can finish it without re-deriving the model.

## What's wired today

### Schema

- **`subscriptions` table** — per-user subscription records. Columns include `id`, `user_id`, `stripe_subscription_id`, `stripe_customer_id`, `status` (active/canceled/past_due/incomplete), `current_period_end`, `created_at`, `updated_at`. See `apps/web/lib/server/db/schema.ts` for the canonical shape (migration `0004_care_plan_scaffold.sql` adds the table).
- **`care_plan_waitlist` table** — captures email + intent before Care Plan ships for real. Used by the "Coming soon" surface to count interest. Migration `0005_care_plan_waitlist.sql`.
- **`users.service_tier` column** — text enum including `"care_plan"`. When the Stripe webhook flips a subscription to `active`, this column is set; when it flips to `canceled`, it reverts. Currently neither path fires because the webhook is unwired.

### API + UI surfaces

- **`/app/profile/care-plan/page.tsx`** — customer-facing waitlist page. Shows the £9.99/mo benefits, a "Join the waitlist" form, and a "Coming soon" badge. Submitting the form POSTs to `/api/care-plan/waitlist` which inserts a `care_plan_waitlist` row.
- **`/api/subscriptions/care-plan/route.ts`** — Stripe Checkout session creator (POST). Builds a Subscription-mode Checkout session with `pricePence: 999` for the £9.99/mo plan. Returns the Checkout URL. **Not currently linked from the customer UI** — the Care Plan page only offers the waitlist signup. The route is reachable if a future surface mounts it.
- **`apps/web/lib/server/stripe.ts`** — Stripe client; `appInfo` is set to `{ name: "ParkingRabbit", version: "0.3.10" }` post-rebrand.

### What does NOT exist

- **`/admin/subscriptions`** — no admin list / detail / cancel UI.
- **Stripe webhook handler** — no `/api/webhooks/stripe` route written. `subscriptions.status` would only flip via direct DB writes today.
- **Customer billing portal link** — no "Manage your subscription" affordance anywhere in `/app/profile/*`.

## Open work to ship Care Plan

In rough order of dependency:

1. **Create the Stripe Subscription product + Price** in the Stripe dashboard (or via API). Add `STRIPE_CARE_PLAN_PRICE_ID` env var.
2. **Write the webhook handler** at `apps/web/app/api/webhooks/stripe/route.ts`. Handle `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`. Flip `subscriptions.status` + `users.service_tier` accordingly.
3. **Wire the customer UI**. Replace `/app/profile/care-plan`'s waitlist form with a "Subscribe now" button that hits `/api/subscriptions/care-plan` and redirects to the Checkout URL.
4. **Wire the cancel / billing portal**. Add `apps/web/app/api/subscriptions/portal-session/route.ts` that calls `stripe.billingPortal.sessions.create()` and returns the URL.
5. **Build `/admin/subscriptions`**:
   - List view: filterable by status (`active`, `past_due`, `canceled`).
   - Detail view: subscription history, ability to cancel + refund.
   - Bulk action: bulk-email the waitlist when the plan goes live.
6. **Enforce the entitlement.** When `users.service_tier === "care_plan"` AND the subscription is active, skip the £2.99 charge on `/api/submit` and let the appeal flow through gratis. The PaymentSheet should detect the entitlement and short-circuit to "You're on Care Plan — submitting for free".

## Why the waitlist captures matter

The pricing thesis is that heavy users (multi-borough commuters, fleet drivers, parents shuttling kids) hit > 3 PCNs/year and would prefer a £9.99/mo cap. The waitlist is the v0.3.x evidence collection — if signups exceed N within M months we ship the live plan; otherwise we leave the surface as-is until conversion economics improve.

## Code references

- `apps/web/lib/server/db/schema.ts` — `subscriptions` + `care_plan_waitlist` tables.
- `apps/web/lib/server/stripe.ts` — Stripe client + `PRICE_PENCE = 299` (the £2.99 one-off appeal price; the £9.99/mo lives only in the route handler currently).
- `apps/web/app/api/subscriptions/care-plan/route.ts` — Checkout session creator (£9.99/mo subscription mode).
- `apps/web/app/api/care-plan/waitlist/route.ts` — waitlist signup endpoint.
- `apps/web/app/app/profile/care-plan/page.tsx` — customer-facing waitlist surface.
- `apps/web/drizzle/0004_care_plan_scaffold.sql`, `0005_care_plan_waitlist.sql` — migrations.

## See also

- [`business/pricing.md`](../business/pricing.md) — the £2.99 one-off vs Care Plan positioning.
- [`business/payment-strategy.md`](../business/payment-strategy.md) — Stripe integration and FCA constraints.
- [`business/roadmap.md`](../business/roadmap.md) — Care Plan listed as 🟡 pending work.
