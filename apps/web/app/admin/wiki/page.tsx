"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ExternalLink, Pencil } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * Embeds the MkDocs wiki inside the admin shell. The full admin sidebar +
 * mobile drawer stay visible; the wiki fills the remaining viewport via
 * iframe.
 *
 * URL resolution (newest wins):
 *   1. `localStorage["parkingrabbit.wikiUrl"]` — admin-settable runtime
 *      override (the "Change URL" button below saves here). Useful when
 *      you're temporarily fronting a one-off wiki tunnel and don't want
 *      to rebuild.
 *   2. `NEXT_PUBLIC_WIKI_URL` — baked into the client bundle at build
 *      time. Set this for a stable prod URL (named tunnel / custom
 *      domain). Set in `apps/web/.env.local` for local dev.
 *   3. `/wiki/` — the SAME-ORIGIN default. The repo's `Caddyfile`
 *      proxies `/wiki/*` to the MkDocs container, and the Cloudflare
 *      quick tunnel for the app points at that Caddy — so this path
 *      works both locally (via `http://localhost:8080`) AND through
 *      the Cloudflare tunnel without any per-rotation reconfig. The
 *      `next.config.ts` adds a matching rewrite so direct-to-:3001
 *      access (bypassing Caddy) also resolves via
 *      `http://127.0.0.1:8800` server-side.
 */
const ENV_WIKI_URL = process.env.NEXT_PUBLIC_WIKI_URL ?? "/wiki/";
const STORAGE_KEY = "parkingrabbit.wikiUrl";

export default function AdminWikiPage() {
  // Start with the env var so SSR + first paint don't blink; on mount
  // we read the localStorage override and replace it if present.
  const [wikiUrl, setWikiUrl] = useState<string>(ENV_WIKI_URL);

  useEffect(() => {
    try {
      const override = window.localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (override) setWikiUrl(override);
    } catch {
      /* private mode — env value stays in place */
    }
  }, []);

  const changeWikiUrl = () => {
    const next = window.prompt(
      "Wiki URL (e.g. https://your-wiki-tunnel.trycloudflare.com/):",
      wikiUrl,
    );
    if (next == null) return;
    const trimmed = next.trim();
    if (!trimmed) {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* private mode */
      }
      setWikiUrl(ENV_WIKI_URL);
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, trimmed);
    } catch {
      /* private mode — keep this session only */
    }
    setWikiUrl(trimmed);
  };

  return (
    // 2026-05-29 — `h-[calc(100vh-3.5rem)]` instead of pure `flex-1`.
    // The admin shell's outer flex was leaving this page short when the
    // ancestor chain didn't all participate in the flex height — the
    // iframe collapsed to ~200 px. Pinning a concrete viewport-relative
    // height (minus the top nav strip) guarantees the iframe always
    // fills the available viewport regardless of ancestor flex
    // behaviour.
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <div className="border-b border-parkingrabbit-border bg-white px-6 py-3 flex items-center justify-between">
        <div className="min-w-0 flex-1 pr-4">
          <p className="text-sm font-bold text-parkingrabbit-navy">
            ParkingRabbit Wiki
          </p>
          <p className="text-[11px] text-parkingrabbit-muted truncate">
            MkDocs Material build — embedded from {wikiUrl}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={changeWikiUrl}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-parkingrabbit-muted hover:text-parkingrabbit-navy transition"
            aria-label="Change wiki URL"
          >
            <Pencil className="size-3.5" />
            Change URL
          </button>
          <a
            href={wikiUrl}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-parkingrabbit-primary hover:underline"
          >
            Open in new tab
            <ExternalLink className="size-3.5" />
          </a>
        </div>
      </div>
      <iframe
        src={wikiUrl}
        title="ParkingRabbit Wiki"
        className="flex-1 w-full border-0"
        // Sandbox keeps the wiki's JS scoped — we trust our own MkDocs
        // build so allow scripts + same-origin so search + nav work
        // normally.
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
      <noscript>
        <Link href={wikiUrl} className="text-parkingrabbit-primary p-4 block">
          Open the wiki ({wikiUrl})
        </Link>
      </noscript>
    </div>
  );
}
