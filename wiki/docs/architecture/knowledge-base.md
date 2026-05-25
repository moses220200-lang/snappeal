# Knowledge base

Two parallel knowledge stores feed ParkingRabbit:

1. **Operational `councils` table + `council_automation` recipes** — the database-backed KB the Playwright MCP submission agent consumes (portal URLs, form schemas, postal addresses). The schema below.
2. **Markdown KB at `apps/web/knowledge/`** (v0.3.0) — precedents from past wins, contravention-code briefs, council quirks. Read at runtime by `lib/server/knowledge.ts` and spliced into the drafter prompt — informs the AI's *reasoning*, not its mechanics. See [§ Markdown knowledge corpus (v0.3.0)](#markdown-knowledge-corpus-v030) at the bottom of this page.

The council/automation tables are the single most-edited data in ParkingRabbit after the appeals themselves. They govern which council is matched, what letter address is used, what portal URL the user is sent to, and (in v0.2) what form fields the Playwright MCP agent expects to fill.

This page is the **schema** that Phase B's admin CRUD targets.

## `councils` table

| Field | Type | Notes |
|---|---|---|
| `slug` | `text PK` | URL-safe identifier, e.g. `westminster`, `kensington-chelsea`, `tfl`. |
| `name` | `text` | Display name, e.g. *"Westminster City Council"*. |
| `type` | `enum` | `borough` / `corporation` / `tfl` / `royal_parks`. |
| `postal_address` | `text` | Full postal address for representations. Multi-line. |
| `appeal_portal_url` | `text` | URL of the council's appeal portal (for v0.1 "open in tab"). |
| `appeal_email` | `text?` | Email address for representations (where accepted). |
| `submission_methods` | `text[]` | Subset of `["portal", "email", "post"]` — declared methods accepted. |
| `identifier_hints` | `text[]` | Strings the vision model uses to recognise the issuer on a PCN: e.g. `["WESTMINSTER CITY COUNCIL", "City of Westminster", "WCC PCN"]`. |
| `pcn_ref_pattern` | `text?` | Regex hint for the PCN reference format issued by this council. |
| `notes` | `text?` | Free-form ops notes. |
| `automation_status` | `enum` | `manual` / `automated_beta` / `automated_ga` — which submission path is active. |
| `automation_form_schema` | `jsonb?` | v0.2: structured form definition the Playwright MCP agent consumes. |
| `last_verified_at` | `timestamp` | Last time an admin confirmed the portal/contact details are correct. |
| `created_at` | `timestamp` | |
| `updated_at` | `timestamp` | |

!!! note "Where contraventions + grounds actually live"
    There is **no `contraventions` table** in the schema — contravention-code knowledge lives as markdown briefs at `apps/web/knowledge/codes/*.md` (currently codes `01, 02, 12, 16, 21, 22, 23, 27, 30, 40, 47, 99`), loaded by `lib/server/knowledge.ts` and spliced into the drafter prompt. Similarly there is **no `grounds` table** — the canonical grounds are an enum in code (`lib/server/contracts.ts`): `contravention-did-not-occur`, `signage-unclear`, `valid-permit`, `blue-badge`, `loading-unloading`, `breakdown`, `medical-emergency`, `vehicle-not-mine`, `penalty-exceeds-amount`, `procedural-impropriety`, `traffic-order-invalid` (11 total). The customer-facing 75-card quiz catalog in `lib/grounds-catalog.ts` maps each card's `mapsTo` field onto these canonical IDs. Schemas below for those embedded structures.

