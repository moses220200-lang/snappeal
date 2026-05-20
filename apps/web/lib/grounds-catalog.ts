/**
 * Catalogue of customer-facing PCN appeal grounds, grouped into categories.
 *
 * Each card maps to ONE of the 11 canonical groundIds enforced by
 * `lib/server/ai.ts` and `lib/server/contracts.ts` (the AI uses these IDs
 * verbatim in the generated letter and they're stored on
 * `appeals.grounds`). The user-facing label/description is richer than the
 * raw ID — multiple cards can map to the same canonical ID (e.g. "Markings
 * were faded" and "Signs contradicted each other" both → signage-unclear).
 *
 * Knowledge base: drawn from
 *   • The Civil Enforcement of Road Traffic Contraventions (Representations
 *     and Appeals) (England) Regulations 2022, reg. 4(2) (the 6 statutory
 *     grounds).
 *   • London Tribunals (London PCNs) practice — additional grounds council
 *     officers routinely accept (loading, breakdown, signage, etc.).
 *   • Common informal grounds — payment-app failure, brief stopping, etc.
 *
 * Keep it broad: customers don't speak in statutory language, so the cards
 * frame each ground in plain English with one example.
 */

export type CanonicalGroundId =
  | "contravention-did-not-occur"
  | "signage-unclear"
  | "valid-permit"
  | "blue-badge"
  | "loading-unloading"
  | "breakdown"
  | "medical-emergency"
  | "vehicle-not-mine"
  | "penalty-exceeds-amount"
  | "procedural-impropriety"
  | "traffic-order-invalid";

export interface GroundCard {
  /** Stable per-card key, used as React key + selection state. */
  id: string;
  /** Customer-facing headline, ≤ 50 chars. */
  label: string;
  /** One-sentence description shown under the headline. */
  body: string;
  /** Emoji that anchors the card visually. */
  icon: string;
  /** Maps the card to one of the canonical ground IDs the AI accepts. */
  mapsTo: CanonicalGroundId;
}

export interface GroundCategory {
  id: string;
  title: string;
  /** Helper text under the category title. */
  blurb: string;
  /** Emoji used in the category chip. */
  icon: string;
  cards: GroundCard[];
}

