import Link from "next/link";
import { ExternalLink } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * Embeds the MkDocs wiki inside the admin shell. The full admin sidebar +
 * mobile drawer stay visible; the wiki fills the remaining viewport via
 * iframe. Default URL is the local docker-compose binding; override via
 * NEXT_PUBLIC_WIKI_URL for prod.
 */
const WIKI_URL = process.env.NEXT_PUBLIC_WIKI_URL ?? "http://localhost:8800";

export default function AdminWikiPage() {
  return (
    <div className="flex-1 flex flex-col">
      <div className="border-b border-parkingrabbit-border bg-white px-6 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-parkingrabbit-navy">ParkingRabbit Wiki</p>
          <p className="text-[11px] text-parkingrabbit-muted">
            MkDocs Material build — business, product, architecture, councils, legal, users.
          </p>
        </div>
        <a
          href={WIKI_URL}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-parkingrabbit-primary hover:underline"
        >
          Open in new tab
          <ExternalLink className="size-3.5" />
        </a>
      </div>
      <iframe
        src={WIKI_URL}
        title="ParkingRabbit Wiki"
        className="flex-1 w-full border-0"
        // Sandbox keeps the wiki's JS scoped — we trust our own MkDocs build
        // so allow scripts + same-origin so search + nav work normally.
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
      <noscript>
        <Link href={WIKI_URL} className="text-parkingrabbit-primary p-4 block">
          Open the wiki ({WIKI_URL})
        </Link>
      </noscript>
    </div>
  );
}
