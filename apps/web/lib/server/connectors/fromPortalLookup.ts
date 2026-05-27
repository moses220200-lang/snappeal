/**
 * Derive a `TicketStatusSnapshot` from the real `portal_lookup` blob
 * written by the Playwright MCP lookup agent.
 *
 * Why this exists: until a per-council connector is implemented, the
 * status endpoint falls back to the deterministic mock connector. The
 * mock rotates 8 stages by `hash(pcnRef:vehicleReg)`, which produced
 * absurd contradictions like "Order for Recovery" (mock) sitting on top
 * of the agent's real read ("open · £160 outstanding · challenge button
 * visible"). For any appeal that has a real lookup snapshot we should
 * trust THAT, not a synthetic rotation.
 *
 * Mapping rules (Layer 1 — deterministic from the bracket-tag verdict):
 *   verdict=open      + due-date in future → stage = appeal_open
 *   verdict=open      + due-date past      → stage = appeal_expired
 *   verdict=expired                        → stage = appeal_expired
 *   verdict=paid                           → stage = paid
 *   verdict=closed                         → stage = closed
 *   verdict=not_found                      → stage = unknown (treat as
 *                                            "we couldn't find it")
 *   verdict=unknown / missing              → null (caller falls back)
 *
 * The amount comes from `metadata.amountPence` (council's authoritative
 * number, not OCR), and `currentDuePence` = that figure. We do NOT
 * synthesise a separate "discount" amount here — Imperial portals
 * already show only the currently-due number, so anything else is a
 * guess.
 *
 * If you're adding a new verdict (e.g. "order_for_recovery" as a
 * first-class Imperial-portal value), extend `PortalLookupVerdict` in
 * `db/schema.ts` first, teach the lookup prompts to emit it, then add a
 * branch here. Don't try to infer recovery stage from amount/£ alone —
 * Imperial portals show different numbers at different stages and the
 * heuristic was wrong twice in dev.
 */
import type { AppealRecord } from "../appeals";
import type {
  TicketStage,
  TicketStatus,
  TicketStatusSnapshot,
} from "./types";

export function snapshotFromPortalLookup(
  appeal: AppealRecord,
): TicketStatusSnapshot | null {
  const lookup = appeal.portalLookup;
  if (!lookup) return null;
  // Only trust a successfully-verified or invalid (paid/closed) read.
  // pending / error / skipped don't have a verdict the UI can act on.
  if (lookup.status !== "verified" && lookup.status !== "invalid") return null;
  if (!lookup.verdict) return null;

  const meta = lookup.metadata ?? {};
  const dueDateAt = meta.dueDateAt ? new Date(meta.dueDateAt) : null;
  const dueInFuture = dueDateAt ? dueDateAt.getTime() > Date.now() : true;

  let stage: TicketStage;
  let status: TicketStatus;
  let canAppeal = false;
  let canPay = false;
  let detail = lookup.verdictReason ?? "";

  switch (lookup.verdict) {
    case "open":
      // Default "open" → appeal_open while the council's stated due-date
      // is still in the future. After due-date passes, the discount/
      // representation window has clearly closed even though the portal
      // may still accept late challenges — we surface that as
      // appeal_expired so the action panel routes to Pay rather than
      // Appeal.
      stage = dueInFuture ? "appeal_open" : "appeal_expired";
      status = "unpaid";
      canAppeal = dueInFuture;
      canPay = true;
      break;
    case "expired":
      stage = "appeal_expired";
      status = "unpaid";
      canAppeal = false;
      canPay = true;
      break;
    case "paid":
      stage = "paid";
      status = "paid";
      canAppeal = false;
      canPay = false;
      break;
    case "closed":
      stage = "closed";
      status = "closed";
      canAppeal = false;
      canPay = false;
      break;
    case "not_found":
      stage = "unknown";
      status = "unknown";
      detail = detail || "Council portal couldn't find this PCN.";
      break;
    case "unknown":
    default:
      return null;
  }

  const daysLeftToAppeal =
    canAppeal && dueDateAt
      ? Math.max(
          0,
          Math.floor((dueDateAt.getTime() - Date.now()) / 86_400_000),
        )
      : null;

  return {
    status,
    stage,
    detail: detail || undefined,
    currentDuePence: meta.amountPence ?? undefined,
    discountUntil: meta.discountUntil ?? null,
    payByDate: meta.dueDateAt ?? null,
    daysLeftToAppeal,
    canAppeal,
    canPay,
    paidAt: meta.paidAt ?? null,
    // We don't have a paymentUrl from the lookup — the caller resolves
    // it from `councils.paymentPortalUrl` on the client side.
    paymentUrl: null,
    rawVerdict: `portal_lookup:${lookup.verdict}`,
    fetchedAt: lookup.fetchedAt,
    // Marks this snapshot as derived from the MCP lookup, NOT the mock
    // rotation. UI surfaces that distinction so customers never see a
    // synthetic stage on top of a real read.
    source: "portal_lookup",
  };
}