export const GROUND_CATEGORIES: GroundCategory[] = [
  {
    id: "signage",
    title: "Signs & markings",
    blurb:
      "The signs or road markings that should've warned you weren't clear.",
    icon: "🪧",
    cards: [
      {
        id: "sign-obscured",
        label: "The sign was hidden or obscured",
        body: "Parked truck, scaffolding, foliage, tape, or graffiti covered the restriction sign.",
        icon: "🌳",
        mapsTo: "signage-unclear",
      },
      {
        id: "sign-missing",
        label: "There was no sign on this street",
        body: "I couldn't see any restriction sign at all from where I parked.",
        icon: "🚫",
        mapsTo: "signage-unclear",
      },
      {
        id: "sign-conflicting",
        label: "The signs contradicted each other",
        body: "Two signs in the same bay or street said different things.",
        icon: "🔀",
        mapsTo: "signage-unclear",
      },
      {
        id: "markings-faded",
        label: "Yellow lines / bay paint were faded",
        body: "The road markings were so worn I couldn't tell they were active restrictions.",
        icon: "🎨",
        mapsTo: "signage-unclear",
      },
      {
        id: "suspension-hidden",
        label: "A suspension notice was hidden",
        body: "A temporary suspension sticker was small / behind something / put up that morning.",
        icon: "📋",
        mapsTo: "signage-unclear",
      },
    ],
  },
  {
    id: "permit",
    title: "Permits & exemptions",
    blurb: "You had documentary right to park there.",
    icon: "🪪",
    cards: [
      {
        id: "resident-permit",
        label: "I had a valid resident permit",
        body: "A current resident / business permit was displayed (or registered virtually to my reg).",
        icon: "🏠",
        mapsTo: "valid-permit",
      },
      {
        id: "visitor-permit",
        label: "I was a permitted visitor",
        body: "I was displaying a scratch-card / visitor voucher / digital visitor permit.",
        icon: "👋",
        mapsTo: "valid-permit",
      },
      {
        id: "blue-badge",
        label: "I had a Blue Badge",
        body: "My disabled-driver Blue Badge was clearly displayed with the clock set.",
        icon: "♿",
        mapsTo: "blue-badge",
      },
      {
        id: "paid-pd",
        label: "I'd paid by Pay-&-Display",
        body: "The ticket was displayed but missed by the warden, or expired by less than 10 minutes.",
        icon: "🎟️",
        mapsTo: "valid-permit",
      },
      {
        id: "paid-app",
        label: "I paid through the app",
        body: "RingGo / PayByPhone / similar — payment succeeded for the correct vehicle and bay.",
        icon: "📱",
        mapsTo: "valid-permit",
      },
    ],
  },
  {
    id: "active",
    title: "Active use, not parked",
    blurb: "You weren't actually parked — you were doing something brief.",
    icon: "📦",
    cards: [
      {
        id: "loading-goods",
        label: "I was actively loading or unloading",
        body: "Moving goods to or from the vehicle in a place where that's allowed (e.g. on a single yellow line during permitted hours).",
        icon: "📦",
        mapsTo: "loading-unloading",
      },
      {
        id: "drop-off",
        label: "I was dropping off / picking up",
        body: "Stopped briefly for a passenger — the driver remained at the wheel.",
        icon: "🚪",
        mapsTo: "loading-unloading",
      },
      {
        id: "trade-call",
        label: "I was on a trade / service call",
        body: "Plumber, electrician, carer, delivery — actively working at the address.",
        icon: "🔧",
        mapsTo: "loading-unloading",
      },
    ],
  },
  {
    id: "necessity",
    title: "Necessity & emergency",
    blurb: "You had no choice but to stop.",
    icon: "🚨",
    cards: [
      {
        id: "breakdown",
        label: "The vehicle broke down",
        body: "Mechanical failure, flat tyre, dead battery — couldn't be moved (have RAC / AA report if possible).",
        icon: "🛠️",
        mapsTo: "breakdown",
      },
      {
        id: "medical",
        label: "Medical emergency",
        body: "Someone needed urgent medical attention and stopping was the safest course.",
        icon: "🩺",
        mapsTo: "medical-emergency",
      },
      {
        id: "directed",
        label: "I was directed to stop",
        body: "A police officer, traffic warden, or council worker told me to stop / park there.",
        icon: "🚓",
        mapsTo: "medical-emergency",
      },
    ],
  },
  {
    id: "identity",
    title: "Wrong vehicle / wrong person",
    blurb: "The PCN doesn't apply to you — or it's a duplicate.",
    icon: "🚗",
    cards: [
      {
        id: "not-keeper",
        label: "I wasn't the keeper at the time",
        body: "I'd sold / transferred the vehicle before the date on the notice (DVLA V5 evidence available).",
        icon: "🔄",
        mapsTo: "vehicle-not-mine",
      },
      {
        id: "wrong-vrm",
        label: "The registration is misread",
        body: "The reg on the PCN doesn't actually match my vehicle (camera / handwriting error).",
        icon: "🔤",
        mapsTo: "vehicle-not-mine",
      },
      {
        id: "already-paid",
        label: "This PCN was already paid / cancelled",
        body: "I've already paid this notice in full, or the council cancelled it before.",
        icon: "💷",
        mapsTo: "procedural-impropriety",
      },
    ],
  },
  {
    id: "process",
    title: "Council error",
    blurb: "Something is wrong with the notice itself.",
    icon: "🏛️",
    cards: [
      {
        id: "did-not-occur",
        label: "The contravention didn't actually happen",
        body: "I was there, but I wasn't doing what they say — the time / place / action recorded is wrong.",
        icon: "❌",
        mapsTo: "contravention-did-not-occur",
      },
      {
        id: "amount-wrong",
        label: "The penalty amount is wrong",
        body: "The amount exceeds what's legally allowed for the contravention code, or shows the wrong band.",
        icon: "💰",
        mapsTo: "penalty-exceeds-amount",
      },
      {
        id: "late-notice",
        label: "The notice arrived too late",
        body: "Notice to Owner / postal notice arrived outside the statutory window.",
        icon: "📬",
        mapsTo: "procedural-impropriety",
      },
      {
        id: "no-cea",
        label: "The CEO didn't issue the notice on the day",
        body: "Notice was posted later, not affixed at the time of the alleged contravention.",
        icon: "🚶",
        mapsTo: "procedural-impropriety",
      },
      {
        id: "tro-defect",
        label: "The traffic order is defective",
        body: "The underlying Traffic Regulation Order has a known defect or wasn't properly consulted.",
        icon: "📜",
        mapsTo: "traffic-order-invalid",
      },
    ],
  },
];

/**
 * Resolve the customer-selected card IDs back to the canonical ground IDs
 * the AI prompt accepts. De-duplicates so the same canonical ground isn't
 * passed twice if the customer ticked multiple variants of it.
 */
export function selectedCardsToGroundIds(cardIds: string[]): CanonicalGroundId[] {
  const seen = new Set<CanonicalGroundId>();
  const out: CanonicalGroundId[] = [];
  for (const cat of GROUND_CATEGORIES) {
    for (const c of cat.cards) {
      if (cardIds.includes(c.id) && !seen.has(c.mapsTo)) {
        seen.add(c.mapsTo);
        out.push(c.mapsTo);
      }
    }
  }
  return out;
}

/** Lookup a card by id — used by the UI when rendering selected chips. */
export function getCardById(id: string): GroundCard | undefined {
  for (const cat of GROUND_CATEGORIES) {
    const found = cat.cards.find((c) => c.id === id);
    if (found) return found;
  }
  return undefined;
}
