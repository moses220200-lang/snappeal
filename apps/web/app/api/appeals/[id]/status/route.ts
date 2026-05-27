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
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/server/db/client";
import { resolveConnector } from "@/lib/server/connectors/registry";
import { ConnectorError } from "@/lib/server/connectors/types";
import { snapshotFromPortalLookup } from "@/lib/server/connectors/fromPortalLookup";
import { snapshotFromOcr } from "@/lib/server/connectors/fromOcr";
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

    // Snapshot precedence (validate-first architecture):
    //
    //   1. portal_lookup — real MCP read of the council's own portal.
    //      Always wins when present and verified/invalid.
    //   2. Automated council, no real lookup yet — return a "validating"
    //      stub snapshot (status_check_pending). The card uses this to
    //      stay in the validating gate; Pay/Appeal tiles are HIDDEN until
    //      the lookup lands. We DO NOT fall through to OCR or mock here:
    //      an automated council has a truth source we trust, and the
    //      user is briefly waiting (~2 min) for it.
    //   3. Non-automated council — OCR-derived snapshot. The council
    //      has no portal we can read, so the user's photo is the only
    //      signal. Pay/Appeal tiles show with an "Unverified" chip.
    //   4. Last resort — mock connector. Effectively only triggered
    //      when we have no councilSlug at all.
    const fromLookup = snapshotFromPortalLookup(appeal);
    if (fromLookup) {
      return NextResponse.json({ snapshot: fromLookup });
    }

    // Resolve council automation status — needed by both the
    // validating-stub branch (automated → wait for lookup) and the
    // OCR-fallback branch (non-automated → show OCR data).
    let councilAutomated = false;
    if (appeal.councilSlug) {
      const db = getDb();
      if (db) {
        const rows = await db
          .select({ automationStatus: schema.councils.automationStatus })
          .from(schema.councils)
          .where(eq(schema.councils.slug, appeal.councilSlug));
        const s = rows[0]?.automationStatus;
        councilAutomated = s === "automated_beta" || s === "automated_ga";
      }
    }

    if (councilAutomated) {
      // Automated council, no portal_lookup yet — return a validating
      // stub so the UI shows the validating gate. Pay/Appeal tiles
      // stay hidden until the real lookup lands. The card's
      // useAutoValidate hook is responsible for kicking the lookup
      // job; this endpoint only describes the state.
      return NextResponse.json({
        snapshot: {
          status: "unknown",
          stage: "status_check_pending",
          detail: "Validating with the council…",
          canAppeal: false,
          canPay: false,
          fetchedAt: new Date().toISOString(),
          source: "portal_lookup",
          rawVerdict: "awaiting_validation",
        },
      });
    }

    // Non-automated council: use OCR snapshot so the user can still
    // act on the ticket. Surfaces with an Unverified chip in the UI.
    const fromOcr = snapshotFromOcr(appeal);
    if (fromOcr) {
      return NextResponse.json({ snapshot: fromOcr });
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
