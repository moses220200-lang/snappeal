/**
 * MCP pre-warm.
 *
 * The first time the worker spawns `npx -y @playwright/mcp@latest` after
 * a host reboot or a fresh container start, it pays:
 *   - npx package resolution + tarball download (~3–10s on a warm
 *     registry, 30–60s on cold network)
 *   - Bundled Chromium download (only the very first time per machine,
 *     cached forever after)
 *   - First-process Chromium boot
 *
 * The customer experiences this as a 30–60s "Warming up a secure browser"
 * silence on the very first PCN of the session. Subsequent jobs are
 * fast because npx + the Chromium binary are cached on disk.
 *
 * `prewarmMcp()` runs that first-job cost EAGERLY at worker boot so the
 * first customer doesn't pay it. We invoke `--help` rather than a real
 * MCP session because help exits in <1s once the package is resolved —
 * we only need npm's tarball cache + the Chromium binary to land on
 * disk, not an actual browser to boot.
 *
 * Idempotent: subsequent boots see the cache and complete in milliseconds.
 * Best-effort: failures are logged but don't block the worker.
 */
import { spawn } from "node:child_process";

let warming: Promise<void> | null = null;

export function prewarmMcp(): Promise<void> {
  if (warming) return warming;
  warming = (async () => {
    const started = Date.now();
    const npxBin = process.platform === "win32" ? "npx.cmd" : "npx";
    await new Promise<void>((resolve) => {
      const child = spawn(npxBin, ["-y", "@playwright/mcp@latest", "--help"], {
        env: process.env,
        stdio: ["ignore", "ignore", "ignore"],
        shell: false,
        windowsHide: true,
      });
      const kill = setTimeout(() => {
        try {
          child.kill("SIGTERM");
        } catch {
          /* ignore */
        }
      }, 120_000);
      child.on("close", () => {
        clearTimeout(kill);
        resolve();
      });
      child.on("error", () => {
        clearTimeout(kill);
        resolve();
      });
    });
    const elapsed = Date.now() - started;
    console.info(`[mcp-warm] prewarm complete (${elapsed}ms)`);
  })();
  return warming;
}
