import Link from "next/link";
import {
  ChevronRight,
  CreditCard,
  Lock,
  Mail,
  ScrollText,
  Settings,
  ShieldQuestion,
} from "lucide-react";

const SECTIONS = [
  {
    title: "Account",
    rows: [
      {
        icon: Mail,
        label: "Email for receipts",
        body: "Add an email so we can send your receipt and council updates.",
        cta: "Add",
        href: "#email",
      },
      {
        icon: CreditCard,
        label: "Payment methods",
        body: "Apple Pay and Google Pay work automatically. No card stored.",
        cta: "View",
        href: "#payments",
      },
    ],
  },
  {
    title: "Help",
    rows: [
      {
        icon: ShieldQuestion,
        label: "How appeals work",
        body: "Plain-English guide to the four-stage appeal process.",
        cta: "Read",
        href: "#help",
      },
      {
        icon: ScrollText,
        label: "Pricing",
        body: "£2.99 per appeal, non-refundable. Service-failure refunds explained.",
        cta: "Read",
        href: "#pricing",
      },
    ],
  },
  {
    title: "Privacy & legal",
    rows: [
      {
        icon: Lock,
        label: "Privacy policy",
        body: "What we collect, how long we keep it, when we delete it.",
        cta: "Read",
        href: "/privacy",
      },
      {
        icon: ScrollText,
        label: "Terms of service",
        body: "What Snappeal is, what it isn't, the service-quality remedy.",
        cta: "Read",
        href: "/terms",
      },
      {
        icon: Settings,
        label: "Delete my data",
        body: "Remove your appeals and photos from this device and our servers.",
        cta: "Manage",
        href: "#dsar",
      },
    ],
  },
];

export default function ProfilePage() {
  return (
    <div className="flex flex-col gap-6 pt-6 px-5">
      <header>
        <h1 className="text-2xl font-bold text-snappeal-navy">Profile</h1>
        <p className="text-sm text-snappeal-muted mt-0.5">
          Settings, help, and privacy. Snappeal v0.1 — no account needed yet.
        </p>
      </header>

      <div className="rounded-2xl bg-snappeal-primary-100 p-4">
        <p className="text-xs font-bold text-snappeal-primary-700 uppercase tracking-wide">
          Anonymous mode
        </p>
        <p className="text-xs text-snappeal-navy mt-1 leading-relaxed">
          Your appeals are stored on this device only. Sign-in (with
          cross-device sync) lands in v0.2.
        </p>
      </div>

      {SECTIONS.map((section) => (
        <section key={section.title}>
          <p className="text-xs font-semibold uppercase tracking-wide text-snappeal-muted mb-2">
            {section.title}
          </p>
          <ul className="rounded-2xl bg-white border border-snappeal-border overflow-hidden divide-y divide-snappeal-border">
            {section.rows.map(({ icon: Icon, label, body, cta, href }) => (
              <li key={label}>
                <Link
                  href={href}
                  className="flex items-start gap-3 p-4 hover:bg-snappeal-bg/50"
                >
                  <span className="size-9 rounded-xl bg-snappeal-primary-100 text-snappeal-primary flex items-center justify-center flex-shrink-0">
                    <Icon className="size-[1.125rem]" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-snappeal-navy">
                      {label}
                    </p>
                    <p className="text-xs text-snappeal-muted mt-0.5 leading-relaxed">
                      {body}
                    </p>
                  </div>
                  <span className="flex items-center gap-1 text-xs font-semibold text-snappeal-primary flex-shrink-0">
                    {cta}
                    <ChevronRight className="size-3.5" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <div className="text-center text-[11px] text-snappeal-muted py-4">
        Snappeal v0.1 · mock data prototype · © 2026
      </div>
    </div>
  );
}
