"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Sparkles } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { GeneratingOverlay, type GeneratingPhase } from "@/components/GeneratingOverlay";
import { AuthGate } from "@/components/AuthGate";
import {
  getOrCreateSessionId,
  getPcnPhoto,
  getEvidencePhotos,
  getNotes,
  getConfirmedTicket,
  setCurrentAppealId,
  clearCaptureFlow,
} from "@/lib/client/session";
import { consumeSSE } from "@/lib/client/sse";

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
  const sessionId = useMemo(() => getOrCreateSessionId(), []);

  const handleConfirmed = useCallback(
    async (paymentIntentId: string | null) => {
      setStage("generating");
      setPhase("read");
      setStreamedLetter("");
      try {
        const pcn = getPcnPhoto();
        const notes = getNotes();
        const evidence = getEvidencePhotos();
        const confirmedTicket = getConfirmedTicket();
        if (!pcn) throw new Error("No PCN photo captured. Please retake.");

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

        let appealId: string | null = null;
        let letterSoFar = "";
        let streamError: string | null = null;

        await consumeSSE(res, (ev) => {
          switch (ev.event) {
            case "appeal": {
              // Fires immediately on connect — the appeal row was just inserted
              // but Claude hasn't been called yet. Stay on "read" so the
              // milestone ladder pulses honestly during the ~30s draft call,
              // instead of jumping to "ground" and looking frozen there.
              const d = ev.data as { appealId: string };
              appealId = d.appealId;
              break;
            }
            case "ticket":
              // Claude returned with the extracted PCN — moving on to grounds.
              setPhase("ground");
              break;
            case "ground":
              // First ground id arrived — grounds picked, drafting next.
              setPhase("draft");
              break;
            case "chunk": {
              const d = ev.data as { text: string };
              letterSoFar += d.text;
              setStreamedLetter(letterSoFar);
              break;
            }
            case "done": {
              const d = ev.data as { appealId: string };
              appealId = d.appealId;
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
        if (!appealId) throw new Error("Stream ended without an appeal id");

        setCurrentAppealId(appealId);
        clearCaptureFlow();
        router.replace(`/app/letter/${appealId}`);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "Failed to draft your appeal");
        setStage("error");
      }
    },
    [router, sessionId],
  );

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
        <GeneratingOverlay phase={phase} streamedText={streamedLetter} />
      )}
      <BackHeader title={pricing.title} subtitle="Step 3 of 4 · Confirm" back="/app/notes" />
      <div className="flex flex-col gap-5 px-5 pt-4 pb-6">

      <section className="rounded-3xl bg-white border border-snappeal-border p-6 text-center">
        <p className="text-xs uppercase tracking-wide text-snappeal-muted">{pricing.caption}</p>
        <p className="mt-2 text-5xl font-bold text-snappeal-navy tracking-tight">{pricing.amount}</p>
        <p className="mt-2 text-xs text-snappeal-muted leading-relaxed max-w-[300px] mx-auto">
          Snappeal AI drafts your full grounds-based appeal and saves it to your inbox — at no cost. Pay only when you want us to auto-submit it through your council&apos;s portal (£2.99 per submission).
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
            to have Snappeal&apos;s MCP agent auto-submit the letter through your council&apos;s portal. Pay only if and when you choose to use it — never charged for the draft.
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
        title="Create your free Snappeal account"
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
