/**
 * `/app/tickets/[id]` — back-compat redirect.
 *
 * The detail page is gone. The smart `<TicketCard>` is the only
 * surface for a ticket and lives on `/app/tickets` (auto-expanded via
 * the `?expand=<id>` query param). All existing deep links — push
 * notifications, payment-sheet return URLs, evidence/letter redirects,
 * inbox links — pass through here untouched.
 */
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function TicketDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/app/tickets?expand=${encodeURIComponent(id)}`);
}
