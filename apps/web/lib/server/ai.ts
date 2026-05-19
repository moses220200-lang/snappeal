import { z } from "zod";
import { generateObject } from "ai";
import { env, requireEnv } from "./env";
import { Ticket, Letter } from "./contracts";

/**
 * Single-call AI extraction + drafting.
 *
 * Takes the PCN photo (and any evidence photos), the user's notes, and
 * returns the extracted ticket fields + the drafted letter — produced in
 * one Claude vision call routed through the Vercel AI Gateway.
 *
 * Failure mode: throws. API routes should catch and return an error
 * response. We deliberately do not surface partial output.
 */

export const GeneratedDraft = z.object({
  ticket: Ticket,
  groundIds: z.array(z.string()).min(0).max(6),
  letter: Letter,
});

export type GeneratedDraft = z.infer<typeof GeneratedDraft>;

const SYSTEM_PROMPT = `You are Snappeal's appeal drafter. The user has photographed a London
Penalty Charge Notice (PCN) and may have added evidence photos and a
short note describing what happened.

Your job is THREE things in one response:

1) EXTRACT the structured ticket fields from the PCN photo. The London
   councils that issue PCNs include the 32 London boroughs plus the City
   of London Corporation and Transport for London (TfL). The issuer name
   is typically printed at the top of the notice; the PCN reference is
   alphanumeric; the contravention code is a two-digit number (e.g. 12,
   30, 40); amount is the full penalty (typically £160 Band A or £130
   Band B); location is the street + area where the vehicle was parked.

2) IDENTIFY the strongest grounds for appeal based on the evidence and
   the user's notes. Valid ground IDs include: contravention-did-not-occur,
   signage-unclear, valid-permit, blue-badge, loading-unloading,
   breakdown, medical-emergency, vehicle-not-mine, penalty-exceeds-amount,
   procedural-impropriety, traffic-order-invalid. Pick at most 3 grounds
   and only those that the photos+notes actually support.

3) DRAFT a clear, formal representation letter addressed to the issuing
   council's parking-services team. The letter must:
   - cite the contravention code by number
   - identify the strongest ground(s) by their plain-English meaning
   - reference the evidence (photos + the user's notes) honestly
   - request cancellation of the PCN
   - close with "Yours faithfully" if you don't have the named officer
   - be 250–500 words. No padding.

Hard rules:
- NEVER invent evidence. If the photos and notes don't support a ground,
  do NOT cite that ground.
- Plain English only. No legalese unless quoting statute.
- Do NOT pretend to be a solicitor. Sign as "the registered keeper" or
  use the name in the notes if provided.
`;

/**
 * Runs the single AI call. The model is configured via env (default
 * `anthropic/claude-sonnet-4-6` through the Vercel AI Gateway).
 */
export async function generateDraft(input: {
  pcnPhotoDataUrl: string;
  evidencePhotoDataUrls: string[];
  notes?: string;
}): Promise<GeneratedDraft> {
  // The Vercel AI Gateway authorises via env var; we just need to confirm
  // it's set before making the call.
  requireEnv("AI_GATEWAY_API_KEY");

  const userContent: Array<
    | { type: "text"; text: string }
    | { type: "image"; image: string | URL }
  > = [
    {
      type: "text",
      text:
        `Please extract and draft an appeal for the attached PCN.` +
        (input.notes
          ? `\n\nThe user's note about what happened: ${input.notes}`
          : "") +
        (input.evidencePhotoDataUrls.length > 0
          ? `\n\n${input.evidencePhotoDataUrls.length} evidence photo(s) of the scene are attached after the PCN.`
          : ""),
    },
    { type: "image", image: input.pcnPhotoDataUrl },
    ...input.evidencePhotoDataUrls.map(
      (url) => ({ type: "image" as const, image: url }),
    ),
  ];

  const { object } = await generateObject({
    model: env.AI_MODEL_ID,
    schema: GeneratedDraft,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });

  return object;
}
