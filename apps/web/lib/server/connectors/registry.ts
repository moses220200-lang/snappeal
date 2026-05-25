/**
 * Connector registry. Maps an issuer (resolved from `councils.slug` or a
 * private-parking heuristic on the PCN ref pattern) to the connector
 * that knows how to read that issuer's portal.
 *
 * Resolution order:
 *   1. Exact match on the council slug or private-parking issuer key.
 *   2. Fallback to the mock connector — surfaces in the UI as
 *      `source: "mock"` so the customer never sees a fake authoritative
 *      verdict.
 *
 * New connectors should:
 *   - Implement `IssuerConnector` (see `./types.ts`).
 *   - Be registered here under a stable key.
 *   - Be exercised by an admin dry-run before `ready: true` flips on.
 *
 * Compliance + ops constraints live in `./types.ts`. Read them before
 * adding a connector.
 */
import { mockConnector } from "./mock";
import type { ConnectorId, IssuerConnector } from "./types";

const REGISTRY: Partial<Record<ConnectorId | string, IssuerConnector>> = {
  mock: mockConnector,
  // Real connectors land here one issuer at a time. See
  // `architecture/status-checker.md` for the rollout order.
};

/** Resolve a connector by council slug (the canonical id for council
 *  PCNs) or by a private-parking issuer key (`parkingeye`, `apcoa`, …).
 *  Always returns a connector — falls back to the mock so callers don't
 *  need null-checks. Inspect the returned `connector.id` to know whether
 *  the result is authoritative or synthetic. */
export function resolveConnector(issuerKey: string | null | undefined): IssuerConnector {
  if (issuerKey && REGISTRY[issuerKey]?.ready) return REGISTRY[issuerKey]!;
  return mockConnector;
}

/** Inventory used by `/admin/councils` (or a future
 *  `/admin/connectors` page) to show readiness at a glance. */
export function listConnectors(): IssuerConnector[] {
  return Object.values(REGISTRY).filter((c): c is IssuerConnector => Boolean(c));
}
