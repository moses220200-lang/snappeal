/**
 * Deterministic mock connector — used in dev + as the registry fallback
 * for any issuer whose real connector hasn't been built yet.
 *
 * Returns a snapshot whose `status` + `stage` cycle through realistic
 * combinations based on a hash of the PCN ref so the UI can be exercised
 * against every action-panel branch (appeal-open, appeal-expired, charge-
 * certificate, paid, cancelled) without polling a real portal. Set
 * `MOCK_STATUS_OVERRIDE.current` (test/admin tooling) to force a specific
 * outcome.
 *
 * Do NOT ship this as the production status checker — the registry's
 * `kind === 'mock'` flag must surface in the UI for any snapshot a real
 * connector hasn't produced (so customers don't see a fake "Paid"
 * verdict). See `architecture/status-checker.md`.
 */
import type {
  ConnectorInput,
  IssuerConnector,
  TicketStage,
  TicketStatus,
  TicketStatusSnapshot,
} from "./types";

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

const ROTATION: TicketStage[] = [
  "discount_active",
  "discount_active",
  "appeal_open",
  "appeal_expired",
  "charge_certificate_issued",
  "order_for_recovery",
  "paid",
  "cancelled",
];

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

/** Maps a (mock) stage onto the right `(status, status-detail, amounts,
 *  canAppeal, canPay)` tuple. Real connectors will produce the same
 *  shape from each issuer's native verdict vocabulary. */
function snapshotFor(stage: TicketStage): Omit<TicketStatusSnapshot, "fetchedAt" | "source"> {
  switch (stage) {
    case "paid":
      return {
        status: "paid",
        stage: "paid",
        detail: "Settled in full — nothing more to do.",
        currentDuePence: 0,
        paidAt: daysAgo(3),
        canAppeal: false,
        canPay: false,
        rawVerdict: "Paid",
      };
    case "under_review":
      return {
        status: "under_appeal",
        stage: "under_review",
        detail: "The council is reviewing your representation.",
        currentDuePence: 0,
        canAppeal: false,
        canPay: false,
        rawVerdict: "Representation received",
      };
    case "appeal_submitted":
      return {
        status: "under_appeal",
        stage: "appeal_submitted",
        detail: "Appeal lodged with the council. Awaiting their decision.",
        currentDuePence: 0,
        canAppeal: false,
        canPay: false,
        rawVerdict: "Appeal lodged",
      };
    case "cancelled":
      return {
        status: "cancelled",
        stage: "cancelled",
        detail: "The council has cancelled this PCN.",
        currentDuePence: 0,
        canAppeal: false,
        canPay: false,
        rawVerdict: "Cancelled",
      };
    case "charge_certificate_issued":
      return {
        status: "charge_certificate_issued",
        stage: "charge_certificate_issued",
        detail: "Penalty escalated — the amount has increased by 50%.",
        currentDuePence: 19500,
        canAppeal: false,
        canPay: true,
        rawVerdict: "Charge Certificate served",
      };
    case "order_for_recovery":
      return {
        status: "charge_certificate_issued",
        stage: "order_for_recovery",
        detail: "Order for Recovery filed at Northampton CCBC. Court fee added.",
        currentDuePence: 21000,
        canAppeal: false,
        canPay: true,
        rawVerdict: "Order for Recovery",
      };
    case "enforcement":
      return {
        status: "closed",
        stage: "enforcement",
        detail: "Passed to enforcement agents. Contact the council directly to settle.",
        currentDuePence: 41000,
        canAppeal: false,
        canPay: true,
        rawVerdict: "Enforcement",
      };
    case "closed":
      return {
        status: "closed",
        stage: "closed",
        detail: "Issuer has closed the file — no further action available in-app.",
        currentDuePence: 0,
        canAppeal: false,
        canPay: false,
        rawVerdict: "Closed",
      };
    case "appeal_expired":
      return {
        status: "unpaid",
        stage: "appeal_expired",
        detail: "The 28-day appeal window has elapsed. You can still pay directly.",
        currentDuePence: 13000,
        canAppeal: false,
        canPay: true,
        rawVerdict: "Outstanding · appeal window closed",
      };
    case "appeal_open":
      return {
        status: "unpaid",
        stage: "appeal_open",
        detail: "Appeal window still open. Rabbit can draft and submit for you.",
        currentDuePence: 13000,
        discountedDuePence: 6500,
        discountUntil: daysFromNow(3),
        payByDate: daysFromNow(17),
        daysLeftToAppeal: 17,
        canAppeal: true,
        canPay: true,
        rawVerdict: "Outstanding · appeal window open",
      };
    case "discount_active":
    default:
      return {
        status: "unpaid",
        stage: "discount_active",
        detail: "Discount available — pay or appeal within the discount window.",
        currentDuePence: 13000,
        discountedDuePence: 6500,
        discountUntil: daysFromNow(9),
        payByDate: daysFromNow(23),
        daysLeftToAppeal: 23,
        canAppeal: true,
        canPay: true,
        rawVerdict: "Outstanding · discount active",
      };
  }
}

export const MOCK_STATUS_OVERRIDE: { current: TicketStage | null } = {
  current: null,
};

/** Coerce a string override (e.g. set via /api/admin/connectors test
 *  surface) into the typed stage enum. Returns `null` if the input
 *  doesn't match a known stage. */
export function setMockStageOverride(value: string | null): void {
  if (!value) {
    MOCK_STATUS_OVERRIDE.current = null;
    return;
  }
  const known: TicketStage[] = [
    "scanned",
    "validated",
    "status_check_pending",
    "discount_active",
    "appeal_open",
    "appeal_expired",
    "appeal_submitted",
    "under_review",
    "charge_certificate_issued",
    "order_for_recovery",
    "enforcement",
    "paid",
    "cancelled",
    "closed",
    "unknown",
  ];
  if (known.includes(value as TicketStage)) {
    MOCK_STATUS_OVERRIDE.current = value as TicketStage;
  }
}

// Keep the status-typed signature for back-compat with admin tooling that
// might still be calling MOCK_STATUS_OVERRIDE.current with a TicketStatus.
// Behaviour: such writes are silently coerced by the runtime cycle below.
void (null as unknown as TicketStatus);

export const mockConnector: IssuerConnector = {
  id: "mock",
  displayName: "Mock issuer",
  portalDescription:
    "Deterministic placeholder. Returns rotating sample stages by hash of the PCN ref so the UI can be exercised without a real portal.",
  ready: false,
  async check(input: ConnectorInput): Promise<TicketStatusSnapshot> {
    const stage =
      MOCK_STATUS_OVERRIDE.current ??
      ROTATION[hash(`${input.pcnRef}:${input.vehicleReg}`) % ROTATION.length];
    return {
      ...snapshotFor(stage),
      fetchedAt: new Date().toISOString(),
      source: "mock",
    };
  },
};
