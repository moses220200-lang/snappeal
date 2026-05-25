import { z } from "zod";
import { runStructured } from "./claude-cli";
import { AppealStrength, Ticket, TicketConfidence, PhotoCoach, Letter } from "./contracts";
import type { KnowledgePack } from "./knowledge.types";
import type { PortalLookupSnapshot } from "./db/schema";

/**
 * Cheap extract-only call. Used during capture (BEFORE the paywall) to
 * show the user what we read from the photo so they can confirm/edit
 * before paying for the full draft. Same model, smaller prompt, no letter.
 */
const EXTRACT_PROMPT = `You are ParkingRabbit's PCN scanner. Extract the ticket
fields from the attached London Penalty Charge Notice photograph.

For each field, output what the photo actually shows. If a field is not
readable, return an empty string (or 0 for amountPence). Never invent
values; never return placeholders like "[NOT READABLE]" inside a field.

- issuer: full council name as printed (e.g. "Westminster City Council",
  "London Borough of Camden", "Transport for London").
- councilSlug: lowercase, kebab-case, one of: westminster, kensington-chelsea,
  camden, lambeth, islington, tfl, city-of-london, hackney, southwark,
  tower-hamlets, ... (Use the empty string if not identifiable.)
- pcnRef: the alphanumeric reference printed on the notice.
- vehicleReg: the VRM as printed.
- contraventionCode: a two-digit number (e.g. "12", "27", "40").
- contraventionDescription: the plain-English description as printed.
- location: street + area where the vehicle was parked.
- issuedAt: ISO 8601 timestamp of issue (best effort, e.g. "2026-05-12T09:14:00+01:00").
- amountPence: the FULL penalty charge in pence — the larger figure
  labelled "Full Amount of the Penalty Charge", NOT the reduced/discounted
  amount. Read the digits with care: 6 vs 8, 0 vs 8, 5 vs 6, 1 vs 7 are
  easy to confuse — zoom mentally and decide deliberately.
  SELF-CHECK: a UK PCN's reduced charge is ALWAYS exactly 50% of the full
  charge. If the notice prints a reduced/early-payment figure, the full
  amount MUST equal twice it. If your reading breaks that relationship you
  have misread a digit — re-read both figures and return the consistent
  pair. Example: a reduced charge of £80 means the full charge is £160
  (16000), never £180. Output integer pence (e.g. 16000 for £160).
`;

const ExtractWithConfidence = z.object({
  ticket: Ticket,
  confidence: TicketConfidence,
});

export async function extractTicket(input: {
  pcnPhotoDataUrl: string;
}): Promise<{
  ticket: z.infer<typeof Ticket>;
  confidence: z.infer<typeof TicketConfidence>;
  modelUsed: string;
  costUsd: number | null;
}> {
  const { value, modelUsed, costUsd } = await runStructured({
    prompt:
      "Extract the ticket fields AND return a confidence score in [0,1] for each field. " +
      "Confidence is your honest read of how legible that field was in the photo. " +
      "Return the schema-conformant JSON. No commentary.",
    schema: ExtractWithConfidence,
    systemPrompt: EXTRACT_PROMPT,
    imageDataUrls: [input.pcnPhotoDataUrl],
    timeoutMs: 60_000,
  });
  return { ticket: value.ticket, confidence: value.confidence, modelUsed, costUsd };
}

/**
 * AI photo coach — quick "is this photo good enough?" pass run alongside
 * extraction. Surfaces "try again" advice when the image is blurry / dark /
 * wrong subject. Same cost profile as a single cheap Claude call.
 */
