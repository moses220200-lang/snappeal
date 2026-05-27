/**
 * POST /api/generate-stream
 *
 * Server-Sent-Event variant of /api/generate. Streams Claude CLI partial
 * messages as they arrive so the Letter page can render the appeal letter
 * word-by-word — turning the 30-second wait into magic.
 *
 * Wire format (each event is JSON on its own SSE message):
 *   event: chunk    — { text: string }           # appended letter body
 *   event: ticket   — { ticket: Ticket }         # extracted ticket
 *   event: ground   — { groundId: string }       # identified ground
 *   event: done     — { appealId, letter, model } # final commit
 *   event: error    — { message }
 *
 * Client should EventSource() to this endpoint with the payload encoded as
 * a JSON-stringified body POST. We use a POST + ReadableStream rather than
 * GET + EventSource because GET URLs can't carry the image payload.
 */
import { generateDraft } from "@/lib/server/ai";
import { recordAiCall, classifyAiError } from "@/lib/server/aiCalls";
import {
  createAppeal,
  getAppealById,
  attachDraftToAppeal,
  markAppealFailed,
  setProcessingStep,
} from "@/lib/server/appeals";
import { getViewer } from "@/lib/server/viewer";
import { GenerateRequest } from "@/lib/server/contracts";
import { generateSemaphore } from "@/lib/server/concurrency";
import { getCardById } from "@/lib/grounds-catalog";
import { loadKnowledgePack } from "@/lib/server/knowledge";
import { z } from "zod";

export const runtime = "nodejs";
// v0.3.7 — bumped from 180s. The drafting CLI call uses ~200s on the
// slow tail (large prompt + KB pack + photos), and the SSE stream then
// chunks the letter at ~30ms per 80 chars. 240s gives the route a
// generous ~40s tail-buffer over the CLI timeout.
export const maxDuration = 240;

const Body = GenerateRequest.extend({ appealId: z.string().optional() });

