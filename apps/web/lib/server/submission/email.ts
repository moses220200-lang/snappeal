/**
 * Email fallback for councils without portal automation.
 *
 * Production: integrates with the transactional provider (Resend / Postmark
 * / SES — TBD per todo.md "Transactional email"). Local dev: returns a
 * deterministic stub so the flow is exercisable without DNS/MX wired up.
 *
 * The outbound message uses the per-appeal `<appeal-id>@appeals.snappeal.ai`
 * as the `Reply-To` so council responses route to the inbound webhook
 * (lib/server/inbound.ts).
 */
import type { AppealRecord } from "../appeals";
import type { schema } from "../db/client";

type CouncilRow = typeof schema.councils.$inferSelect;

export interface EmailSubmissionResult {
  delivered: boolean;
  messageId: string | null;
  error: string | null;
}

export async function sendCouncilEmail(opts: {
  appeal: AppealRecord;
  council: CouncilRow;
}): Promise<EmailSubmissionResult> {
  const { appeal, council } = opts;
  if (!council.appealEmail) {
    return { delivered: false, messageId: null, error: "council has no email on file" };
  }

  const provider = process.env.EMAIL_PROVIDER ?? "stub";
  if (provider === "stub" || !process.env.RESEND_API_KEY) {
    // Deterministic stub: pretend we sent it; record a fake message id.
    const messageId = `<stub-${appeal.id}@appeals.snappeal.ai>`;
    return { delivered: true, messageId, error: null };
  }

  try {
    const subject = appeal.letterSubject ?? `Representation against PCN ${appeal.ticket?.pcnRef ?? ""}`;
    const text = appeal.letterBody ?? "";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `Snappeal Appeals <${appeal.replyEmail ?? "no-reply@appeals.snappeal.ai"}>`,
        to: [council.appealEmail],
        reply_to: appeal.replyEmail ?? undefined,
        subject,
        text,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { delivered: false, messageId: null, error: `resend ${res.status}: ${body}` };
    }
    const json = (await res.json()) as { id?: string };
    return { delivered: true, messageId: json.id ? `<${json.id}@appeals.snappeal.ai>` : null, error: null };
  } catch (err) {
    return { delivered: false, messageId: null, error: err instanceof Error ? err.message : String(err) };
  }
}
