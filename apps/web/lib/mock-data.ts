/**
 * Typed mock-data accessor for the v0.1 prototype.
 *
 * Mirrors the JSON contract at /fixtures/mock-data.json (single source of
 * truth). When the real backend is wired up in Phase C v0.2, swap the
 * `read*` exports for fetch calls against the API.
 */

export type TimelineState = "completed" | "in_progress" | "pending";

export type TimelineStep = {
  id: string;
  label: string;
  state: TimelineState;
  at: string | null;
};

export type Ticket = {
  issuer: string;
  councilSlug: string;
  pcnRef: string;
  vehicleReg: string;
  contraventionCode: string;
  contraventionDescription: string;
  issuedAt: string;
  location: string;
  amountPence: number;
  photoUrl: string;
};

export type EvidencePhoto = {
  id: string;
  url: string;
  caption: string;
};

export type LetterDoc = {
  subject: string;
  body: string;
  wordCount: number;
  addressedTo: string;
};

export type Submission = {
  method: "portal" | "email" | "manual";
  channel: "portal" | "email";
  submittedAt: string | null;
  councilReference: string | null;
  screenshotUrl: string | null;
};

export type Payment = {
  amountPence: number;
  currency: string;
  stripePaymentIntentId: string;
  paidAt: string;
  method: "apple_pay" | "google_pay" | "card";
};

export type AppealStatus =
  | "draft"
  | "ready"
  | "submitting"
  | "submitted"
  | "under_review"
  | "decision_pending"
  | "cancelled"
  | "rejected";

export type Appeal = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: AppealStatus;
  step: string;
  timeline: TimelineStep[];
  ticket: Ticket;
  evidencePhotos: EvidencePhoto[];
  notes: string;
  grounds: string[];
  letter: LetterDoc;
  submission: Submission;
  payment: Payment;
};

export type Council = {
  slug: string;
  name: string;
  type: "borough" | "tfl" | "corporation" | "royal_parks";
  appealPortalUrl: string;
  /** Optional separate Pay-yourself URL — used when the council runs
   *  appeals and payments on different hosts (e.g. Lambeth uses
   *  pcnevidence.lambeth.gov.uk for challenges but lambethparking.paypcn.com
   *  for payments). Null = reuse `appealPortalUrl` for the Pay tile. */
  paymentPortalUrl?: string | null;
  appealEmail: string | null;
  postalAddress: string | null;
  automationStatus: "manual" | "automated_beta" | "automated_ga";
};

export const user = {
  id: "anon-9f3d2a1c",
  displayName: "Alex",
  createdAt: "2026-04-18T10:14:00Z",
  anonymous: true,
  emailForReceipts: null as string | null,
};

export const pricing = {
  amountPence: 299,
  currency: "GBP",
  displayAmount: "£2.99",
  model: "one-off" as const,
  refundable: false,
  rationale:
    "You pay for the appeal we draft and submit, not for the outcome.",
  serviceFailureRefund: true,
};

export const stats = {
  londonPcnsPerYear: 9_462_185,
  tribunalAppealsPerYear: 47_935,
  tribunalWinRate: 0.494,
  year: "2024-25",
  source: "London Councils, Enforcement and appeals statistics 2024-25",
};

