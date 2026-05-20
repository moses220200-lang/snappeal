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
import { getSettings } from "../settings";
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

// Default: LIVE on. Opt out by setting SNAPPEAL_SUBMISSION_LIVE=0 (mocks the
// engine so dev work without a Claude CLI / Playwright MCP can still exercise
// the UI flow). The runtime override at /admin/settings supersedes the env.
function isLive(): boolean {
  return getSettings().submissionLive;
}

interface RunInput {
  appeal: AppealRecord;
  /** Job id used as the anchor for live progress events (set by the worker). */
  jobId?: string;
}

export async function runSubmission({ appeal, jobId }: RunInput): Promise<SubmissionOutcome> {
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

  if (!isLive()) {
    return mockSubmission(appeal, null, council);
  }

  // Decide channel: prefer portal (LLM + Playwright) when the council has
  // automation_status >= automated_beta; otherwise fall back to email.
  const preferPortal =
    council.automationStatus === "automated_beta" ||
    council.automationStatus === "automated_ga";

  if (preferPortal) {
    let portalError: string | null = null;
    try {
      const result = await runPortalAutomation({ appeal, council, jobId });
      if (result.success) return portalToOutcome(result);
      portalError = result.error ?? "portal automation reported failure";
    } catch (err) {
      portalError = err instanceof Error ? err.message : String(err);
    }
    // Portal didn't go through — fall back to email when we have one. This
    // covers both "agent threw" and "agent returned success=false" (the more
    // common case for council backends that bounce with 'service unavailable').
    if (council.appealEmail) {
      try {
        const fallback = await sendCouncilEmail({ appeal, council });
        return {
          ...emailToOutcome(fallback),
          lastError: `portal failed → email fallback: ${portalError}`,
        };
      } catch (emailErr) {
        const emailMessage = emailErr instanceof Error ? emailErr.message : String(emailErr);
        return {
          method: "portal",
          channel: "portal",
          status: "failed",
          councilReference: null,
          messageId: null,
          screenshotUrl: null,
          lastError: `portal failed: ${portalError}; email fallback also failed: ${emailMessage}`,
          submittedAt: null,
        };
      }
    }
    return {
      method: "portal",
      channel: "portal",
      status: "failed",
      councilReference: null,
      messageId: null,
      screenshotUrl: null,
      lastError: portalError,
      submittedAt: null,
    };
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
  const method = council?.appealEmail && !isLive() ? "email" : "portal";
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
