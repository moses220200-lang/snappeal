/**
 * Guidance chips shown under the dictation textarea.
 *
 * Each entry maps a selected card id (from `lib/grounds-catalog.ts`) to
 * a small set of short writing prompts. When the user picks a ground,
 * the dictation panel renders these as tappable chips that nudge the
 * customer towards the specific facts the drafter and council
 * adjudicator will care about — without us pre-writing the prose for
 * them. Tapping a chip appends the prompt phrase to the textarea so the
 * user can fill in the detail in their own words.
 *
 * Keep prompts short (≤ 80 chars), neutral, and evidence-friendly. We
 * never ask the user to invent — only to remember.
 */

type ChipMap = Record<string, readonly string[]>;

/** Card-specific prompts; falls back to category-level prompts then a
 *  default set when no card-specific entry exists. */
export const CARD_TO_GUIDANCE: ChipMap = {
  /* ── Signs & markings ──────────────────────────────────────────── */
  "sign-obscured": [
    "Describe exactly what was blocking the sign",
    "Say when you first noticed",
    "Mention any photo you took of the obstruction",
  ],
  "sign-missing": [
    "Where were you parked relative to the nearest signs",
    "Describe what signs (if any) you saw on the street",
  ],
  "sign-conflicting": [
    "Note the two signs and what each said",
    "Say which side of the road each sign was on",
  ],
  "sign-too-small": [
    "Describe where the sign was positioned",
    "Say how high above the bay it was",
  ],
  "sign-not-illuminated": [
    "What time of day was it",
    "Describe the lighting on the sign",
  ],
  "markings-faded": [
    "Describe the state of the markings",
    "Say what bay type you thought it was",
  ],
  "markings-absent": [
    "Describe the road surface where you parked",
    "Say what made you think it was unrestricted",
  ],
  "cpz-edge-no-warning": [
    "Which road did you enter the CPZ from",
    "Describe the entry — any sign at all",
  ],
  "terminal-sign-missing": [
    "Where did you think the restriction ended",
    "Describe the road layout",
  ],

  /* ── Bay suspensions ───────────────────────────────────────────── */
  "suspension-no-notice": [
    "Describe the bay and any markings on the day",
    "Say what time you parked",
  ],
  "suspension-late-posted": [
    "Say when you parked vs when the notice appeared",
    "Mention any photos or witnesses",
  ],
  "suspension-wrong-dates": [
    "Quote the dates printed on the notice",
    "Say which date the PCN is for",
  ],
  "suspension-tiny-sticker": [
    "Describe the size and position of the sticker",
    "Say where you were standing/sitting when you looked",
  ],
  "suspension-not-listed-online": [
    "Say when you checked the council website",
    "Mention a screenshot if you have one",
  ],

  /* ── Permits & exemptions ─────────────────────────────────────── */
  "resident-permit": [
    "Quote your permit number if you remember it",
    "Say the zone/borough the permit covers",
    "Mention the validity dates",
  ],
  "business-permit": [
    "Quote the permit number",
    "Say which VRM it's registered against",
  ],
  "visitor-scratchcard": [
    "Say which resident bought the card",
    "Quote the date/time you scratched off",
  ],
  "visitor-digital": [
    "Say who activated the session",
    "Quote the time the session started",
  ],
  "virtual-permit-system": [
    "Say which borough's virtual permit system this is",
    "Mention any confirmation email you have",
  ],
  "paid-pd": [
    "Say where the pay-and-display ticket was placed",
    "Mention the time printed on it",
  ],
  "paid-app-correct-bay": [
    "Which app did you use (RingGo / PayByPhone / etc.)",
    "Quote the zone or location code from the receipt",
  ],
  "paid-app-grace-period": [
    "Say when your paid session ended vs when the PCN was issued",
    "Mention the time on the CEO photograph if known",
  ],

  /* ── Blue Badge ───────────────────────────────────────────────── */
  "bb-displayed": [
    "Confirm the badge was on the dashboard",
    "Say which side the photo/symbol faced",
  ],
  "bb-clock-set": [
    "What arrival time did the clock show",
    "How long had you been parked",
  ],
  "bb-momentarily-not-visible": [
    "Describe how the badge moved",
    "Say what you did when you returned",
  ],
  "bb-disabled-bay-misclassified": [
    "Describe the bay markings",
    "Say if there was a name or just a wheelchair symbol",
  ],

  /* ── Active use ───────────────────────────────────────────────── */
  "loading-continuous-activity": [
    "Describe what you were moving",
    "Say roughly how long the activity took",
    "Mention the address you were delivering to/from",
  ],
  "loading-bulky-goods": [
    "Describe the size and weight of the goods",
    "Say why kerbside access was needed",
  ],
  "unloading-from-shop": [
    "Name the shop and what you bought",
    "Mention the receipt time if you have one",
  ],
  "drop-off-passenger": [
    "Say how long you stopped for",
    "Describe who you were setting down or picking up",
  ],
  "trade-call-at-address": [
    "Name your trade and the address",
    "Mention any invoice or worksheet you can share",
  ],
  "removals-marked": [
    "Say which removal company",
    "Describe the items moved",
  ],

  /* ── Necessity & emergency ───────────────────────────────────── */
  "breakdown-mechanical": [
    "Describe the failure symptom",
    "Say what time it happened",
    "Mention any garage or callout number",
  ],
  "breakdown-aa-rac-attended": [
    "Name the breakdown service",
    "Quote your callout/membership number",
  ],
  "medical-emergency": [
    "Describe the emergency (briefly)",
    "Mention any hospital or GP letter you can share",
  ],
  "directed-by-officer": [
    "Say who directed you to stop",
    "Describe their uniform or vehicle",
  ],
  "road-closed-detour": [
    "Where was the closure",
    "Say why you couldn't move on",
  ],
  "vehicle-immobile-fuel": [
    "Say what time the vehicle ran dry",
    "Mention how you arranged fuel",
  ],

  /* ── Identity & keeper ───────────────────────────────────────── */
  "not-keeper-sold": [
    "Quote the sale date",
    "Mention the V5C transfer date",
    "Name the buyer if you can",
  ],
  "not-keeper-buyer-not-registered": [
    "Quote your purchase date",
    "Mention when your name went on the V5C",
  ],
  "hire-vehicle": [
    "Name the hire company",
    "Quote your hire agreement reference",
  ],
  "wrong-vrm-misread": [
    "Quote the VRM on the PCN",
    "Quote your actual VRM",
  ],
  "fleet-driver-not-self": [
    "Say which fleet/company",
    "Mention how the driver can be identified",
  ],

  /* ── Already settled ─────────────────────────────────────────── */
  "already-paid": [
    "Quote the payment reference if you have it",
    "Say when and how you paid",
  ],
  "already-cancelled": [
    "Quote the cancellation date",
    "Mention the letter or email you received",
  ],
  "duplicate-pcn": [
    "Quote both PCN references",
    "Say what's different (or the same) between them",
  ],

  /* ── Charge & amount ─────────────────────────────────────────── */
  "wrong-band": [
    "Say which band you were charged",
    "Mention what the bay/restriction should be",
  ],
  "discount-window-missed-by-council": [
    "Quote the dates you contacted the council",
    "Say what response (if any) you received",
  ],
  "full-charge-too-soon": [
    "Quote the issue date and the date the full charge applied",
  ],
  "surcharge-not-warranted": [
    "Quote the surcharge amount",
    "Say what it claims to be for",
  ],
  "vat-or-fee-added": [
    "Quote the extra amount on the PCN",
  ],

  /* ── CCTV ────────────────────────────────────────────────────── */
  "cctv-misread": [
    "Quote the VRM on the PCN",
    "Quote your actual VRM",
  ],
  "cctv-no-warning-sign": [
    "Describe the approach to the location",
    "Say where the camera is positioned",
  ],
  "cctv-wrong-direction": [
    "Describe the manoeuvre on the PCN",
    "Describe what you actually did",
  ],
  "cctv-momentary-stop": [
    "Say roughly how long you stopped",
    "Describe why you stopped",
  ],

  /* ── Procedural errors ──────────────────────────────────────── */
  "nto-late": [
    "Quote the PCN issue date",
    "Quote the date the NTO landed",
  ],
  "nto-not-sent": [
    "Confirm you never received the original PCN",
    "Quote the NTO arrival date",
  ],
  "ceo-did-not-attend": [
    "Describe what (if anything) was on the windscreen",
    "Say how you first heard about the PCN",
  ],
  "observation-too-short": [
    "Describe the contravention as the council allege",
    "Say what you were doing at the time",
  ],
  "photographic-evidence-missing": [
    "Confirm you asked for the photographs",
    "Mention the council's reply (or lack of one)",
  ],
  "charge-certificate-too-early": [
    "Quote the NTO date and the Charge Certificate date",
    "Say if you'd already made representations",
  ],

  /* ── Underlying TRO ─────────────────────────────────────────── */
  "tro-not-published": [
    "Say what restriction you're disputing",
    "Mention any council reply about the TRO",
  ],
  "tro-superseded": [
    "Describe the on-street signs vs the order you believe applies",
  ],
  "tro-experimental-expired": [
    "Quote the order's start date if you know it",
    "Say how long the experimental period was meant to last",
  ],
  "tro-defective-consult": [
    "Mention any consultation document you found (or didn't find)",
  ],
};

/** Returns up to N guidance prompts that match the user's selected
 *  cards. We dedupe across cards so the chip strip doesn't repeat the
 *  same nudge twice when two cards in the same category share guidance. */
export function guidanceForCards(
  selectedCardIds: readonly string[],
  limit = 4,
): string[] {
  if (selectedCardIds.length === 0) return [...DEFAULT_GUIDANCE];
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const id of selectedCardIds) {
    const prompts = CARD_TO_GUIDANCE[id];
    if (!prompts) continue;
    for (const p of prompts) {
      if (!seen.has(p)) {
        seen.add(p);
        ordered.push(p);
        if (ordered.length >= limit) return ordered;
      }
    }
  }
  // If selected cards had no entries, fall back to defaults.
  return ordered.length > 0 ? ordered : [...DEFAULT_GUIDANCE];
}

/** Fallback when no card-specific guidance applies. */
export const DEFAULT_GUIDANCE: readonly string[] = [
  "Describe what happened in your own words",
  "Mention any photos or receipts you have",
  "Say what time of day it was",
  "Note anyone with you who saw it",
];
