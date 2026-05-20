/**
 * Admin council-automation CRUD.
 *
 * GET   /api/admin/council-automation/<slug>   → current recipe
 * PUT   /api/admin/council-automation/<slug>   → update agentPrompt + fieldHints
 * POST  /api/admin/council-automation/<slug>/dry-run (handled below as POST)
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/server/admin";
import { getAutomation, upsertAutomation, dryRunAutomation } from "@/lib/server/submission/automation";
import { jsonError } from "@/lib/server/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const { slug } = await ctx.params;
  const row = await getAutomation(slug);
  if (!row) return NextResponse.json(jsonError("NOT_FOUND", `No automation for ${slug}`), { status: 404 });
  return NextResponse.json({ automation: row });
}

const PutBody = z.object({
  agentPrompt: z.string().min(50).max(20_000),
  fieldHints: z.record(z.string(), z.unknown()).optional().nullable(),
});

export async function PUT(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const { slug } = await ctx.params;
  let body: z.infer<typeof PutBody>;
  try {
    body = PutBody.parse(await req.json());
  } catch (err) {
    return NextResponse.json(jsonError("BAD_REQUEST", "Invalid body", String(err)), { status: 400 });
  }
  const row = await upsertAutomation({
    councilSlug: slug,
    agentPrompt: body.agentPrompt,
    fieldHints: body.fieldHints ?? null,
    updatedBy: auth.user.email,
  });
  return NextResponse.json({ automation: row });
}

const PostBody = z.object({
  action: z.literal("dry-run"),
  appealId: z.string().optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const { slug } = await ctx.params;
  let body: z.infer<typeof PostBody>;
  try {
    body = PostBody.parse(await req.json());
  } catch (err) {
    return NextResponse.json(jsonError("BAD_REQUEST", "Invalid body", String(err)), { status: 400 });
  }
  try {
    const result = await dryRunAutomation({ councilSlug: slug, appealId: body.appealId ?? null });
    return NextResponse.json({ result });
  } catch (err) {
    return NextResponse.json(
      jsonError("DRY_RUN_FAILED", err instanceof Error ? err.message : "Dry-run failed"),
      { status: 500 },
    );
  }
}
