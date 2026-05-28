/**
 * /app/manual-entry — back-compat redirect (2026-05-27).
 *
 * The dedicated manual-entry page was deleted because it duplicated
 * the editable form that already lives on the smart ticket card on
 * /app/tickets. Users now enter PCN details inline on the card
 * itself (see `components/ticket/TicketDetailsForm.tsx`), reached
 * either via the failure card's "Enter details manually" expand-on-tap
 * button or via /app/scan's "Input manually" tile (which creates a
 * fresh draft + navigates to /app/tickets?expand=<id>&inputManual=1).
 *
 * This stub redirects any back-compat link (notification, email,
 * bookmark, scheduled task) to /app/tickets so stale links don't 404.
 * If a `?appealId=…` query is present, we forward it as `?expand=…`
 * so the user lands on the specific ticket; otherwise we send them to
 * the list and they can pick up where they left off.
 */
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ManualEntryRedirect({
  searchParams,
}: {
  searchParams: Promise<{ appealId?: string }>;
}) {
  const params = await searchParams;
  const appealId = params?.appealId;
  if (appealId) {
    redirect(
      `/app/tickets?expand=${encodeURIComponent(appealId)}&inputManual=1`,
    );
  }
  redirect("/app/tickets");
}