const COACH_PROMPT = `You are ParkingRabbit's photo coach. The user has just taken a photo
of a London Penalty Charge Notice (PCN). Your job is to score the photo's legibility
and give one short piece of "retake or proceed" advice.

Score quality:
- "good": clearly legible, the key fields (PCN reference, vehicle reg, contravention
  code, amount) are all readable from the photo alone.
- "ok": legible but some fields are smudged, glared, or cropped. The user can proceed
  but should be ready to manually correct one or two fields.
- "poor": the photo isn't a PCN, is too blurry / dark / cropped to read, or shows
  something else (e.g. a screenshot of an app). Advise retake.

issues: up to 5 short noun-phrase issues (e.g. "glare on top half", "photo cut off
at the bottom", "image is too dark").

advice: ONE sentence the user sees — actionable, plain English, polite.
Examples:
  "Looks great — you can proceed."
  "Try moving a bit closer so the PCN reference is in focus."
  "It looks like this isn't a PCN photo — retake using the rear camera."
`;

export async function coachPhoto(input: {
  pcnPhotoDataUrl: string;
}): Promise<z.infer<typeof PhotoCoach>> {
  const { value } = await runStructured({
    prompt: "Score the attached photo and write the user-facing advice.",
    schema: PhotoCoach,
    systemPrompt: COACH_PROMPT,
    imageDataUrls: [input.pcnPhotoDataUrl],
    timeoutMs: 30_000,
  });
  return value;
}

/**
 * "Strengthen my notes" — rewrites the user's free-text notes into a
 * polished, evidence-friendly paragraph that the drafter can later embed
 * in the letter. Never invents facts; only restructures.
 */
const STRENGTHEN_PROMPT = `You are ParkingRabbit's notes editor. The user has typed a few
sentences describing what happened. Rewrite the notes into ONE concise paragraph
(80–160 words) that:

- Uses plain English (no legal vocabulary)
- Sticks to the facts the user gave you — NEVER invent details
- Orders events chronologically
- Surfaces any explicit legal hooks (Blue Badge, loading, obscured signage, breakdown,
  medical emergency, wrong vehicle, already paid, amount disputed) without claiming
  them unless the user's text supports them
- Closes by stating what the user wants — usually cancellation of the PCN

Return JSON with two fields:
  improved: string — the rewritten paragraph
  changes: string[] — up to 3 short bullets explaining what you cleaned up
`;

export const StrengthenedNotes = z.object({
  improved: z.string().min(20).max(2000),
  changes: z.array(z.string()).max(3),
});

export async function strengthenNotes(input: {
  raw: string;
}): Promise<z.infer<typeof StrengthenedNotes>> {
  const { value } = await runStructured({
    prompt: `Original notes:\n\n${input.raw}\n\nRewrite per the system prompt.`,
    schema: StrengthenedNotes,
    systemPrompt: STRENGTHEN_PROMPT,
    timeoutMs: 30_000,
  });
  return value;
}

/**
 * Re-score an EXISTING appeal's strength without redrafting the letter.
 *
 * Used when a customer adds more evidence to a weak appeal: we re-evaluate
 * how likely the appeal is to succeed given the (unchanged) letter + the
 * new evidence photos, and return a fresh AppealStrength. The letter is
 * never rewritten — only the score/rationale/improvements update.
 */
const SCORE_PROMPT = `You are ParkingRabbit's appeal-strength assessor for London PCN appeals.

You are given a drafted appeal letter, the grounds it relies on, the user's
notes, the issuing council, and the evidence photos the user has attached.
Score how likely this appeal is to SUCCEED on review by the council /
adjudicator, 0–100:
  80–100 strong    — solid grounds AND evidence that clearly supports them
  50–79  solid     — plausible grounds with reasonable supporting evidence
  30–49  weak      — argument plausible but the evidence is thin / generic
   0–29  very weak — little or no evidence supports the chosen grounds

Judge the EVIDENCE PHOTOS critically and specifically. A wide, general scene
shot is weaker than a close-up that isolates the exact issue (the specific
faded bay markings, the obscured sign, the displayed permit/badge). More
relevant, specific photos must RAISE the score; generic or irrelevant photos
must not. Adding strong corroborating photos to a previously thin appeal
should move the score up meaningfully.

Return:
  score: integer 0–100
  rationale: <=280 chars — one or two sentences, referencing the ACTUAL
    evidence supplied (mention the photos when relevant).
  improvements: up to 3 short, concrete next steps that would raise the
    score further (<=140 chars each). If the appeal is already strong,
    return an empty array.`;

