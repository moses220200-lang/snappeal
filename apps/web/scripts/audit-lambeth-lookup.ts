/**
 * One-shot audit: fire the Lambeth portal lookup against an existing
 * appeal row and report exactly how the MCP agent navigated the
 * challenge.php portal. Read-only walk — never submits or pays.
 *
 *   npx tsx --env-file=.env.local scripts/audit-lambeth-lookup.ts <appealId>
 *
 * If no appealId is supplied, picks the most recent Lambeth appeal.
 */
import { eq } from "drizzle-orm";
import { getDb, schema } from "../lib/server/db/client";
import { runPortalLookup } from "../lib/server/submission/lookup";
import { getAppealById } from "../lib/server/appeals";

async function main() {
  const argId = process.argv[2];
  const db = getDb();
  if (!db) throw new Error("DATABASE_URL not set");

  let appealId = argId;
  if (!appealId) {
    const rows = await db
      .select()
      .from(schema.appeals)
      .where(eq(schema.appeals.councilSlug, "lambeth"))
      .orderBy(schema.appeals.createdAt);
    const latest = rows[rows.length - 1];
    if (!latest) throw new Error("No Lambeth appeals in DB");
    appealId = latest.id;
    console.log(`[audit] no appealId — using latest Lambeth appeal ${appealId}`);
  }

  const appeal = await getAppealById(appealId);
  if (!appeal) throw new Error(`Appeal ${appealId} not found`);

  const councilRows = await db
    .select()
    .from(schema.councils)
    .where(eq(schema.councils.slug, "lambeth"));
  if (!councilRows[0]) throw new Error("Lambeth council row missing");
  const council = councilRows[0];

  console.log("───────────────────────────────────");
  console.log(`Appeal:           ${appeal.id}`);
  console.log(`Council:          ${council.name}`);
  console.log(`Appeal portal:    ${council.appealPortalUrl}`);
  console.log(`Payment portal:   ${council.paymentPortalUrl ?? "(none)"}`);
  console.log(`PCN ref:          ${appeal.ticket?.pcnRef ?? "(missing)"}`);
  console.log(`Vehicle reg:      ${appeal.ticket?.vehicleReg ?? "(missing)"}`);
  console.log(`Automation:       ${council.automationStatus}`);
  console.log("───────────────────────────────────");
  console.log("[audit] firing runPortalLookup — read-only walk only…\n");

  const t0 = Date.now();
  const result = await runPortalLookup({ appeal, council });
  const seconds = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`\n───── LOOKUP COMPLETE in ${seconds}s ─────`);
  console.log(`success:          ${result.success}`);
  console.log(`cost:             ${result.costUsd ? `$${result.costUsd.toFixed(4)}` : "(unknown)"}`);
  console.log(`screenshot:       ${result.screenshotPath ?? "(none)"}`);
  if (result.error) console.log(`error:            ${result.error}`);
  console.log("");
  console.log("───── SNAPSHOT ─────");
  console.log(JSON.stringify(result.snapshot, null, 2));
  process.exit(result.success ? 0 : 1);
}

main().catch((err) => {
  console.error("[audit] fatal:", err);
  process.exit(1);
});
