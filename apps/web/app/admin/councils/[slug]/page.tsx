import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/server/db/client";
import { CouncilForm } from "@/components/CouncilForm";

export const dynamic = "force-dynamic";

export default async function EditCouncilPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const db = getDb();
  if (!db) notFound();
  const rows = await db.select().from(schema.councils).where(eq(schema.councils.slug, slug));
  const c = rows[0];
  if (!c) notFound();

  return (
    <CouncilForm
      mode="edit"
      initial={{
        slug: c.slug,
        name: c.name,
        type: c.type,
        appealPortalUrl: c.appealPortalUrl,
        appealEmail: c.appealEmail,
        postalAddress: c.postalAddress,
        submissionMethods: (c.submissionMethods as string[]) ?? [],
        identifierHints: (c.identifierHints as string[]) ?? [],
        pcnRefPattern: c.pcnRefPattern,
        automationStatus: c.automationStatus,
        notes: c.notes,
      }}
    />
  );
}