export async function scoreAppealStrength(input: {
  letterBody: string;
  grounds: string[];
  notes?: string | null;
  council?: string | null;
  evidencePhotoDataUrls?: string[];
}): Promise<z.infer<typeof AppealStrength>> {
  const photos = input.evidencePhotoDataUrls ?? [];
  const parts: string[] = [];
  if (input.council) parts.push(`Issuing council: ${input.council}`);
  if (input.grounds.length) {
    parts.push(`Grounds relied on: ${input.grounds.join(", ")}`);
  }
  if (input.notes && input.notes.trim()) {
    parts.push(`User's account of what happened:\n${input.notes.trim()}`);
  }
  parts.push(`Drafted appeal letter:\n${input.letterBody}`);
  parts.push(
    `The user has attached ${photos.length} evidence photo${
      photos.length === 1 ? "" : "s"
    }${photos.length ? " — assess each one below." : "."}`,
  );
  const { value } = await runStructured({
    prompt: parts.join("\n\n"),
    schema: AppealStrength,
    systemPrompt: SCORE_PROMPT,
    imageDataUrls: photos,
    timeoutMs: 45_000,
  });
  return value;
}

/**
 * Single-call AI extraction + drafting.
 *
 * Takes the PCN photo (and any evidence photos), the user's notes, and
 * returns the extracted ticket fields + the drafted letter — produced in
 * one Claude call piped through the Claude Code CLI in headless mode.
 *
 * Failure mode: throws. API routes should catch and return an error
 * response. We deliberately do not surface partial output.
 */

export const GeneratedDraft = z.object({
  ticket: Ticket,
  groundIds: z.array(z.string()).min(0).max(6),
  letter: Letter,
  strength: AppealStrength,
});

export type GeneratedDraft = z.infer<typeof GeneratedDraft>;

