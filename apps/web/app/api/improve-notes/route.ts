import { NextResponse } from "next/server";
import { z } from "zod";
import { strengthenNotes } from "@/lib/server/ai";
import { jsonError } from "@/lib/server/contracts";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  raw: z.string().min(10).max(2000),
});

/**
 * POST /api/improve-notes
 *
 * Rewrites the user's free-text notes into a polished, evidence-friendly
 * paragraph. Returns the improved text + a short "changes I made" list.
 * Used by the "Strengthen my notes" button on /app/notes.
 */
export async function POST(request: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch (err) {
    return NextResponse.json(jsonError("BAD_REQUEST", "Invalid body", String(err)), {
      status: 400,
    });
  }
  try {
    const result = await strengthenNotes({ raw: body.raw });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      jsonError("AI_ERROR", err instanceof Error ? err.message : "Failed to improve notes"),
      { status: 500 },
    );
  }
}
