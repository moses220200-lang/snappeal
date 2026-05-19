/**
 * End-to-end backend test: create appeal → generate via Claude CLI → re-fetch
 * → submit. Run with:
 *
 *   npm run test:e2e:backend
 *
 * Verifies the real path: Postgres + Claude CLI piping + submission engine.
 */
import { readFile } from "node:fs/promises";

const BASE = process.env.SNAPPEAL_BASE ?? "http://127.0.0.1:3001";
const PCN_IMAGE_PATH =
  process.env.SNAPPEAL_TEST_PCN ??
  "C:\\Users\\User\\desktop\\parkingappeal\\snappeal-home-final.png";

interface AppealRecordView {
  id: string;
  status: string;
  councilSlug: string | null;
  letterSubject: string | null;
  letterWordCount: number | null;
  modelUsed: string | null;
  grounds: string[];
}

async function main() {
  const sessionId = `test_${Date.now()}`;
  console.info(`▶ sessionId = ${sessionId}`);

  // ── 1. Create draft appeal ──────────────────────────────────────────────
  const createRes = await fetch(`${BASE}/api/appeals`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
  if (!createRes.ok) throw new Error(`create failed: ${createRes.status} ${await createRes.text()}`);
  const created = (await createRes.json()) as { appeal: { id: string; replyEmail: string | null } };
  const appealId = created.appeal.id;
  console.info(`✓ appeal created: ${appealId} (reply-to ${created.appeal.replyEmail})`);

  // ── 2. Run /api/generate (real Claude CLI) ──────────────────────────────
  const imgBytes = await readFile(PCN_IMAGE_PATH);
  const pcnPhoto = `data:image/png;base64,${imgBytes.toString("base64")}`;
  console.info(`▶ generate (image bytes=${imgBytes.length})`);
  const t0 = Date.now();
  const genRes = await fetch(`${BASE}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sessionId,
      appealId,
      pcnPhoto,
      evidencePhotos: [],
      notes:
        "Builder hoarding hid the suspension notice. Parked 09:10, returned 09:30 to find a PCN already on the windscreen.",
    }),
  });
  const elapsed = Date.now() - t0;
  const genJson = await genRes.json();
  if (!genRes.ok) {
    console.error("✗ generate failed", genRes.status, genJson);
    process.exit(1);
  }
  console.info(`✓ generate succeeded in ${(elapsed / 1000).toFixed(1)}s, model=${genJson.modelUsed}`);
  console.info(`  ticket.issuer = ${genJson.ticket?.issuer}`);
  console.info(`  ticket.pcnRef = ${genJson.ticket?.pcnRef}`);
  console.info(`  groundIds     = ${genJson.groundIds?.join(", ")}`);
  console.info(`  letter.words  = ${genJson.letter?.wordCount}`);
  console.info(`  letter[:200]  = ${String(genJson.letter?.body).slice(0, 200)}…`);

  // ── 3. Re-fetch from DB ─────────────────────────────────────────────────
  const fetchRes = await fetch(`${BASE}/api/appeals/${appealId}`);
  const { appeal } = (await fetchRes.json()) as { appeal: AppealRecordView };
  console.info(`✓ persisted: status=${appeal.status}, council=${appeal.councilSlug}, words=${appeal.letterWordCount}, model=${appeal.modelUsed}`);

  // ── 4. Submit ───────────────────────────────────────────────────────────
  const submitRes = await fetch(`${BASE}/api/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId, appealId, paymentIntentId: "pi_dev_test" }),
  });
  const submitJson = await submitRes.json();
  if (!submitRes.ok) {
    console.error("✗ submit failed", submitRes.status, submitJson);
    process.exit(1);
  }
  console.info(`✓ submission: method=${submitJson.method}, status=${submitJson.status}, ref=${submitJson.councilReference}`);

  // ── 5. Re-fetch after submit ────────────────────────────────────────────
  const afterRes = await fetch(`${BASE}/api/appeals/${appealId}`);
  const after = ((await afterRes.json()) as { appeal: AppealRecordView }).appeal;
  console.info(`✓ post-submit status = ${after.status}`);
  console.info(`\n🎉 E2E backend audit passed — appeal ${appealId}`);
}

main().catch((err) => {
  console.error("E2E test failed:", err);
  process.exit(1);
});
