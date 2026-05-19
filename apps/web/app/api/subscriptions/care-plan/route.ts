import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/server/auth";
import { getDb, schema } from "@/lib/server/db/client";
import { env } from "@/lib/server/env";
import { stripe } from "@/lib/server/stripe";
import { jsonError } from "@/lib/server/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CARE_PLAN_PRICE_ID = process.env.STRIPE_CARE_PLAN_PRICE_ID;

/**
 * GET /api/subscriptions/care-plan — current viewer's Care Plan status.
 * POST              — start a Stripe Checkout session for the £9.99/mo plan.
 *
 * When Stripe isn't fully wired (no STRIPE_CARE_PLAN_PRICE_ID), POST creates
 * a local "pending" subscription row and returns it — useful for previewing
 * the post-subscribe UX during development.
 */

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json(jsonError("UNAUTHENTICATED", "Sign in first"), { status: 401 });
  const db = getDb();
  if (!db) return NextResponse.json({ subscription: null });
  const rows = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.userId, user.id));
  return NextResponse.json({ subscription: rows[0] ?? null });
}

export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json(jsonError("UNAUTHENTICATED", "Sign in first"), { status: 401 });
  const db = getDb();
  if (!db) return NextResponse.json(jsonError("DATABASE_NOT_CONFIGURED", "DB missing"), { status: 503 });

  // Real Stripe Checkout path — needs both a secret key and a Price ID.
  if (env.STRIPE_SECRET_KEY && CARE_PLAN_PRICE_ID) {
    try {
      const session = await stripe().checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: CARE_PLAN_PRICE_ID, quantity: 1 }],
        customer_email: user.email,
        success_url: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001"}/app/profile/care-plan?status=success`,
        cancel_url: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001"}/app/profile/care-plan?status=cancel`,
        metadata: { userId: user.id, product: "care_plan" },
      });
      // Persist a placeholder; the webhook upgrades it on `checkout.session.completed`.
      const id = `sub_${randomBytes(8).toString("hex")}`;
      await db.insert(schema.subscriptions).values({
        id,
        userId: user.id,
        status: "incomplete",
        product: "care_plan",
        pricePence: 999,
      });
      return NextResponse.json({ checkoutUrl: session.url });
    } catch (err) {
      return NextResponse.json(
        jsonError("STRIPE_ERROR", err instanceof Error ? err.message : "checkout failed"),
        { status: 500 },
      );
    }
  }

  // Dev/scaffold path — record a local "pending" subscription so the UI
  // can render the post-subscribe state without round-tripping Stripe.
  const id = `sub_${randomBytes(8).toString("hex")}`;
  await db.insert(schema.subscriptions).values({
    id,
    userId: user.id,
    status: "active", // pretend
    product: "care_plan",
    pricePence: 999,
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });
  return NextResponse.json({
    subscription: { id, status: "active", product: "care_plan", pricePence: 999 },
    note: "dev_mode_no_stripe — flip STRIPE_CARE_PLAN_PRICE_ID + STRIPE_SECRET_KEY for real Checkout",
  });
}

/** DELETE → cancel at period end. Real path calls Stripe; dev marks the row. */
export async function DELETE() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json(jsonError("UNAUTHENTICATED", "Sign in first"), { status: 401 });
  const db = getDb();
  if (!db) return NextResponse.json(jsonError("DATABASE_NOT_CONFIGURED", "DB missing"), { status: 503 });

  const rows = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.userId, user.id));
  const sub = rows[0];
  if (!sub) return NextResponse.json(jsonError("NOT_FOUND", "No subscription"), { status: 404 });

  if (env.STRIPE_SECRET_KEY && sub.stripeSubscriptionId) {
    await stripe().subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: true });
  }
  await db
    .update(schema.subscriptions)
    .set({ cancelAtPeriodEnd: "true", updatedAt: new Date() })
    .where(eq(schema.subscriptions.id, sub.id));
  return NextResponse.json({ ok: true });
}
