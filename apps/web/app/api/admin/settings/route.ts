/**
 * GET  /api/admin/settings → { settings, envStatus }
 * PATCH /api/admin/settings body: { key, value } → { settings }
 *
 * The runtime-mutable toggles. Env-derived secrets are NEVER returned via
 * this endpoint — only the names and the configured/missing status.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/server/admin";
import {
  getSettings,
  inventoryStatus,
  setFakePayment,
  setMcpHeaded,
  setShowMcpLiveView,
  setSkipPaymentCheck,
  setStopAtReview,
  setSubmissionLive,
  setWorkerDisabled,
} from "@/lib/server/settings";
import { jsonError } from "@/lib/server/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  return NextResponse.json({
    settings: getSettings(),
    envStatus: inventoryStatus(),
  });
}

const PatchBody = z.object({
  key: z.enum([
    "mcpHeaded",
    "stopAtReview",
    "submissionLive",
    "workerDisabled",
    "fakePayment",
    "skipPaymentCheck",
    "showMcpLiveView",
  ]),
  /** `null` for the *override*-style settings reverts to env-derived default. */
  value: z.union([z.boolean(), z.null()]),
});

export async function PATCH(req: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  let body: z.infer<typeof PatchBody>;
  try {
    body = PatchBody.parse(await req.json());
  } catch (err) {
    return NextResponse.json(jsonError("BAD_REQUEST", "Invalid body", String(err)), {
      status: 400,
    });
  }

  switch (body.key) {
    case "mcpHeaded":
      if (typeof body.value !== "boolean") {
        return NextResponse.json(jsonError("BAD_REQUEST", "mcpHeaded requires boolean"), { status: 400 });
      }
      setMcpHeaded(body.value);
      break;
    case "stopAtReview":
      if (typeof body.value !== "boolean") {
        return NextResponse.json(jsonError("BAD_REQUEST", "stopAtReview requires boolean"), { status: 400 });
      }
      setStopAtReview(body.value);
      break;
    case "submissionLive":
      setSubmissionLive(body.value);
      break;
    case "workerDisabled":
      setWorkerDisabled(body.value);
      break;
    case "fakePayment":
      setFakePayment(body.value);
      break;
    case "skipPaymentCheck":
      setSkipPaymentCheck(body.value);
      break;
    case "showMcpLiveView":
      if (typeof body.value !== "boolean") {
        return NextResponse.json(jsonError("BAD_REQUEST", "showMcpLiveView requires boolean"), { status: 400 });
      }
      setShowMcpLiveView(body.value);
      break;
  }

  return NextResponse.json({ settings: getSettings() });
}
