# Submission engine

What the user is paying £2.99 for, technically. The submission engine is the bridge between the AI-drafted letter and the council's "we received your appeal" confirmation.

## The two paths

```mermaid
flowchart LR
    Letter[AI-drafted letter ready] --> Decide{Council's<br/>preferred channel<br/>+ engine status}
    Decide -->|portal automation healthy| Auto[LLM + MCP path]
    Decide -->|portal congested,<br/>broken, or unsupported| Email[Email path]

    Auto --> Sandbox[Vercel Sandbox<br/>microVM]
    Sandbox --> Playwright[Playwright MCP server]
    Playwright --> Portal[(Council portal)]
    Portal --> Confirm1[Submission reference<br/>+ confirmation screenshot]

    Email --> EmailSvc[Transactional email<br/>from user's domain alias]
    EmailSvc --> Inbox[(Council inbox)]
    Inbox --> Confirm2[Bounce-free delivery<br/>+ timestamped receipt]

    Confirm1 --> Done([Appeal submitted])
    Confirm2 --> Done

    style Auto fill:#16a34a,color:#ffffff
    style Email fill:#2563eb,color:#ffffff
    style Done fill:#16a34a,color:#ffffff
```

Both paths produce the same observable outcome from the user's perspective: an appeal has been delivered to the council with a recorded timestamp. The user pays for **delivery**, not for which path delivered.

## Path 1 — LLM + Playwright MCP (primary)

When the council's online portal is supported and healthy:

1. The Submit action enqueues a job to a **Vercel Workflow** (WDK) — durable, retry-safe.
2. The workflow boots a **Vercel Sandbox** microVM running a **Playwright MCP server**.
3. An **LLM agent** inside the workflow consumes the council's form schema from the [knowledge base](knowledge-base.md) and uses MCP browser tools (click, fill, select, upload, wait) to complete the form.
4. The agent uploads the PCN photo and any evidence photos from Vercel Blob.
5. On submission, the agent extracts the confirmation reference and submission screenshot, writes them back to the appeal record.

**Why an LLM agent rather than scripted Playwright?** Three reasons:

- **Form variability.** Council forms differ subtly even when using the same vendor (Taranto, Civica, etc.). An LLM agent reading the form's actual current state is more robust than hand-tuned selectors that break on every CMS update.
- **Field-mapping intelligence.** When a council form asks "What is the basis for your representation?" with a free-text box, the agent maps from our stage-aware ground (e.g. statutory ground "Procedural impropriety") to the council's expected register.
- **Schema is the floor, not the ceiling.** The KB schema gives the agent a starting hint (URL, expected fields). The agent handles surprises — popups, captcha challenges (where legally permitted to interpret, not bypass), session timeouts, multi-step wizards.

This is what "we will MCP appeal the ticket using a LLM" cashes out to.

## Path 2 — Email submission (fallback)

When the portal path can't be used. Reasons:

- **Portal congestion** — council's portal is throttling, slow, or returning errors. A retry budget is consumed without success.
- **Portal not supported yet** — the council's form schema isn't in the KB for the relevant contravention stage.
- **Portal explicitly unsupported by the council** — some councils accept appeals **only** by email or post for certain stages.
- **Engine outage** — the LLM agent, the Sandbox, or Playwright MCP is unavailable; we route around the failure rather than block the user.

When fallback fires:

1. The workflow composes a structured email — the appeal letter as body, photos as attachments, PCN reference + vehicle reg in the subject line per the council's stated format.
2. Email is sent from a per-user transactional alias (`<user-id>@appeals.snappeal.ai`) so the council's reply lands in our inbound mail handler — closing the loop on response tracking (see [response-tracking](#response-tracking-stub)).
3. The submission is recorded with `method: "email"` and the email's message-id as the immutable receipt.
4. We monitor for bounces; a bounce promotes to a manual ops queue rather than silently failing.

**Email is not second-class.** For councils that prefer email (or whose portal is unreliable), email is the *first*-class channel. The fallback framing is about routing — not about quality.

## Decision logic — which path?

The workflow consults the KB at submission time:

```
if council.submission_methods includes "portal" 
   AND council.automation_status in ("automated_beta", "automated_ga")
   AND engine.portal_health == "ok"
   AND not engine.portal_recently_congested(council, last 60 min)
then path = portal
else if council.submission_methods includes "email"
   AND council.appeal_email is set
then path = email
else path = manual    # falls back to v0.1 "copy + open portal" UX
```

A small number of councils support only postal submission for certain stages — these are deferred to a manual-handoff queue and the user is told before payment.

## What we promise the user (and don't)

Pre-payment screen states:

> **£2.99 — one-off, non-refundable.** We'll draft your appeal and submit it to your council — through their online portal where possible, or by email when the portal is unavailable. You're paying for the work we deliver, not for the outcome.

We do **not** promise:

- A specific submission channel. The engine picks the best available route.
- Sub-minute submission time. Portal automation typically completes in 30–90 seconds; email submission is near-instant; but a congested portal might queue our job for several minutes. Either way the user sees "Submitted ✓" once delivery is confirmed.
- A specific council response time. The submission timestamp is ours; everything after is the council's.

## Per-council rollout order

Portal automation ships in waves:

1. **Westminster** (highest London volume)
2. **Kensington & Chelsea** (Chatbot Max — needs conversation handler)
3. **Camden**
4. **Lambeth** (separate informal / formal forms — stage-aware)
5. **Islington**
6. **TfL** (red routes, bus lanes)
7. **City of London** (Taranto platform — selectors reusable for other Taranto councils)
8. **Newham**, **Hammersmith & Fulham**, **Lewisham** (top per-borough volumes)
9. Then breadth across remaining London boroughs

For every borough not yet automated, **the email fallback path is active from day one** — so there is no "unsupported council" experience in v0.1, just "submitted via portal" or "submitted via email".

## Failure handling

| Failure | Engine behaviour | User-visible state |
|---|---|---|
| Form schema not found / outdated selector | LLM agent attempts recovery; on third failure, escalate | Path switches to email fallback; user sees "Submitted ✓" |
| Captcha or human-only barrier | Stop automation, switch to email | User sees "Submitted via email ✓" |
| Email bounces | Move to ops queue, alert admin | User sees "Awaiting confirmation — we'll update you" |
| Council closed for submissions (e.g. system down) | Retry with backoff for up to 6 hours; then ops escalation | User sees "Queued — council system down, retrying" |
| Workflow itself crashes | Vercel Workflow retries idempotently | User sees no change; we observe internally |

## Response tracking (stub)

Council replies arrive at the user's transactional alias (`<user-id>@appeals.snappeal.ai`). Our inbound mail handler:

1. Parses the council's reply (LLM-assisted, since reply formats differ).
2. Classifies into one of: *cancelled*, *rejected, with right to appeal*, *charge offer*, *request for more info*, *other*.
3. Updates the appeal's status from `under_review` → `decision_pending` → outcome.
4. Notifies the user (push + email).

Detailed design lives in `architecture/response-tracking.md` (stub — to be written alongside v0.2 build).

## Sources and references

- [Knowledge base schema](knowledge-base.md) — the per-council records this engine consumes.
- [System overview](system-overview.md) — where this engine sits in the wider system.
- [AI pipeline](ai-pipeline.md) — the model used by the LLM agent inside the Sandbox.
- [Pricing](../business/pricing.md) — the commercial frame around what we promise.
