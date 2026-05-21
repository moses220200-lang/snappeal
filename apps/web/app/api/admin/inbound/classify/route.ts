import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/server/admin";
import { runStructured } from "@/lib/server/claude-cli";
import { jsonError } from "@/lib/server/contracts";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const Body = z.object({
  subject: z.string().max(200).optional(),
  bodyText: z.string().min(5).max(20_000),
});

const Schema = z.object({
  outcome: z.enum(["cancelled", "rejected", "acknowledged", "request", "unknown"]),
  reasoning: z.string().max(500),
});

const PROMPT = `You are ParkingRabbit's inbound-mail classifier. Classify the council's reply.

- "cancelled" = council accepted the appeal, PCN cancelled.
- "rejected" = representation rejected, PCN stands.
- "acknowledged" = receipt only, no decision.
- "request" = council asks for more info / evidence.
- "unknown" = out-of-office, spam, unrelated.

Return outcome + a one-sentence reasoning.`;

/**
 * POST /api/admin/inbound/classify — admin sandbox: paste an email body
 * and see how the classifier would label it. Useful for tuning the
 * prompt without firing a real webhook.
 */
export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch (err) {
    return NextResponse.json(jsonError("BAD_REQUEST", "Invalid body", String(err)), { status: 400 });
  }
  try {
    const result = await runStructured({
      prompt: `Subject: ${body.subject ?? "(none)"}\n\nBody:\n${body.bodyText}`,
      schema: Schema,
      systemPrompt: PROMPT,
      timeoutMs: 45_000,
    });
    return NextResponse.json({ classification: result.value, costUsd: result.costUsd });
  } catch (err) {
    return NextResponse.json(
      jsonError("AI_ERROR", err instanceof Error ? err.message : "Classify failed"),
      { status: 500 },
    );
  }
}