export const appeals: Appeal[] = [
  {
    id: "appeal-001",
    createdAt: "2026-05-12T11:32:00Z",
    updatedAt: "2026-05-16T09:04:00Z",
    status: "under_review",
    step: "submitted",
    timeline: [
      { id: "ticket_added", label: "Ticket Uploaded", state: "completed", at: "2026-05-12T11:32:00Z" },
      { id: "info_collected", label: "Information Collected", state: "completed", at: "2026-05-12T11:34:00Z" },
      { id: "appeal_written", label: "Appeal Written", state: "in_progress", at: "2026-05-12T11:35:00Z" },
      { id: "appeal_submitted", label: "Appeal Submitted", state: "pending", at: null },
    ],
    ticket: {
      issuer: "Westminster City Council",
      councilSlug: "westminster",
      pcnRef: "WC12345678",
      vehicleReg: "AB12 CDE",
      contraventionCode: "12",
      contraventionDescription:
        "Parked in a residents' or shared use parking place without a valid permit/voucher",
      issuedAt: "2026-05-12T09:14:00+01:00",
      location: "Marylebone High Street, W1U",
      amountPence: 16000,
      photoUrl: "/mock/pcn-westminster.jpg",
    },
    evidencePhotos: [
      { id: "ev-1", url: "/mock/evidence-1.jpg", caption: "Suspension notice obscured" },
      { id: "ev-2", url: "/mock/evidence-2.jpg", caption: "Bay markings faded" },
    ],
    notes:
      "I parked at 9:10 — the suspension notice was hidden behind a builder's hoarding. Walked back at 9:30 and the PCN was already issued.",
    grounds: ["signage-unclear", "contravention-did-not-occur"],
    letter: {
      subject: "Representation against PCN WC12345678",
      body: "Dear Westminster City Council Parking Services,\n\nI am writing to challenge Penalty Charge Notice WC12345678 issued on 12 May 2026 in respect of vehicle AB12 CDE at Marylebone High Street, W1U.\n\nI submit this representation on the following grounds:\n\n1. The signage advising of the bay suspension was not visible at the time of parking. A builder's hoarding had been erected directly in front of the suspension notice, rendering it impossible for a reasonable motorist to be aware of the restriction.\n\n2. In the circumstances, the alleged contravention (Code 12 — parking in a residents' bay without a valid permit) cannot be said to have occurred where the suspension itself was not clearly communicated.\n\nPlease find attached photographs taken at the location showing the obstructed signage and the position of the vehicle relative to the bay markings.\n\nI respectfully request that you cancel this Penalty Charge Notice.\n\nYours faithfully,\nAlex",
      wordCount: 312,
      addressedTo:
        "City of Westminster Parking Services, PO Box 351, Sheffield, S98 1TU",
    },
    submission: {
      method: "portal",
      channel: "portal",
      submittedAt: "2026-05-12T11:36:00Z",
      councilReference: "WCC-REP-2026-019822",
      screenshotUrl: "/mock/submission-receipt.jpg",
    },
    payment: {
      amountPence: 299,
      currency: "GBP",
      stripePaymentIntentId: "pi_3OmockedFor_demo",
      paidAt: "2026-05-12T11:33:00Z",
      method: "apple_pay",
    },
  },
  {
    id: "appeal-002",
    createdAt: "2026-04-02T14:22:00Z",
    updatedAt: "2026-04-18T16:50:00Z",
    status: "cancelled",
    step: "resolved",
    timeline: [
      { id: "ticket_added", label: "Ticket Uploaded", state: "completed", at: "2026-04-02T14:22:00Z" },
      { id: "info_collected", label: "Information Collected", state: "completed", at: "2026-04-02T14:24:00Z" },
      { id: "appeal_written", label: "Appeal Written", state: "completed", at: "2026-04-02T14:25:00Z" },
      { id: "appeal_submitted", label: "Appeal Submitted", state: "completed", at: "2026-04-02T14:26:00Z" },
      { id: "decision", label: "PCN Cancelled", state: "completed", at: "2026-04-18T16:50:00Z" },
    ],
    ticket: {
      issuer: "London Borough of Camden",
      councilSlug: "camden",
      pcnRef: "CM98765432",
      vehicleReg: "AB12 CDE",
      contraventionCode: "40",
      contraventionDescription:
        "Parked in a disabled person's parking place without a valid Blue Badge",
      issuedAt: "2026-04-02T13:55:00+01:00",
      location: "Camden High Street, NW1",
      amountPence: 13000,
      photoUrl: "/mock/pcn-camden.jpg",
    },
    evidencePhotos: [],
    notes:
      "I displayed my Blue Badge with the clock set correctly. The warden didn't see it because it had slid down behind the dashboard.",
    grounds: ["blue-badge", "contravention-did-not-occur"],
    letter: {
      subject: "Representation against PCN CM98765432",
      body: "Dear Camden Council Parking Operations,\n\nI am writing to challenge Penalty Charge Notice CM98765432 issued on 2 April 2026 in respect of vehicle AB12 CDE…\n\nYours faithfully,\nAlex",
      wordCount: 287,
      addressedTo:
        "London Borough of Camden Parking Operations, PO Box 755, Redhill, RH1 9GQ",
    },
    submission: {
      method: "portal",
      channel: "portal",
      submittedAt: "2026-04-02T14:26:00Z",
      councilReference: "CAM-PCN-2026-77123",
      screenshotUrl: null,
    },
    payment: {
      amountPence: 299,
      currency: "GBP",
      stripePaymentIntentId: "pi_3OmockedFor_demo2",
      paidAt: "2026-04-02T14:25:00Z",
      method: "google_pay",
    },
  },
];

