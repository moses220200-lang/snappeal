/**
 * Lambeth deterministic recipe.
 *
 * Drives `https://pcnevidence.lambeth.gov.uk/pcnonline/challenge.php`
 * via Playwright directly — no Claude inference, no MCP. Zero $
 * per lookup. ~10-20s wall-clock vs ~60-120s for the Claude path.
 *
 * DOM signature gates: at each step the recipe checks for landmarks
 * we know exist on a healthy portal. On mismatch we return
 * `{ drift: true }` and the runner falls back to the Claude MCP
 * lookup. The signatures below are the MINIMUM needed for the
 * recipe to do its job — keep this list short so the recipe
 * tolerates harmless layout tweaks.
 *
 * Single source of portal knowledge for the deterministic path —
 * this file SHOULD mirror the structural facts encoded in
 * `prompts/lambeth_lookup.ts`. When the portal changes you update
 * BOTH; the drift checker tells you when it's time.
 */
import type { Page } from "playwright";
import {
  drift,
  recipeError,
  type CouncilRecipe,
  type RecipeInput,
  type RecipeResult,
} from "./types";
import type {
  PortalLookupVerdict,
  PortalLookupSnapshot,
} from "../../db/schema";

const PORTAL_URL = "https://pcnevidence.lambeth.gov.uk/pcnonline/challenge.php";

