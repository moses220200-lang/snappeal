/**
 * Dev-only helper: mint an admin JWT for a given email, fetch the
 * page via HTTP, save the HTML. Used to smoke-test admin server
 * components without going through a real sign-in flow.
 *
 *   tsx scripts/fetch-admin-page.ts /admin/appeals/<id> [out.html]
 *   tsx scripts/fetch-admin-page.ts /admin/appeals/<id> shot.png --screenshot
 *
 * Reads AUTH_SECRET from .env.local. Talks to the dev server on
 * port 3001 (set DEV_PORT to override).
 */
import { config as loadEnv } from "dotenv";
import { existsSync, writeFileSync } from "node:fs";
import { createHmac } from "node:crypto";

loadEnv({ path: ".env.local" });

const ADMIN_EMAIL = process.env.DEV_ADMIN_EMAIL ?? "patrick@biras.com";
const PORT = process.env.DEV_PORT ?? "3001";

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function main() {
  const path = process.argv[2];
  const outFile = process.argv[3] ?? "admin-page.html";
  if (!path) {
    console.error("usage: tsx scripts/fetch-admin-page.ts <path> [outFile]");
    process.exit(1);
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    console.error("AUTH_SECRET missing or too short — check .env.local");
    process.exit(1);
  }

  // Look up the admin user id by email.
  const { getDb, schema } = await import("../lib/server/db/client");
  const { eq } = await import("drizzle-orm");
  const db = getDb();
  if (!db) throw new Error("DB not configured");
  const rows = await db.select().from(schema.users).where(eq(schema.users.email, ADMIN_EMAIL));
  const user = rows[0];
  if (!user) throw new Error(`No user with email ${ADMIN_EMAIL}`);
  if (user.role !== "admin") throw new Error(`User ${ADMIN_EMAIL} is not admin`);

  // Mint a 1-hour admin JWT — matches the shape signJwt() produces but
  // shorter-lived since this is a one-shot dev token.
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signingInput = `${header}.${payload}`;
  const sig = base64UrlEncode(
    createHmac("sha256", Buffer.from(secret, "utf8")).update(signingInput).digest(),
  );
  const token = `${signingInput}.${sig}`;

  const url = `http://127.0.0.1:${PORT}${path}`;
  console.log(`GET ${url} as ${user.email} (${user.id})`);

  const wantScreenshot = process.argv.includes("--screenshot");

  if (wantScreenshot) {
    // Launch a real browser via Playwright, set the cookie at the
    // context layer (httpOnly = OK), navigate, screenshot the full
    // scrollable page. Outfile should be a .png.
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 1,
    });
    await ctx.addCookies([
      {
        name: "parkingrabbit.token",
        value: token,
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      },
    ]);
    // Skip the 3s ParkingRabbitSplash animation by pre-marking it as
    // already-shown in sessionStorage before the React tree mounts.
    await ctx.addInitScript(() => {
      try {
        window.sessionStorage.setItem("parkingrabbit.splashShown", "1");
      } catch {
        /* sessionStorage might be blocked — splash will still play but
         * we'll let networkidle fire anyway. */
      }
    });
    const page = await ctx.newPage();
    const resp = await page.goto(url, { waitUntil: "networkidle" });
    console.log(`status: ${resp?.status() ?? "?"}`);
    await page.screenshot({ path: outFile, fullPage: true });
    const { statSync } = await import("node:fs");
    const sizeBytes = existsSync(outFile) ? statSync(outFile).size : 0;
    console.log(`saved screenshot to ${outFile} (${sizeBytes} bytes)`);
    await browser.close();
    return;
  }

  const res = await fetch(url, {
    headers: { cookie: `parkingrabbit.token=${token}` },
    redirect: "manual",
  });
  console.log(`status: ${res.status}`);
  console.log(`location: ${res.headers.get("location") ?? "—"}`);
  console.log(`content-type: ${res.headers.get("content-type") ?? "—"}`);

  const html = await res.text();
  writeFileSync(outFile, html, "utf8");
  console.log(`saved ${html.length} bytes to ${outFile}`);

  // Quick sniff: does the response look like an error overlay?
  const errMarkers = ["__next_error__", "ReferenceError", "TypeError:", "stack-trace"];
  const found = errMarkers.filter((m) => html.includes(m));
  if (found.length > 0) {
    console.warn(`!! markers in HTML: ${found.join(", ")}`);
    process.exit(2);
  }
  if (existsSync(outFile)) {
    console.log("ok");
  }
}

void main();
