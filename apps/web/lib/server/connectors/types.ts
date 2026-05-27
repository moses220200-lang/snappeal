/**
 * Issuer-connector interface + the canonical `TicketStatus` enum.
 *
 * UK parking tickets are fragmented across councils, TfL, private parking
 * companies (ParkingEye, Euro Car Parks, APCOA, NCP, ...), rail operators,
 * and airport parking. There is **no central database**; every issuer has
 * its own portal, its own login, and its own anti-bot posture (CAPTCHA,
 * JS-rendered SPAs, rate limits, session tokens, sometimes Cloudflare).
 *
 * Rather than promising "AI logs into every council automatically", we
 * model each issuer as a connector that converts the universal
 * `{ pcnRef, vehicleReg }` input into a `TicketStatusSnapshot`. Concrete
 * implementations land one issuer at a time after manual portal
 * reconnaissance + a Playwright MCP recipe. Until then, the registry
 * (lib/server/connectors/registry.ts) falls back to a deterministic mock
 * so the rest of the app can be built and tested.
 *
 * Future work (DO NOT remove these comments — they document operational
 * constraints that anyone touching connectors needs to know):
 *
 *   - **CAPTCHA / anti-bot.** Many council portals (Westminster's notably)
 *     gate the lookup behind reCAPTCHA v2 or hCaptcha. Solving programmatically
 *     is a TOS violation. Plan: route through human-in-the-loop or licensed
 *     anti-captcha providers; never bypass.
 *   - **Rate limits.** Hammering a portal will get the ParkingRabbit IP
 *     pool banned. Connector calls must go through a shared rate-limit
 *     queue scoped per-issuer.
 *   - **Session tokens.** Some portals (TfL Congestion Charge in particular)
 *     issue short-lived session cookies that expire mid-walk. Connectors
 *     must retry-on-expire idempotently.
 *   - **JS-app portals.** Reading raw HTML is not enough — many portals
 *     ship a React/Angular SPA. Connectors that fetch raw HTML must be
 *     migrated to Playwright MCP before they generalise.
 *   - **Auth-required portals.** A handful of private parking companies
 *     (ParkingEye after the appeal window) hide the status behind a
 *     mandatory account creation. Treat those as `kind: "manual"` in the
 *     registry until we have a stored credential vault.
 */

/* ───── status taxonomy ─────
 *
 * One canonical enum across every issuer. Concrete connectors map their
 * native verdict strings into this set; UI badges and admin tooling read
 * the enum directly.
 */

export type TicketStatus =
  /** PCN has been issued but not paid and not under formal challenge. */
  | "unpaid"
  /** Settled in full (or to the discount). */
  | "paid"
  /** Formal representation lodged; awaiting council decision. */
  | "under_appeal"
  /** Council/issuer has cancelled the PCN. Customer owes nothing. */
  | "cancelled"
  /** Council has escalated to a Charge Certificate (CC) — penalty +50%,
   *  appeal window narrowed. London-specific concept. */
  | "charge_certificate_issued"
  /** Issuer-side terminal state ("Order for Recovery", "Closed", "Sent to
   *  bailiff"). Customer can no longer appeal without going to the
   *  Traffic Penalty Tribunal. */
  | "closed"
  /** Connector returned a verdict the registry doesn't recognise — render
   *  a neutral state and surface the raw text in admin. */
  | "unknown";

/** Lifecycle stage of a PCN, modelled separately from `TicketStatus` so the
 *  UI can show "appeal expired" + "charge certificate issued" simultaneously
 *  (status = unpaid, stage = charge_certificate_issued) without inventing a
 *  combined enum. Stages roll forward over time; once a PCN escalates it
 *  doesn't roll back. */
export type TicketStage =
  /** Just scanned by the user; no portal lookup yet. */
  | "scanned"
  /** Portal lookup ran; ticket metadata confirmed by the council. */
  | "validated"
  /** Connector unavailable / status check still pending. */
  | "status_check_pending"
  /** Discount window still open — early-bird half-price applies. */
  | "discount_active"
  /** Statutory appeal window (28 days) still open. */
  | "appeal_open"
  /** Statutory appeal window has elapsed — customer can no longer file an
   *  informal representation. Some councils accept witness statements at
   *  later stages but that's a separate (future) workflow. */
  | "appeal_expired"
  /** Customer has lodged an appeal with the council; awaiting decision. */
  | "appeal_submitted"
  /** Council is actively reviewing the appeal. */
  | "under_review"
  /** Charge Certificate issued — penalty +50%, narrower remaining options. */
  | "charge_certificate_issued"
  /** Order for Recovery filed at Northampton CCBC. Customer can still file
   *  a witness statement on grounds like "did not receive the PCN". */
  | "order_for_recovery"
  /** Bailiff / enforcement agent stage. */
  | "enforcement"
  /** Paid by the customer. */
  | "paid"
  /** Cancelled by the issuer (appeal succeeded, void, or admin discretion). */
  | "cancelled"
  /** File closed by the issuer (terminal). */
  | "closed"
  /** Unknown / connector couldn't determine. */
  | "unknown";

