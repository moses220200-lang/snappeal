# Managing councils

The council CRUD lives at `/admin/councils`. Three concrete pages, plus a per-council automation editor that's the most frequently-touched surface.

## Pages

| Route | Purpose |
|---|---|
| `/admin/councils` | List view of every council in the `councils` table. Per-row Edit + MCP automation links. **Add Council** button top-right. |
| `/admin/councils/new` | Create form: name, slug, type (`borough` / `corporation` / `tfl` / `royal_parks`), portal URL, appeal email, postal address, submission methods (`portal` / `email` / `post`), identifier hints (array of strings the vision model uses to recognise the issuer on a PCN, e.g. `["WESTMINSTER CITY COUNCIL", "WCC PCN"]`), PCN ref pattern regex, automation status. |
| `/admin/councils/[slug]` | Edit any field on the council row. Saves trigger `last_verified_at = now()`. |
| `/admin/councils/[slug]/automation` | **The MCP automation editor.** See below. |

## Adding a new council

1. Visit `/admin/councils` → **Add Council**.
2. Pick a kebab-case slug (it becomes the URL key — `westminster`, `kensington-chelsea`).
3. Fill in the basics from the council's own website: name, type, portal URL, postal address, appeal email if listed.
4. Add **identifier hints** — phrases that appear on the PCN itself so the vision OCR can match the issuer. Look at a real PCN photo and copy the council's name + any branding text verbatim.
5. Add a **PCN ref pattern** regex if the council uses a stable prefix (e.g. `^WE\d{8}$` for Westminster). Optional but improves OCR confidence scoring.
6. Set **automation status** to `manual` initially. Flip to `automated_beta` only after the dry-run passes (next section).
7. Save. The council is immediately available on `/api/councils` (the public endpoint the customer app reads).

## Editing the MCP automation recipe

`/admin/councils/[slug]/automation` is where you tune how the headless Claude + Playwright MCP agent drives this council's portal.

| Field | What it does |
|---|---|
| **`agent_prompt`** | The Markdown system prompt fed to the submission agent. Edit any line — the change takes effect on the **very next claimed `submit_appeal` job** without a restart (the worker reads from `council_automation` on every claim). |
| **`lookup_agent_prompt`** | Optional. The Markdown prompt for the **read-only** PCN-lookup agent (parallel `pcn_lookup` job). When nullable, falls back to the in-code `FALLBACK_LOOKUP_PROMPT`. |
| **`field_hints`** | `jsonb` with last-known-good selectors + hints. Evolves as portals change. Append-only is safe; deleting a hint may regress the agent. |
| **Last dry-run trace** | Persisted from the most recent dry-run: full step trace + final JSON + screenshots + success flag + timestamp. Useful for diffing why a new prompt regresses. |

### Running a dry-run

1. Edit `agent_prompt` / `lookup_agent_prompt` / `field_hints` to your taste.
2. Tap **Dry-run against live portal**. The page POSTs `/api/admin/council-automation/[slug]/dry-run` which spawns a real Claude + Playwright MCP agent against a hardcoded test PCN for this council. Default mode is `stopAtReview=true` so the agent never actually clicks Submit — it stops at the review page and returns its plan.
3. Watch the live event log + screenshots stream in. Total runtime is usually 60–180 s.
4. On done you see: success/failure pill, full JSON the agent intended to submit, every step, every screenshot, the wall-clock duration, and the Claude cost. Trace persists on the row.
5. If the dry-run is green, save. If red, edit and retry.

### Reset to canonical

Every council automation prompt was originally forked from the Westminster recipe. **Reset to canonical** reverts `agent_prompt` to the in-code fallback (the same canonical Westminster recipe). Use when:

- A prompt edit makes things worse and you can't quickly bisect.
- Onboarding a new council whose portal vendor is similar enough to Westminster's to use as a starting point.
- Sanity-checking that the canonical still works against a council that's been broken for a while.

The reset is per-field — `field_hints` and `lookup_agent_prompt` are preserved.

## Verification cadence

Per `councils.last_verified_at`, the admin dashboard flags any council whose row hasn't been re-saved in the last 90 days. The verification routine is:

1. Open the council's own challenge page in a browser.
2. Confirm the portal URL still resolves and the form layout hasn't changed.
3. Confirm the postal address + appeal email match what the council publishes.
4. If anything's drifted, edit the row and Save (which stamps `last_verified_at`).
5. If the portal layout changed materially, **run a fresh dry-run** before flipping back to `automated_beta`.

## Bulk operations

There's no bulk-verify UI today (open work). For now, re-saving each council row individually is the verification flow.

## Where this lives in code

- `app/admin/councils/page.tsx`, `app/admin/councils/new/page.tsx`, `app/admin/councils/[slug]/page.tsx`, `app/admin/councils/[slug]/automation/page.tsx`.
- `app/api/admin/councils/*` — CRUD endpoints (POST/PATCH/DELETE).
- `app/api/admin/council-automation/[slug]/route.ts` — GET/PUT prompt + field hints.
- `app/api/admin/council-automation/[slug]/dry-run/route.ts` — spawn the dry-run agent.
- `app/api/admin/council-automation/[slug]/reset-to-canonical/route.ts` — revert.
- `lib/server/db/schema.ts → councils, councilAutomation` — schema (see [architecture/data-model.md](../architecture/data-model.md)).
- `lib/server/submission/portal.ts → runPortalAutomation()` — the consumer of `agent_prompt`.
- `lib/server/submission/lookup.ts → runPortalLookup()` — the consumer of `lookup_agent_prompt`.
- `lib/server/submission/prompts/` — canonical / fallback prompts (the Westminster fork source).
