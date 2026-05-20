"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Clock, Scale, Sparkles } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { StripePaymentForm } from "@/components/StripePaymentForm";
import { FakePaymentButtons } from "@/components/FakePaymentButtons";
import { GeneratingOverlay, type GeneratingPhase } from "@/components/GeneratingOverlay";
import { AuthGate } from "@/components/AuthGate";
import {
  ServiceTier,
  getOrCreateSessionId,
  getPcnPhoto,
  getEvidencePhotos,
  getNotes,
  getConfirmedTicket,
  getServiceTier,
  setCurrentAppealId,
  clearCaptureFlow,
} from "@/lib/client/session";
import { consumeSSE } from "@/lib/client/sse";

const FAKE_PAYMENT = process.env.NEXT_PUBLIC_SNAPPEAL_FAKE_PAYMENT === "1";

/**
 * v0.1 paywall. Pricing tiers (set on the wizard's Service-Tier step):
 *
 *   - "buy_time"  → FREE — a fast holding challenge. Skips Stripe entirely.
 *   - "grounds"   → £2.99 — full AI-drafted representation.
 *   - "care_plan" → £9.99/mo subscription (coming soon — wizard nudges them
 *                   to "grounds" until billing is live).
 */
export default function PaywallPage() {
  const router = useRouter();
  const [stage, setStage] = useState<"pay" | "generating" | "error">("pay");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tier, setTier] = useState<ServiceTier>("grounds");
  const [phase, setPhase] = useState<GeneratingPhase>("read");
  const [streamedLetter, setStreamedLetter] = useState("");
  const sessionId = useMemo(() => getOrCreateSessionId(), []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTier(getServiceTier());
  }, []);

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

  const isFree = tier === "buy_time";
  const pricing = isFree
    ? { amount: "Free", caption: "No card needed", title: "Buy time — free holding challenge", icon: Clock }
    : { amount: "£2.99", caption: "One-off, non-refundable", title: "Full appeal — £2.99", icon: Scale };

  return (
    <>
      {stage === "generating" && (
        <GeneratingOverlay phase={phase} streamedText={streamedLetter} />
      )}
      <BackHeader title={pricing.title} subtitle={`Step 3 of 4 · ${isFree ? "Confirm" : "Pay"}`} back="/app/notes" />
      <div className="flex flex-col gap-5 px-5 pt-4 pb-6">

      <section className="rounded-3xl bg-white border border-snappeal-border p-6 text-center">
        <p className="text-xs uppercase tracking-wide text-snappeal-muted">{pricing.caption}</p>
        <p className="mt-2 text-5xl font-bold text-snappeal-navy tracking-tight">{pricing.amount}</p>
        <p className="mt-2 text-xs text-snappeal-muted leading-relaxed max-w-[280px] mx-auto">
          {isFree
            ? "Snappeal AI files a quick holding challenge with your council — protects your 14-day discount window while you decide."
            : "You're paying for the appeal we draft and submit, not for the outcome."}
        </p>
      </section>

      <section className="rounded-2xl bg-white border border-snappeal-border p-5">
        <p className="text-sm font-bold text-snappeal-navy mb-3">What&apos;s included</p>
        <ul className="space-y-2.5">
          {(isFree
            ? [
                "Brief holding challenge filed with your council",
                "Protects the £80 discount window if rejected",
                "You can upgrade to a full grounds-based appeal any time",
              ]
            : [
                "AI-drafted appeal citing the right ground and contravention code",
                "Submitted directly to your council's portal (or by email)",
                "Status timeline you can track in the Tickets tab",
                "Service-failure refund if our system doesn't deliver",
              ]
          ).map((item) => (
            <li key={item} className="flex items-start gap-2.5">
              <CheckCircle2 className="size-4 text-snappeal-success flex-shrink-0 mt-0.5" />
              <span className="text-xs text-snappeal-navy leading-relaxed">{item}</span>
            </li>
          ))}
        </ul>
        {!isFree && (
          <div className="mt-4 pt-3 border-t border-snappeal-border flex flex-col gap-2">
            <Link
              href="/app/notes"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.localStorage.setItem("snappeal.serviceTier", "buy_time");
                }
              }}
              className="inline-flex items-center gap-1 text-xs font-semibold text-snappeal-primary"
            >
              Just need a holding challenge? Switch to Buy Time (free) →
            </Link>
            <Link
              href="/app/profile#care-plan"
              className="rounded-xl bg-gradient-to-br from-snappeal-primary to-snappeal-primary-700 text-white p-3 flex items-start gap-3"
            >
              <Sparkles className="size-4 mt-0.5 flex-shrink-0" />
              <span className="flex-1 text-[11px] leading-relaxed">
                <span className="font-bold">Care Plan — £9.99/mo</span> · unlimited
                grounds-based appeals included. Worth it from your 4th PCN.
              </span>
            </Link>
          </div>
        )}
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
        subtitle={
          isFree
            ? "Even free Buy Time appeals need an account so we can track council replies and protect your discount window."
            : "We need an account on file before charging anything — it's how your tickets and council replies stay tied to you."
        }
        benefits={[
          isFree ? "Free Buy Time appeals — no card needed" : "Full grounds-based appeal — £2.99 one-off",
          "Sync your tickets across every device",
          "Inbox alerts when the council replies",
        ]}
      >
        {isFree ? (
          <button
            type="button"
            onClick={() => void handleConfirmed(null)}
            className="rounded-2xl bg-snappeal-action text-white font-semibold py-4 flex items-center justify-center gap-2 shadow-lg shadow-snappeal-action/40 hover:bg-snappeal-action-600 transition"
          >
            <Clock className="size-5" />
            Send my holding challenge — Free
          </button>
        ) : FAKE_PAYMENT ? (
          <FakePaymentButtons onSucceeded={(pi) => void handleConfirmed(pi)} />
        ) : (
          <StripePaymentForm
            sessionId={sessionId}
            returnUrl="/app/paywall"
            onSucceededInPlace={(pi) => void handleConfirmed(pi)}
          />
        )}
      </AuthGate>
      </div>
    </>
  );
}
