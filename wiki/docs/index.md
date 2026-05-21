---
hide:
  - navigation
  - toc
---

# ParkingRabbit

**Pay or challenge London parking tickets in minutes.**

This wiki is the public source of truth for the ParkingRabbit project — what we're building, why, how, and for whom. **Last refreshed 2026-05-21 (v0.2.2 — error guards + cloud-first drafts).** Read [handoff.md](handoff.md) first if you're picking this up cold.

<div class="appeal-hero" markdown>

[**Business**<br><span>Mission, vision, business plan, market, pricing, roadmap.</span>](business/index.md)

[**Product**<br><span>The 5-tap user flow, features, design principles.</span>](product/index.md)

[**Architecture**<br><span>System overview, data model, AI pipeline, submission engine.</span>](architecture/index.md)

[**Councils**<br><span>All 33 London boroughs plus TfL — portal URLs, addresses, methods.</span>](councils/index.md)

[**Legal**<br><span>Statutory grounds, contravention codes, the appeal stages.</span>](legal/index.md)

[**Users**<br><span>How to appeal, what good evidence looks like, FAQ.</span>](users/index.md)

</div>

## What ParkingRabbit does

A Londoner snaps a photo of their Penalty Charge Notice (PCN). ParkingRabbit OCRs the ticket, asks the customer a few quick questions, and — depending on the path the customer chooses — either:

- **Pays the ticket** for them through `/app/pay` (PCN amount + £1.99 service fee), or
- **Drafts a formal representation letter for free**, then optionally **auto-submits it** to the issuing council via Claude + Playwright MCP (`£2.99` per auto-submission).

Email submission is the fallback channel for councils whose portal isn't automated yet.

## What ParkingRabbit doesn't do

ParkingRabbit is not a solicitor. We draft representations and submit them on your behalf — we don't represent you at a tribunal hearing, and we don't guarantee an outcome. The strongest appeal is grounded in honest facts; we'll never invent evidence.

## Where the project is right now (v0.2.x)

- **Backend live**: Postgres + Drizzle schema (11 tables, 10 migrations), JWT auth, Postgres-backed job queue, Claude CLI piped headlessly, Westminster portal automation via Playwright MCP, inbound mail webhook.
- **Customer app live in dev**: home → capture → notes → paywall → letter → live submitting view → tickets list (all UIs rebuilt for the ParkingRabbit pivot).
- **Admin backend live**: 13 admin pages — appeals, councils + MCP editor, submissions, inbound, jobs, users, health, wiki.
- **Deferred until production keys**: live Stripe, Apple/Google OAuth, inbound DNS+MX, Vercel deploy, Vercel Blob for photos. Tracked in [todo.md](todo.md).

See [handoff.md](handoff.md) for the canonical "what's shipped vs in-flight" log, and [business/roadmap.md](business/roadmap.md) for the longer-form plan.
