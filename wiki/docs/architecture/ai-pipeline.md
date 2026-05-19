# AI pipeline

> :material-pencil-outline: **Stub.** Filled in early Phase C when `/api/generate` is built.

## At-a-glance

- **Gateway**: Vercel AI Gateway (`AI_GATEWAY_API_KEY`).
- **Primary model**: `anthropic/claude-sonnet-4-6` (vision + drafting).
- **Failover**: `anthropic/claude-haiku-4-5` (cost-sensitive extraction-only mode).
- **Call shape**: single `generateObject` with a Zod schema covering extracted ticket + identified council + drafted letter; letter body streams independently via `streamText` to give the user immediate feedback.
- **Inputs**: PCN photo (required), up to 6 evidence photos, user notes (text), council KB excerpt + contravention library (text).
- **Outputs**: extracted ticket fields, council slug, suggested ground IDs, full letter text.

## Prompt strategy (planned)

- System prompt encodes the [design principles](../product/design-principles.md) verbatim: plain English, honest evidence, no legal vocabulary in the user-facing extracted fields, formal-but-plain register in the letter body.
- The KB excerpt is filtered server-side to *just* the councils whose identifier hints overlap the photo, to keep prompt size in budget.
- The system prompt explicitly forbids invented evidence ("if the photos and notes do not support a ground, do not cite that ground").

## Cost target

- < £0.08 per generation at v0.1 volumes.
- < £0.04 once Haiku-routed extraction is wired up.

**TODO**: full prompts, Zod schema, golden-set regression suite.
