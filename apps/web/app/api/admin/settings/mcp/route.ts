/**
 * Admin runtime-settings for the MCP submission engine.
 *
 *   GET  /api/admin/settings/mcp  → { mcpHeaded }
 *   PUT  /api/admin/settings/mcp  body: { mcpHeaded: boolean } → { mcpHeaded }
 *
 * The toggle is in-memory only — it survives until the dev server is
 * restarted, then reverts to the PARKINGRABBIT_MCP_HEADED env var default.
 * Pin a permanent default by setting the env var.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/server/admin";
import { getSettings, setMcpHeaded, setStopAtReview } from "@/lib/server/settings";
import { jsonError } from "@/lib/server/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  return NextResponse.json(getSettings());
}

const PutBody = z.object({
  mcpHeaded: z.boolean().optional(),
  stopAtReview: z.boolean().optional(),
});

export async function PUT(req: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  let body: z.infer<typeof PutBody>;
  try {
    body = PutBody.parse(await req.json());
  } catch (err) {
    return NextResponse.json(jsonError("BAD_REQUEST", "Invalid body", String(err)), { status: 400 });
  }
  if (typeof body.mcpHeaded === "boolean") setMcpHeaded(body.mcpHeaded);
  if (typeof body.stopAtReview === "boolean") setStopAtReview(body.stopAtReview);
  return NextResponse.json(getSettings());
}