/** A single read from an issuer's portal. Connectors return this shape. */
export interface TicketStatusSnapshot {
  status: TicketStatus;
  /** Lifecycle stage — see `TicketStage`. Drives the action-panel
   *  conditional rendering (appeal-open vs appeal-expired vs escalated). */
  stage: TicketStage;
  /** Human-readable summary line — used as the UI subtitle. */
  detail?: string;
  /** Pence. Whatever the portal currently shows as the amount due (£0 when paid). */
  currentDuePence?: number;
  /** Pence. The discounted amount if the discount window is still open. */
  discountedDuePence?: number;
  /** ISO date — when the discount window ends. */
  discountUntil?: string | null;
  /** ISO date — final-payment deadline (after which a Charge Certificate may issue). */
  payByDate?: string | null;
  /** Days remaining in the statutory appeal window. NULL when not
   *  applicable (e.g. ticket is already paid / cancelled). */
  daysLeftToAppeal?: number | null;
  /** Can the customer still file an appeal? Derived from the stage. */
  canAppeal: boolean;
  /** Can the customer pay the issuer right now (i.e. is the PCN
   *  still outstanding)? Derived from the stage. */
  canPay: boolean;
  /** ISO date — when paid (if `status === "paid"`). */
  paidAt?: string | null;
  /** Where the customer settles directly with the issuer. Resolved by the
   *  connector when it knows a per-PCN deep link, else falls back to the
   *  council's generic PCN portal. */
  paymentUrl?: string | null;
  /** Native verdict string from the portal — kept for diagnostics + audit. */
  rawVerdict?: string;
  /** When this snapshot was read. */
  fetchedAt: string;
  /** Which connector produced this — `mock` until a real one ships. */
  source: ConnectorId;
}

/** Stable identifier for a connector implementation. The registry uses
 *  this to look up + log per-connector telemetry. */
export type ConnectorId =
  | "mock"
  // Not a connector in the classical sense — flags a snapshot derived from
  // the Playwright MCP lookup blob written onto `appeals.portal_lookup`
  // by the lookup agent. The UI treats `portal_lookup` as authoritative
  // (the agent literally read the council's own page) instead of falling
  // back to the synthetic mock rotation.
  | "portal_lookup"
  // councils
  | "westminster"
  | "lambeth"
  | "camden"
  | "tfl-congestion"
  | "tfl-bus-lane"
  // private parking (placeholders — none implemented yet)
  | "parkingeye"
  | "euro-car-parks"
  | "apcoa"
  | "ncp"
  | "horizon"
  // rail/airport (placeholders)
  | "national-rail"
  | "heathrow-airport-parking";

/** Universal connector input — every issuer agrees on at minimum PCN ref
 *  + vehicle registration. Extensions (DVLA postcode, account login,
 *  etc.) ride in `extra` so the interface stays flat. */
export interface ConnectorInput {
  pcnRef: string;
  vehicleReg: string;
  extra?: Record<string, string>;
}

/** Standardised failure shape. Connectors throw `ConnectorError` when
 *  they can't read the portal — distinguishing this from `status:
 *  "unknown"` (portal read fine, verdict just didn't fit the taxonomy). */
export class ConnectorError extends Error {
  constructor(
    public readonly code:
      | "PORTAL_UNREACHABLE"
      | "PORTAL_BLOCKED" // CAPTCHA / Cloudflare / 403
      | "INVALID_INPUT"
      | "RATE_LIMITED"
      | "NOT_IMPLEMENTED",
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ConnectorError";
  }
}

/** Connector contract.
 *
 *  Implementations should:
 *  - Be idempotent. Re-checking the same PCN must not have side-effects.
 *  - Respect the per-connector rate limit (enforced by the registry).
 *  - Throw `ConnectorError` for any operational failure; never return a
 *    fake `unpaid` snapshot to "look healthy".
 *  - Be testable without network. Inject the HTTP / Playwright client.
 */
export interface IssuerConnector {
  /** Stable id used by the registry. */
  readonly id: ConnectorId;
  /** Customer-readable issuer name. */
  readonly displayName: string;
  /** Why this connector exists / which portal it reads. Surfaced in
   *  /admin/councils and the architecture doc. */
  readonly portalDescription: string;
  /** True once the connector has been implemented and verified end-to-end
   *  against the real portal. Mock + placeholder connectors return false
   *  so the registry can fall back. */
  readonly ready: boolean;
  /** Fetch the latest status. */
  check(input: ConnectorInput): Promise<TicketStatusSnapshot>;
}

/** UI helpers — keep mapping logic here so every surface (ticket card,
 *  detail page, admin) reads the same labels and tones. */
export const STATUS_LABEL: Record<TicketStatus, string> = {
  unpaid: "Outstanding",
  paid: "Paid",
  under_appeal: "Under appeal",
  cancelled: "Cancelled",
  charge_certificate_issued: "Charge Certificate issued",
  closed: "Closed by issuer",
  unknown: "Status unclear",
};

export const STAGE_LABEL: Record<TicketStage, string> = {
  scanned: "Just scanned",
  validated: "Validated",
  status_check_pending: "Checking status",
  discount_active: "Discount window open",
  appeal_open: "Appeal window open",
  appeal_expired: "Appeal period expired",
  appeal_submitted: "Appeal submitted",
  under_review: "Council reviewing",
  charge_certificate_issued: "Charge Certificate issued",
  order_for_recovery: "Order for Recovery",
  enforcement: "Enforcement / bailiff",
  paid: "Settled",
  cancelled: "Cancelled",
  closed: "Closed",
  unknown: "Status unclear",
};

export type StatusTone = "neutral" | "positive" | "warning" | "danger" | "info";

export const STATUS_TONE: Record<TicketStatus, StatusTone> = {
  unpaid: "warning",
  paid: "positive",
  under_appeal: "info",
  cancelled: "positive",
  charge_certificate_issued: "danger",
  closed: "neutral",
  unknown: "neutral",
};