const SYSTEM_PROMPT = `You are ParkingRabbit's appeal drafter — a legally literate London PCN
specialist working ONLY from the photographs and notes the user supplies.

Your job is FOUR things in one response:

1) EXTRACT the structured ticket fields from the PCN photo.

   - The London authorities that issue Penalty Charge Notices are the 32
     London boroughs (each with a recognisable header — e.g. "WESTMINSTER
     CITY COUNCIL", "LONDON BOROUGH OF CAMDEN", "ROYAL BOROUGH OF
     KENSINGTON AND CHELSEA"), the City of London Corporation, and
     Transport for London (TfL — Red Routes / Congestion Charge / ULEZ).
   - PCN reference: an alphanumeric string, typically 6–14 characters,
     printed prominently near the top of the notice.
   - Contravention code: a two-digit number (e.g. 01, 12, 16, 27, 30,
     40, 47) — these are the standard London codes.
   - Issued: date and time the notice was issued or affixed.
   - Location: street + area where the vehicle was parked (e.g.
     "Marylebone High Street, W1U").
   - Vehicle reg: the VRM printed on the notice. Echo what's actually in
     the photo — don't normalise.
   - Amount: the FULL penalty charge (the larger figure labelled "Full
     Amount of the Penalty Charge", NOT the reduced/early-payment amount;
     Band A £160 or Band B £130 are typical). Read digits deliberately —
     6 vs 8, 0 vs 8, 5 vs 6, 1 vs 7 are easily confused. SELF-CHECK: the
     reduced charge is always exactly 50% of the full charge, so the full
     amount must equal twice any reduced figure printed (e.g. £80 reduced
     ⇒ £160 full, never £180). Output amountPence as integer pence.
   - councilSlug: lowercase, kebab-case, matching one of:
     westminster, kensington-chelsea, camden, lambeth, islington, tfl,
     city-of-london, hackney, southwark, tower-hamlets, ... If you can't
     identify the council from the image, return an EMPTY STRING (not a
     placeholder). NEVER return a value like "[council-slug]".

   When ANY field is unreadable from the photo, set that field to an empty
   string (or 0 for amountPence). Do not invent values. Do not write
   placeholders like "[NOT READABLE]" — the empty string is the signal.

2) GATHER CONTEXT from every piece of evidence the user has supplied.

   The user's note is the most important piece of context — read it
   carefully and look for explicit hooks for a legal ground:
     - "I had a Blue Badge" / "I had a permit"
     - "The signs were obscured / hidden / behind X"
     - "I was loading" / "unloading" / "10 minutes"
     - "Breakdown" / "engine failure" / "tyre"
     - "Medical emergency" / "ambulance"
     - "Wasn't me" / "sold the car" / "wrong vehicle"
     - "Already paid" / "amount is wrong"

   For each evidence photo the user attaches (after the PCN photo),
   describe in one phrase what it shows and how it strengthens the case.
   Even when you can't be 100% sure what an evidence photo depicts, give
   it a charitable, evidence-friendly reading.

3) IDENTIFY the strongest grounds. Valid ground IDs and what they mean:

   - contravention-did-not-occur — the alleged contravention didn't
     happen as the council says (signs misread, time mis-recorded, etc.).
   - signage-unclear — the controlling sign was hidden, ambiguous, or
     contradicted by other signs.
   - valid-permit — the vehicle was displaying a valid resident/business
     permit at the time.
   - blue-badge — the vehicle was displaying a valid Blue Badge.
   - loading-unloading — the vehicle was actively loading or unloading
     in a place where that is permitted.
   - breakdown — the vehicle had broken down and could not be moved.
   - medical-emergency — driver was responding to a medical emergency.
   - vehicle-not-mine — the registered keeper was not the keeper at the
     time, or the VRM is misread.
   - penalty-exceeds-amount — the amount on the notice is wrong.
   - procedural-impropriety — the council failed a required procedural
     step (e.g. notice not properly served, time limit breached).
   - traffic-order-invalid — the underlying Traffic Regulation Order is
     defective.

   Pick AT MOST 3 grounds, and only ones the photos + notes actually
   support. Order by strongest first.

4) DRAFT a formal representation letter to the issuing council.

   Structure:
     - Salutation: "Dear [Council Name] Parking Services," (or just "Dear
       Sir or Madam," if the council is unknown).
     - Opening: state the PCN ref, vehicle reg, date, and location. If
       any are unknown, write "[the details on the attached notice]".
     - One paragraph per ground, each headed by a short label
       (e.g. "Ground 1 — Signage was not visible"). Cite the contravention
       code by number when relevant.
     - Reference the evidence (the user's note + the photos) honestly.
       Never invent details the photos don't show.
     - Closing: "I respectfully request that this Penalty Charge Notice
       be cancelled in full." Sign as "Yours faithfully," / "The
       Registered Keeper" (or the name the user gave in their note).

   The letter must be 250–500 words. Plain English only. No invented
   facts, no fake reference numbers, no fictional officer names. If the
   image is unreadable, write the letter with bracketed placeholders the
   user can fill in — but do NOT pretend to have data you don't.

5) ADDRESSED-TO line: the formal council parking-services postal
   address if you know it (e.g. "City of Westminster Parking Services,
   PO Box 351, Sheffield, S98 1TU"), otherwise the council name + "Parking
   Services" alone.

6) USE THE KNOWLEDGE PACK supplied below to strengthen your reasoning.

   The pack contains, when available:
   - Up to 6 redacted precedents of previously won appeals filtered to
     the user's selected grounds + contravention code + council.
   - 1–2 contravention-code briefs explaining the statutory basis and
     the defences council adjudicators routinely accept.
   - 1 council brief listing the issuing authority's quirks (postal
     address, evidence bar, common rebuttals, portal idiosyncrasies).

   When precedents are provided, MIRROR their successful framing where
   the user's facts align — never copy phrasing verbatim. Express the
   precedent's keyArgument in your own words.
   When a code brief lists a common rebuttal from council, PRE-EMPT it
   in the letter with one sentence.
   When the council brief notes a quirk (e.g. discount window is 14
   days), respect it in any deadline language.
   The knowledge pack is INTERNAL context — never mention "precedents",
   "knowledge base", file IDs, or the brief titles in the letter body.

7) SCORE THE APPEAL STRENGTH.

   Output a strength.score (0–100, integer) reflecting your honest read
   of the chance THIS council cancels the PCN at the informal or NTO
   stage GIVEN the evidence supplied:
     - 80–100: strong — clear ground + corroborating evidence + matching
       precedent + sympathetic council.
     - 50–79: solid — at least one strong ground with partial evidence.
     - 30–49: weak — argument plausible but evidence is thin or council
       routinely refuses this ground.
     - 0–29: very weak — no evidence supports the chosen grounds.

   The score reflects EVIDENCE supplied, not the abstract legal merit.
   Worked example: if the user selected "signage-unclear" but supplied
   zero evidence photos and a 5-word note, the appropriate score is
   25–35, NOT 60. A strong substantive ground with no evidence is still
   weak in front of an adjudicator.

   When score < 50, write a one-sentence strength.rationale the user
   sees ("Without a photo of the obscured sign on the day, the council
   will likely reject this."). List up to 3 strength.improvements —
   short, actionable evidence asks the user can satisfy.

   The score is metadata for the product UI. NEVER include it, the
   rationale, or the improvements list in the letter body.

Hard rules:
- NEVER invent evidence the photos don't show.
- NEVER return placeholders like "[council-slug]" or "[NOT READABLE]" in
  a structured field — use an empty string instead.
- Plain English. Quote statute only when the user's note explicitly
  raises it.
- Do not impersonate a solicitor.
- The knowledge pack is internal context — do not cite, name, or quote
  its entries in the letter body.
- The strength score reflects evidence supplied, not the abstract merit
  of the legal argument.
`;

