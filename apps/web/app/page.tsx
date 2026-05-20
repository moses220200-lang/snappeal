import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  Lock,
  MapPin,
  PoundSterling,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Trophy,
  Upload,
} from "lucide-react";
import { Wordmark } from "@/components/Logo";
import { PhoneMockup } from "@/components/PhoneMockup";
import { AppStoreBadge, GooglePlayBadge } from "@/components/StoreBadges";

export default function Home() {
  return (
    <div className="min-h-screen bg-snappeal-bg text-snappeal-navy">
      <Header />
      <main>
        <Hero />
        <TrustStrip />
        <HowItWorks />
        <DownloadSection />
      </main>
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header
      // `pt-[env(safe-area-inset-top)]` adds a buffer equal to the iOS
      // status-bar inset when the site runs as an installed PWA in
      // standalone mode, so the time / Dynamic Island stop overlapping
      // the "Snappeal" wordmark + Get Started button.
      className="sticky top-0 z-50 border-b border-snappeal-border bg-snappeal-bg/85 backdrop-blur pt-[env(safe-area-inset-top,0px)]"
    >
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
        <Wordmark />
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-snappeal-navy">
          <Link href="#how" className="hover:text-snappeal-primary transition">
            How it works
          </Link>
          <Link href="#why" className="hover:text-snappeal-primary transition">
            Why Snappeal?
          </Link>
          <Link href="#stories" className="hover:text-snappeal-primary transition">
            Success stories
          </Link>
          <Link href="#pricing" className="hover:text-snappeal-primary transition">
            Pricing
          </Link>
          <Link href="#faq" className="hover:text-snappeal-primary transition">
            FAQ
          </Link>
        </nav>
        <div className="flex items-center gap-3">
          <Link
            href="/app"
            className="hidden sm:inline text-sm font-medium text-snappeal-navy hover:text-snappeal-primary transition"
          >
            Log in
          </Link>
          <Link
            href="/app"
            className="inline-flex items-center gap-1.5 rounded-xl bg-snappeal-primary !text-white text-sm font-semibold px-4 py-2.5 hover:bg-snappeal-primary-600 transition"
          >
            <span className="text-white">Get Started</span>
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="hero-bg relative overflow-hidden">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8 py-14 md:py-20 grid grid-cols-1 lg:grid-cols-[0.48fr_0.52fr] gap-10 lg:gap-12 xl:gap-14 items-center">
        {/* LEFT — copy + CTAs */}
        <div className="max-w-xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-white border border-snappeal-border px-3.5 py-1.5 text-xs font-semibold text-snappeal-navy shadow-sm">
            <MapPin className="size-3.5 text-snappeal-primary" />
            Made for drivers in London
          </div>

          <h1 className="mt-6 text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.05] tracking-tight text-snappeal-navy">
            Don&apos;t pay that parking ticket.
            <br />
            <span className="whitespace-nowrap text-snappeal-primary">
              Appeal it in{" "}
              <span className="relative inline-block">
                seconds.
                {/* Hand-drawn yellow brush stroke — sits under "seconds" only.
                    Using a plain <img> rather than next/image because the SVG
                    is a tiny static asset and we want it to scale 1:1 with the
                    word width via percentage-based positioning. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/seconds-underline.svg"
                  alt=""
                  aria-hidden
                  className="pointer-events-none select-none absolute left-0 right-0 -bottom-2 sm:-bottom-2.5 lg:-bottom-3 w-full h-auto"
                />
              </span>
            </span>
          </h1>

          <p className="mt-7 text-base sm:text-lg text-snappeal-muted leading-relaxed max-w-md">
            Upload your notice, answer a few questions, and Snappeal drafts a
            clear, tailored appeal for you.
          </p>

          {/* Hero CTA: store badges (iOS + Android). Native apps are still
           *  in flight — both badges show a "Coming soon" pill. The
           *  in-browser app is reachable via the "Get Started" button in
           *  the top-right header. */}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <AppStoreBadge />
            <GooglePlayBadge />
          </div>

          <div className="mt-6 flex items-center gap-2.5 text-sm text-snappeal-muted">
            <span className="inline-flex size-7 rounded-full bg-green-100 items-center justify-center shrink-0">
              <ShieldCheck className="size-4 text-snappeal-success" strokeWidth={2} />
            </span>
            <span>
              <strong className="text-snappeal-navy font-semibold">
                49.4% of formal parking appeals
              </strong>{" "}
              were upheld in London in 2024–25.
            </span>
          </div>
        </div>

        {/* RIGHT — phone with floating context cards. Slight negative
         *  translate so the visual group sits closer to the headline column
         *  on wide viewports instead of drifting to the page edge. */}
        <div className="relative isolate min-h-[640px] flex items-center justify-center lg:-translate-x-4 xl:-translate-x-8">
          {/* Soft circle backdrop */}
          <div
            aria-hidden
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <div className="size-[420px] lg:size-[480px] rounded-full bg-snappeal-primary-50/70" />
            <div className="absolute size-[540px] rounded-full border border-snappeal-primary-100/70" />
            <div
              className="absolute size-[420px] lg:size-[480px] rounded-full opacity-40"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 1px 1px, rgba(0,122,255,0.18) 1px, transparent 0)",
                backgroundSize: "16px 16px",
                WebkitMaskImage:
                  "radial-gradient(closest-side, #000 60%, transparent 100%)",
                maskImage:
                  "radial-gradient(closest-side, #000 60%, transparent 100%)",
              }}
            />
          </div>

          <div className="relative">
            <PhoneMockup />

            {/* Floating context cards — all stacked on the RIGHT of the phone,
             *  pushed further right so the phone breathes, and starting BELOW
             *  the phone's status bar/notch. Order top → bottom: ticket →
             *  social proof → outcome stat. */}
            <div className="hidden md:flex absolute top-32 lg:top-28 -right-10 lg:-right-20 flex-col gap-3 z-20 w-36">
              {/* 1 · Notice Uploaded — yellow PCN thumb */}
              <FloatingCard>
                <p className="text-[11px] font-semibold text-snappeal-navy mb-1.5">
                  Notice Uploaded
                </p>
                <div className="rounded-md overflow-hidden border border-snappeal-border bg-snappeal-bg/40 aspect-[5/4] flex items-center justify-center">
                  <MiniPcnThumb />
                </div>
              </FloatingCard>

              {/* 2 · Social proof — trust badge with 5 stars */}
              <FloatingCard>
                <div className="flex items-center justify-center mb-1.5">
                  <span className="size-9 rounded-xl bg-snappeal-primary-50 flex items-center justify-center">
                    <ShieldCheck className="size-5 text-snappeal-primary" strokeWidth={2} />
                  </span>
                </div>
                <p className="text-[11px] font-bold text-snappeal-navy text-center leading-tight">
                  London drivers
                  <br />
                  trust Snappeal
                </p>
                <div className="mt-1.5 flex items-center justify-center gap-0.5">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Star key={i} className="size-3 text-yellow-400" fill="currentColor" />
                  ))}
                </div>
                <p className="text-[11px] font-bold text-snappeal-navy text-center mt-1">
                  4.8/5
                </p>
                <p className="text-[9px] text-snappeal-muted text-center">
                  from 2,300+ reviews
                </p>
              </FloatingCard>

              {/* 3 · Real London stats — center-aligned to match the two
               *  cards above (Notice + Trust badge). Title, big % figure,
               *  description, and mini chart sit on one optical centre line. */}
              <div className="rounded-2xl bg-white border border-snappeal-border shadow-xl shadow-black/[0.06] p-3 flex flex-col items-center justify-center text-center">
                <p className="text-[9px] font-semibold text-snappeal-muted">Real London stats</p>
                <p className="text-xl font-extrabold text-snappeal-primary leading-none mt-1">
                  49.4%
                </p>
                <p className="text-[9px] text-snappeal-muted leading-tight mt-1">
                  of formal appeals
                  <br />
                  were upheld in
                  <br />
                  2024–25.
                </p>
                <svg
                  viewBox="0 0 80 28"
                  className="mt-2 w-20 h-5 text-snappeal-primary"
                  aria-hidden
                >
                  <path
                    d="M2 22 L 16 18 L 30 20 L 44 12 L 58 14 L 72 6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path d="M72 6 L 67 8 M 72 6 L 70 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FloatingCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white border border-snappeal-border shadow-xl shadow-black/[0.06] p-2.5">
      {children}
    </div>
  );
}

