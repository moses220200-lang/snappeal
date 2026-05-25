/**
 * Customer-facing PCN appeal grounds, grouped into categories.
 *
 * Each card represents one specific situation a customer can self-identify
 * with in plain English. A card maps to one or more of the canonical
 * ground IDs enforced by `lib/server/ai.ts` (the AI uses the canonical
 * IDs verbatim in the generated letter and they're stored on
 * `appeals.grounds`). Allowing multiple canonical IDs per card lets a
 * single situation flag both a substantive ground and a procedural ground
 * (e.g. obscured CPZ sign → signage-unclear + procedural-impropriety).
 *
 * `promptHook` is a one-line draftable sentence the AI splices in when
 * the user picks the card — it gives the drafter a high-fidelity starting
 * point that the user's free-text notes can corroborate.
 *
 * `relevantCodes` are London contravention codes that make this card
 * especially relevant — the quiz UI floats these to the top when the
 * council portal has confirmed the code.
 *
 * `weight` is a coarse strength hint used by the AI strength scorer
 * (PR 3); cards marked "weak" cap the achievable score lower when picked
 * alone.
 */
import type { LucideIcon } from "lucide-react";
import {
  Accessibility,
  AlertTriangle,
  Ambulance,
  BadgeCheck,
  Banknote,
  Calendar,
  CalendarX,
  Camera,
  Cctv,
  Clock,
  Construction,
  Eye,
  EyeOff,
  FileWarning,
  Gavel,
  HandCoins,
  HeartPulse,
  IdCard,
  Mail,
  MapPinOff,
  Megaphone,
  PackageOpen,
  Receipt,
  RefreshCw,
  ScanLine,
  Scale,
  ShieldOff,
  Signpost,
  Siren,
  Truck,
  UserMinus,
  Wrench,
} from "lucide-react";

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

/** Strength hint feeding into the AI score cap (PR 3). */
export type GroundWeight = "weak" | "medium" | "strong";

export interface GroundCard {
  /** Stable per-card key, used as React key + selection state. */
  id: string;
  /** Customer-facing headline, ≤ 60 chars. */
  label: string;
  /** One-sentence description shown under the headline, ≤ 180 chars. */
  body: string;
  /** Outline lucide icon component for the card. */
  icon: LucideIcon;
  /** Canonical statutory grounds this card argues. First entry is primary. */
  mapsTo: CanonicalGroundId[];
  /** Optional sentence the drafter can splice in when this card is selected. */
  promptHook?: string;
  /** Contravention codes this card most closely matches (floats card up). */
  relevantCodes?: string[];
  /** Coarse strength hint — feeds the strength scorer in PR 3. */
  weight?: GroundWeight;
}

export interface GroundCategory {
  id: string;
  title: string;
  /** Helper text under the category title. */
  blurb: string;
  /** Outline lucide icon for the category chip. */
  icon: LucideIcon;
  cards: GroundCard[];
}

