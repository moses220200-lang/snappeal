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
  try {
    const appeals = await listAppealsForViewer({ sessionId, userId: viewer.userId });
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
