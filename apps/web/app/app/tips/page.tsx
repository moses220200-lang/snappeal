import Link from "next/link";
import {
  Calendar,
  Camera,
  CheckCircle2,
  ChevronRight,
  FileText,
  Lightbulb,
  ShieldAlert,
} from "lucide-react";
import { BackHeader } from "@/components/BackHeader";

type Tip = {
  icon: typeof Lightbulb;
  title: string;
  body: string;
  cta: string;
  href: string;
  tone: "blue" | "green" | "amber";
};

const TONE = {
  blue: {
    bg: "bg-snappeal-primary-100",
    text: "text-snappeal-primary",
    badge: "bg-snappeal-primary text-white",
  },
  green: {
    bg: "bg-green-100",
    text: "text-green-700",
    badge: "bg-green-600 text-white",
  },
  amber: {
    bg: "bg-amber-100",
    text: "text-amber-700",
    badge: "bg-amber-600 text-white",
  },
} as const;

const FEATURED: Tip = {
  icon: Calendar,
  title: "Appeal within 14 days",
  body: "Submitting your appeal inside the discount window pauses the clock — you keep the 50% reduction even if the council rejects it.",
  cta: "Why 14 days matters",
  href: "#tips/14-days",
  tone: "green",
};

const SECTIONS: { heading: string; tips: Tip[] }[] = [
  {
    heading: "Before you photograph",
    tips: [
      {
        icon: Camera,
        title: "Wide first, then close",
        body: "A wide shot establishes context (the street, the signs, the car in situ). Close shots prove specific claims (faded markings, hidden signs).",
        cta: "Evidence guide",
        href: "#tips/photos",
        tone: "blue",
      },
      {
        icon: ShieldAlert,
        title: "Photograph what's missing",
        body: "A missing sign or a hidden one is worth more than a present one. If a sign is behind a tree, photograph the tree.",
        cta: "Read more",
        href: "#tips/missing-signs",
        tone: "amber",
      },
    ],
  },
  {
    heading: "Writing the note",
    tips: [
      {
        icon: FileText,
        title: "One honest sentence beats a paragraph",
        body: "Write what actually happened — calmly, briefly, in your own words. The AI will turn it into a formal appeal.",
        cta: "Examples",
        href: "#tips/notes",
        tone: "blue",
      },
      {
        icon: CheckCircle2,
        title: "Don't invent context",
        body: "If your evidence doesn't support the appeal, no AI letter — and no human solicitor — will make it true. Honest appeals win more often.",
        cta: "Our honesty rule",
        href: "#tips/honesty",
        tone: "green",
      },
    ],
  },
  {
    heading: "Common grounds",
    tips: [
      {
        icon: Lightbulb,
        title: "Signage was unclear, obscured, or absent",
        body: "The single most common winning ground. Photograph trees, scaffolding, vehicles, anything blocking the signs.",
        cta: "Signage guide",
        href: "#tips/signage",
        tone: "blue",
      },
      {
        icon: Lightbulb,
        title: "Actively loading or unloading",
        body: "Continuous activity is required — not just stopping with the engine running. Watch the wording on the PCN.",
        cta: "Loading rules",
        href: "#tips/loading",
        tone: "amber",
      },
      {
        icon: Lightbulb,
        title: "Valid Blue Badge displayed correctly",
        body: "The clock must be set correctly. The badge must be visible from outside the car. A slipped badge has cancelled many a PCN.",
        cta: "Blue Badge guide",
        href: "#tips/blue-badge",
        tone: "blue",
      },
    ],
  },
];

export default function TipsPage() {
  const featuredTone = TONE[FEATURED.tone];
  return (
    <>
      <BackHeader
        title="Tips"
        subtitle="Plain-English advice to make your appeal stronger"
        back="/app"
      />
      <div className="flex flex-col gap-5 px-5 pt-4 pb-6 snappeal-content-top">

      {/* Featured tip — the 14-day rule */}
      <Link
        href={FEATURED.href}
        className={`block rounded-2xl ${featuredTone.bg} p-5 hover:opacity-90 transition`}
      >
        <div className="flex items-start gap-3">
          <span
            className={`size-11 rounded-2xl ${featuredTone.badge} flex items-center justify-center flex-shrink-0`}
          >
            <FEATURED.icon className="size-5" />
          </span>
          <div className="flex-1">
            <p className="text-xs uppercase tracking-wide font-semibold text-snappeal-navy/60">
              Featured tip
            </p>
            <h2 className="text-lg font-bold text-snappeal-navy mt-0.5">
              {FEATURED.title}
            </h2>
            <p className="text-sm text-snappeal-navy/85 mt-2 leading-relaxed">
              {FEATURED.body}
            </p>
            <span
              className={`inline-flex items-center gap-1 mt-3 text-sm font-semibold ${featuredTone.text}`}
            >
              {FEATURED.cta}
              <ChevronRight className="size-4" />
            </span>
          </div>
        </div>
      </Link>

      {SECTIONS.map((section) => (
        <section key={section.heading}>
          <p className="text-xs font-semibold uppercase tracking-wide text-snappeal-muted mb-2">
            {section.heading}
          </p>
          <div className="flex flex-col gap-2.5">
            {section.tips.map((tip) => {
              const tone = TONE[tip.tone];
              return (
                <Link
                  key={tip.title}
                  href={tip.href}
                  className="rounded-2xl bg-white border border-snappeal-border p-4 flex items-start gap-3 hover:border-snappeal-primary transition"
                >
                  <span
                    className={`size-10 rounded-xl ${tone.bg} ${tone.text} flex items-center justify-center flex-shrink-0`}
                  >
                    <tip.icon className="size-[1.125rem]" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-snappeal-navy">
                      {tip.title}
                    </p>
                    <p className="text-xs text-snappeal-muted mt-1 leading-relaxed">
                      {tip.body}
                    </p>
                  </div>
                  <ChevronRight className="size-4 text-snappeal-muted flex-shrink-0 self-center" />
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      <div className="text-[11px] text-snappeal-muted text-center pt-2 pb-4 leading-relaxed">
        Tips are drawn from the public wiki at{" "}
        <Link href="/wiki/users/" className="text-snappeal-primary font-semibold">
          parkingrabbit.com/wiki/users
        </Link>{" "}
        — keep it open for the deep-dive.
      </div>
      </div>
    </>
  );
}