## `apps/web/knowledge/codes/<NN>.md` frontmatter

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
```

## Canonical grounds (enum in `lib/server/contracts.ts`)

| `id` | TMA-2004 statutory? | Notes |
|---|---|---|
| `contravention-did-not-occur` | yes | The most-used statutory ground when the basic facts don't hold up. |
| `signage-unclear` | informal | Sign obscured / contradictory / missing — drives a procedural-impropriety reframe. |
| `valid-permit` | yes | Permit valid + on display. |
| `blue-badge` | yes | BB clock + badge visible + within rules. |
| `loading-unloading` | informal | Active loading exemption (Highway Code Rule 240 / TMA s.6). |
| `breakdown` | informal | Vehicle disabled — proof required. |
| `medical-emergency` | informal | Medical exemption — proof required. |
| `vehicle-not-mine` | yes | Statutory transfer of liability. |
| `penalty-exceeds-amount` | yes | Charge incorrectly calculated. |
| `procedural-impropriety` | yes | TMA s.4 / contravention not technically issued correctly. |
| `traffic-order-invalid` | yes | Underlying TRO defective. |

The customer never sees these IDs directly — they pick from the 75 cards in `lib/grounds-catalog.ts → GROUND_CATEGORIES`, and `selectedCardsToGroundIds()` flattens each card's `mapsTo` array onto this enum (deduped, capped at 6).

## `automation_form_schema` (v0.2)

Per-council JSON describing the council's appeal portal form. Consumed by the Playwright MCP agent. Example shape:

```json
{
  "url": "https://appeals.westminster.gov.uk/pcn",
  "steps": [
    {
      "selector": "input[name='pcnRef']",
      "fill": "{{ticket.pcnRef}}"
    },
    {
      "selector": "input[name='vrm']",
      "fill": "{{ticket.vehicleReg}}"
    },
    {
      "selector": "textarea[name='reasons']",
      "fill": "{{appeal.letterBody}}"
    },
    {
      "selector": "input[type='file'][name='evidence']",
      "uploadAll": "{{appeal.evidencePhotoUrls}}"
    },
    {
      "selector": "button[type='submit']",
      "click": true,
      "thenWaitFor": "text=submission received"
    }
  ],
  "captureConfirmation": {
    "selector": "[data-testid='reference']",
    "intoField": "submissionRef"
  }
}
```

This schema is intentionally a **mini DSL**, not arbitrary code. Two reasons:

1. **Safety** — admins can edit a council's form schema without writing JS.
2. **Determinism** — the AI agent inside the Workflow consumes this schema rather than improvising selectors, which keeps council submissions predictable and auditable.

## Versioning

Open work — there is **no `council_audit` table today**. Per-council change tracking is on the open-work list in [admin.md](admin.md). For now, `council_automation.updated_by` + `updated_at` capture who-last-touched-the-automation-recipe; council CRUD itself isn't audited yet.

## Initial seed

`scripts/seed-councils.ts` inserts **7 councils** sourced from `apps/web/lib/mock-data.ts`: Westminster, Kensington & Chelsea, Camden, Lambeth, Islington, TfL, City of London. Run with `npm run db:seed`. Logos are populated separately by `scripts/populate-council-logos.ts`. The 32-borough-plus-TfL-plus-City-of-London full set is intended; the remainder fill in as portal recon completes — see [councils/index.md](../councils/index.md).

## Admin operations on this data

The live `/admin/councils/*` surface exposes:

- **List view** at `/admin/councils` with the **Add Council** button.
- **Detail + edit** at `/admin/councils/[slug]`.
- **MCP automation editor** at `/admin/councils/[slug]/automation` — edit `agentPrompt` + `fieldHints` + run a **dry-run against the live portal** (returns event log + final JSON + screenshot) + reset to canonical Westminster fallback.
- **Create** at `/admin/councils/new`.

See [admin.md](admin.md) for the full admin surface map.

## Markdown knowledge corpus (v0.3.0)

Beyond the operational `councils` table, a **filesystem-backed markdown corpus** at `apps/web/knowledge/` informs the AI drafter's *reasoning*. Three folders:

```
apps/web/knowledge/
├── precedents/    # Anonymised past wins (London tribunals / informal stage / NTO).
├── codes/         # One brief per common contravention code (01, 02, 12, 16, 21, 22, 23, 27, 30, 40, 47, 99).
└── councils/      # One brief per top London authority (westminster, camden, kensington-chelsea, lambeth, islington, tfl).
```

Each file has YAML frontmatter + a body. See `apps/web/knowledge/README.md` for the contribution format. Frontmatter shapes are typed in `lib/server/knowledge.types.ts`.

### Retrieval

`lib/server/knowledge.ts` exports `loadKnowledgePack({groundIds, contraventionCode?, councilSlug?}) → KnowledgePack`. The loader is a lazy-singleton (frontmatter parsed once at module init via `gray-matter`). Ranking is deterministic for v1:

- Precedent score = `+3` per ground intersection, `+2` if contravention code matches, `+1` if council matches, `+2` if outcome == `cancelled`, `+1` if date within 24 months. Filter score ≥ 3, sort score desc + date desc, take top 6.
- Code briefs: primary `codes/<NN>.md` + 1 similar-code brief via curated map (`12 ↔ 16`, `01 ↔ 02`, `24 ↔ 27`, `21 ↔ 22`).
- Council brief: exact slug match on `councils/<slug>.md`.

The renderer truncates each body to 500 chars, prioritises `summary` + `keyArgument` over body. The final pack is hard-capped at **2500 tokens** (`approxTokens = ceil(charCount / 4)`); on overshoot, the lowest-scoring precedent is dropped and the render retries.

### Bundling

`lib/server/knowledge.ts` is fenced behind `import "server-only"` to prevent client-bundle leakage. `next.config.ts` sets `outputFileTracingIncludes` for both `/api/generate-stream` and `/api/generate` so the markdown corpus ships inside the Vercel function bundles — without this, runtime reads ENOENT in production. Verify with `vercel build` locally before any deploy.

### Audit trail

When the drafter runs, the route persists `appeals.knowledge_pack_used = { usedIds, tokens }` so the choice of precedents / briefs that shaped a given letter is recoverable later. See migration `0013_appeal_strength_and_kb.sql`.

### Migration path to pgvector

When the corpus exceeds ~200 docs the deterministic ranker stops paying its way and we move to embeddings. Planned: a `knowledge_chunks` table with a `vector(1536)` embedding column populated by a build-time script using OpenAI `text-embedding-3-small`, then `ORDER BY embedding <=> $1 LIMIT 8` with the existing filter score as a re-rank step. Until then, the filesystem-based approach is faster to review and diff in PRs.
