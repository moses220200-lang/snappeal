/**
 * One-shot Westminster dry-run probe.
 *
 *   npx tsx --env-file=.env.local scripts/test-dryrun-westminster.ts \
 *     WE66452241 S99SNN
 *
 * Hits the live Westminster appeals portal via Claude + Playwright MCP,
 * stops at the review page (NEVER submits), and prints the parsed result
 * plus the screenshot path. Used to verify route selection + form filling
 * before pointing a real customer at it.
 */
import { dryRunAutomation } from "../lib/server/submission/automation";
import { copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

async function main() {
  const [pcnRef, vehicleReg] = process.argv.slice(2);
  if (!pcnRef || !vehicleReg) {
    console.error("usage: tsx test-dryrun-westminster.ts <pcnRef> <vehicleReg>");
    process.exit(1);
  }

  console.info(`[dryrun] starting Westminster dry-run with PCN=${pcnRef} reg=${vehicleReg}`);
  const t0 = Date.now();
  const result = await dryRunAutomation({
    councilSlug: "westminster",
    ticketOverride: {
      pcnRef,
      vehicleReg,
      issuer: "Westminster City Council",
      contraventionCode: "12",
      amountPence: 13000,
      location: "Test Lane, W1U 1AA",
      issuedAt: new Date().toISOString(),
      grounds: ["signage-unclear"],
      replyEmail: "dry-run@appeals.parkingrabbit.com",
      letterSubject: `Representation against PCN ${pcnRef}`,
      letterBody: [
        "This is a PARKINGRABBIT DRY RUN. NO APPEAL is being submitted.",
        "",
        "The agent should stop at the review page and screenshot it.",
        "",
        "If you are reading this in a real submission, abort and report.",
      ].join("\n"),
    },
    timeoutMs: 6 * 60_000,
  });

  console.info(`[dryrun] finished in ${Math.round((Date.now() - t0) / 1000)}s`);
  console.info(`[dryrun] ok=${result.ok} screenshot=${result.screenshotPath ?? "(none)"}`);
  console.info(`[dryrun] cost=${result.costUsd ?? "?"} events=${result.events.length}`);
  // Tool-call histogram + a focus list for screenshot/snapshot to expose the
  // agent's actual behaviour.
  const tally: Record<string, number> = {};
  for (const c of result.toolCalls) {
    const short = c.name.replace(/^mcp__[^_]+__/, "");
    tally[short] = (tally[short] ?? 0) + 1;
  }
  console.info(`[dryrun] tool calls:`, JSON.stringify(tally, null, 2));
  const ssCalls = result.toolCalls.filter((c) => c.name.includes("take_screenshot"));
  console.info(`[dryrun] browser_take_screenshot invocations: ${ssCalls.length}`);
  for (const c of ssCalls) console.info(`    →`, JSON.stringify(c.input));
  console.info(`[dryrun] parsed:`, JSON.stringify(result.parsed, null, 2));
  console.info(`[dryrun] tail of finalText (last 1000 chars):\n${result.finalText.slice(-1000)}`);

  // Copy every screenshot the agent took to a stable location for inspection.
  const outDir = join(process.cwd(), "dryrun-screenshots");
  await mkdir(outDir, { recursive: true });
  if (result.allScreenshots.length > 0) {
    for (const src of result.allScreenshots) {
      if (!existsSync(src)) continue;
      const name = src.split(/[\\/]/).pop()!;
      const dest = join(outDir, name);
      await copyFile(src, dest);
      console.info(`[dryrun] saved: ${dest}`);
    }
  } else if (result.screenshotPath && existsSync(result.screenshotPath)) {
    const dest = join(outDir, "review.png");
    await copyFile(result.screenshotPath, dest);
    console.info(`[dryrun] saved: ${dest}`);
  } else {
    console.warn(`[dryrun] no screenshots found in workDir: ${result.workDir}`);
  }

  process.exit(result.ok ? 0 : 2);
}

main().catch((err) => {
  console.error("[dryrun] crashed:", err);
  process.exit(1);
});
