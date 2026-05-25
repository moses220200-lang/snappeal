"use client";

/**
 * `/app/support` — customer-support chat surface.
 *
 * Replaces the retired Inbox tab in the bottom nav. Today the page is a
 * lightweight chat-style scaffold: a welcome card + a "send message"
 * action that opens the user's mail client with a pre-filled subject /
 * body addressed to support@parkingrabbit.com (the same address used in
 * `/app/profile/help`). When the team wires in a real chat provider
 * (Intercom / Crisp / etc.), the message-input row at the bottom is the
 * obvious mount point — drop the embed in there.
 */
import { MessageCircle, Sparkles } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";

const SUPPORT_EMAIL = "support@parkingrabbit.com";
const MAILTO = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
  "ParkingRabbit support",
)}&body=${encodeURIComponent("Hi ParkingRabbit team,\n\n")}`;

export default function SupportPage() {
  return (
    <>
      <AppHeader
        title="Support"
        subtitle="Chat to the ParkingRabbit team — we usually reply within a few hours."
      />
      <main className="px-5 pb-32 pt-1 flex flex-col gap-4">
        <section className="rounded-3xl bg-white border border-snappeal-border p-5 flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <span className="size-11 rounded-2xl bg-snappeal-primary-50 text-snappeal-primary flex items-center justify-center shrink-0">
              <Sparkles className="size-5" strokeWidth={2.25} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-bold text-snappeal-navy leading-tight">
                Talk to a human
              </p>
              <p className="text-[12.5px] text-snappeal-muted mt-1 leading-snug">
                Stuck on a ticket, payment, or appeal? Tell us what&apos;s
                going on and we&apos;ll come back with the next step.
              </p>
            </div>
          </div>
          <a
            href={MAILTO}
            className="mt-1 rounded-2xl bg-snappeal-primary text-white font-bold text-center py-3.5 hover:bg-snappeal-primary-600 transition shadow-lg shadow-snappeal-primary/30 inline-flex items-center justify-center gap-2"
          >
            <MessageCircle className="size-4" strokeWidth={2.25} />
            Start a conversation
          </a>
          <p className="text-[11px] text-snappeal-muted text-center">
            Replies usually within a few hours · Mon–Fri, 9–6 GMT
          </p>
        </section>

        {/* Chat-thread placeholder so the surface reads as a live chat
         *  instead of a contact form. The actual provider can plug in
         *  here later without restructuring the page. */}
        <section className="rounded-3xl bg-snappeal-bg/50 border border-dashed border-snappeal-border p-5 flex flex-col gap-3 min-h-[200px]">
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-snappeal-muted">
            Conversation
          </p>
          <div className="self-start max-w-[85%] rounded-2xl rounded-tl-md bg-white border border-snappeal-border px-4 py-3">
            <p className="text-[12.5px] font-bold text-snappeal-navy">
              ParkingRabbit
            </p>
            <p className="text-[12.5px] text-snappeal-navy/90 mt-0.5 leading-snug">
              Hi — tap <span className="font-semibold">Start a conversation</span>{" "}
              above to email our team. We&apos;ll be right with you.
            </p>
          </div>
        </section>

        <p className="text-[11px] text-snappeal-muted text-center">
          Or email us directly at{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="font-semibold text-snappeal-primary hover:underline"
          >
            {SUPPORT_EMAIL}
          </a>
        </p>
      </main>
    </>
  );
}
