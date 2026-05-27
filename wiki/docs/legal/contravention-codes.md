# Contravention codes

Last refreshed **2026-05-27 (v0.3.10)**.

Every PCN issued under TMA 2004 carries a **contravention code** — a two-digit number that tells the motorist (and the adjudicator) exactly which rule the council says was broken. The list below covers the most common codes in London.

The full official list is maintained by London Councils' Traffic Enforcement Centre. Use this table as a reference for what each code means in plain English and which ground(s) are most often relevant.

> **AI-readable mirror (v0.3.0):** each common code below also has a per-code brief at `apps/web/knowledge/codes/<NN>.md` (statutory basis + common defences + common council rebuttals) that the AI drafter reads via `loadKnowledgePack()` and uses to pre-empt the council's likely response. Edits to those briefs feed directly into the next generated letter — see [architecture/knowledge-base.md § Markdown knowledge corpus (v0.3.0)](../architecture/knowledge-base.md#markdown-knowledge-corpus-v030).

| Code | What the PCN says | Common defences |
|---|---|---|
| **01** | Parked in a restricted street during prescribed hours | Signage unclear/obscured; loading exemption; contravention did not occur |
| **02** | Parked or loading/unloading in a restricted street where waiting and loading/unloading restrictions are in force | Genuine loading/unloading with continuous activity; signage |
| **12** | Parked in a residents' or shared use parking place without a valid permit/voucher | Valid permit obscured but present; permit was valid; signage |
| **16** | Parked in a permit space without displaying a valid permit | Valid permit displayed but missed; permit obscured by vehicle structure |
| **19** | Parked in a residents' or shared use parking place displaying an invalid permit | Permit was valid at the time; technical permit issue resolved later |
| **21** | Parked in a suspended bay or space | Suspension signage not in place; contravention did not occur |
| **22** | Re-parked within one hour of leaving a bay or space in the same parking place | Different vehicle; misidentification |
| **23** | Parked in a parking place or area not designated for that class of vehicle | Class designation unclear; signage |
| **24** | Not parked correctly within the markings of the bay or space | Markings faded or absent; physical obstruction prevented correct parking |
| **25** | Parked in a loading place during restricted hours without loading | Genuine loading evidence; observation period not respected (procedural impropriety) |
| **30** | Parked for longer than permitted | Pay & display ticket valid; technical payment issue; mobile payment session active |
| **40** | Parked in a designated disabled person's parking place without a valid Blue Badge | Valid Blue Badge with clock set; badge obscured |
| **47** | Stopped on a restricted bus stop or stand | Genuine stopped-for-loading (where exempt); medical/emergency |
| **99** | Stopped on a pedestrian crossing or zigzag markings | Medical emergency; vehicle broken down |

## How ParkingRabbit uses these codes

When you photograph a PCN, the vision model extracts the contravention code. The drafted letter then:

1. Names the code by number ("Contravention 12 — parked in a residents' or shared use parking place without a valid permit/voucher").
2. Selects from the column of **common defences** above, only those supported by your photos + notes.
3. Cites the relevant TMA 2004 ground at the formal stage if needed (see [tma-2004.md](tma-2004.md)).

If the photo's code doesn't match the description on your PCN — typical when the photo is glare-affected — you can correct the code in the editable letter step.

## Sources

- London Councils, *Civil Parking Enforcement* — <https://www.londoncouncils.gov.uk/services/civil-parking-enforcement>
- Department for Transport, *Statutory Guidance on Civil Parking Enforcement* (the official codes list is appended) — <https://www.gov.uk/government/publications/civil-parking-enforcement>
