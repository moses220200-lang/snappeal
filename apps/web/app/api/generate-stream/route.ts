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
import {
  createAppeal,
  getAppealById,
  attachDraftToAppeal,
  markAppealFailed,
} from "@/lib/server/appeals";
import { getViewer } from "@/lib/server/viewer";
import { GenerateRequest } from "@/lib/server/contracts";
import { generateSemaphore } from "@/lib/server/concurrency";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 180;

const Body = GenerateRequest.extend({ appealId: z.string().optional() });

function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch (err) {
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
        }
        send("appeal", { appealId });

        // Generate the full draft. We stream a synthetic "typing" effect
        // across the final letter body so the UI feels live even when the
        // underlying CLI call is one-shot. (Full token-stream pass-through
        // is a follow-up: switch to runAgentic with stream-json forwarding.)
        //
        // `confirmedTicket` MUST be forwarded — without it the drafter has
        // to re-OCR the PCN from scratch, which on real photos blows the
        // 120s CLI timeout (the streaming cutover originally dropped this
        // and silently failed every real-photo request).
        // The semaphore matches `/api/generate` so a burst of concurrent
        // SSE requests doesn't fork unbounded `claude` subprocesses.
        const release = await generateSemaphore.acquire();
        let draft;
        try {
          draft = await generateDraft({
            pcnPhotoDataUrl: body.pcnPhoto,
            evidencePhotoDataUrls: body.evidencePhotos,
            notes: body.notes,
            confirmedTicket: body.confirmedTicket,
          });
        } finally {
          release();
        }
        send("ticket", { ticket: draft.ticket });
        for (const g of draft.groundIds) send("ground", { groundId: g });

        // Persist now so the appeal page can fetch it concurrently.
        const persisted = await attachDraftToAppeal(appealId, draft);

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
        // Flag the row so a later visit to /app/letter/<id> can offer Retry
        // instead of polling forever on a null letterBody.
        if (appealId) {
          await markAppealFailed(appealId).catch(() => {});
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