function MiniPcnThumb() {
  return (
    <svg viewBox="0 0 120 96" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern
          id="miniPcnHatch"
          patternUnits="userSpaceOnUse"
          width="4"
          height="4"
          patternTransform="rotate(45)"
        >
          <rect width="4" height="4" fill="#0a0a0a" />
          <rect x="0.6" y="0.6" width="2.8" height="2.8" fill="#ffffff" />
        </pattern>
      </defs>
      <rect width="120" height="96" fill="#f4f4f5" />
      <rect x="14" y="10" width="92" height="76" fill="url(#miniPcnHatch)" />
      <rect x="22" y="18" width="76" height="60" fill="#fdd420" />
      <text x="60" y="38" textAnchor="middle" fontFamily="Helvetica, Arial, sans-serif" fontSize="9" fontWeight={900} fill="#0a0a0a" letterSpacing={-0.2}>
        PENALTY
      </text>
      <text x="60" y="50" textAnchor="middle" fontFamily="Helvetica, Arial, sans-serif" fontSize="9" fontWeight={900} fill="#0a0a0a" letterSpacing={-0.2}>
        CHARGE
      </text>
      <text x="60" y="62" textAnchor="middle" fontFamily="Helvetica, Arial, sans-serif" fontSize="9" fontWeight={900} fill="#0a0a0a" letterSpacing={-0.2}>
        NOTICE
      </text>
      <text x="60" y="74" textAnchor="middle" fontFamily="Helvetica, Arial, sans-serif" fontSize="5" fontWeight={800} fill="#0a0a0a">
        WARNING
      </text>
    </svg>
  );
}

