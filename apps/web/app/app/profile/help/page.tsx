"use client";

import { ExternalLink, Mail } from "lucide-react";
import { ProfileSubPage } from "@/components/ProfileSubPage";

const FAQ = [
  {
    q: "What's the difference between Buy Time and a full appeal?",
    a: "Buy Time files a quick free holding challenge — enough to protect the 14-day £80 discount window while you decide. A full appeal (£2.99) is the proper grounds-based case, drafted by ParkingRabbit AI and submitted to the council on your behalf.",
  },
  {
    q: "What happens after I submit?",
    a: "We submit your appeal to the council's official portal (or by email if they don't accept portal submissions). The council typically responds within 28–56 days. ParkingRabbit parses every reply and pings you when the decision lands.",
  },
  {
    q: "What if the council rejects my appeal?",
    a: "You can escalate to the Traffic Penalty Tribunal (free for the motorist). The ParkingRabbit letter we drafted is suitable for tribunal review. We don't currently file the tribunal appeal for you — that's on the roadmap.",
  },
  {
    q: "Is the £2.99 refundable?",
    a: "Not based on outcome — you're paying for the work, not for winning. We do offer a service-failure refund if ParkingRabbit's system fails to deliver the appeal to the council.",
  },
  {
    q: "How is my data protected?",
    a: "Photos are stored encrypted, processed once, then automatically deleted after 90 days. We never sell data. See the full privacy policy below.",
  },
  {
    q: "Can I edit the letter before it's sent?",
    a: "Yes — every drafted letter is shown to you on the Letter screen before submission. Copy / share / refine.",
  },
];

export default function HelpPage() {
  return (
    <ProfileSubPage title="Help & Support" subtitle="FAQ and how to reach us.">
      <ul className="flex flex-col gap-2.5">
        {FAQ.map((item) => (
          <li key={item.q} className="rounded-2xl bg-white border border-parkingrabbit-border p-4">
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-parkingrabbit-navy list-none flex items-center justify-between gap-2">
                {item.q}
                <span className="text-parkingrabbit-primary text-xs">tap</span>
              </summary>
              <p className="mt-2 text-xs text-parkingrabbit-muted leading-relaxed">{item.a}</p>
            </details>
          </li>
        ))}
      </ul>

      <section className="rounded-2xl bg-white border border-parkingrabbit-border p-5 flex flex-col gap-3">
        <p className="text-sm font-bold text-parkingrabbit-navy">Still stuck?</p>
        <a
          href="mailto:support@parkingrabbit.com"
          className="rounded-xl bg-parkingrabbit-primary-50 border border-parkingrabbit-primary-100 px-4 py-3 flex items-center gap-3 text-sm text-parkingrabbit-navy"
        >
          <span className="size-9 rounded-xl bg-white text-parkingrabbit-primary flex items-center justify-center">
            <Mail className="size-[1.125rem]" />
          </span>
          <span className="flex-1">
            <span className="block font-semibold">Email support</span>
            <span className="block text-xs text-parkingrabbit-muted">support@parkingrabbit.com · replies within 24h</span>
          </span>
          <ExternalLink className="size-4 text-parkingrabbit-muted" />
        </a>
      </section>
    </ProfileSubPage>
  );
}
