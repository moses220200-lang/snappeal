import { NextResponse } from "next/server";
import { SubmitRequest, SubmitResponse, jsonError } from "@/lib/server/contracts";

export const runtime = "nodejs";

/**
 * POST /api/submit
 *
 * v0.1 stub: returns a mock confirmation. The real implementation lands in
 * v0.2 and looks like this:
 *
 *   1. Verify the PaymentIntent succeeded.
 *   2. Look up the council's submission_methods + automation_status from
 *      the KB (`councils` table).
 *   3. Decide path: portal (LLM + Playwright MCP in a Vercel Sandbox) OR
 *      email (transactional email from per-user `<id>@appeals.snappeal.ai`
 *      alias).
 *   4. Enqueue a Vercel Workflow with the durable submission job.
 *   5. Return `submissionId` + `status: "queued"`.
 *
 * Implementation lives in lib/server/submission/ (TBD).
 */
export async function POST(request: Request) {
  let body: SubmitRequest;
  try {
    const json = await request.json();
    body = SubmitRequest.parse(json);
  } catch (err) {
    return NextResponse.json(
      jsonError("BAD_REQUEST", "Invalid submit request body", String(err)),
      { status: 400 },
    );
  }

  // v0.1 mock: always "succeeds" via the portal channel after 100ms.
  const response: SubmitResponse = {
    submissionId: `sub_mock_${Date.now()}`,
    status: "submitted",
    method: body.preferredMethod ?? "portal",
    councilReference: `MOCK-REF-${body.appealId.slice(-6).toUpperCase()}`,
    submittedAt: new Date().toISOString(),
  };

  return NextResponse.json(response);
}
