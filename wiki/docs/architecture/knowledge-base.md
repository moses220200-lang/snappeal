# Knowledge base

The council knowledge base is the single most-edited data in Snappeal after the appeals themselves. It governs which council is matched, what letter address is used, what portal URL the user is sent to, and (in v0.2) what form fields the Playwright MCP agent expects to fill.

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

## `contraventions` table

| Field | Type | Notes |
|---|---|---|
| `code` | `text PK` | TMA code, e.g. `12`, `40`, `47`. |
| `description` | `text` | Plain English (used in extracted-fields card). |
| `formal_description` | `text` | The text as it appears on PCNs. |
| `applies_to` | `text[]` | List of authority types this code is issued by (`borough`, `tfl`, …). |
| `typical_grounds` | `text[]` | IDs of grounds particularly relevant for this code (e.g. `12` → `valid-permit`). |
| `notes` | `text?` | Edge cases. |

## `grounds` table

| Field | Type | Notes |
|---|---|---|
| `id` | `text PK` | e.g. `signage-unclear`, `blue-badge`, `loading-unloading`. |
| `label` | `text` | User-friendly label. |
| `detail` | `text` | What the AI uses when including this ground in the letter. |
| `is_statutory` | `bool` | True for the six TMA-2004 grounds; false for informal grounds. |
| `applies_to_codes` | `text[]?` | Optional binding to specific contravention codes. |

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

Every change to a council record (via the admin UI) writes a row to `council_audit` with `actor_user_id`, `field`, `before`, `after`, `at`. This is required because a wrong portal URL or a broken form-schema in production causes real harm (failed submissions, lost user appeals).

## Initial seed (Phase A)

`councils/index.md` lists the full set: 32 London boroughs + City of London Corporation + TfL + Royal Parks. Top 5 by PCN volume (Westminster, K&C, Camden, Lambeth, Islington) are filled with researched portal URLs and contact details in Phase A. The remainder use the `_template.md` placeholder until verified.

## Admin operations on this data (Phase B)

The Phase B admin UI exposes:

- **List view** with filters (`type`, `automation_status`, `last_verified_at` older than 90 days).
- **Detail view + edit** for each council record.
- **Bulk verify** — mark a set of councils as freshly verified.
- **Form-schema editor** — JSON editor with live validation against a Zod schema.
- **Diff view** showing the last 10 changes via `council_audit`.