export const LAMBETH_RECIPE: CouncilRecipe = {
  slug: "lambeth",
  displayName: "London Borough of Lambeth",
  timeoutMs: 60_000,
  async run(page: Page, input: RecipeInput): Promise<RecipeResult> {
    const t0 = Date.now();
    try {
      // ─── Step 1: navigate to challenge.php ───
      await page.goto(PORTAL_URL, { waitUntil: "domcontentloaded", timeout: 20_000 });

      // Drift check: two inputs (PCN ref + VRM) + a Search button MUST
      // be present. Their absence means the portal has been redesigned.
      const inputs = await page.locator("input[type='text'], input:not([type])").count();
      if (inputs < 2) {
        return drift(
          `Expected ≥2 text inputs on the challenge.php landing page; found ${inputs}.`,
          1,
          t0,
        );
      }
      // ─── Step 2: fill the lookup form ───
      // The Imperial portal labels the fields generically. We target
      // the first two text inputs by index, which is brittle but
      // tolerates label-copy changes. If the form structure changes
      // (e.g. an extra field added before PCN ref), the values land
      // in the wrong slots and the post-lookup page will show the
      // generic "no record" — caught at step 3's drift gate.
      const pcnInput = page.locator("input[type='text'], input:not([type])").nth(0);
      const vrmInput = page.locator("input[type='text'], input:not([type])").nth(1);
      await pcnInput.fill(input.pcnRef.trim());
      // VRM must be entered WITHOUT spaces — the Imperial form
      // silently rejects them.
      await vrmInput.fill(input.vehicleReg.replace(/\s+/g, "").trim());

      // ─── Step 3: submit + wait for the ticket-details page ───
      const searchButton = page
        .locator("input[type='submit'], button[type='submit'], button:has-text('Search'), button:has-text('Find')")
        .first();
      if ((await searchButton.count()) === 0) {
        return drift(
          "No submit button found on challenge.php landing page.",
          2,
          t0,
        );
      }
      await Promise.all([
        page.waitForLoadState("domcontentloaded", { timeout: 20_000 }),
        searchButton.click(),
      ]);

      // ─── Step 4: scrape ticket-details page (step2.php) ───
      // ONE evaluate call extracts everything — matches what the
      // Claude prompt does. Verdict resolution mirrors the prompt
      // logic so the two paths can't drift in interpretation.
      const scraped = await page.evaluate(() => {
        const text = (document.body.innerText || "").replace(/\s+/g, " ").trim();
        const grab = (re: RegExp): string | null => {
          const m = text.match(re);
          return m ? m[1].trim() : null;
        };

        const challengeBtn = Array.from(
          document.querySelectorAll("a, button, input[type=submit]"),
        ).find((el) =>
          /challenge|make.+representation|dispute|reasons/i.test(
            (el.textContent || (el as HTMLInputElement).value || ""),
          ),
        );

        const closedSignals = [
          /no further representation/i,
          /charge certificate/i,
          /order for recovery/i,
          /registered at northampton/i,
          /you are no longer entitled to make representations/i,
          /statutory.+period has expired/i,
          /TE9 witness statement/i,
        ]
          .filter((re) => re.test(text))
          .map((re) => re.source);

        let verdict: PortalLookupVerdict = "open";
        let verdictReason = "";
        if (/paid in full|this PCN has been paid|balance.+£0|balance.+0\.00/i.test(text)) {
          verdict = "paid";
          verdictReason = "Page states paid in full / £0 balance.";
        } else if (/cancelled|withdrawn|no further action/i.test(text)) {
          verdict = "closed";
          verdictReason = "Page states case cancelled/withdrawn.";
        } else if (closedSignals.length > 0) {
          verdict = "expired";
          verdictReason = "Appeal route closed: " + closedSignals.join("; ");
        } else if (/no PCN found|no record matches|not found/i.test(text)) {
          verdict = "not_found";
          verdictReason = "Search returned no record.";
        } else if (!challengeBtn) {
          verdict = "expired";
          verdictReason = "No Challenge/Representation route visible on the page.";
        } else {
          verdictReason = "Challenge button visible; PCN live with outstanding balance.";
        }

        const amountMatch = text.match(/£\s*([0-9]{1,4}(?:\.[0-9]{2})?)/);
        const amountPence = amountMatch
          ? Math.round(parseFloat(amountMatch[1]) * 100)
          : null;

        return {
          verdict,
          verdictReason,
          pcnRef: grab(
            /(?:PCN(?: Number)?|Notice(?: Number)?)[:\s]+([A-Z0-9-]{6,16})/i,
          ),
          vehicleReg: grab(
            /(?:VRN(?: Number)?|Vehicle Registration(?: Number)?|VRM|Reg)[:\s]+([A-Z0-9 ]{4,9})/i,
          ),
          contraventionCode: grab(
            /(?:Contravention(?: code)?|Code)[:\s]+([0-9]{1,3})/i,
          ),
          location: grab(/(?:Street|Location)[:\s]+([^,\n]{3,80})/i),
          issuedAt: grab(
            /(?:Notice Service Date|Issued|On)[:\s]+([0-9]{2}[-/][0-9]{2}[-/][0-9]{4}(?:\s+[0-9]{2}:[0-9]{2}(?::[0-9]{2})?)?)/i,
          ),
          amountPence,
          dueDateAt: grab(
            /(?:due|by|expir(?:y|es))[:\s]+([0-9]{1,2}\s+\w+\s+[0-9]{4})/i,
          ),
          challengeAvailable: !!challengeBtn,
          closedSignals,
          pageText: text.slice(0, 500), // for drift diagnostics
        };
      });

      // Drift check: if we got `not_found` we don't know whether the
      // PCN really doesn't exist or whether the portal structure
      // changed and we landed on a generic page. We treat
      // `not_found` as a CLEAN verdict (the customer's PCN ref is
      // wrong) but if NONE of the metadata fields were extractable
      // AND the page doesn't contain the words "not found" or "no
      // record", it's almost certainly a portal redesign.
      const gotAnyMeta =
        scraped.pcnRef ||
        scraped.vehicleReg ||
        scraped.amountPence != null;
      if (
        scraped.verdict === "not_found" &&
        !gotAnyMeta &&
        !/not found|no record/i.test(scraped.pageText)
      ) {
        return drift(
          `step2.php showed no metadata + no 'not found' marker. Portal may have moved. First 300 chars: "${scraped.pageText.slice(0, 300)}"`,
          3,
          t0,
        );
      }

      // ─── Step 5 (optional): harvest warden photo URLs ───
      // Only if the verdict is open + the View Images link exists.
      // Same pattern as the Claude prompt — single browser.evaluate.
      let photoUrls: string[] = [];
      if (scraped.verdict === "open" || scraped.verdict === "expired") {
        const viewImagesLink = page
          .locator("a:has-text('View Images'), a:has-text('View Photos'), a:has-text('Evidence')")
          .first();
        if ((await viewImagesLink.count()) > 0) {
          try {
            await Promise.all([
              page.waitForLoadState("domcontentloaded", { timeout: 15_000 }),
              viewImagesLink.click({ timeout: 5_000 }),
            ]);
            photoUrls = await page.evaluate(() => {
              return Array.from(
                document.querySelectorAll(
                  "img.warden-photo, .ticket-image img, .gallery-item img, .photo-gallery img, .photos-list img, .pcn-images img, main img",
                ),
              )
                .map((el) => ({
                  src: (el as HTMLImageElement).getAttribute("src") || "",
                  w: (el as HTMLImageElement).naturalWidth || 0,
                  h: (el as HTMLImageElement).naturalHeight || 0,
                }))
                .filter((r) => r.src && r.w >= 200 && r.h >= 200)
                .map((r) => new URL(r.src, location.href).href);
            });
          } catch {
            // Photo capture is bonus; missing photos don't fail the run.
            photoUrls = [];
          }
        }
      }

      // Build the metadata bag, coercing types.
      const metadata: NonNullable<PortalLookupSnapshot["metadata"]> = {};
      if (scraped.pcnRef) metadata.pcnRef = scraped.pcnRef;
      if (scraped.vehicleReg) metadata.vehicleReg = scraped.vehicleReg;
      if (scraped.contraventionCode)
        metadata.contraventionCode = scraped.contraventionCode;
      if (scraped.location) metadata.location = scraped.location;
      if (scraped.issuedAt) metadata.issuedAt = scraped.issuedAt;
      if (scraped.amountPence != null)
        metadata.amountPence = scraped.amountPence;
      if (scraped.dueDateAt) metadata.dueDateAt = scraped.dueDateAt;

      return {
        ok: true,
        verdict: scraped.verdict,
        verdictReason: scraped.verdictReason,
        metadata,
        photoUrls,
        durationMs: Date.now() - t0,
      };
    } catch (err) {
      // Network / browser / timeout — runner falls back to Claude.
      const message = err instanceof Error ? err.message : String(err);
      const errorKind = /timeout|timed out/i.test(message)
        ? "timeout"
        : /net::ERR|ENOTFOUND|ECONNREFUSED/i.test(message)
          ? "network"
          : /browser|chromium/i.test(message)
            ? "browser"
            : "other";
      return recipeError(err, t0, errorKind as never);
    }
  },
};
