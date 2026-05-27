# ParkingRabbit knowledge base

This folder is the corpus the AI drafter draws on when writing a
representation letter. Every file is markdown with YAML frontmatter
and is read at runtime by `lib/server/knowledge.ts`.

There are three folders:

- `precedents/` — anonymised real-world wins. Drafter mirrors the
  reasoning where the user's facts align, never copies verbatim.
- `codes/` — one brief per common London contravention code.
  Statutory basis + the defences council adjudicators routinely accept.
- `councils/` — one brief per London authority covering postal
  address, evidence bar, common rebuttals, portal idiosyncrasies.

## Adding a precedent

Filename convention: `<year>-<council-slug>-code<NN>-<short-slug>.md`
e.g. `2024-westminster-code12-obscured-sign.md`.

Frontmatter (all required unless marked optional):

```yaml
---
id: "westminster-2024-code12-obscured"
groundIds: ["signage-unclear", "procedural-impropriety"]
contraventionCodes: ["12", "16"]
councilSlugs: ["westminster", "kensington-chelsea"]
outcome: "cancelled"      # cancelled | upheld | partial
stage: "informal"          # informal | nto | tribunal
date: "2024-03-14"
summary: "One sentence describing the case."
keyArgument: "One sentence naming the operative legal framing."
---
```

Body should be 200–600 words, anonymised, plain English. Highlight:
- What the council initially said,
- The single move that flipped the result,
- The evidence that did the work.

## Adding a code brief

Filename: `codes/<NN>.md` (zero-padded two digits).

```yaml
---
code: "12"
title: "Parked in a residents'/shared use bay without a valid permit"
statutoryBasis: "TMA 2004, s.78; LATOPR 1996, reg. 18."
strongestGrounds: ["valid-permit", "signage-unclear"]
typicalBand: "B"
typicalAmountPence: 13000
---
## Common defences
- ...
## Common rebuttals from council
- ...
```

## Adding a council brief

Filename: `councils/<slug>.md` matching the slug in the `councils`
table (eg `westminster`, `tfl`).

```yaml
---
slug: "westminster"
name: "Westminster City Council"
parkingServicesAddress: "City of Westminster Parking Services, ..."
appealEmail: "parking@westminster.gov.uk"
portalUrl: "https://www.westminster.gov.uk/parking-pcn-appeal"
acceptsGrounds: ["signage-unclear", "valid-permit", ...]
strictOn: ["medical-emergency"]
evidenceBar: "high"
quirks: |
  - ...
---
```

## Token budget

The loader hard-caps the rendered knowledge pack at ~2500 tokens (~10
KB of text). Keep bodies focused. The drafter sees the `summary` and
`keyArgument` first, the body only when budget allows.

## Adding files at scale

For corpus > 200 docs we move to pgvector + embeddings (see plan).
Until then, this filesystem-based approach is faster to review and
diff in PRs.
