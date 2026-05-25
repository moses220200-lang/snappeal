/**
 * Types for the markdown knowledge base loaded by `knowledge.ts`.
 *
 * Frontmatter shapes are parsed from `apps/web/knowledge/**.md` via
 * gray-matter. All fields are optional in source — the loader fills
 * sane defaults during normalisation.
 */

export type PrecedentOutcome = "cancelled" | "upheld" | "partial";
export type PrecedentStage = "informal" | "nto" | "tribunal";

export interface PrecedentFrontmatter {
  id?: string;
  groundIds?: string[];
  contraventionCodes?: string[];
  councilSlugs?: string[];
  outcome?: PrecedentOutcome;
  stage?: PrecedentStage;
  date?: string; // ISO yyyy-mm-dd
  summary?: string;
  keyArgument?: string;
}

export interface PrecedentBrief {
  id: string;
  groundIds: string[];
  contraventionCodes: string[];
  councilSlugs: string[];
  outcome: PrecedentOutcome;
  stage: PrecedentStage;
  date: string; // ISO; "" when missing
  summary: string;
  keyArgument: string;
  body: string;
  /** Computed at retrieval time — used to sort. */
  score?: number;
}

export interface CodeFrontmatter {
  code?: string;
  title?: string;
  statutoryBasis?: string;
  strongestGrounds?: string[];
  typicalBand?: "A" | "B";
  typicalAmountPence?: number;
}

export interface CodeBrief {
  code: string;
  title: string;
  statutoryBasis: string;
  strongestGrounds: string[];
  typicalBand: "A" | "B" | null;
  typicalAmountPence: number | null;
  body: string;
}

export interface CouncilFrontmatter {
  slug?: string;
  name?: string;
  parkingServicesAddress?: string;
  appealEmail?: string;
  portalUrl?: string;
  acceptsGrounds?: string[];
  strictOn?: string[];
  evidenceBar?: "low" | "medium" | "high";
  quirks?: string;
}

export interface CouncilBrief {
  slug: string;
  name: string;
  parkingServicesAddress: string;
  appealEmail: string;
  portalUrl: string;
  acceptsGrounds: string[];
  strictOn: string[];
  evidenceBar: "low" | "medium" | "high";
  quirks: string;
}

export interface KnowledgePack {
  precedents: PrecedentBrief[]; // ≤ 6
  codeBriefs: CodeBrief[]; // ≤ 2
  councilBrief: CouncilBrief | null;
  /** Already-rendered, prompt-ready markdown. Capped at ~2500 tokens. */
  rendered: string;
  /** ceil(charCount / 4) — rough token estimate. */
  approxTokens: number;
  /** Stable IDs of the precedents + the brief slugs actually included.
   *  Used by the audit trail on the appeals row. */
  usedIds: string[];
}