/**
 * Runs the single Claude call via the headless CLI. Returns a strictly typed
 * draft. Throws on any failure (CLI exit, schema mismatch, vision error).
 */
export async function generateDraft(input: {
  /** Base64 data URL of the PCN photo. Optional — when a complete
   *  `confirmedTicket` is provided we skip vision entirely. The route
   *  is responsible for ensuring at least one of (photo, complete
   *  ticket) is present; we throw fast here as a defensive backstop. */
  pcnPhotoDataUrl?: string;
  evidencePhotoDataUrls: string[];
  notes?: string;
  /** Already-extracted+confirmed ticket fields. When supplied, the drafter
   * uses these verbatim and re-extracts only what's missing. */
  confirmedTicket?: Partial<z.infer<typeof Ticket>>;
  /** Cards the user picked in the quiz, with their promptHooks — the
   *  drafter uses the hooks as starting points where the user's note
   *  corroborates them. */
  selectedCards?: Array<{
    id: string;
    label: string;
    promptHook?: string;
    weight?: "weak" | "medium" | "strong";
  }>;
  /** Council-portal-verified metadata. Treated as authoritative — beats
   *  OCR'd ticket fields when present. */
  portalMetadata?: PortalLookupSnapshot["metadata"];
  /** Knowledge pack from `lib/server/knowledge.ts`. Adds precedent
   *  framings, code briefs, and council quirks the drafter can lean on. */
  knowledgePack?: KnowledgePack;
}): Promise<GeneratedDraft & { modelUsed: string; costUsd: number | null }> {
  // If the user has already confirmed the PCN fields on /app/capture (via
  // /api/extract), don't make Claude re-OCR the ticket photo here. We just
  // hand it the structured fields and skip attaching the PCN image —
  // shaves ~10–25 s off the draft call by avoiding a second vision pass on
  // the same notice. Evidence photos are still attached because Claude
  // needs to read them to write the letter.
  const required: Array<keyof z.infer<typeof Ticket>> = [
    "issuer",
    "pcnRef",
    "vehicleReg",
    "contraventionCode",
    "location",
    "issuedAt",
    "amountPence",
  ];
  const ticket = input.confirmedTicket ?? {};
  const ticketComplete =
    required.every((k) => {
      const v = (ticket as Record<string, unknown>)[k];
      return v !== undefined && v !== null && v !== "";
    });

  const promptParts = [
    ticketComplete
      ? "Draft a representation letter for the PCN whose fields are provided below. The fields have already been OCR'd and confirmed by the user — do NOT re-extract or second-guess them. Use them verbatim in the letter."
      : "Please extract the PCN fields from the attached PCN photo and draft a representation letter.",
    input.confirmedTicket && Object.keys(input.confirmedTicket).length > 0
      ? `${ticketComplete ? "Confirmed" : "Partially confirmed"} ticket fields:\n${JSON.stringify(input.confirmedTicket, null, 2)}${
          ticketComplete
            ? ""
            : "\n\nThe above fields are correct as-is; only fill any missing/empty values by reading the PCN photo."
        }`
      : null,
    input.portalMetadata && Object.keys(input.portalMetadata).length > 0
      ? `Council-portal-verified metadata (treat as authoritative — these came directly from the issuing authority's system):\n${JSON.stringify(input.portalMetadata, null, 2)}`
      : null,
    input.selectedCards && input.selectedCards.length > 0
      ? `The user picked these specific situations from the quiz. Use each promptHook as a starting framing where the user's note corroborates it; ignore hooks where the note contradicts or fails to support them:\n${input.selectedCards
          .map(
            (c) =>
              `- [${c.id}] ${c.label}${c.weight ? ` (strength: ${c.weight})` : ""}${c.promptHook ? `\n    hook: ${c.promptHook}` : ""}`,
          )
          .join("\n")}`
      : null,
    input.notes ? `User's note about what happened: ${input.notes}` : null,
    input.evidencePhotoDataUrls.length > 0
      ? `${input.evidencePhotoDataUrls.length} evidence photo(s) of the scene are attached. For each, give it a charitable, evidence-supportive reading in the letter — but never invent facts the photos do not show.`
      : null,
    input.knowledgePack && input.knowledgePack.rendered.length > 0
      ? `KNOWLEDGE PACK (internal context — do not cite, name, or quote in the letter body):\n\n${input.knowledgePack.rendered}`
      : null,
    "Respond with a single JSON object matching the provided schema. Do not wrap it in markdown.",
  ].filter(Boolean);

  if (!ticketComplete && !input.pcnPhotoDataUrl) {
    throw new Error(
      "generateDraft requires either a complete confirmedTicket or a pcnPhotoDataUrl",
    );
  }
  const images = ticketComplete
    ? input.evidencePhotoDataUrls
    : [input.pcnPhotoDataUrl!, ...input.evidencePhotoDataUrls];

  const { value, modelUsed, costUsd } = await runStructured({
    prompt: promptParts.join("\n\n"),
    schema: GeneratedDraft,
    systemPrompt: SYSTEM_PROMPT,
    imageDataUrls: images,
    timeoutMs: 120_000,
  });

  // Server-side strength cap — defend against AI score inflation when the
  // evidence base is thin. Claude tends to score generously even when
  // there's almost nothing to ground a ground in.
  const noEvidence = input.evidencePhotoDataUrls.length === 0;
  const thinNotes = (input.notes?.trim().length ?? 0) < 50;
  const capped = { ...value };
  if (noEvidence && thinNotes && capped.strength.score > 45) {
    capped.strength = {
      ...capped.strength,
      score: 45,
      rationale: `${"We capped this score because no evidence photos were attached and the notes are very brief. "}${capped.strength.rationale}`.slice(
        0,
        280,
      ),
    };
  }

  return { ...capped, modelUsed, costUsd };
}
