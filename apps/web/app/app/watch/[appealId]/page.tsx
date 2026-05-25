/**
 * /app/watch/[appealId] — convenience redirect (v0.2.13).
 *
 * The smart ticket card on `/app/tickets/[appealId]` now owns the live
 * view. This route is kept alive so old email / notification deep-links
 * still work — it just forwards to the card. No body needed.
 */
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function WatchAppealPage({
  params,
}: {
  params: Promise<{ appealId: string }>;
}) {
  const { appealId } = await params;
  redirect(`/app/tickets/${appealId}`);
}