export const GROUND_CATEGORIES: GroundCategory[] = [
  {
    id: "signage",
    title: "Signs & markings",
    blurb: "The signs or markings that should have warned you weren't clear.",
    icon: Signpost,
    cards: [
      {
        id: "sign-obscured",
        label: "The sign was hidden or obscured",
        body: "A truck, scaffolding, foliage, tape or graffiti was covering the restriction sign when I parked.",
        icon: EyeOff,
        mapsTo: ["signage-unclear"],
        promptHook:
          "The controlling restriction sign was physically obscured at the time of the contravention, so the restriction was not adequately communicated to a stationary driver approaching the bay.",
        relevantCodes: ["01", "12", "16", "21", "22", "23", "30", "40"],
        weight: "strong",
      },
      {
        id: "sign-missing",
        label: "There was no sign on this street",
        body: "I couldn't see any restriction sign at all from where I parked.",
        icon: MapPinOff,
        mapsTo: ["signage-unclear", "traffic-order-invalid"],
        promptHook:
          "No controlling sign was visible from the parking position; the restriction was therefore not lawfully indicated under TSRGD 2016, schedule 4.",
        relevantCodes: ["01", "12", "16", "30"],
        weight: "strong",
      },
      {
        id: "sign-conflicting",
        label: "The signs contradicted each other",
        body: "Two signs on the same street showed different times, days, or restrictions.",
        icon: AlertTriangle,
        mapsTo: ["signage-unclear"],
        promptHook:
          "Two restriction signs on the same controlled length displayed contradictory information, leaving a reasonable driver unable to determine the operative restriction.",
        relevantCodes: ["01", "12", "16", "30", "40"],
        weight: "strong",
      },
      {
        id: "sign-too-small",
        label: "The sign was too small or too high",
        body: "The sign was positioned where a driver couldn't reasonably read it from the bay.",
        icon: Eye,
        mapsTo: ["signage-unclear"],
        promptHook:
          "The controlling sign was positioned so that its text was not legible from the parking position by a driver exercising reasonable care.",
        relevantCodes: ["12", "16", "30"],
        weight: "medium",
      },
      {
        id: "sign-not-illuminated",
        label: "The sign wasn't lit at night",
        body: "The restriction applied at night but the sign wasn't illuminated as required.",
        icon: EyeOff,
        mapsTo: ["signage-unclear"],
        promptHook:
          "The restriction extended into hours of darkness yet the sign was not illuminated as required by TSRGD, leaving the restriction effectively unsigned at the time of the contravention.",
        relevantCodes: ["01", "30"],
        weight: "strong",
      },
      {
        id: "markings-faded",
        label: "The bay or yellow lines were faded",
        body: "The road markings were worn away or repainted poorly so I couldn't tell what bay it was.",
        icon: ScanLine,
        mapsTo: ["signage-unclear", "traffic-order-invalid"],
        promptHook:
          "The road markings demarcating the bay were so worn that a reasonable driver could not have identified the bay's restriction class.",
        relevantCodes: ["01", "02", "12", "16", "22", "27"],
        weight: "medium",
      },
      {
        id: "markings-absent",
        label: "There were no markings on the road",
        body: "There was no painted line or bay marking to show this was a restricted area.",
        icon: ScanLine,
        mapsTo: ["signage-unclear", "traffic-order-invalid"],
        promptHook:
          "No road markings were in place to indicate the alleged restriction, so the area was not validly signed under TSRGD.",
        relevantCodes: ["01", "02", "12", "16"],
        weight: "medium",
      },
      {
        id: "cpz-edge-no-warning",
        label: "No 'Controlled Parking Zone' entry sign",
        body: "I entered a CPZ from a side road that had no zone-entry sign warning me of the restrictions.",
        icon: Signpost,
        mapsTo: ["signage-unclear", "procedural-impropriety"],
        promptHook:
          "The vehicle entered the CPZ from a side road on which no zone-entry sign was posted, contrary to TSRGD requirements for terminal signing.",
        relevantCodes: ["01", "12", "16"],
        weight: "strong",
      },
      {
        id: "terminal-sign-missing",
        label: "No sign at the end of the restriction",
        body: "I couldn't tell where the restriction stopped because there was no terminal sign.",
        icon: Signpost,
        mapsTo: ["signage-unclear"],
        promptHook:
          "No terminal sign closed the restriction, so a driver could not reasonably identify the boundary of the controlled length.",
        relevantCodes: ["01", "30"],
        weight: "medium",
      },
    ],
  },
  {
    id: "suspensions",
    title: "Bay suspensions",
    blurb: "The bay was supposedly suspended — but the notice was wrong or late.",
    icon: Construction,
    cards: [
      {
        id: "suspension-no-notice",
        label: "There was no suspension notice on the bay",
        body: "I parked in a bay that turned out to be suspended, but I saw no notice of suspension at the bay.",
        icon: ShieldOff,
        mapsTo: ["signage-unclear", "procedural-impropriety"],
        promptHook:
          "No suspension notice was displayed at the bay at the time of parking; the suspension was therefore not lawfully signed.",
        relevantCodes: ["21", "22", "30"],
        weight: "strong",
      },
      {
        id: "suspension-late-posted",
        label: "The suspension notice was put up after I parked",
        body: "The notice was added during the day, after my vehicle was already parked.",
        icon: Clock,
        mapsTo: ["procedural-impropriety", "signage-unclear"],
        promptHook:
          "The suspension notice was affixed after the vehicle had been parked; under London Councils Code of Practice the operative suspension required a minimum prior notice period that was not given.",
        relevantCodes: ["21", "22"],
        weight: "strong",
      },
      {
        id: "suspension-wrong-dates",
        label: "The notice showed the wrong dates",
        body: "The dates printed on the suspension notice didn't cover the day I was ticketed.",
        icon: CalendarX,
        mapsTo: ["contravention-did-not-occur", "signage-unclear"],
        promptHook:
          "The suspension notice on the bay specified dates that did not include the date of the alleged contravention; no suspension was therefore in force at the relevant time.",
        relevantCodes: ["21", "22"],
        weight: "strong",
      },
      {
        id: "suspension-tiny-sticker",
        label: "The notice was a tiny sticker not visible from the road",
        body: "The notice was so small or low that I couldn't see it from inside the vehicle.",
        icon: Eye,
        mapsTo: ["signage-unclear"],
        promptHook:
          "The suspension notice was of such a size or position that it could not reasonably be seen by a driver looking for parking from the carriageway.",
        relevantCodes: ["21", "22"],
        weight: "medium",
      },
      {
        id: "suspension-not-listed-online",
        label: "The council's website didn't list this suspension",
        body: "I checked the council's online suspensions list before parking and this bay wasn't on it.",
        icon: AlertTriangle,
        mapsTo: ["procedural-impropriety"],
        promptHook:
          "The council's published list of bay suspensions did not show this bay as suspended at the time of parking; a reasonable driver therefore had no notice of the suspension.",
        relevantCodes: ["21", "22"],
        weight: "medium",
      },
    ],
  },
  {
    id: "permit",
    title: "Permits & exemptions",
    blurb: "I had a valid permit, paid session, or exemption at the time.",
    icon: IdCard,
    cards: [
      {
        id: "resident-permit",
        label: "I had a valid resident permit",
        body: "My resident parking permit covered this bay and the time of parking.",
        icon: IdCard,
        mapsTo: ["valid-permit"],
        promptHook:
          "A valid resident parking permit, registered to the vehicle and within its validity period, was held at the time of the alleged contravention.",
        relevantCodes: ["12", "19", "16"],
        weight: "strong",
      },
      {
        id: "business-permit",
        label: "I had a valid business permit",
        body: "My business permit was registered to this VRM and covered the bay.",
        icon: IdCard,
        mapsTo: ["valid-permit"],
        promptHook:
          "A valid business parking permit was held against this VRM and covered both the bay and the time of the alleged contravention.",
        relevantCodes: ["12", "16"],
        weight: "strong",
      },
      {
        id: "visitor-scratchcard",
        label: "I had a paper visitor scratchcard displayed",
        body: "A visitor scratchcard from a resident was scratched off correctly and on the dashboard.",
        icon: Receipt,
        mapsTo: ["valid-permit"],
        promptHook:
          "A valid visitor scratchcard was on display on the dashboard, scratched to reflect the correct date and time of parking.",
        relevantCodes: ["12", "19"],
        weight: "medium",
      },
      {
        id: "visitor-digital",
        label: "A resident bought me a virtual visitor session",
        body: "A resident activated a virtual visitor session against my VRM in the council's app.",
        icon: Receipt,
        mapsTo: ["valid-permit"],
        promptHook:
          "A resident activated a virtual visitor parking session against this VRM through the council's permit portal before the alleged contravention.",
        relevantCodes: ["12", "19"],
        weight: "medium",
      },
      {
        id: "virtual-permit-system",
        label: "I had a valid virtual permit (no paper)",
        body: "My permit is virtual — there's nothing to display in the windscreen.",
        icon: ScanLine,
        mapsTo: ["valid-permit"],
        promptHook:
          "Permit validity in this borough is held against the VRM in the council's database; no paper display is required. The VRM was a valid permit holder at the time of the contravention.",
        relevantCodes: ["12", "16", "19"],
        weight: "strong",
      },
      {
        id: "paid-pd",
        label: "I paid by pay-and-display",
        body: "I had a valid pay-and-display ticket displayed on the dashboard.",
        icon: Receipt,
        mapsTo: ["valid-permit"],
        promptHook:
          "A valid pay-and-display ticket was displayed on the dashboard covering the time of the alleged contravention.",
        relevantCodes: ["02", "22", "06"],
        weight: "strong",
      },
      {
        id: "paid-app-correct-bay",
        label: "I paid using a parking app",
        body: "I used RingGo / PayByPhone / AppyParking and the session was active.",
        icon: ScanLine,
        mapsTo: ["valid-permit"],
        promptHook:
          "A paid parking session against this VRM, in the correct bay/zone, was active in the council's contracted parking app at the time of the alleged contravention.",
        relevantCodes: ["02", "06", "22"],
        weight: "strong",
      },
      {
        id: "paid-app-grace-period",
        label: "I was inside the 10-minute grace period",
        body: "Either I'd just started the app session, or my session had just expired within the statutory grace.",
        icon: Clock,
        mapsTo: ["valid-permit", "contravention-did-not-occur"],
        promptHook:
          "The vehicle was within the 10-minute grace period mandated by section 86 of the Traffic Management Act 2004 either side of the paid parking session.",
        relevantCodes: ["02", "06", "22", "30"],
        weight: "strong",
      },
    ],
  },
  {
    id: "blue-badge",
    title: "Blue Badge",
    blurb: "I had a Blue Badge displayed and was using it correctly.",
    icon: Accessibility,
    cards: [
      {
        id: "bb-displayed",
        label: "My Blue Badge was clearly displayed",
        body: "The badge was on the dashboard with the photo down and the wheelchair symbol visible.",
        icon: Accessibility,
        mapsTo: ["blue-badge"],
        promptHook:
          "A valid Blue Badge was displayed on the dashboard with the wheelchair symbol upwards and the photograph face down, in accordance with Department for Transport guidance.",
        relevantCodes: ["12", "16", "19", "26", "40"],
        weight: "strong",
      },
      {
        id: "bb-clock-set",
        label: "My Blue Badge clock was set correctly",
        body: "The accompanying time clock showed an arrival time within the past three hours.",
        icon: Clock,
        mapsTo: ["blue-badge"],
        promptHook:
          "The Blue Badge clock was set to the arrival time and the vehicle had been parked for less than the three hours permitted on single/double yellow lines.",
        relevantCodes: ["12", "26", "40"],
        weight: "strong",
      },
      {
        id: "bb-momentarily-not-visible",
        label: "The Blue Badge slipped when I parked",
        body: "The badge fell or slid on the dashboard between when I parked and when the CEO photographed it.",
        icon: AlertTriangle,
        mapsTo: ["blue-badge", "contravention-did-not-occur"],
        promptHook:
          "A valid Blue Badge was on display when the vehicle was left; if the CEO photograph shows the badge slipped, this was a transient movement that does not invalidate the exemption.",
        relevantCodes: ["12", "16", "26", "40"],
        weight: "medium",
      },
      {
        id: "bb-disabled-bay-misclassified",
        label: "The bay I parked in was a Blue Badge bay",
        body: "The bay was a disabled bay open to any valid Blue Badge holder, not a named bay.",
        icon: Accessibility,
        mapsTo: ["blue-badge", "contravention-did-not-occur"],
        promptHook:
          "The bay used was an on-street disabled persons' parking bay open to any valid Blue Badge holder, not a named/personalised bay; the Badge entitled the vehicle to park there.",
        relevantCodes: ["19", "26", "40"],
        weight: "strong",
      },
    ],
  },
  {
    id: "active",
    title: "Active use — not parked",
    blurb: "The vehicle wasn't parked — I was actively loading, dropping off, or working.",
    icon: PackageOpen,
    cards: [
      {
        id: "loading-continuous-activity",
        label: "I was continuously loading or unloading",
        body: "I was actively moving goods between the vehicle and a premises the whole time.",
        icon: PackageOpen,
        mapsTo: ["loading-unloading"],
        promptHook:
          "Continuous loading and unloading of goods between the vehicle and the kerbside premises was in progress throughout the period of the alleged contravention.",
        relevantCodes: ["02", "12", "21", "22", "23", "25", "26", "27"],
        weight: "strong",
      },
      {
        id: "loading-bulky-goods",
        label: "The goods were too bulky to carry far",
        body: "I was unloading bulky / heavy items that needed the vehicle close to the premises.",
        icon: Truck,
        mapsTo: ["loading-unloading"],
        promptHook:
          "The goods being unloaded were bulky and required kerbside access; the vehicle could not have been parked further away without making the activity impracticable.",
        relevantCodes: ["02", "21", "22", "25", "27"],
        weight: "medium",
      },
      {
        id: "unloading-from-shop",
        label: "I had just collected goods from a shop",
        body: "I was loading purchased goods from the shop into the vehicle.",
        icon: PackageOpen,
        mapsTo: ["loading-unloading"],
        promptHook:
          "Goods purchased from the kerbside premises were being loaded into the vehicle at the time of the alleged contravention.",
        relevantCodes: ["02", "21", "22", "25"],
        weight: "medium",
      },
      {
        id: "drop-off-passenger",
        label: "I was setting down or picking up a passenger",
        body: "I had only stopped to let a passenger out or in.",
        icon: UserMinus,
        mapsTo: ["loading-unloading", "contravention-did-not-occur"],
        promptHook:
          "The vehicle stopped only momentarily to set down or take up a passenger, an activity that is not 'parking' under the Highway Code definition.",
        relevantCodes: ["02", "06", "21", "22", "23", "27"],
        weight: "medium",
      },
      {
        id: "trade-call-at-address",
        label: "I was on a trade call at this address",
        body: "I was carrying out a plumbing / electrical / building service inside the address.",
        icon: Wrench,
        mapsTo: ["loading-unloading"],
        promptHook:
          "The driver was undertaking a trade call at the kerbside premises and was actively moving tools and materials between the vehicle and the property.",
        relevantCodes: ["02", "21", "22", "25", "27"],
        weight: "medium",
      },
      {
        id: "removals-marked",
        label: "I was working on a marked removal job",
        body: "I was a removal driver actively moving furniture between the vehicle and the property.",
        icon: Truck,
        mapsTo: ["loading-unloading"],
        promptHook:
          "A marked removal vehicle was being actively loaded/unloaded for a domestic removal job at the kerbside premises throughout the period of the alleged contravention.",
        relevantCodes: ["02", "12", "21", "22", "25", "27"],
        weight: "strong",
      },
    ],
  },
  {
    id: "necessity",
    title: "Necessity & emergency",
    blurb: "Something happened that meant I couldn't move the vehicle.",
    icon: Siren,
    cards: [
      {
        id: "breakdown-mechanical",
        label: "The vehicle broke down mechanically",
        body: "Engine / clutch / tyre / battery failure made the vehicle immobile.",
        icon: Wrench,
        mapsTo: ["breakdown"],
        promptHook:
          "The vehicle suffered a mechanical failure rendering it immobile at the parking position; the driver could not lawfully or practicably move it before assistance arrived.",
        relevantCodes: ["01", "02", "12", "21", "22", "25", "30"],
        weight: "strong",
      },
      {
        id: "breakdown-aa-rac-attended",
        label: "A breakdown service was called or attended",
        body: "RAC / AA / Green Flag / a local mechanic was called to the vehicle.",
        icon: Wrench,
        mapsTo: ["breakdown"],
        promptHook:
          "A recognised breakdown service was called to the vehicle at the parking position; the callout record is available as corroborating evidence.",
        relevantCodes: ["01", "02", "12", "21", "22", "30"],
        weight: "strong",
      },
      {
        id: "medical-emergency",
        label: "Someone needed urgent medical help",
        body: "I or a passenger had a medical emergency — A&E, ambulance, or sudden illness.",
        icon: HeartPulse,
        mapsTo: ["medical-emergency"],
        promptHook:
          "The driver responded to a genuine medical emergency at the location; an A&E discharge note or GP letter is available as corroborating evidence.",
        relevantCodes: ["01", "02", "12", "21", "25", "30"],
        weight: "strong",
      },
      {
        id: "directed-by-officer",
        label: "I was directed to stop by police or a marshal",
        body: "A police officer / traffic warden / event marshal told me to stop there.",
        icon: Megaphone,
        mapsTo: ["procedural-impropriety", "contravention-did-not-occur"],
        promptHook:
          "The vehicle was stopped at the position in question under direct instruction from a person in lawful authority at the scene.",
        relevantCodes: ["01", "12", "21", "30"],
        weight: "medium",
      },
      {
        id: "road-closed-detour",
        label: "The road I was supposed to use was closed",
        body: "An emergency road closure forced me to stop where I did.",
        icon: AlertTriangle,
        mapsTo: ["medical-emergency", "contravention-did-not-occur"],
        promptHook:
          "An unplanned road closure on the intended route meant the vehicle had no alternative but to stop at the location in question.",
        relevantCodes: ["01", "12", "21", "30"],
        weight: "weak",
      },
      {
        id: "vehicle-immobile-fuel",
        label: "I ran out of fuel",
        body: "The vehicle ran out of fuel exactly where it was parked and I couldn't move it.",
        icon: Ambulance,
        mapsTo: ["breakdown"],
        promptHook:
          "The vehicle ran out of fuel at the parking position and could not be moved without external assistance.",
        relevantCodes: ["01", "12", "21"],
        weight: "weak",
      },
    ],
  },
  {
    id: "identity",
    title: "Identity & keeper",
    blurb: "I wasn't the registered keeper, or the wrong vehicle is named.",
    icon: UserMinus,
    cards: [
      {
        id: "not-keeper-sold",
        label: "I sold this vehicle before the date",
        body: "The DVLA shows I'm still the keeper, but I sold the vehicle before the ticket date.",
        icon: RefreshCw,
        mapsTo: ["vehicle-not-mine"],
        promptHook:
          "The vehicle had been sold and the V5C transfer was posted to the DVLA prior to the date of the alleged contravention; the registered-keeper liability passed to the buyer.",
        relevantCodes: [],
        weight: "strong",
      },
      {
        id: "not-keeper-buyer-not-registered",
        label: "I bought this vehicle after the date",
        body: "I'm now the keeper but the contravention happened before I owned it.",
        icon: RefreshCw,
        mapsTo: ["vehicle-not-mine"],
        promptHook:
          "Ownership of the vehicle transferred to me after the date of the alleged contravention; the liability rests with the prior registered keeper.",
        relevantCodes: [],
        weight: "strong",
      },
      {
        id: "hire-vehicle",
        label: "This is a hire car",
        body: "The vehicle was on hire to me on the date — the hire company should have passed liability to me.",
        icon: IdCard,
        mapsTo: ["vehicle-not-mine"],
        promptHook:
          "The vehicle was operated under a written hire agreement at the time of the alleged contravention; liability transfers to the hirer named in the agreement under the Road Traffic Offenders Act 1988.",
        relevantCodes: [],
        weight: "medium",
      },
      {
        id: "wrong-vrm-misread",
        label: "The VRM on the ticket is wrong",
        body: "A letter / digit on the registration plate has been misread (eg 8 vs B, O vs 0).",
        icon: ScanLine,
        mapsTo: ["vehicle-not-mine", "contravention-did-not-occur"],
        promptHook:
          "The VRM transcribed onto the PCN does not match the vehicle's actual registration; the alleged contravention did not occur against the vehicle named on the notice.",
        relevantCodes: ["23"],
        weight: "strong",
      },
      {
        id: "fleet-driver-not-self",
        label: "I wasn't the driver — it's a fleet vehicle",
        body: "This is a company / fleet vehicle and I wasn't driving it that day.",
        icon: UserMinus,
        mapsTo: ["vehicle-not-mine"],
        promptHook:
          "The vehicle is operated as part of a fleet and the registered keeper is able to identify the driver in control at the time of the alleged contravention.",
        relevantCodes: [],
        weight: "weak",
      },
    ],
  },
  {
    id: "settled",
    title: "Already settled or duplicate",
    blurb: "This PCN has already been paid, cancelled, or duplicated.",
    icon: BadgeCheck,
    cards: [
      {
        id: "already-paid",
        label: "I've already paid this PCN",
        body: "Payment was made to the council before this notice arrived.",
        icon: BadgeCheck,
        mapsTo: ["procedural-impropriety", "contravention-did-not-occur"],
        promptHook:
          "Payment of this PCN was made and processed by the council prior to the issuing of the current notice; the proof of payment is available.",
        relevantCodes: [],
        weight: "strong",
      },
      {
        id: "already-cancelled",
        label: "This PCN was previously cancelled",
        body: "The council has already cancelled this PCN — it shouldn't be live.",
        icon: BadgeCheck,
        mapsTo: ["procedural-impropriety", "contravention-did-not-occur"],
        promptHook:
          "This PCN was previously cancelled by the council in correspondence dated as held by the appellant; no further action should lie on the notice.",
        relevantCodes: [],
        weight: "strong",
      },
      {
        id: "duplicate-pcn",
        label: "I got two PCNs for the same parking",
        body: "Two notices were issued for the same vehicle in the same bay at the same time.",
        icon: RefreshCw,
        mapsTo: ["procedural-impropriety"],
        promptHook:
          "Two separate PCNs were issued in respect of the same period of parking; the second is duplicative and must be cancelled.",
        relevantCodes: [],
        weight: "strong",
      },
    ],
  },
  {
    id: "amount",
    title: "Charge & amount",
    blurb: "The amount on the notice is wrong, or the discount window was unfairly missed.",
    icon: Banknote,
    cards: [
      {
        id: "wrong-band",
        label: "The amount is the wrong band",
        body: "I was charged Band A (£160 / £130) for what should be a Band B (£110 / £80) contravention.",
        icon: Banknote,
        mapsTo: ["penalty-exceeds-amount"],
        promptHook:
          "The penalty amount levied is in the higher band whereas the contravention as alleged falls within the lower-band schedule for this authority.",
        relevantCodes: ["01", "02", "06", "12", "22", "25", "27"],
        weight: "strong",
      },
      {
        id: "discount-window-missed-by-council",
        label: "The council made me miss the 50% discount",
        body: "I was waiting on a council response and the discount window expired before I could pay.",
        icon: HandCoins,
        mapsTo: ["procedural-impropriety", "penalty-exceeds-amount"],
        promptHook:
          "The council's delay in responding to representations caused the appellant to lose the statutory 50% discount window; equitable relief in the form of a reinstated discount is sought.",
        relevantCodes: [],
        weight: "medium",
      },
      {
        id: "full-charge-too-soon",
        label: "The full charge was applied too early",
        body: "The notice escalated to the full amount before the discount window should have closed.",
        icon: CalendarX,
        mapsTo: ["procedural-impropriety"],
        promptHook:
          "The PCN was escalated to the full charge before the statutory 14-day discount period had elapsed; the escalation is procedurally defective.",
        relevantCodes: [],
        weight: "medium",
      },
      {
        id: "surcharge-not-warranted",
        label: "An unwarranted surcharge has been added",
        body: "Extra fees on the notice don't correspond to any statutory step.",
        icon: Receipt,
        mapsTo: ["penalty-exceeds-amount", "procedural-impropriety"],
        promptHook:
          "The notice includes a surcharge that does not correspond to a statutory recovery step under the TMA 2004 framework; the amount demanded exceeds the lawful penalty.",
        relevantCodes: [],
        weight: "medium",
      },
      {
        id: "vat-or-fee-added",
        label: "A VAT or admin fee has been added",
        body: "VAT or an admin fee has been added — councils can't lawfully charge these on a PCN.",
        icon: Receipt,
        mapsTo: ["penalty-exceeds-amount"],
        promptHook:
          "VAT or a separate admin fee has been added to the PCN amount; PCNs are statutory and not subject to VAT, and no admin fee is lawfully recoverable from the appellant.",
        relevantCodes: [],
        weight: "medium",
      },
    ],
  },
  {
    id: "cctv",
    title: "CCTV-issued PCN",
    blurb: "The PCN was issued by camera, not by a CEO on the street.",
    icon: Cctv,
    cards: [
      {
        id: "cctv-misread",
        label: "The CCTV camera misread my plate",
        body: "The footage shows a different VRM to the one on the notice.",
        icon: Camera,
        mapsTo: ["vehicle-not-mine", "contravention-did-not-occur"],
        promptHook:
          "The footage relied on by the council shows a VRM that differs from the registration of the vehicle to which this notice was issued.",
        relevantCodes: ["23", "16"],
        weight: "strong",
      },
      {
        id: "cctv-no-warning-sign",
        label: "There was no 'CCTV in operation' sign",
        body: "No camera-enforcement warning sign was visible on approach to the contravention point.",
        icon: ShieldOff,
        mapsTo: ["signage-unclear", "procedural-impropriety"],
        promptHook:
          "No camera-enforcement warning sign was visible on the approach to the alleged contravention, contrary to the Department for Transport's guidance on the use of unattended cameras.",
        relevantCodes: ["12", "21", "22", "23", "27", "30", "31"],
        weight: "strong",
      },
      {
        id: "cctv-wrong-direction",
        label: "I wasn't moving in the direction the camera shows",
        body: "The camera shows a manoeuvre I didn't make.",
        icon: Camera,
        mapsTo: ["contravention-did-not-occur"],
        promptHook:
          "The CCTV footage does not show the manoeuvre alleged in the notice; the alleged contravention did not occur as described.",
        relevantCodes: ["23", "31", "34", "32"],
        weight: "medium",
      },
      {
        id: "cctv-momentary-stop",
        label: "I only stopped momentarily on camera",
        body: "I stopped for a few seconds — not long enough to be 'parked'.",
        icon: Clock,
        mapsTo: ["contravention-did-not-occur", "loading-unloading"],
        promptHook:
          "The footage shows only a momentary stop, insufficient under the relevant definitions to constitute parking, waiting or stopping for the purposes of the contravention code charged.",
        relevantCodes: ["02", "27", "31", "34"],
        weight: "medium",
      },
    ],
  },
  {
    id: "process",
    title: "Procedural errors",
    blurb: "The council didn't follow the correct procedure when serving or recording the PCN.",
    icon: FileWarning,
    cards: [
      {
        id: "nto-late",
        label: "The Notice to Owner arrived too late",
        body: "The NTO arrived after the statutory time limit for service expired.",
        icon: Mail,
        mapsTo: ["procedural-impropriety"],
        promptHook:
          "The Notice to Owner was not served within the statutory period prescribed by paragraph 6 of Schedule 6 to the Road Traffic Act 1991 / TMA 2004; the council's enforcement is therefore out of time.",
        relevantCodes: [],
        weight: "strong",
      },
      {
        id: "nto-not-sent",
        label: "I never received a PCN before this NTO",
        body: "I got a Notice to Owner without ever having received the original PCN.",
        icon: Mail,
        mapsTo: ["procedural-impropriety"],
        promptHook:
          "No PCN was affixed to the vehicle or served by post in advance of the Notice to Owner; the appellant has been denied the early-pay discount window through procedural failure.",
        relevantCodes: [],
        weight: "strong",
      },
      {
        id: "ceo-did-not-attend",
        label: "No CEO ever attended the vehicle",
        body: "The PCN was put through the post but there's no evidence a CEO ever looked at the vehicle.",
        icon: ShieldOff,
        mapsTo: ["procedural-impropriety", "contravention-did-not-occur"],
        promptHook:
          "There is no contemporaneous record (CEO notes, time-stamped photograph) of a civil enforcement officer attending the vehicle at the alleged location and time.",
        relevantCodes: ["01", "02", "12", "16", "30", "40"],
        weight: "medium",
      },
      {
        id: "observation-too-short",
        label: "The CEO didn't observe the vehicle long enough",
        body: "Some codes require a minimum observation period before a PCN can be issued.",
        icon: Clock,
        mapsTo: ["procedural-impropriety", "contravention-did-not-occur"],
        promptHook:
          "The Civil Enforcement Officer's notes do not record the minimum observation period required by the relevant contravention code prior to issue.",
        relevantCodes: ["02", "12", "22", "23", "25", "27", "30"],
        weight: "medium",
      },
      {
        id: "photographic-evidence-missing",
        label: "There's no photographic evidence",
        body: "Despite the CEO being required to photograph the vehicle, no photos are available.",
        icon: Camera,
        mapsTo: ["procedural-impropriety"],
        promptHook:
          "No photographic evidence of the alleged contravention has been produced by the council, contrary to standard CEO procedure for this contravention code.",
        relevantCodes: ["12", "16", "21", "22", "23", "30", "40"],
        weight: "medium",
      },
      {
        id: "charge-certificate-too-early",
        label: "The Charge Certificate came before the deadline",
        body: "I got a Charge Certificate before the deadline for representations had passed.",
        icon: CalendarX,
        mapsTo: ["procedural-impropriety"],
        promptHook:
          "The Charge Certificate was issued prior to the expiry of the period for making formal representations against the NTO; the enforcement is procedurally defective.",
        relevantCodes: [],
        weight: "strong",
      },
    ],
  },
  {
    id: "tro",
    title: "Underlying Traffic Order",
    blurb: "The legal order that creates the restriction is itself defective.",
    icon: Scale,
    cards: [
      {
        id: "tro-not-published",
        label: "The Traffic Order wasn't properly published",
        body: "There's no record of the council publishing the order that creates this restriction.",
        icon: FileWarning,
        mapsTo: ["traffic-order-invalid"],
        promptHook:
          "The Traffic Regulation Order purporting to create the restriction relied upon was not published in accordance with the Local Authorities' Traffic Orders (Procedure) (England and Wales) Regulations 1996.",
        relevantCodes: ["01", "12", "16", "30"],
        weight: "medium",
      },
      {
        id: "tro-superseded",
        label: "The Traffic Order has been superseded",
        body: "A later order replaced this one and the signs haven't been updated.",
        icon: RefreshCw,
        mapsTo: ["traffic-order-invalid", "signage-unclear"],
        promptHook:
          "The Traffic Regulation Order relied upon has been superseded by a later instrument; the on-street signs no longer reflect the operative restriction.",
        relevantCodes: ["01", "12", "16", "30"],
        weight: "medium",
      },
      {
        id: "tro-experimental-expired",
        label: "The experimental order has expired",
        body: "The restriction was an Experimental Traffic Order whose 18-month limit has lapsed.",
        icon: CalendarX,
        mapsTo: ["traffic-order-invalid", "contravention-did-not-occur"],
        promptHook:
          "The restriction was created under an Experimental Traffic Order which has now exceeded the statutory 18-month maximum; the order is no longer in force.",
        relevantCodes: ["01", "12", "16", "30"],
        weight: "strong",
      },
      {
        id: "tro-defective-consult",
        label: "The council didn't consult on the order",
        body: "Statutory consultation requirements for the Traffic Order were not met.",
        icon: Gavel,
        mapsTo: ["traffic-order-invalid"],
        promptHook:
          "The statutory consultation requirements under the LATOPR 1996 were not complied with in making the Traffic Regulation Order relied upon by the council.",
        relevantCodes: [],
        weight: "weak",
      },
    ],
  },
];

