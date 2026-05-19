import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  Lock,
  Play,
  Send,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Trophy,
  Upload,
} from "lucide-react";
import { Wordmark } from "@/components/Logo";
import { PhoneMockup } from "@/components/PhoneMockup";
import { AppStoreBadge, GooglePlayBadge } from "@/components/StoreBadges";
import { WindscreenBackdrop } from "@/components/WindscreenBackdrop";

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
    <header className="sticky top-0 z-50 border-b border-snappeal-border bg-snappeal-bg/85 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
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
            className="inline-flex items-center gap-1.5 rounded-xl bg-snappeal-primary text-white text-sm font-semibold px-4 py-2.5 hover:bg-snappeal-primary-600 transition"
          >
            Get Started
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="hero-bg relative overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 md:py-20 grid md:grid-cols-2 gap-12 md:gap-8 items-center">
        <div className="max-w-xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-white border border-snappeal-border px-3.5 py-1.5 text-xs font-semibold text-snappeal-navy shadow-sm">
            <span aria-hidden>🇬🇧</span>
            Made for drivers in London
          </div>

          <h1 className="mt-5 text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.05] tracking-tight text-snappeal-navy">
            Don&apos;t pay that{" "}
            <span className="text-snappeal-primary">parking ticket.</span>
            <br />
            Let us help you appeal.
          </h1>

          <p className="mt-5 text-base sm:text-lg text-snappeal-muted leading-relaxed">
            Snappeal makes it easy to appeal parking tickets in London. We
            guide you step-by-step and create powerful appeals tailored to your
            case.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="/app"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-snappeal-primary text-white font-semibold px-6 py-3.5 hover:bg-snappeal-primary-600 transition shadow-lg shadow-snappeal-primary/25"
            >
              Start Your Appeal
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="#how"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white border border-snappeal-border text-snappeal-navy font-semibold px-6 py-3.5 hover:border-snappeal-primary transition"
            >
              <Play className="size-4 text-snappeal-primary" fill="currentColor" />
              How It Works
            </Link>
          </div>

          <div className="mt-6 flex items-center gap-3 text-sm text-snappeal-muted">
            <ShieldCheck className="size-5 text-snappeal-success" />
            <span>
              <strong className="text-snappeal-navy">
                49.4% of formal appeals
              </strong>{" "}
              were upheld in London in 2024-25.{" "}
              <Link
                href="https://www.londoncouncils.gov.uk/news-and-press-releases/2025/london-councils-enforcement-and-appeals-statistics-2024-25"
                className="underline decoration-snappeal-border underline-offset-2 hover:text-snappeal-navy"
                target="_blank"
                rel="noopener"
              >
                Source
              </Link>
            </span>
          </div>
        </div>

        <div className="relative isolate min-h-[600px] sm:min-h-[640px] flex items-center justify-center">
          <WindscreenBackdrop />
          <div className="relative">
            <PhoneMockup />
            {/* Floating trust badge with curly arrow — positioned outside the phone */}
            <div className="hidden sm:flex absolute -bottom-2 -right-14 lg:-right-20 w-44 rounded-2xl bg-white border border-snappeal-border shadow-2xl shadow-black/10 p-3 items-start gap-2 z-20">
              <div className="size-9 rounded-full bg-snappeal-primary-100 flex items-center justify-center flex-shrink-0">
                <svg
                  viewBox="0 0 24 24"
                  className="size-5 text-snappeal-primary"
                  fill="currentColor"
                  aria-hidden
                >
                  <path d="M12 2 21 5v6c0 5-3.8 9.7-9 11-5.2-1.3-9-6-9-11V5l9-3z" />
                </svg>
              </div>
              <div>
                <p className="text-[11px] font-bold text-snappeal-navy leading-tight">
                  Thousands of London drivers trust Snappeal
                </p>
              </div>
              {/* Curly arrow pointing back to phone */}
              <svg
                viewBox="0 0 60 60"
                aria-hidden
                className="absolute -left-12 -top-2 size-14 text-snappeal-primary/70 -rotate-12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              >
                <path d="M52 12 C 40 18, 28 28, 22 42" />
                <path d="M22 42 l 6 -3 M 22 42 l 4 6" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TrustStrip() {
  const items = [
    {
      icon: Sparkles,
      title: "AI-Drafted Appeals",
      body: "Snappeal drafts your appeal from your photos and notes — clear, formal, and tailored to the contravention.",
    },
    {
      icon: TrendingUp,
      title: "Real London Stats",
      body: "49.4% of formal London PCN appeals were upheld in 2024-25. We use that benchmark, not invented win rates.",
    },
    {
      icon: ShieldCheck,
      title: "£2.99, One-Off",
      body: "Pay once, non-refundable. You're paying for the appeal we draft and submit, not for the outcome.",
    },
    {
      icon: Lock,
      title: "Secure & Private",
      body: "Your data is encrypted, never sold, and deleted 90 days after your appeal resolves.",
    },
  ];

  return (
    <section
      id="why"
      className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 -mt-6 relative z-10"
    >
      <div className="rounded-3xl bg-white border border-snappeal-border shadow-xl shadow-snappeal-primary/5 p-6 sm:p-8 grid sm:grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8">
        {items.map(({ icon: Icon, title, body }) => (
          <div key={title} className="flex items-start gap-4">
            <span className="flex-shrink-0 size-11 rounded-full bg-snappeal-primary-100 flex items-center justify-center">
              <Icon className="size-5 text-snappeal-primary" />
            </span>
            <div>
              <h3 className="text-base font-bold text-snappeal-navy">
                {title}
              </h3>
              <p className="text-sm text-snappeal-muted mt-1 leading-relaxed">
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
                {/* Icon */}
                <span className="block size-12 rounded-2xl bg-snappeal-primary-100 flex items-center justify-center mb-4 ml-1">
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
            <AppStoreBadge />
            <GooglePlayBadge />
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
