/**
 * Submission engine — entry point.
 *
 * Decides per council whether the appeal goes via portal automation
 * (Claude + Playwright MCP) or via email. Falls back to a deterministic
 * mock when SNAPPEAL_SUBMISSION_LIVE is unset, so the frontend flow is
 * exercisable end-to-end without network side-effects.
 */
import type { AppealRecord } from "../appeals";
import { runPortalAutomation, type PortalAutomationResult } from "./portal";
import { sendCouncilEmail, type EmailSubmissionResult } from "./email";
import { getDb, schema } from "../db/client";
import { eq } from "drizzle-orm";

export type SubmissionOutcome = {
  method: "portal" | "email" | "manual";
  channel: string;
  status: "queued" | "submitting" | "submitted" | "failed";
  councilReference: string | null;
  messageId: string | null;
  screenshotUrl: string | null;
  lastError: string | null;
  submittedAt: Date | null;
};

const LIVE = process.env.SNAPPEAL_SUBMISSION_LIVE === "1";

interface RunInput {
  appeal: AppealRecord;
}

export async function runSubmission({ appeal }: RunInput): Promise<SubmissionOutcome> {
  if (!appeal.councilSlug) {
    return mockSubmission(appeal, "council slug missing — generate the draft first");
  }
  if (!appeal.letterBody) {
    return mockSubmission(appeal, "letter body missing — generate the draft first");
  }

  const council = await loadCouncil(appeal.councilSlug);
  if (!council) {
    return mockSubmission(appeal, `unknown council slug: ${appeal.councilSlug}`);
  }

  if (!LIVE) {
    return mockSubmission(appeal, null, council);
  }

  // Decide channel: prefer portal (LLM + Playwright) when the council has
  // automation_status >= automated_beta; otherwise fall back to email.
  const preferPortal =
    council.automationStatus === "automated_beta" ||
    council.automationStatus === "automated_ga";

  if (preferPortal) {
    try {
      const result = await runPortalAutomation({ appeal, council });
      return portalToOutcome(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Fall through to email on portal failure when an email address exists.
      if (council.appealEmail) {
        const fallback = await sendCouncilEmail({ appeal, council });
        return { ...emailToOutcome(fallback), lastError: `portal failed: ${message}` };
      }
      return {
        method: "portal",
        channel: "portal",
        status: "failed",
        councilReference: null,
        messageId: null,
        screenshotUrl: null,
        lastError: message,
        submittedAt: null,
      };
    }
  }

  if (council.appealEmail) {
    const result = await sendCouncilEmail({ appeal, council });
    return emailToOutcome(result);
  }

  return mockSubmission(appeal, "no portal automation and no email on file");
}

async function loadCouncil(slug: string) {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(schema.councils)
    .where(eq(schema.councils.slug, slug));
  return rows[0] ?? null;
}

function portalToOutcome(r: PortalAutomationResult): SubmissionOutcome {
  return {
    method: "portal",
    channel: "portal",
    status: r.success ? "submitted" : "failed",
    councilReference: r.councilReference,
    messageId: null,
    screenshotUrl: r.screenshotPath,
    lastError: r.success ? null : (r.error ?? "portal automation reported failure"),
    submittedAt: r.success ? new Date() : null,
  };
}

function emailToOutcome(r: EmailSubmissionResult): SubmissionOutcome {
  return {
    method: "email",
    channel: "email",
    status: r.delivered ? "submitted" : "failed",
    councilReference: null,
    messageId: r.messageId ?? null,
    screenshotUrl: null,
    lastError: r.error ?? null,
    submittedAt: r.delivered ? new Date() : null,
  };
}

function mockSubmission(
  appeal: AppealRecord,
  warning: string | null,
  council?: { appealEmail: string | null } | null,
): SubmissionOutcome {
  const ref = `MOCK-${appeal.id.slice(-6).toUpperCase()}`;
  const method = council?.appealEmail && !LIVE ? "email" : "portal";
  return {
    method,
    channel: method,
    status: "submitted",
    councilReference: ref,
    messageId: method === "email" ? `<${ref}@appeals.snappeal.ai>` : null,
    screenshotUrl: null,
    lastError: warning,
    submittedAt: new Date(),
  };
}
