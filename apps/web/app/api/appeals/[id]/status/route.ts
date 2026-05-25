/**
 * GET /api/appeals/[id]/status
 *
 * Resolves the right issuer connector for the appeal and returns a
 * `TicketStatusSnapshot`. Until real connectors ship, this routes to
 * the mock connector and the response is marked `source: "mock"` so
 * the UI can render a "preview" badge.
 *
 * Ownership-gated: an appeal's status is only visible to its owner
 * (or an admin). The route never falls back to "Unpaid by default" —
 * the connector either returns a real verdict, an unknown verdict, or
 * throws `ConnectorError` which surfaces as a 502.
 *
 * Future work:
 *   - Cache snapshots on the appeal row (`appeals.status_snapshot jsonb`)
 *     with a short TTL so repeated calls don't hammer the council portal.
 *   - Enqueue an async job for connectors that need Playwright MCP
 *     instead of a sync fetch — same pattern as the lookup flow.
 *   - Expose a webhook for connectors that can push status updates
 *     (most issuers don't support this, but it's the future-proof path).
 */
import { NextResponse } from "next/server";
import { getAppealById, DatabaseNotConfiguredError } from "@/lib/server/appeals";
import { jsonError } from "@/lib/server/contracts";
import { resolveConnector } from "@/lib/server/connectors/registry";
import { ConnectorError } from "@/lib/server/connectors/types";
import {
  canViewAppeal,
  getRequestSessionId,
  getViewer,
} from "@/lib/server/viewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  try {
    const appeal = await getAppealById(id);
    if (!appeal) {
      return NextResponse.json(jsonError("NOT_FOUND", `Appeal ${id} not found`), {
        status: 404,
      });
    }
    const viewer = await getViewer();
    const sessionId = getRequestSessionId(request);
    if (!canViewAppeal(viewer, appeal, sessionId)) {
      return NextResponse.json(
        jsonError("FORBIDDEN", `Appeal ${id} status not visible to this viewer`),
        { status: 403 },
      );
    }

    const ticket = appeal.ticket;
    if (!ticket?.pcnRef || !ticket?.vehicleReg) {
      return NextResponse.json(
        jsonError("BAD_REQUEST", "Appeal is missing PCN ref / vehicle reg — capture the ticket first."),
        { status: 400 },
      );
    }

    const connector = resolveConnector(appeal.councilSlug);
    try {
      const snapshot = await connector.check({
        pcnRef: ticket.pcnRef,
        vehicleReg: ticket.vehicleReg,
      });
      return NextResponse.json({ snapshot });
    } catch (err) {
      if (err instanceof ConnectorError) {
        return NextResponse.json(
          jsonError(err.code, err.message),
          { status: err.code === "INVALID_INPUT" ? 400 : 502 },
        );
      }
      throw err;
    }
  } catch (err) {
    if (err instanceof DatabaseNotConfiguredError) {
      return NextResponse.json(jsonError("DATABASE_NOT_CONFIGURED", err.message), {
        status: 503,
      });
    }
    return NextResponse.json(
      jsonError("INTERNAL", err instanceof Error ? err.message : "Status check failed"),
      { status: 500 },
    );
  }
}
