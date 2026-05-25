import "server-only";

/**
 * Knowledge-pack loader / ranker / renderer.
 *
 * Reads markdown precedents, code briefs, and council briefs from
 * `apps/web/knowledge/**` once at module init (lazy-singleton). Given a
 * set of selected ground IDs + a contravention code + a council slug,
 * returns a prompt-ready markdown pack capped at ~2500 tokens.
 *
 * v1: deterministic ranking — no embeddings, no DB. Migrate to pgvector
 * when the corpus exceeds ~200 docs.
 *
 * The loader fences itself behind `import "server-only"` so it can
 * never leak into a client bundle (markdown filesystem reads + Node
 * APIs only).
 */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";
import type {
  CodeBrief,
  CodeFrontmatter,
  CouncilBrief,
  CouncilFrontmatter,
  KnowledgePack,
  PrecedentBrief,
  PrecedentFrontmatter,
} from "./knowledge.types";

const KNOWLEDGE_ROOT = join(process.cwd(), "knowledge");
const APPROX_TOKEN_CAP = 2500;
const CHARS_PER_TOKEN = 4;
const MAX_PRECEDENTS = 6;
const MAX_BODY_CHARS = 500;

/** Similar-code map for surfacing a second code brief when relevant. */
const SIMILAR_CODES: Record<string, string> = {
  "12": "16",
  "16": "12",
  "01": "02",
  "02": "01",
  "24": "27",
  "27": "24",
  "21": "22",
  "22": "21",
};

interface KnowledgeIndex {
  precedents: PrecedentBrief[];
  codeBriefs: Map<string, CodeBrief>;
  councilBriefs: Map<string, CouncilBrief>;
}

let indexPromise: Promise<KnowledgeIndex> | null = null;

/* ────────────────────────────────────────────────────────────────────── */
/*  Loading                                                                */
/* ────────────────────────────────────────────────────────────────────── */

async function loadIndex(): Promise<KnowledgeIndex> {
  if (indexPromise) return indexPromise;
  indexPromise = (async () => {
    const [precedents, codeBriefs, councilBriefs] = await Promise.all([
      loadPrecedents(),
      loadCodeBriefs(),
      loadCouncilBriefs(),
    ]);
    return { precedents, codeBriefs, councilBriefs };
  })();
  return indexPromise;
}

async function loadPrecedents(): Promise<PrecedentBrief[]> {
  const dir = join(KNOWLEDGE_ROOT, "precedents");
  const files = await safeReaddir(dir);
  const out: PrecedentBrief[] = [];
  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    const raw = await readFile(join(dir, file), "utf8");
    const parsed = matter(raw);
    const fm = parsed.data as PrecedentFrontmatter;
    out.push({
      id: fm.id ?? file.replace(/\.md$/, ""),
      groundIds: fm.groundIds ?? [],
      contraventionCodes: fm.contraventionCodes ?? [],
      councilSlugs: fm.councilSlugs ?? [],
      outcome: fm.outcome ?? "cancelled",
      stage: fm.stage ?? "informal",
      date: fm.date ?? "",
      summary: fm.summary ?? "",
      keyArgument: fm.keyArgument ?? "",
      body: parsed.content.trim(),
    });
  }
  return out;
}

async function loadCodeBriefs(): Promise<Map<string, CodeBrief>> {
  const dir = join(KNOWLEDGE_ROOT, "codes");
  const files = await safeReaddir(dir);
  const map = new Map<string, CodeBrief>();
  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    const raw = await readFile(join(dir, file), "utf8");
    const parsed = matter(raw);
    const fm = parsed.data as CodeFrontmatter;
    const code = (fm.code ?? file.replace(/\.md$/, "")).trim();
    map.set(code, {
      code,
      title: fm.title ?? "",
      statutoryBasis: fm.statutoryBasis ?? "",
      strongestGrounds: fm.strongestGrounds ?? [],
      typicalBand: fm.typicalBand ?? null,
      typicalAmountPence: fm.typicalAmountPence ?? null,
      body: parsed.content.trim(),
    });
  }
  return map;
}

async function loadCouncilBriefs(): Promise<Map<string, CouncilBrief>> {
  const dir = join(KNOWLEDGE_ROOT, "councils");
  const files = await safeReaddir(dir);
  const map = new Map<string, CouncilBrief>();
  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    const raw = await readFile(join(dir, file), "utf8");
    const parsed = matter(raw);
    const fm = parsed.data as CouncilFrontmatter;
    const slug = (fm.slug ?? file.replace(/\.md$/, "")).trim();
    map.set(slug, {
      slug,
      name: fm.name ?? "",
      parkingServicesAddress: fm.parkingServicesAddress ?? "",
      appealEmail: fm.appealEmail ?? "",
      portalUrl: fm.portalUrl ?? "",
      acceptsGrounds: fm.acceptsGrounds ?? [],
      strictOn: fm.strictOn ?? [],
      evidenceBar: fm.evidenceBar ?? "medium",
      quirks: (fm.quirks ?? "").trim(),
    });
  }
  return map;
}

