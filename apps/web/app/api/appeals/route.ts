import { NextResponse } from "next/server";
import { z } from "zod";
import { createAppeal, listAppealsForViewer, DatabaseNotConfiguredError } from "@/lib/server/appeals";
import { jsonError } from "@/lib/server/contracts";
import { getViewer } from "@/lib/server/viewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateBody = z.object({
  sessionId: z.string().min(1).max(128),
  notes: z.string().max(2000).optional().nullable(),
});

/**
 * POST /api/appeals
 *
 * Creates a fresh draft appeal for the current viewer (guest or signed-in).
 * Returns the appeal record with its server-issued id + reply-to alias.
 */
export async function POST(request: Request) {
  let body: z.infer<typeof CreateBody>;
  try {
    body = CreateBody.parse(await request.json());
  } catch (err) {
    return NextResponse.json(jsonError("BAD_REQUEST", "Invalid create body", String(err)), {
      status: 400,
    });
  }
  const viewer = await getViewer();
  try {
    const appeal = await createAppeal({
      sessionId: body.sessionId,
      userId: viewer.userId,
      notes: body.notes ?? null,
    });
    return NextResponse.json({ appeal });
  } catch (err) {
    if (err instanceof DatabaseNotConfiguredError) {
      return NextResponse.json(jsonError("DATABASE_NOT_CONFIGURED", err.message), { status: 503 });
    }
    return NextResponse.json(
      jsonError("INTERNAL", err instanceof Error ? err.message : "Failed to create appeal"),
      { status: 500 },
    );
  }
}

/**
 * GET /api/appeals?sessionId=...
 *
 * Lists every appeal visible to the current viewer — their guest sessionId's
 * rows, plus (when signed in) every appeal already claimed by their userId.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json(jsonError("BAD_REQUEST", "Missing sessionId query param"), {
      status: 400,
    });
  }
  const viewer = await getViewer();
  // v0.2.15+: the v0.2.7 "guests don't see a list" gate is gone.
  // Progressive ticket creation now persists real ticket rows owned by
  // the guest session as soon as a PCN is uploaded, so the dashboard
  // MUST surface them or the user is stranded with a ticket they
  // can't find. `listAppealsForViewer` already filters strictly to
  // `sessionId` (and, when present, `userId`) so a guest only ever
  // sees their own session's appeals.
  // v0.2.13 — `?since=<ISO>` returns only appeals updated strictly after
  // the timestamp, used by the smart ticket card's 15s reconciliation poll
  // so it doesn't redownload the full list each tick. Invalid input is
  // silently ignored (the caller falls back to a full fetch).
  const sinceRaw = url.searchParams.get("since");
  let since: Date | null = null;
  if (sinceRaw) {
    const t = Date.parse(sinceRaw);
    if (!Number.isNaN(t)) since = new Date(t);
  }
  try {
    const appeals = await listAppealsForViewer({
      sessionId,
      userId: viewer.userId,
      since,
    });
    return NextResponse.json({ appeals });
  } catch (err) {
    if (err instanceof DatabaseNotConfiguredError) {
      return NextResponse.json(jsonError("DATABASE_NOT_CONFIGURED", err.message), { status: 503 });
    }
    return NextResponse.json(
      jsonError("INTERNAL", err instanceof Error ? err.message : "Failed to list appeals"),
      { status: 500 },
    );
  }
}