function TrustStrip() {
  const items = [
    {
      icon: Sparkles,
      title: "AI-Drafted Appeals",
      body: "Clear, formal appeal letters tailored to your contravention.",
    },
    {
      icon: MapPin,
      title: "London-Focused",
      body: "Built around real London parking appeal workflows and data.",
    },
    {
      icon: PoundSterling,
      title: "£2.99, One-Off",
      body: "Simple fixed pricing. Pay once per appeal.",
    },
    {
      icon: Lock,
      title: "Secure & Private",
      body: "Your information is encrypted and handled securely.",
    },
  ];

  return (
    <section
      id="why"
      className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-4 lg:mt-2 relative z-10"
    >
      <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4 sm:gap-5">
        {items.map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            className="rounded-2xl bg-white border border-snappeal-border p-5 flex items-start gap-3.5 hover:border-snappeal-primary/40 transition"
          >
            <span className="flex-shrink-0 size-11 rounded-full bg-snappeal-primary-50 flex items-center justify-center">
              <Icon className="size-5 text-snappeal-primary" strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <h3 className="text-[15px] font-bold text-snappeal-navy">{title}</h3>
              <p className="text-[13px] text-snappeal-muted mt-1 leading-relaxed">
                {body}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: 1,
      icon: Upload,
      title: "Upload Your Ticket",
      body: "Snap a photo of your PCN, or enter the details by hand. Add evidence photos (signs, bay markings, the car) if you have them.",
    },
    {
      n: 2,
      icon: FileText,
      title: "We Draft Your Case",
      body: "Our AI reads the ticket, picks the strongest ground for your situation, and writes a clear, formal appeal.",
    },
    {
      n: 3,
      icon: Send,
      title: "We Submit Your Appeal",
      body: "We send your appeal to the issuing council's portal (or by email if their portal's down).",
    },
    {
      n: 4,
      icon: Trophy,
      title: "We Stay With You",
      body: "We notify you when the council responds. If your appeal succeeds, the PCN is cancelled.",
    },
  ];

  return (
    <section
      id="how"
      className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-10 lg:mt-16"
    >
      <div className="rounded-3xl bg-snappeal-primary-50/50 border border-snappeal-border/60 p-6 sm:p-10 lg:p-14">
        <h2 className="text-3xl sm:text-4xl font-bold text-snappeal-navy text-center tracking-tight">
          How it works
        </h2>
        <p className="mt-3 text-snappeal-muted text-center max-w-2xl mx-auto">
          Five taps. £2.99. Your London parking ticket appealed — drafted by
          AI, submitted to the council, tracked end to end.
        </p>

        <ol className="mt-10 lg:mt-14 grid sm:grid-cols-2 md:grid-cols-4 gap-5 md:gap-6 relative">
          {steps.map((step, i) => (
            <li key={step.n} className="relative">
              {/* Card */}
              <div className="relative rounded-2xl bg-white border border-snappeal-border p-6 h-full">
                {/* Big blue rounded-square step number — top-left */}
                <div className="absolute -top-3.5 -left-3.5 size-9 rounded-xl bg-snappeal-primary text-white text-sm font-extrabold flex items-center justify-center shadow-lg shadow-snappeal-primary/40 ring-4 ring-snappeal-primary-50/60">
                  {step.n}
                </div>
                {/* Icon — centred horizontally in the card */}
                <span className="mx-auto size-12 rounded-2xl bg-snappeal-primary-100 flex items-center justify-center mb-4">
                  <step.icon className="size-6 text-snappeal-primary" />
                </span>
                <h3 className="text-lg font-bold text-snappeal-navy">
                  {step.title}
                </h3>
                <p className="text-sm text-snappeal-muted mt-1.5 leading-relaxed">
                  {step.body}
                </p>
              </div>

              {/* Dashed connector arrow to next step (desktop only) */}
              {i < steps.length - 1 && (
                <span
                  aria-hidden
                  className="hidden md:flex absolute top-1/2 -right-4 -translate-y-1/2 z-10 items-center gap-0.5 text-snappeal-primary/55"
                >
                  <span className="block w-5 border-t-2 border-dashed border-current" />
                  <ArrowRight className="size-3.5" strokeWidth={2.5} />
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function DownloadSection() {
  return (
    <section
      id="install"
      className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-16 lg:pb-24"
    >
      <div className="rounded-3xl bg-snappeal-navy text-white p-8 sm:p-12 lg:p-16 grid md:grid-cols-2 gap-8 items-center">
        <div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Get Snappeal on your phone
          </h2>
          <p className="mt-4 text-white/75 text-base leading-relaxed max-w-md">
            Native iOS and Android apps are coming soon. In the meantime, you
            can install Snappeal as a web app — same experience, same icon on
            your home screen.
          </p>

          <ul className="mt-6 space-y-2.5 text-sm text-white/85">
            <li className="flex items-center gap-2.5">
              <CheckCircle2 className="size-4 text-snappeal-success" />
              Works on iPhone, Android, and desktop
            </li>
            <li className="flex items-center gap-2.5">
              <CheckCircle2 className="size-4 text-snappeal-success" />
              No login required for v0.1
            </li>
            <li className="flex items-center gap-2.5">
              <CheckCircle2 className="size-4 text-snappeal-success" />
              £2.99 per appeal, one-off, non-refundable
            </li>
          </ul>
        </div>

        <div className="flex flex-col gap-4 items-start lg:items-end">
          <div className="flex flex-wrap gap-3">
            <AppStoreBadge variant="on-dark" />
            <GooglePlayBadge variant="on-dark" />
          </div>
          <div className="text-xs text-white/60">
            Or open <span className="font-semibold text-white">snappeal.ai</span>{" "}
            on your phone and tap <em>Add to Home Screen</em>.
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-snappeal-border bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 grid sm:grid-cols-2 gap-6 items-start">
        <div>
          <Wordmark />
          <p className="mt-3 text-xs text-snappeal-muted max-w-sm leading-relaxed">
            Snappeal drafts and submits representations against London Penalty
            Charge Notices. It is not a solicitor and doesn&apos;t guarantee an
            outcome.
          </p>
        </div>
        <div className="flex flex-wrap gap-5 text-sm text-snappeal-muted sm:justify-end">
          <Link href="#pricing" className="hover:text-snappeal-navy">
            Pricing
          </Link>
          <Link href="#faq" className="hover:text-snappeal-navy">
            FAQ
          </Link>
          <Link href="/privacy" className="hover:text-snappeal-navy">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-snappeal-navy">
            Terms
          </Link>
          <Link href="mailto:hello@snappeal.ai" className="hover:text-snappeal-navy">
            Contact
          </Link>
        </div>
      </div>
      <div className="border-t border-snappeal-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between text-xs text-snappeal-muted">
          <span>© 2026 Snappeal · Made in London</span>
          <span>v0.1 prototype · mock data</span>
        </div>
      </div>
    </footer>
  );
}
