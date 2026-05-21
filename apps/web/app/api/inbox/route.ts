import { NextResponse } from "next/server";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/server/db/client";
import { listAppealsForViewer, DatabaseNotConfiguredError } from "@/lib/server/appeals";
import { jsonError } from "@/lib/server/contracts";
import { getViewer } from "@/lib/server/viewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/inbox?sessionId=...
 *
 * Aggregates every conversation thread the viewer can see — one thread per
 * appeal, each with:
 *   - the outbound letter (synthesised from `appeals.letterBody`)
 *   - every submission record (sent timestamp + reference)
 *   - every inbound message (council replies, parsed by /api/inbound)
 *
 * The frontend renders this as a chat-style timeline.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json(jsonError("BAD_REQUEST", "Missing sessionId"), { status: 400 });
  }

  try {
    const viewer = await getViewer();
    const appeals = await listAppealsForViewer({ sessionId, userId: viewer.userId });
    if (appeals.length === 0) return NextResponse.json({ threads: [] });

    const ids = appeals.map((a) => a.id);
    const db = getDb();
    if (!db) throw new DatabaseNotConfiguredError();

    const [submissions, inbounds] = await Promise.all([
      db.select().from(schema.submissions).where(inArray(schema.submissions.appealId, ids)).orderBy(desc(schema.submissions.createdAt)),
      db.select().from(schema.inboundMessages).where(
        and(
          ids.length === 1
            ? eq(schema.inboundMessages.appealId, ids[0])
            : or(...ids.map((id) => eq(schema.inboundMessages.appealId, id)))!,
        ),
      ).orderBy(desc(schema.inboundMessages.receivedAt)),
    ]);

    const threads = appeals
      // Filter out drafts with no events so the inbox never shows empty noise.
      .filter((appeal) => {
        const hasLetter = Boolean(appeal.letterBody);
        const hasSub = submissions.some((s) => s.appealId === appeal.id);
        const hasInbound = inbounds.some((m) => m.appealId === appeal.id);
        return hasLetter || hasSub || hasInbound;
      })
      .map((appeal) => {
      const subs = submissions.filter((s) => s.appealId === appeal.id);
      const ins = inbounds.filter((m) => m.appealId === appeal.id);
      const events: Array<{
        id: string;
        type: "draft" | "sent" | "received";
        at: string;
        from: string;
        to: string;
        subject: string;
        body: string;
        meta?: Record<string, unknown>;
      }> = [];

      if (appeal.letterBody) {
        events.push({
          id: `${appeal.id}-draft`,
          type: "draft",
          at: appeal.updatedAt,
          from: appeal.replyEmail ?? "you@parkingrabbit.com",
          to: appeal.letterAddressedTo ?? appeal.ticket?.issuer ?? "Council",
          subject: appeal.letterSubject ?? "Representation",
          body: appeal.letterBody,
        });
      }

      for (const s of subs) {
        events.push({
          id: s.id,
          type: "sent",
          at: (s.submittedAt ?? s.createdAt).toISOString(),
          from: appeal.replyEmail ?? "you@parkingrabbit.com",
          to: appeal.letterAddressedTo ?? appeal.ticket?.issuer ?? "Council",
          subject: appeal.letterSubject ?? "Representation",
          body: `Submitted via ${s.channel}${s.councilReference ? ` · ref ${s.councilReference}` : ""}`,
          meta: { method: s.method, status: s.status, councilReference: s.councilReference, screenshotUrl: s.screenshotUrl },
        });
      }

      for (const m of ins) {
        events.push({
          id: m.id,
          type: "received",
          at: m.receivedAt.toISOString(),
          from: m.fromAddr,
          to: m.toAddr,
          subject: m.subject ?? "(no subject)",
          body: m.bodyText ?? "",
          meta: { classification: m.classification },
        });
      }

      events.sort((a, b) => a.at.localeCompare(b.at));
      // Lightweight AI triage: a one-line summary derived from the latest event.
      // Picks the council's latest reply if present, otherwise our latest send.
      const last = events[events.length - 1];
      const summary = (() => {
        if (!last) return null;
        if (last.type === "received") {
          const cls = String(last.meta?.classification ?? "");
          if (cls === "cancelled") return "🎉 Council cancelled the PCN";
          if (cls === "rejected") return "Council rejected — review options";
          if (cls === "acknowledged") return "Council acknowledged receipt — awaiting decision";
          if (cls === "request") return "Council wants more info — reply needed";
          return "New council reply — open to read";
        }
        if (last.type === "sent") return `Submitted via ${last.meta?.method ?? "portal"}`;
        if (last.type === "draft") return "Draft ready — awaiting submission";
        return null;
      })();
      return {
        appealId: appeal.id,
        pcnRef: appeal.ticket?.pcnRef ?? null,
        council: appeal.ticket?.issuer ?? null,
        status: appeal.status,
        events,
        summary,
      };
    });

    return NextResponse.json({ threads });
  } catch (err) {
    if (err instanceof DatabaseNotConfiguredError) {
      return NextResponse.json(jsonError("DATABASE_NOT_CONFIGURED", err.message), { status: 503 });
    }
    return NextResponse.json(
      jsonError("INTERNAL", err instanceof Error ? err.message : "Failed to load inbox"),
      { status: 500 },
    );
  }
}