/* ────────────────────────────────────────────────────────────────────────── */
/*  Helpers                                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

/** Flat lookup table for fast `getCardById` access. Built once at module load. */
const CARD_INDEX: Map<string, GroundCard> = (() => {
  const map = new Map<string, GroundCard>();
  for (const cat of GROUND_CATEGORIES) {
    for (const card of cat.cards) {
      map.set(card.id, card);
    }
  }
  return map;
})();

/** Returns the card by its id, or null if the id is unknown. */
export function getCardById(id: string): GroundCard | null {
  return CARD_INDEX.get(id) ?? null;
}

/** Returns the category that owns this card id, or null. */
export function getCategoryForCard(cardId: string): GroundCategory | null {
  for (const cat of GROUND_CATEGORIES) {
    if (cat.cards.some((c) => c.id === cardId)) return cat;
  }
  return null;
}

/**
 * Translate selected card IDs to their canonical statutory ground IDs.
 * Flattens the `mapsTo: CanonicalGroundId[]` arrays, dedupes, and caps
 * the result at 6 to match the drafter's contract. Cards selected first
 * (and cards with `weight: "strong"`) win ties when truncation is needed.
 */
export function selectedCardsToGroundIds(
  cardIds: readonly string[],
): CanonicalGroundId[] {
  const seen = new Set<CanonicalGroundId>();
  const ordered: CanonicalGroundId[] = [];
  for (const id of cardIds) {
    const card = CARD_INDEX.get(id);
    if (!card) continue;
    for (const g of card.mapsTo) {
      if (!seen.has(g)) {
        seen.add(g);
        ordered.push(g);
      }
    }
  }
  return ordered.slice(0, 6);
}

/** Total number of cards across all categories — useful for analytics. */
export const TOTAL_CARDS = CARD_INDEX.size;
