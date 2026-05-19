import { NextResponse } from "next/server";
import { z } from "zod";
import { processInboundMessage } from "@/lib/server/inbound";
import { jsonError } from "@/lib/server/contracts";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/inbound
 *
 * Webhook target for the transactional mail provider's inbound parse
 * feature (Postmark Inbound, Resend webhooks, SES + SNS). Each provider
 * has a slightly different envelope; we accept the lowest-common subset
 * and let providers map to it via their dashboard config.
 *
 * Security: production should gate this on a shared secret in
 * `INBOUND_WEBHOOK_SECRET` (header `X-Snappeal-Webhook-Secret`).
 */
const Body = z.object({
  from: z.string(),
  to: z.string(),
  subject: z.string().optional().nullable(),
  text: z.string().optional().nullable(),
  html: z.string().optional().nullable(),
  headers: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request) {
  const expected = process.env.INBOUND_WEBHOOK_SECRET;
  if (expected) {
    const supplied = request.headers.get("x-snappeal-webhook-secret");
    if (supplied !== expected) {
      return NextResponse.json(jsonError("UNAUTHORIZED", "bad webhook secret"), {
        status: 401,
      });
    }
  }
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch (err) {
    return NextResponse.json(jsonError("BAD_REQUEST", "Invalid inbound payload", String(err)), {
      status: 400,
    });
  }
  try {
    const result = await processInboundMessage({
      fromAddr: body.from,
      toAddr: body.to,
      subject: body.subject ?? null,
      bodyText: body.text ?? null,
      bodyHtml: body.html ?? null,
      rawHeaders: body.headers ?? null,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      jsonError("INTERNAL", err instanceof Error ? err.message : "Failed to process inbound"),
      { status: 500 },
    );
  }
}
