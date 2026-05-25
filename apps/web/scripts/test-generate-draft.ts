/**
 * One-shot probe to reproduce the "Drafting hit a snag" failure outside
 * of the SSE route. Loads the test PCN photo, calls generateDraft, and
 * prints the full error if it throws.
 *
 *   npx tsx --env-file=.env.local scripts/test-generate-draft.ts
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { generateDraft } from "../lib/server/ai";
import { getCardById } from "../lib/grounds-catalog";

async function main() {
  const photoPath = join(
    process.cwd(),
    ".playwright-mcp",
    "test_pcn.jpeg",
  );
  const photoBytes = await readFile(photoPath);
  const photoDataUrl = `data:image/jpeg;base64,${photoBytes.toString("base64")}`;
  console.info(`[probe] loaded photo ${photoPath} (${photoBytes.length} bytes)`);

  // Mirror what /api/generate-stream does: load knowledge pack and
  // grounds cards exactly the same way.
  const groundIds = ["signage-unclear", "valid-permit-displayed"];
  const selectedCards = groundIds
    .map((id) => getCardById(id))
    .filter((c): c is NonNullable<ReturnType<typeof getCardById>> => !!c)
    .map((c) => ({
      id: c.id,
      label: c.label,
      promptHook: c.promptHook,
      weight: c.weight,
    }));
  console.info(`[probe] selectedCards=${selectedCards.length}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const knowledgePack: any = {
    usedIds: [] as string[],
    approxTokens: 0,
    rendered: "",
    precedents: [],
    codeBriefs: [],
    councilBrief: null,
  };
  console.info(`[probe] knowledgePack stubbed (empty)`);

  const t0 = Date.now();
  try {
    const draft = await generateDraft({
      pcnPhotoDataUrl: photoDataUrl,
      evidencePhotoDataUrls: [],
      notes: "The signage was completely obscured by overgrown trees on the day.",
      selectedCards,
      knowledgePack,
    });
    const dur = Date.now() - t0;
    console.info(`[probe] OK in ${dur}ms · model=${draft.modelUsed} · cost=$${draft.costUsd ?? "?"}`);
    console.info("ticket =", JSON.stringify(draft.ticket, null, 2));
    console.info("groundIds =", draft.groundIds);
    console.info("strength =", JSON.stringify(draft.strength, null, 2));
    console.info("letter.subject =", draft.letter.subject);
    console.info("letter.body length =", draft.letter.body?.length ?? 0);
  } catch (err) {
    const dur = Date.now() - t0;
    console.error(`[probe] FAILED in ${dur}ms`);
    console.error(err instanceof Error ? err.stack ?? err.message : err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