function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: Request) {
  // Parse raw JSON first so we can flag the appeal row even when the
  // strict Zod parse rejects the payload — without this, the client's
  // 3s polling loop spins for 3 minutes on a request that already 400'd
  // (a fire-and-forget `void fetch` swallows the response). Flagging
  // the row flips it to `step="generation_failed"` so the card can
  // surface a Retry CTA on the next poll tick.
  const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const rawAppealId = typeof raw.appealId === "string" ? raw.appealId : undefined;

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(raw);
  } catch (err) {
    console.error(
      `[generate-stream] invalid body for appeal=${rawAppealId ?? "<unknown>"}:`,
      err instanceof Error ? err.message : err,
    );
    if (rawAppealId)
      await markAppealFailed(
        rawAppealId,
        `Invalid body: ${err instanceof Error ? err.message : String(err)}`,
      ).catch(() => {});
    return new Response(
      sseFrame("error", { message: `Invalid body: ${String(err)}` }),
      { status: 400, headers: { "content-type": "text/event-stream" } },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sseFrame(event, data)));
      };

      // Hoisted so the catch can flag the row if generation throws mid-flight.
      let appealId: string | undefined = body.appealId;

      try {
        if (!appealId) {
          const viewer = await getViewer();
          const created = await createAppeal({
            sessionId: body.sessionId,
            userId: viewer.userId,
            notes: body.notes ?? null,
          });
          appealId = created.id;
        } else {
          const existing = await getAppealById(appealId);
          if (!existing) {
            send("error", { message: `Appeal ${appealId} not found` });
            controller.close();
            return;
          }
          // v0.3.7 — in-flight guard. The draft-kickoff useEffect in
          // TicketCard.tsx is mount-scoped, so a back-nav / refresh /
          // route swap during the ~30-200s drafting window can fire
          // /api/generate-stream a second time against the same
          // appeal id. Without this guard, two concurrent Claude
          // subprocesses race and `attachDraftToAppeal` is
          // last-writer-wins. The processing.draft.status field
          // already exists in the schema; we set it to "running" on
          // entry and short-circuit on duplicates whose marker isn't
          // stale. `appeal.updatedAt` (bumped by setProcessingStep)
          // is the proxy timestamp for staleness — `completedAt` is
          // only set on done/failed.
          const RUNNING_TTL_MS = 240_000; // matches route maxDuration
          const draftStatus = existing.processing?.draft?.status;
          const updatedAt = existing.updatedAt
            ? new Date(existing.updatedAt as unknown as string | Date)
            : null;
          const rowAgeMs =
            updatedAt && !Number.isNaN(updatedAt.getTime())
              ? Date.now() - updatedAt.getTime()
              : Number.POSITIVE_INFINITY;
          if (
            draftStatus === "running" &&
            rowAgeMs < RUNNING_TTL_MS &&
            !existing.letterBody
          ) {
            send("error", {
              message:
                "Drafting already in flight for this appeal; not starting a duplicate.",
            });
            controller.close();
            return;
          }
          // Claim the lane (also bumps updatedAt as our in-flight timestamp).
          await setProcessingStep(appealId, "draft", "running").catch(() => {});
        }
        send("appeal", { appealId });

        // Pull the freshest appeal row so the drafter sees the latest
        // notes, grounds, portal lookup, etc. — these may have been
        // PATCHed in moments before the SSE request arrived.
        const appealRow = await getAppealById(appealId);

        // Resolve the user's selected card IDs to rich objects (label,
        // promptHook, weight) the drafter can stitch into the letter.
        const selectedCards = (appealRow?.grounds ?? [])
          .map((id) => getCardById(id))
          .filter((c): c is NonNullable<ReturnType<typeof getCardById>> => !!c)
          .map((c) => ({
            id: c.id,
            label: c.label,
            promptHook: c.promptHook,
            weight: c.weight,
          }));

        // Load the markdown knowledge pack — precedents + code briefs +
        // council brief filtered by the user's actual context. The
        // contravention code comes from the portal lookup when verified
        // (more authoritative), otherwise from OCR.
        const knowledgePack = await loadKnowledgePack({
          groundIds: appealRow?.grounds ?? [],
          contraventionCode:
            appealRow?.portalLookup?.metadata?.contraventionCode ??
            appealRow?.ticket?.contraventionCode,
          councilSlug:
            appealRow?.councilSlug ?? appealRow?.ticket?.councilSlug ?? undefined,
        });

        // Generate the full draft. We stream a synthetic "typing" effect
        // across the final letter body so the UI feels live even when the
        // underlying CLI call is one-shot. (Full token-stream pass-through
        // is a follow-up: switch to runAgentic with stream-json forwarding.)
        //
        // `confirmedTicket` matters for cost + latency: when complete, the
        // drafter skips a re-OCR pass that otherwise blows the 120s CLI
        // timeout. On the ticket-detail "Start drafting" path the client
        // doesn't send one (no fresh /app/capture session), so we fall
        // back to whatever the appeal row already has on file.
        // The semaphore matches `/api/generate` so a burst of concurrent
        // SSE requests doesn't fork unbounded `claude` subprocesses.
        const confirmedTicket = body.confirmedTicket ?? appealRow?.ticket ?? undefined;
        const release = await generateSemaphore.acquire();
        let draft;
        const draftStart = Date.now();
        try {
          draft = await generateDraft({
            pcnPhotoDataUrl: body.pcnPhoto,
            evidencePhotoDataUrls: body.evidencePhotos,
            notes: appealRow?.notes ?? body.notes,
            confirmedTicket,
            selectedCards,
            portalMetadata: appealRow?.portalLookup?.metadata,
            knowledgePack,
          });
          void recordAiCall({
            appealId,
            stage: "draft",
            model: draft.modelUsed,
            costUsd: draft.costUsd,
            durationMs: Date.now() - draftStart,
            ok: true,
          });
        } catch (err) {
          void recordAiCall({
            appealId,
            stage: "draft",
            model: "(failed-before-response)",
            costUsd: null,
            durationMs: Date.now() - draftStart,
            ok: false,
            errorKind: classifyAiError(err),
            errorMessage: err instanceof Error ? err.message : String(err),
          });
          throw err;
        } finally {
          release();
        }
        send("ticket", { ticket: draft.ticket });
        for (const g of draft.groundIds) send("ground", { groundId: g });
        send("strength", { strength: draft.strength });

        // Persist now so the appeal page can fetch it concurrently.
        const persisted = await attachDraftToAppeal(appealId, draft, {
          usedIds: knowledgePack.usedIds,
          tokens: knowledgePack.approxTokens,
        });
        // v0.3.7 — clear the in-flight marker. Without this the
        // running-status marker survives the successful drafting run
        // and a future legitimate generate-stream (e.g. after a user
        // taps "redraft with evidence") would be incorrectly rejected
        // as a duplicate. attachDraftToAppeal doesn't touch
        // `processing` itself; this is the explicit handoff.
        await setProcessingStep(appealId, "draft", "done").catch(() => {});

        // Stream the letter in 80-char chunks with a tiny delay so the UI
        // gets a visible typing animation.
        const body_ = persisted.letterBody ?? "";
        const CHUNK = 80;
        for (let i = 0; i < body_.length; i += CHUNK) {
          send("chunk", { text: body_.slice(i, i + CHUNK) });
          await new Promise((r) => setTimeout(r, 30));
        }

        send("done", {
          appealId,
          letter: {
            subject: persisted.letterSubject,
            body: persisted.letterBody,
            wordCount: persisted.letterWordCount,
            addressedTo: persisted.letterAddressedTo,
          },
          modelUsed: draft.modelUsed,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "stream failed";
        // Surface the actual error in the server console — the client
        // uses a fire-and-forget `void fetch` and never reads the SSE
        // body, so without this log a "Drafting hit a snag" symptom is
        // invisible to anyone debugging. The full Error stack is most
        // useful — include it when available.
        console.error(
          `[generate-stream] drafting failed for appeal=${appealId ?? "<unknown>"}:`,
          err instanceof Error ? err.stack ?? err.message : err,
        );
        // Flag the row so a later visit to /app/letter/<id> can offer Retry
        // instead of polling forever on a null letterBody.
        if (appealId) {
          await markAppealFailed(appealId, message).catch(() => {});
        }
        send("error", { message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
