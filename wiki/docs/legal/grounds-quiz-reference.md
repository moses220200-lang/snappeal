# Grounds catalog reference

Last refreshed **2026-05-27 (v0.3.10)**.

The customer-facing Build-appeal quiz surfaces ~75 specific situations across 12 categories. Each situation is a `GroundCard` that **maps to one or more `CanonicalGroundId`s** — the 11 canonical grounds (the six TMA-2004 statutory grounds plus the five informal mitigations the AI drafter uses at stage 1; see [tma-2004.md](tma-2004.md)). This page is the human-readable index of that catalog; the canonical source is `apps/web/lib/grounds-catalog.ts`. At submission time each `CanonicalGroundId` is translated to the specific portal radio label that the council uses, via the per-council P11 grounds registry — see [architecture/grounds-registry.md](../architecture/grounds-registry.md).

## Why 75 cards, not 11 statutory grounds

A naive grounds-picker would surface the 11 `CanonicalGroundId`s directly:

> *contravention-did-not-occur, signage-unclear, valid-permit, blue-badge, loading-unloading, breakdown, medical-emergency, vehicle-not-mine, penalty-exceeds-amount, procedural-impropriety, traffic-order-invalid.*

A driver hit with a PCN doesn't think in those words. They think *"the sign was hidden by a delivery van"* or *"I'd just sold the car two weeks before"*. The catalog encodes the 11 grounds AS the situations drivers actually describe, with a `promptHook` per card that gives the AI drafter a single defensible sentence to splice in. Net effect: the customer picks something concrete and obvious; the drafter constructs a defensible TMA-2004 argument from it.

## The 12 categories

| Category | Cards | Purpose |
|---|---|---|
| **Signs & markings** | ~10 | Sign obscured, missing, contradictory, too small, not illuminated, faded markings, no CPZ-entry sign, etc. Maps mostly to `signage-unclear` + `traffic-order-invalid`. |
| **Bay suspensions** | ~5 | Bay was unsigned but suspended, suspension dates wrong, suspension ended early, etc. Maps to `signage-unclear` + `procedural-impropriety`. |
| **Permits & exemptions** | ~6 | Valid permit not seen, blue-zone permit, dispensation, trade permit, etc. Maps to `valid-permit`. |
| **Blue Badge** | ~5 | Blue Badge displayed but not seen, clock not set, badge visible but expired, holder using badge legitimately. Maps to `blue-badge`. |
| **Active use — not parked** | ~5 | Driver in vehicle, engine running, dropping a passenger, loading goods, deliveries. Maps to `loading-unloading` + `contravention-did-not-occur`. |
| **Necessity & emergency** | ~6 | Medical emergency, vehicle breakdown, urgent help to a vulnerable person, fire/police instruction. Maps to `breakdown` + `medical-emergency`. |
| **Identity & keeper** | ~6 | Vehicle just sold (V5 not yet processed), stolen, cloned plates, in a workshop, on hire. Maps to `vehicle-not-mine`. |
| **Already settled or duplicate** | ~3 | Already paid the PCN, already cancelled by the council, duplicate notice. Maps to `contravention-did-not-occur` + `procedural-impropriety`. |
| **Charge & amount** | ~4 | Amount exceeds statutory max, discount window mis-applied, fee added incorrectly. Maps to `penalty-exceeds-amount`. |
| **CCTV-issued PCN** | ~5 | Camera angle didn't show the alleged contravention, camera-issued for an offence that requires officer observation, lighting prevents reading the plate. Maps to `procedural-impropriety` + `contravention-did-not-occur`. |
| **Procedural errors** | ~8 | NTO timing wrong, less than 28 days served, contravention code wrong on the PCN, photographic evidence missing, observation period too short. Maps to `procedural-impropriety`. |
| **Underlying Traffic Order** | ~5 | The TRO isn't valid, the road isn't covered by the order, the order was suspended. Maps to `traffic-order-invalid`. |

## `GroundCard` shape

```ts
interface GroundCard {
  id: string;                       // e.g. "sign-obscured"
  label: string;                    // ≤ 60 chars, customer-facing headline
  body: string;                     // ≤ 180 chars, one-sentence explainer
  icon: LucideIcon;                 // outline icon for the card chip
  mapsTo: CanonicalGroundId[];      // statutory grounds; primary first
  promptHook?: string;              // one sentence the drafter can splice in
  relevantCodes?: string[];         // contravention codes this card best fits (floats it up)
  weight: "weak" | "medium" | "strong";  // feeds the AI strength-score cap
}
```

The `weight` field is consumed by `scoreAppealStrength()` in `apps/web/lib/server/ai.ts` — a letter built on only "weak" cards is score-capped lower than one built on "strong" cards.

## How the drafter sees the catalog

When the user taps "Build my appeal":

1. `confirmEvidenceAndDraft()` PATCHes `appeal.grounds: string[]` — an array of GroundCard `id`s.
2. The draft-kickoff `useEffect` fires `/api/generate-stream`.
3. The route reads `appeal.grounds` and calls `getCardById()` to resolve each id to a rich object: `{id, label, promptHook, weight}`.
4. These rich objects are passed to `generateDraft()` as `selectedCards: [...]`. The drafter sees the labels and promptHooks; it does NOT see the raw catalog or any cards the user didn't pick.
5. The knowledge pack loader (`loadKnowledgePack`) filters precedents + statutory briefs + council brief by the `CanonicalGroundId`s + `contraventionCode` + `councilSlug`. Top 6 precedents (score ≥ 3) are stitched into the prompt.

## Where this lives

- **Canonical source**: `apps/web/lib/grounds-catalog.ts` (the 12 categories + their cards).
- **Quiz UI**: `apps/web/components/TicketCardBody.tsx → GatheringEvidenceCard` (the "Common reasons" pills, clamped to 3 visible rows). The 12-reason pill list is a deliberate subset of the 75-card catalog — the most-picked reasons surfaced first; "Show all reasons" expands to the rest.
- **AI consumers**: `apps/web/lib/server/ai.ts:scoreAppealStrength()` + `generateDraft()`.
- **Knowledge pack**: `apps/web/lib/server/knowledge.ts` + `apps/web/knowledge/{precedents,codes,councils}/*.md`.

## See also

- [TMA 2004 statutory grounds](tma-2004.md) — the 11 canonical grounds the cards map to.
- [Contravention codes](contravention-codes.md) — the 12 contravention-code briefs (`apps/web/knowledge/codes/{NN}.md`) the drafter consults.
- [Representations and appeals](representations-and-appeals.md) — the four-stage appeal pipeline (informal → formal → tribunal → statutory declaration).
- [`architecture/ai-pipeline.md`](../architecture/ai-pipeline.md) — how the catalog feeds the drafter.
- [`architecture/grounds-registry.md`](../architecture/grounds-registry.md) — the per-council canonical-slug → portal-radio-label translation that runs at submission time.
