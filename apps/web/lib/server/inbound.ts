/**
 * Inbound mail processing for `<appeal-id>@appeals.parkingrabbit.com`.
 *
 * Triggered by /api/inbound (a webhook from the transactional mail provider
 * — Postmark / Resend / SES). Each message is classified using a small
 * Claude CLI prompt that maps council reply language onto the four
 * outcomes we care about:
 *
 *   - cancelled    — council has cancelled the PCN
 *   - rejected     — council has rejected the representation
 *   - acknowledged — council acknowledges receipt; no decision yet
 *   - request      — council is asking for more info
 *   - unknown      — fallback when none of the above match
 *
 * The classification updates `appeals.status` so the UI timeline reflects
 * the latest council position.
 */
import { z } from "zod";
import { eq } from "drizzle-orm";
import { runStructured } from "./claude-cli";
import { getDb, schema } from "./db/client";

const Classification = z.object({
  outcome: z.enum(["cancelled", "rejected", "acknowledged", "request", "unknown"]),
  reasoning: z.string().max(500),
});

export interface InboundMessage {
  fromAddr: string;
  toAddr: string;
  subject?: string | null;
  bodyText?: string | null;
  bodyHtml?: string | null;
  rawHeaders?: Record<string, unknown> | null;
}

const SYSTEM_PROMPT = `You are ParkingRabbit's inbound-mail classifier. The user is
forwarding you the body of an email from a London council in response to a
PCN appeal representation. Classify the council's position.

- "cancelled" = the council has accepted the appeal and cancelled the PCN
  (look for phrases like "cancelled", "no further action", "case closed in
  your favour").
- "rejected" = the council has rejected the representation and the PCN
  stands. Often includes "Notice of Rejection".
- "acknowledged" = receipt confirmation, no decision yet ("we have received
  your representation", "we will respond within 56 days").
- "request" = council asks for more evidence or information.
- "unknown" = anything else (out-of-office, spam, unrelated).
`;

export async function processInboundMessage(msg: InboundMessage) {
  const db = getDb();
  if (!db) return { stored: false, classification: null };

  // The recipient address encodes the appeal id: <ap_xxxx>@appeals.parkingrabbit.com
  const localPart = msg.toAddr.split("@")[0]?.trim().toLowerCase() ?? "";
  const appealId = localPart.startsWith("ap_") ? localPart : null;

  const id = `in_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  let classification: "cancelled" | "rejected" | "acknowledged" | "request" | "unknown" = "unknown";
  try {
    const body = msg.bodyText ?? stripHtml(msg.bodyHtml ?? "");
    if (body.trim()) {
      const result = await runStructured({
        prompt: `Subject: ${msg.subject ?? ""}\n\nBody:\n${body.slice(0, 6000)}`,
        schema: Classification,
        systemPrompt: SYSTEM_PROMPT,
        timeoutMs: 45_000,
      });
      classification = result.value.outcome;
    }
  } catch {
    classification = "unknown";
  }

  await db.insert(schema.inboundMessages).values({
    id,
    appealId,
    fromAddr: msg.fromAddr,
    toAddr: msg.toAddr,
    subject: msg.subject ?? null,
    bodyText: msg.bodyText ?? null,
    bodyHtml: msg.bodyHtml ?? null,
    classification,
    rawHeaders: msg.rawHeaders ?? null,
  });

  if (appealId && (classification === "cancelled" || classification === "rejected")) {
    await db
      .update(schema.appeals)
      .set({
        status: classification,
        updatedAt: new Date(),
      })
      .where(eq(schema.appeals.id, appealId));
  }

  return { stored: true, classification, appealId };
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
