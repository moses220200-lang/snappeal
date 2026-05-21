import { redirect } from "next/navigation";

/**
 * `/app/letter/<id>` used to render its own page with the AI-drafted letter
 * + the Submit button + the PaymentSheet. That UI now lives directly on the
 * ticket detail page (`/app/tickets/<id>`), so this route just bounces.
 *
 * Kept around for backward-compat with anything that still has the old
 * URL — paywall completion, push notifications, email links, etc.
 */
export default async function LetterRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/app/tickets/${id}`);
}
