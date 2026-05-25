"use client";

/**
 * /app/evidence — legacy redirect (v0.2.11).
 *
 * The standalone evidence + grounds + notes page was absorbed into the
 * ticket detail in v0.2.11, and the entire post-scan flow consolidated
 * onto `/app/tickets/[id]` in v0.2.13. The new smart card on the ticket
 * detail page is the single decision surface — validation, drafting,
 * payment, submission, all inline.
 *
 * This stub redirects any back-compat bookmark / old SSE-flow link to
 * the most-recent appeal, or to the tickets list if none exists.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getCurrentAppealId } from "@/lib/client/session";

export default function EvidenceRedirect() {
  const router = useRouter();
  useEffect(() => {
    const aid = getCurrentAppealId();
    if (aid) router.replace(`/app/tickets/${encodeURIComponent(aid)}`);
    else router.replace("/app/tickets");
  }, [router]);
  return (
    <div className="flex flex-col items-center justify-center pt-32 gap-3 text-snappeal-muted">
      <Loader2 className="size-5 animate-spin text-snappeal-primary" />
      <p className="text-xs">Taking you to your ticket…</p>
    </div>
  );
}
