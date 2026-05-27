/**
 * Lambeth grounds mapping — verified against the four portal screenshots
 * captured on 2026-05-26 (the agent reached step 3 of the wizard during
 * a real test submission, so the radio list, textarea placeholder, and
 * contact form are screenshot-confirmed).
 *
 * Portal: https://pcnevidence.lambeth.gov.uk/pcnonline/challenge.php
 * (Imperial Civil Enforcement Solutions stack — same backend as
 * Westminster, RBKC, Hammersmith & Fulham. The radio rows below match
 * what Imperial renders for Lambeth; other Imperial councils USUALLY
 * surface the same 10 rows verbatim, but always re-verify before
 * registering a new council.)
 *
 * Signage canonical grounds map to "The Traffic Management Order is
 * invalid" on Lambeth — Imperial's UI groups signage issues under TMO
 * validity (a sign that doesn't communicate the restriction makes the
 * TMO unenforceable for that bay). Verified by reading Lambeth's
 * guidance text on the step-2 details page.
 */

import type { CouncilGroundsMapping } from "./types";

export const LAMBETH_GROUNDS: CouncilGroundsMapping = {
  councilSlug: "lambeth",
  councilName: "London Borough of Lambeth",
  verifiedAgainst:
    "Portal screenshots 2026-05-26 (step 1 grounds page; step 2 details page; step 3 contact page).",
  /**
   * Wizard step 1 — radio list, ordered top-to-bottom as they appear on
   * Lambeth's challenge.php. Selected row shows a purple tick on the
   * LEFT. Lambeth allows exactly ONE selection.
   */
  portalGrounds: [
    "The contravention did not occur",
    "I was not the owner of the vehicle at the time the contravention occurred",
    "The vehicle had been taken without the keepers consent (i.e. it was stolen)",
    "We are a hire firm and will provide details of the hirer",
    "The PCN exceeded the amount applicable",
    "The PCN has been paid",
    "The Traffic Management Order is invalid",
    "The CEO was not prevented from serving the PCN",
    "There has been a procedural impropriety on the part of the enforcement authority",
    "I wish to challenge this PCN for other reasons",
  ],
  translate: {
    "contravention-did-not-occur": "The contravention did not occur",
    "vehicle-not-mine":
      "I was not the owner of the vehicle at the time the contravention occurred",
    // Signage issues collapse to TMO invalidity in Lambeth's taxonomy —
    // an unreadable sign means the TMO can't be enforced.
    "signage-unclear": "The Traffic Management Order is invalid",
    "traffic-order-invalid": "The Traffic Management Order is invalid",
    "penalty-exceeds-amount": "The PCN exceeded the amount applicable",
    "procedural-impropriety":
      "There has been a procedural impropriety on the part of the enforcement authority",
    // Circumstance-based grounds have no dedicated row on Lambeth — the
    // statutory framing is "Other reasons" with the actual narrative in
    // the step-2 textarea.
    "valid-permit": "I wish to challenge this PCN for other reasons",
    "blue-badge": "I wish to challenge this PCN for other reasons",
    "loading-unloading": "I wish to challenge this PCN for other reasons",
    breakdown: "I wish to challenge this PCN for other reasons",
    "medical-emergency": "I wish to challenge this PCN for other reasons",
  },
  fallbackLabel: "I wish to challenge this PCN for other reasons",
};