export const councils: Council[] = [
  {
    slug: "westminster",
    name: "Westminster City Council",
    type: "borough",
    appealPortalUrl: "https://appeals.westminster.gov.uk/",
    appealEmail: "parkingappeals@westminster.gov.uk",
    postalAddress:
      "City of Westminster Parking Services, PO Box 351, Sheffield, S98 1TU",
    automationStatus: "automated_beta",
  },
  {
    slug: "kensington-chelsea",
    name: "Royal Borough of Kensington and Chelsea",
    type: "borough",
    appealPortalUrl:
      "https://www.rbkc.gov.uk/parking-permissions/parking-fines-and-penalty-charge-notices-pcns/help-your-penalty-charge-notice-pcn",
    appealEmail: null,
    postalAddress: null,
    automationStatus: "manual",
  },
  {
    slug: "camden",
    name: "London Borough of Camden",
    type: "borough",
    appealPortalUrl: "https://www.camden.gov.uk/challenge-a-pcn",
    appealEmail: null,
    postalAddress:
      "London Borough of Camden, Parking Operations, PO Box 755, Redhill, RH1 9GQ",
    automationStatus: "automated_beta",
  },
  {
    slug: "lambeth",
    // Lambeth runs its appeal flow on a third-party Imperial Civil
    // Enforcement portal (pcnevidence.lambeth.gov.uk) and its payments
    // on a different host (lambethparking.paypcn.com). The MCP agent
    // must drive the challenge URL; the customer-facing Pay tile must
    // open the paypcn URL — they are NOT the same link.
    name: "London Borough of Lambeth",
    type: "borough",
    appealPortalUrl: "https://pcnevidence.lambeth.gov.uk/pcnonline/challenge.php",
    paymentPortalUrl: "https://lambethparking.paypcn.com/default.aspx",
    appealEmail: "parkingservices@lambeth.gov.uk",
    postalAddress:
      "London Borough of Lambeth, PO Box 333, Darlington, DL1 9LG",
    automationStatus: "automated_beta",
  },
  {
    slug: "islington",
    name: "London Borough of Islington",
    type: "borough",
    appealPortalUrl:
      "https://www.islington.gov.uk/parking/parking-tickets/challenge-a-penalty-charge-notice",
    appealEmail: null,
    postalAddress: null,
    automationStatus: "manual",
  },
  {
    slug: "tfl",
    name: "Transport for London",
    type: "tfl",
    appealPortalUrl:
      "https://tfl.gov.uk/modes/driving/red-routes/penalty-charge-notices/make-a-representation",
    appealEmail: null,
    postalAddress: null,
    automationStatus: "manual",
  },
  {
    slug: "city-of-london",
    name: "City of London Corporation",
    type: "corporation",
    appealPortalUrl:
      "https://www.cityoflondon.gov.uk/services/parking/parking-tickets/challenge-a-ticket",
    appealEmail: null,
    postalAddress: null,
    automationStatus: "manual",
  },
];

export const getAppeal = (id: string) =>
  appeals.find((a) => a.id === id);

export const getCouncil = (slug: string) =>
  councils.find((c) => c.slug === slug);

export const formatPence = (pence: number): string =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pence / 100);

export const formatDate = (iso: string | null): string => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
};

export const formatDateTime = (iso: string | null): string => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const statusLabel: Record<AppealStatus, string> = {
  draft: "Draft",
  ready: "Ready to send",
  submitting: "Submitting",
  submitted: "Submitted",
  under_review: "Under review",
  decision_pending: "Decision pending",
  cancelled: "Cancelled",
  rejected: "Rejected",
};

export const statusTone: Record<
  AppealStatus,
  "muted" | "accent" | "success" | "danger"
> = {
  draft: "muted",
  ready: "accent",
  submitting: "accent",
  submitted: "accent",
  under_review: "accent",
  decision_pending: "accent",
  cancelled: "success",
  rejected: "danger",
};
