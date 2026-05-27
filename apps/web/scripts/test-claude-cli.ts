/**
 * Quick smoke test for lib/server/claude-cli.ts.
 *   npm run test:claude
 * Pings the CLI with a trivial structured prompt; prints the parsed object.
 */
import { z } from "zod";
import { runStructured } from "../lib/server/claude-cli";

const Schema = z.object({
  ok: z.boolean(),
  message: z.string(),
});

async function main() {
  const started = Date.now();
  const result = await runStructured({
    prompt:
      "Return a JSON object with ok=true and message='parkingrabbit cli pipe is wired'.",
    schema: Schema,
    timeoutMs: 60_000,
  });
  const dur = Date.now() - started;
  console.info(`[test-claude-cli] ${dur}ms · model=${result.modelUsed} · cost=$${result.costUsd ?? "?"}`);
  console.info(result.value);
}

main().catch((err) => {
  console.error("[test-claude-cli] failed:", err);
  process.exit(1);
});
