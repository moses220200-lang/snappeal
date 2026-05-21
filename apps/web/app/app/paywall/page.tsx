"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Sparkles } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { GeneratingOverlay, type GeneratingPhase } from "@/components/GeneratingOverlay";
import { AuthGate } from "@/components/AuthGate";
import {
  getOrCreateSessionId,
  getPcnPhoto,
  getEvidencePhotos,
  getCurrentAppealId,
  setCurrentAppealId,
  clearCaptureFlow,
} from "@/lib/client/session";
import { getAppeal } from "@/lib/client/draft";
import { consumeSSE } from "@/lib/client/sse";
import type { AppealRecord } from "@/lib/server/appeals";

/**
 * Pricing model:
 *
 *   - Drafting an appeal letter and saving it to the user's inbox = FREE,
 *     unlimited. No payment, no card.
 *   - £2.99 is charged only when the user opts to auto-submit the letter
 *     through the council's portal via the MCP agent. One-off per
 *     submission. (Future) the auto-submit toggle lives on the letter
 *     review screen, not before draft generation.
 */
export default function PaywallPage() {
  const router = useRouter();
  const [stage, setStage] = useState<"pay" | "generating" | "error">("pay");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [phase, setPhase] = useState<GeneratingPhase>("read");
  const [streamedLetter, setStreamedLetter] = useState("");
  const [letterHeader, setLetterHeader] = useState<{
    to: string;
    subject: string;
    date: string;
  } | null>(null);
  const sessionId = useMemo(() => getOrCreateSessionId(), []);

  // Buffered typewriter. Server emits the letter in ~80-char chunks with a
  // 30 ms delay — so a typical 1.5k-char letter dumps in < 1 s after a 30+
  // second wait, which feels anticlimactic. We collect chunks in a ref and
  // drain them into `streamedLetter` at a steady, friendlier pace (targeting
  // ~8–10 s of visible typing regardless of letter length).
  const bufferRef = useRef("");
  const drainTimerRef = useRef<number | null>(null);
  // setInterval (not self-recursive setTimeout) so the tick callback doesn't
  // have to reference itself — keeps the lint rule about temporal-dead-zone
  // closures happy without changing UX.
  const startDrain = useCallback(() => {
    if (drainTimerRef.current !== null) return;
    drainTimerRef.current = window.setInterval(() => {
      const remaining = bufferRef.current.length;
      if (remaining === 0) return;
      // Adaptive rate: drain over ~10 s of wall-clock (≈ 330 ticks at 30 ms),
      // with a 3-char-per-tick floor so even tiny buffers don't feel laggy.
      const take = Math.max(3, Math.ceil(remaining / 330));
      const slice = bufferRef.current.slice(0, take);
      bufferRef.current = bufferRef.current.slice(take);
      setStreamedLetter((s) => s + slice);
    }, 30);
  }, []);
  const stopDrain = useCallback(() => {
    if (drainTimerRef.current !== null) {
      window.clearInterval(drainTimerRef.current);
      drainTimerRef.current = null;
    }
  }, []);
  // Resolves once the buffer is fully drained — so we can wait before
  // redirecting to /app/letter instead of cutting the typing animation off.
  const waitForBufferDrain = useCallback(
    () =>
      new Promise<void>((resolve) => {
        const check = () => {
          if (bufferRef.current.length === 0) {
            resolve();
            return;
          }
          window.setTimeout(check, 60);
        };
        check();
      }),
    [],
  );

  const handleConfirmed = useCallback(
    async (paymentIntentId: string | null) => {
      setStage("generating");
      setStreamedLetter("");
      setLetterHeader(null);
      bufferRef.current = "";
      stopDrain();
      startDrain();
      try {
        const pcn = getPcnPhoto();
        const evidence = getEvidencePhotos();
        if (!pcn) throw new Error("No PCN photo captured. Please retake.");

        // Pull the canonical ticket / notes / grounds from the cloud appeal
        // row. Capture + notes pages have been PATCHing the draft incrementally
        // (lib/client/draft.ts), so the DB is the source of truth — we just
        // re-send the fields here so /api/generate-stream can hand them off
        // to generateDraft() inline (saves an extra DB round-trip on the
        // server). Photos still ride the body until Blob storage is wired.
        const appealId = getCurrentAppealId();
        let appeal: AppealRecord | null = null;
        if (appealId) {
          appeal = await getAppeal(appealId, { force: true }).catch(() => null);
        }
        const confirmedTicket = appeal?.ticket ?? null;
        const notes = appeal?.notes ?? "";

        // When the ticket was already extracted + confirmed on /app/capture,
        // generateDraft() skips the OCR pass entirely on the server. Reflect
        // that here by starting the overlay at the "draft" milestone — the
        // "Reading your PCN" + "Identifying grounds" steps already happened
        // upstream (capture page + notes page) and shouldn't pulse a second
        // time as if ParkingRabbit were doing them from scratch.
        const ticketComplete =
          !!confirmedTicket &&
          ["issuer", "pcnRef", "vehicleReg", "contraventionCode", "location", "issuedAt", "amountPence"]
            .every((k) => {
              const v = (confirmedTicket as unknown as Record<string, unknown>)[k];
              return v !== undefined && v !== null && v !== "";
            });
        setPhase(ticketComplete ? "draft" : "read");

        // Pre-seed the letter header when we already know the council and
        // PCN ref — no need to wait for the SSE `ticket` event to round-trip.
        if (ticketComplete && confirmedTicket) {
          setLetterHeader({
            to: String(confirmedTicket.issuer ?? "Your council"),
            subject: confirmedTicket.pcnRef
              ? `Representation against PCN #${String(confirmedTicket.pcnRef)}`
              : "Representation against your PCN",
            date: new Date().toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            }),
          });
        }

        // Stream the draft via SSE so the overlay can show the letter typing
        // in real time. The Claude call itself is one-shot — the chunks are
        // a deliberate UX flourish — but the `appeal`/`ticket`/`ground`
        // milestone events come back as soon as each step completes.
        const res = await fetch("/api/generate-stream", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-snappeal-session": sessionId,
          },
          body: JSON.stringify({
            sessionId,
            appealId: appealId ?? undefined,
            pcnPhoto: pcn,
            evidencePhotos: evidence,
            notes: notes || undefined,
            confirmedTicket:
              confirmedTicket && Object.keys(confirmedTicket).length > 0 ? confirmedTicket : undefined,
            paymentIntentId: paymentIntentId ?? undefined,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error?.message ?? `Generate failed (${res.status})`);
        }

        let resolvedAppealId: string | null = appealId ?? null;
        let streamError: string | null = null;

        await consumeSSE(res, (ev) => {
          switch (ev.event) {
            case "appeal": {
              // Fires immediately on connect — the appeal row was just inserted
              // (or echoed back if we supplied one). Stay on "read" so the
              // milestone ladder pulses honestly during the ~30s draft call,
              // instead of jumping to "ground" and looking frozen there.
              const d = ev.data as { appealId: string };
              resolvedAppealId = d.appealId;
              break;
            }
            case "ticket": {
              // Claude returned with the extracted PCN — moving on to grounds.
              // Compose an email-style header so the user sees a To/Subject/
              // Date frame the moment we know which council this is, well
              // before the body chunks start streaming.
              const d = ev.data as {
                ticket: { issuer?: string; pcnRef?: string } | null;
              };
              if (d.ticket) {
                setLetterHeader({
                  to: d.ticket.issuer ?? "Your council",
                  subject: d.ticket.pcnRef
                    ? `Representation against PCN #${d.ticket.pcnRef}`
                    : "Representation against your PCN",
                  date: new Date().toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  }),
                });
              }
              // Don't regress the milestone — if we already jumped to
              // "draft" because the ticket was pre-confirmed on /app/capture,
              // an arriving `ticket` SSE event shouldn't claw the ladder
              // back to "ground".
              setPhase((p) => (p === "draft" || p === "done" ? p : "ground"));
              break;
            }
            case "ground":
              // First ground id arrived — grounds picked, drafting next.
              setPhase((p) => (p === "done" ? p : "draft"));
              break;
            case "chunk": {
              const d = ev.data as { text: string };
              // Push into the typewriter buffer instead of the visible state
              // directly — the drain loop reveals chars at a friendlier pace.
              bufferRef.current += d.text;
              break;
            }
            case "done": {
              const d = ev.data as { appealId: string };
              resolvedAppealId = d.appealId;
              setPhase("done");
              break;
            }
            case "error": {
              const d = ev.data as { message?: string };
              streamError = d?.message ?? "Stream failed";
              break;
            }
          }
        });

        if (streamError) throw new Error(streamError);
        if (!resolvedAppealId) throw new Error("Stream ended without an appeal id");

        // Hold the redirect until the typewriter has finished revealing every
        // chunk we buffered — otherwise the overlay yanks away mid-sentence.
        await waitForBufferDrain();
        stopDrain();

        setCurrentAppealId(resolvedAppealId);
        clearCaptureFlow();
        router.replace(`/app/tickets/${resolvedAppealId}`);
      } catch (err) {
        stopDrain();
        setErrorMessage(err instanceof Error ? err.message : "Failed to draft your appeal");
        setStage("error");
      }
    },
    [router, sessionId, startDrain, stopDrain, waitForBufferDrain],
  );

  // Belt-and-braces cleanup if the user navigates away mid-stream.
  useEffect(() => stopDrain, [stopDrain]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const pi = url.searchParams.get("payment_intent");
    const redirectStatus = url.searchParams.get("redirect_status");
    if (pi && redirectStatus === "succeeded") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void handleConfirmed(pi);
    }
  }, [handleConfirmed]);

  const pricing = {
    amount: "Free",
    caption: "Drafting your appeal is free",
    title: "Draft your appeal — Free",
  };

  return (
    <>
      {stage === "generating" && (
        <GeneratingOverlay
          phase={phase}
          streamedText={streamedLetter}
          letterHeader={letterHeader}
        />
      )}
      <BackHeader title={pricing.title} subtitle="Step 3 of 4 · Confirm" back="/app/notes" />
      <div className="flex flex-col gap-5 px-5 pt-4 pb-6">

      <section className="rounded-3xl bg-white border border-snappeal-border p-6 text-center">
        <p className="text-xs uppercase tracking-wide text-snappeal-muted">{pricing.caption}</p>
        <p className="mt-2 text-5xl font-bold text-snappeal-navy tracking-tight">{pricing.amount}</p>
        <p className="mt-2 text-xs text-snappeal-muted leading-relaxed max-w-[300px] mx-auto">
          ParkingRabbit AI drafts your full grounds-based appeal and saves it to your inbox — at no cost. Pay only when you want us to auto-submit it through your council&apos;s portal (£2.99 per submission).
        </p>
      </section>

      <section className="rounded-2xl bg-white border border-snappeal-border p-5">
        <p className="text-sm font-bold text-snappeal-navy mb-3">What you get — free</p>
        <ul className="space-y-2.5">
          {[
            "AI-drafted appeal citing the right ground and contravention code",
            "Saved to your inbox — copy/paste or download as PDF",
            "Status timeline you can track in the Tickets tab",
            "Unlimited drafts, no card on file",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2.5">
              <CheckCircle2 className="size-4 text-snappeal-success flex-shrink-0 mt-0.5" />
              <span className="text-xs text-snappeal-navy leading-relaxed">{item}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 pt-3 border-t border-snappeal-border">
          <p className="text-[11px] text-snappeal-muted leading-relaxed">
            <span className="font-semibold text-snappeal-navy">Optional add-on:</span>{" "}
            <span className="font-semibold text-snappeal-primary">£2.99 per submission</span>{" "}
            to have ParkingRabbit&apos;s <span className="font-semibold">AI Auto-Submit Agent</span> file the letter through your council&apos;s portal for you. Pay only if and when you choose to use it — never charged for the draft.
          </p>
        </div>
      </section>

      {stage === "error" && errorMessage && (
        <div className="rounded-2xl bg-red-50 border border-red-200 p-4 text-sm text-red-900">
          <p className="font-semibold">We couldn&apos;t draft your appeal</p>
          <p className="mt-1 text-xs">{errorMessage}</p>
          <button
            type="button"
            onClick={() => setStage("pay")}
            className="mt-3 text-xs font-semibold text-red-900 underline underline-offset-2"
          >
            Try again
          </button>
        </div>
      )}

      <AuthGate
        title="Create your free ParkingRabbit account"
        subtitle="Drafting the appeal is free — we just need an account on file so your tickets and council replies stay tied to you."
        benefits={[
          "Free AI-drafted appeal — no card needed",
          "Sync your tickets across every device",
          "Inbox alerts when the council replies",
        ]}
      >
        <button
          type="button"
          onClick={() => void handleConfirmed(null)}
          className="rounded-2xl bg-snappeal-action text-white font-semibold py-4 flex items-center justify-center gap-2 shadow-lg shadow-snappeal-action/40 hover:bg-snappeal-action-600 transition"
        >
          <Sparkles className="size-5" />
          Draft my appeal — Free
        </button>
      </AuthGate>
      </div>
    </>
  );
}
