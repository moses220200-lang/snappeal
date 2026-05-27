# Knowledge base

Last refreshed **2026-05-27 (v0.3.10)**.

Three parallel knowledge stores feed ParkingRabbit:

1. **Operational `councils` + `council_automation` tables** — the database-backed config the Playwright MCP submission agent and the deterministic recipes consume (portal URLs, postal addresses, per-council `agentPrompt` + `lookupAgentPrompt`).
2. **Markdown KB at `apps/web/knowledge/`** — precedents from past wins, contravention-code briefs, council quirks. Read at runtime by `lib/server/knowledge.ts` and spliced into the drafter prompt — informs the AI's *reasoning*, not its mechanics.
3. **Per-council grounds-translation registry at `lib/server/submission/grounds/`** (v0.3.10 P11) — the canonical-slug → portal-radio-label map. Informs the submission agent's *clicking*. See [`grounds-registry.md`](grounds-registry.md).

This page covers stores 1 + 2. Store 3 has its own page.

## `councils` table

Per-issuer config consumed by every flow that needs to recognise, contact, or automate a council.

| Field | Type | Notes |
|---|---|---|
| `slug` | `text PK` | URL-safe identifier, e.g. `westminster`, `kensington-chelsea`, `tfl`. |
| `name` | `text` | Display name. |
| `type` | `enum` | `borough` / `corporation` / `tfl` / `other`. |
| `postal_address` | `text` | Full postal address for representations. |
| `appeal_portal_url` | `text` | The free challenge route (NOT the payment route — those differ for some councils, e.g. Lambeth). |
| `payment_portal_url` | `text?` | Separate "Pay yourself" deep-link host. Used by the Pay-yourself tile so the customer doesn't land on the challenge form. |
| `appeal_email` | `text?` | Email address for representations (where accepted). |
| `submission_methods` | `text[]` | Subset of `["portal", "email", "post"]`. |
| `identifier_hints` | `text[]` | Strings the vision model uses to recognise the issuer on a PCN. |
| `pcn_ref_pattern` | `text?` | Regex hint for the PCN reference format issued by this council. |
| `notes` | `text?` | Free-form ops notes. |
| `automation_status` | `enum` | `manual` / `automated_beta` / `automated_ga`. |
| `discount_window_days` | `int` | UK standard is 14; some councils run promo extensions. |
| `logo_url`, `logo_bg` | text | For the `<IssuerLogoReel>` + `<CouncilBadge>` chrome. |
| `last_verified_at` | `timestamp` | Last time an admin confirmed the portal/contact details are correct. |
| `created_at`, `updated_at` | `timestamp` | |

The deprecated `automation_form_schema` JSONB column from v0.2 is gone — per-council Playwright recipes (Phase 9) and Claude MCP prompts (`agentPrompt`/`lookupAgentPrompt`) replaced it. See [`deterministic-recipes.md`](deterministic-recipes.md).

## `council_automation` table

Per-council MCP / recipe metadata, separate from `councils` so the prompt blobs don't bloat the main councils row.