async function safeReaddir(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Ranking + rendering                                                   */
/* ────────────────────────────────────────────────────────────────────── */

interface LoadInput {
  groundIds: string[];
  contraventionCode?: string;
  councilSlug?: string;
}

export async function loadKnowledgePack(input: LoadInput): Promise<KnowledgePack> {
  const index = await loadIndex();
  const codeKey = (input.contraventionCode ?? "").trim();
  const councilKey = (input.councilSlug ?? "").trim().toLowerCase();
  const groundSet = new Set(input.groundIds);

  const twoYearsAgo = Date.now() - 24 * 30 * 24 * 60 * 60 * 1000;

  // Score precedents.
  const scored: PrecedentBrief[] = [];
  for (const p of index.precedents) {
    let score = 0;
    for (const g of p.groundIds) if (groundSet.has(g)) score += 3;
    if (codeKey && p.contraventionCodes.includes(codeKey)) score += 2;
    if (councilKey && p.councilSlugs.includes(councilKey)) score += 1;
    if (p.outcome === "cancelled") score += 2;
    if (p.date) {
      const ts = Date.parse(p.date);
      if (!Number.isNaN(ts) && ts >= twoYearsAgo) score += 1;
    }
    if (score >= 3) {
      scored.push({ ...p, score });
    }
  }
  scored.sort((a, b) => {
    const s = (b.score ?? 0) - (a.score ?? 0);
    if (s !== 0) return s;
    return a.date < b.date ? 1 : -1;
  });
  let precedents = scored.slice(0, MAX_PRECEDENTS);

  // Code briefs.
  const codeBriefs: CodeBrief[] = [];
  if (codeKey) {
    const primary = index.codeBriefs.get(codeKey);
    if (primary) codeBriefs.push(primary);
    const similar = SIMILAR_CODES[codeKey];
    if (similar) {
      const sim = index.codeBriefs.get(similar);
      if (sim) codeBriefs.push(sim);
    }
  }

  // Council brief.
  const councilBrief = councilKey ? index.councilBriefs.get(councilKey) ?? null : null;

  // Render, trimming precedents until we fit the token cap.
  let rendered = renderPack(precedents, codeBriefs, councilBrief);
  let approxTokens = estimateTokens(rendered);
  while (approxTokens > APPROX_TOKEN_CAP && precedents.length > 0) {
    precedents = precedents.slice(0, -1);
    rendered = renderPack(precedents, codeBriefs, councilBrief);
    approxTokens = estimateTokens(rendered);
  }

  const usedIds: string[] = [
    ...precedents.map((p) => `precedent:${p.id}`),
    ...codeBriefs.map((c) => `code:${c.code}`),
    ...(councilBrief ? [`council:${councilBrief.slug}`] : []),
  ];

  return {
    precedents,
    codeBriefs,
    councilBrief,
    rendered,
    approxTokens,
    usedIds,
  };
}

function renderPack(
  precedents: readonly PrecedentBrief[],
  codeBriefs: readonly CodeBrief[],
  councilBrief: CouncilBrief | null,
): string {
  const out: string[] = [];

  if (codeBriefs.length > 0) {
    out.push("## Contravention code briefs");
    for (const c of codeBriefs) {
      const lines = [
        `### Code ${c.code} — ${c.title}`,
        c.statutoryBasis ? `_Statutory basis:_ ${c.statutoryBasis}` : "",
        truncate(c.body, MAX_BODY_CHARS),
      ].filter(Boolean);
      out.push(lines.join("\n\n"));
    }
  }

  if (councilBrief) {
    out.push("## Issuing-authority brief");
    const lines = [
      `### ${councilBrief.name} (${councilBrief.slug})`,
      councilBrief.parkingServicesAddress
        ? `_Postal address:_ ${councilBrief.parkingServicesAddress}`
        : "",
      councilBrief.evidenceBar
        ? `_Evidence bar:_ ${councilBrief.evidenceBar}`
        : "",
      councilBrief.strictOn?.length
        ? `_Strict on:_ ${councilBrief.strictOn.join(", ")}`
        : "",
      councilBrief.quirks ? `_Quirks:_\n${truncate(councilBrief.quirks, MAX_BODY_CHARS)}` : "",
    ].filter(Boolean);
    out.push(lines.join("\n\n"));
  }

  if (precedents.length > 0) {
    out.push("## Relevant precedents");
    for (const p of precedents) {
      const lines = [
        `### ${p.id}`,
        `_Grounds:_ ${p.groundIds.join(", ")}  ·  _Outcome:_ ${p.outcome} at ${p.stage} stage`,
        p.summary ? `_Summary:_ ${p.summary}` : "",
        p.keyArgument ? `_Key argument:_ ${p.keyArgument}` : "",
      ].filter(Boolean);
      out.push(lines.join("\n\n"));
    }
  }

  return out.join("\n\n");
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trimEnd()}…`;
}

function estimateTokens(s: string): number {
  return Math.ceil(s.length / CHARS_PER_TOKEN);
}

/** Test/dev hook — clears the lazy-singleton so reloads pick up
 *  filesystem changes. Not for production use. */
export function __resetKnowledgeIndex(): void {
  indexPromise = null;
}
