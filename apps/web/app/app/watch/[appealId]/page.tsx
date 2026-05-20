/**
 * /app/watch/[appealId] — convenience redirect.
 *
 * Looks up the latest `submit_appeal` job for the given appeal and forwards
 * the user to /app/submitting/<jobId> so the ticket card doesn't have to
 * carry the job id directly. If no job exists yet, falls back to the ticket
 * detail page (the customer hasn't submitted yet).
 */
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/server/db/client";

export const dynamic = "force-dynamic";

export default async function WatchAppealPage({
  params,
}: {
  params: Promise<{ appealId: string }>;
}) {
  const { appealId } = await params;
  const db = getDb();
  if (db) {
    const rows = await db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(eq(schema.jobs.appealId, appealId))
      .orderBy(desc(schema.jobs.createdAt))
      .limit(1);
    if (rows[0]) redirect(`/app/submitting/${rows[0].id}`);
  }
  redirect(`/app/tickets/${appealId}`);
}
