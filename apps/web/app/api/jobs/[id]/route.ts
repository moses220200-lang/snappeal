import { NextResponse } from "next/server";
import { getJob } from "@/lib/server/jobs/queue";
import { jsonError } from "@/lib/server/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/jobs/[id] — frontend polls this after /api/submit to watch
 * the submit_appeal job progress. Returns the job row sans secrets.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const job = await getJob(id);
  if (!job) {
    return NextResponse.json(jsonError("NOT_FOUND", `Job ${id} not found`), { status: 404 });
  }
  return NextResponse.json({ job });
}