| Field | Type | Notes |
|---|---|---|
| `council_slug` | `text PK + FK` | One row per council. |
| `agent_prompt` | `text` | The submission Claude prompt. Loaded by `runPortalAutomation` and embedded into `runAgentic`. Seeded from the canonical `prompts/<slug>.ts` on first read. |
| `lookup_agent_prompt` | `text?` | The lookup Claude prompt (separate from submission so the agent doesn't accidentally try to file). Falls back to a generic prompt when null. |
| `field_hints` | `jsonb` | Portal form labels + button text + decoy hints. Helps the agent disambiguate "Next" from "Pay now". |
| `last_dry_run` | `jsonb` | Event log + final result from `/admin/councils/<slug>/automation` dry-run. |
| `last_dry_run_ok` | `boolean` | Quick render flag for the admin UI. |
| `updated_at`, `updated_by` | | Light audit. |

Edit + dry-run via `/admin/councils/<slug>/automation`. The line-numbered code editor + drift counter + canonical-inspect button are live in v0.3.9.

!!! note "Where contraventions + grounds actually live"
    There is **no `contraventions` table** in the schema — contravention-code knowledge lives as markdown briefs at `apps/web/knowledge/codes/*.md`. There is **no `grounds` table** — the canonical grounds are an enum in code (`lib/grounds-catalog.ts`): 11 `CanonicalGroundId`s. The customer-facing 75-card quiz catalog in `lib/grounds-catalog.ts` maps each card's `mapsTo` field onto these canonical IDs. The per-council portal-radio-label translation lives in `lib/server/submission/grounds/<slug>.ts` (the P11 registry) — see [`grounds-registry.md`](grounds-registry.md).

## Markdown knowledge corpus

Filesystem-backed markdown at `apps/web/knowledge/` informs the AI drafter's *reasoning*. Three folders:

```
apps/web/knowledge/
├── precedents/   # Anonymised past wins (London tribunals / informal stage / NTO).
├── codes/        # Per contravention code (01, 02, 12, 16, 21, 22, 23, 27, 30, 40, 47, 99).
└── councils/     # Per top London authority (westminster, camden, kensington-chelsea,
                  #   lambeth, islington, tfl).
```

Each file has YAML frontmatter + body. Contribution format documented at `apps/web/knowledge/README.md`. Frontmatter shapes typed in `lib/server/knowledge.types.ts`.

### Frontmatter shapes

**Code brief** (`codes/<NN>.md`):

```yaml
code: "12"
description: "Parked in a residents' or shared-use parking place..."
formalDescription: "as it appears on PCNs"
appliesTo: ["borough", "tfl"]
typicalGrounds: ["valid-permit"]
similarCodes: [16]
commonRebuttals:
  - "Permit not displayed"
  - "Permit expired or zoned wrong"
discountRules: "50% off if paid within 14 days"
```

**Council brief** (`councils/<slug>.md`):

```yaml
slug: lambeth
name: London Borough of Lambeth
postalAddress: |
  Lambeth Parking Services
  ...
appealEmail: appeals@lambeth.gov.uk
portalUrl: https://pcnevidence.lambeth.gov.uk/pcnonline/challenge.php
paymentPortalUrl: https://lambethparking.paypcn.com/default.aspx
acceptsGrounds: [signage-unclear, valid-permit, blue-badge, ...]
strictOn: [late-night-suspensions, footway-parking]
evidenceBar: "medium"
discountWindowDays: 14
quirks: |
  - Strong CCTV enforcement on bus lanes + box junctions
  - Virtual permits checked against DB by VRM
  - Suspensions must be posted 7 days in advance per LB Code of Practice
```

**Precedent** (`precedents/<year>-<council>-<short>.md`):

```yaml
id: "2024-lambeth-code23-cctv-misread"
year: 2024
council: lambeth
contraventionCode: "23"
grounds: [vehicle-not-mine, contravention-did-not-occur]
outcome: cancelled                # cancelled | rejected | partial
stage: informal                   # informal | NTO | tribunal
summary: "VRM misread by CCTV ANPR — council issued cancel after evidence pack..."
keyArgument: "Photographic comparison of plate vs notice plate..."
```

## Canonical grounds (enum in `lib/grounds-catalog.ts`)

| `id` | TMA-2004 statutory? | Notes |
|---|---|---|
| `contravention-did-not-occur` | yes | The most-used statutory ground when the basic facts don't hold up. |
| `signage-unclear` | informal | Sign obscured / contradictory / missing — usually reframes to procedural impropriety. |
| `valid-permit` | yes | Permit valid + on display. |
| `blue-badge` | yes | BB clock + badge visible + within rules. |
| `loading-unloading` | informal | Active loading exemption (Highway Code Rule 240 / TMA s.6). |
| `breakdown` | informal | Vehicle disabled — proof required. |
| `medical-emergency` | informal | Medical exemption — proof required. |
| `vehicle-not-mine` | yes | Statutory transfer of liability. |
| `penalty-exceeds-amount` | yes | Charge incorrectly calculated. |
| `procedural-impropriety` | yes | TMA s.4 / contravention not technically issued correctly. |
| `traffic-order-invalid` | yes | Underlying TRO defective. |

The customer never sees these IDs directly — they pick from the 75 cards in `lib/grounds-catalog.ts → GROUND_CATEGORIES`, and `selectedCardsToGroundIds()` flattens each card's `mapsTo` array onto this enum (deduped, capped at 6). For the council-portal-side translation see [`grounds-registry.md`](grounds-registry.md).

## Retrieval (drafter consumption)

`lib/server/knowledge.ts` exports `loadKnowledgePack({groundIds, contraventionCode?, councilSlug?}) → KnowledgePack`. Lazy-singleton — frontmatter parsed once at module init via `gray-matter`. Ranking is deterministic for v1:

- Precedent score = `+3` per ground intersection, `+2` if contravention code matches, `+1` if council matches, `+2` if outcome == `cancelled`, `+1` if date within 24 months. Filter score ≥ 3, sort score desc + date desc, take top 6.
- Code briefs: primary `codes/<NN>.md` + 1 similar-code brief via curated map (`12 ↔ 16`, `01 ↔ 02`, `24 ↔ 27`, `21 ↔ 22`).
- Council brief: exact slug match on `councils/<slug>.md`.

The renderer truncates each body to ~500 chars, prioritises `summary` + `keyArgument` over body. The final pack is hard-capped at **2500 tokens** (`approxTokens = ceil(charCount / 4)`); on overshoot, the lowest-scoring precedent is dropped and the render retries.

## Audit trail

When the drafter runs, the route persists `appeals.knowledge_pack_used = { usedIds, tokens }` so the choice of precedents / briefs that shaped a given letter is recoverable later. The admin appeal-detail page (`/admin/appeals/[id]`) surfaces this so an ops reviewer can trace why a letter was framed a particular way.

## Bundling

`lib/server/knowledge.ts` is fenced behind `import "server-only"` to prevent client-bundle leakage. `next.config.ts` sets `outputFileTracingIncludes` for `/api/generate-stream` and `/api/generate` so the markdown corpus ships inside the Vercel function bundles. Verify with `vercel build` locally before any deploy.

## Migration path to pgvector

When the corpus exceeds ~200 docs the deterministic ranker stops paying its way and we move to embeddings. Planned: a `knowledge_chunks` table with a `vector(1536)` column populated by a build-time script using OpenAI `text-embedding-3-small`, then `ORDER BY embedding <=> $1 LIMIT 8` with the existing filter score as a re-rank step. Until then, the filesystem-based approach is faster to review and diff in PRs.

## Initial seed

`scripts/seed-councils.ts` inserts **7 councils** sourced from `apps/web/lib/mock-data.ts`: Westminster, Kensington & Chelsea, Camden, Lambeth, Islington, TfL, City of London. Run with `npm run db:seed`. Logos populated separately by `scripts/populate-council-logos.ts`. The 32-borough-plus-TfL-plus-City-of-London full set is intended; the remainder fill in as portal recon completes — see [`../councils/index.md`](../councils/index.md).

## Cross-refs

- The AI pipeline that consumes the knowledge pack: [`ai-pipeline.md`](ai-pipeline.md).
- Per-council canonical-slug → portal-label translation: [`grounds-registry.md`](grounds-registry.md).
- The submission engine that consumes `agentPrompt` + `fieldHints`: [`submission-engine.md`](submission-engine.md).
- Per-council deterministic Playwright recipes: [`deterministic-recipes.md`](deterministic-recipes.md).
- Per-council wiki pages: [`../councils/index.md`](../councils/index.md).
- The customer-facing grounds quiz the AI reads: [`../legal/grounds-quiz-reference.md`](../legal/grounds-quiz-reference.md).
- Admin recipe editor + dry-run: [`admin.md`](admin.md).
