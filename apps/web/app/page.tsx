import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  FileText,
  MapPin,
  PlayCircle,
  PoundSterling,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Tag,
  TrendingUp,
  Trophy,
  Upload,
} from "lucide-react";
import { ParkingRabbitLogo, Wordmark } from "@/components/Logo";
import { PhoneMockup } from "@/components/PhoneMockup";
import { AppStoreBadge, GooglePlayBadge } from "@/components/StoreBadges";
import { getCouncilLookup } from "@/lib/server/councils";

export default async function Home() {
  const councilMap = await getCouncilLookup();
  const councils = Array.from(councilMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  return (
    <div className="min-h-screen bg-parkingrabbit-bg text-parkingrabbit-navy">
      <Header />
      <main>
        <Hero />
        <CouncilStrip councils={councils} />
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
      // the "ParkingRabbit" wordmark + Get Started button.
      className="sticky top-0 z-50 border-b border-parkingrabbit-border bg-parkingrabbit-bg/85 backdrop-blur pt-[env(safe-area-inset-top,0px)]"
    >
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
        <ParkingRabbitLogo size={40} variant="dark" layout="horizontal" />
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-parkingrabbit-navy">
          <Link href="#how" className="hover:text-parkingrabbit-primary transition">
            How It Works
          </Link>
          <Link href="#why" className="hover:text-parkingrabbit-primary transition">
            Success Rate
          </Link>
          <Link href="#pricing" className="hover:text-parkingrabbit-primary transition">
            Pricing
          </Link>
          <Link href="#faq" className="hover:text-parkingrabbit-primary transition">
            FAQs
          </Link>
          <Link
            href="#resources"
            className="inline-flex items-center gap-1 hover:text-parkingrabbit-primary transition"
          >
            Resources
            <ChevronDown className="size-4" strokeWidth={2.25} />
          </Link>
        </nav>
        <div className="flex items-center gap-3">
          <Link
            href="/app"
            className="hidden sm:inline text-sm font-medium text-parkingrabbit-navy hover:text-parkingrabbit-primary transition"
          >
            Log in
          </Link>
          <Link
            href="/app"
            className="inline-flex items-center gap-1.5 rounded-xl bg-parkingrabbit-primary !text-white text-sm font-semibold px-4 py-2.5 hover:bg-parkingrabbit-primary-600 transition"
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
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 pt-14 md:pt-20 pb-0 grid grid-cols-1 lg:grid-cols-[0.6fr_0.4fr] gap-10 lg:gap-12 xl:gap-14 items-center">
        {/* LEFT — copy + CTAs */}
        <div className="max-w-[740px]">
          <div className="inline-flex items-center gap-2 rounded-full bg-white border border-parkingrabbit-border px-3.5 py-1.5 text-xs font-semibold text-parkingrabbit-navy shadow-sm">
            <MapPin className="size-3.5 text-parkingrabbit-primary" />
            Made for drivers in London
          </div>

          <h1 className="mt-6">
            <span className="sr-only">Appeal an unfair parking ticket.</span>
            <HeroHeadlineSvg />
          </h1>

          <p className="mt-7 text-base sm:text-[17px] text-parkingrabbit-muted leading-relaxed max-w-[620px]">
            Under the Traffic Management Act 2004 and the Civil Enforcement of
            Parking Contraventions (England) Representations and Appeals
            Regulations 2007, motorists can challenge a Penalty Charge Notice
            (PCN).
          </p>

          <div className="mt-8 flex items-stretch gap-3 sm:flex-wrap">
            <Link
              href="/app"
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-xl bg-parkingrabbit-primary !text-white text-base font-semibold px-6 py-3.5 hover:bg-parkingrabbit-primary-600 transition"
            >
              <span className="text-white">Free Appeal</span>
              <ArrowRight className="size-4 text-white shrink-0" strokeWidth={2.25} />
            </Link>
            <Link
              href="#how"
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-xl bg-white border border-parkingrabbit-border text-parkingrabbit-navy text-base font-semibold px-6 py-3.5 hover:border-parkingrabbit-primary/40 transition"
            >
              <PlayCircle className="size-5 text-parkingrabbit-primary shrink-0" strokeWidth={1.75} />
              See How It Works
            </Link>
          </div>

          <div className="mt-6 flex items-center gap-2.5 text-sm text-parkingrabbit-muted">
            <span className="inline-flex size-7 rounded-full bg-green-100 items-center justify-center shrink-0">
              <ShieldCheck className="size-4 text-parkingrabbit-success" strokeWidth={2} />
            </span>
            <span>
              <strong className="text-parkingrabbit-navy font-semibold">
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
          <div
            aria-hidden
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <div
              className="size-[430px] lg:size-[480px] rounded-full overflow-hidden"
              style={{ opacity: 0.12, filter: "blur(0.3px)", zIndex: 0 }}
            >
              <UnionJackMuted />
            </div>
            <div className="absolute size-[540px] rounded-full border border-parkingrabbit-primary-100/70" />
          </div>

          <div className="relative z-10">
            {/* On mobile, shift the phone left so the floating cards on the
             *  right don't obscure the in-progress / timeline content inside
             *  the phone screen. On sm+ the viewport is wide enough that
             *  the cards float clear of the phone, so this offset only
             *  applies at the smallest breakpoint. */}
            <div className="-translate-x-10 sm:translate-x-0">
              <PhoneMockup />
            </div>

            {/* Floating context cards — three "badges" (Notice Uploaded /
             *  4.8/5 social proof / 49.4% outcome stat) stacked on the
             *  RIGHT of the phone. All three cards center their text +
             *  titles so the rhythm reads uniformly across breakpoints. */}
            <div className="flex absolute top-3 sm:top-8 md:top-32 lg:top-28 -right-1 sm:-right-3 md:-right-10 lg:-right-20 flex-col gap-1.5 md:gap-3 z-20 w-[7.25rem] md:w-36">
              <FloatingCard>
                <p className="text-[10px] md:text-[11px] font-semibold text-parkingrabbit-navy mb-1 md:mb-1.5 text-center">
                  Notice Uploaded
                </p>
                <div className="rounded-md overflow-hidden border border-parkingrabbit-border bg-parkingrabbit-bg/40 aspect-[5/4] flex items-center justify-center">
                  <MiniPcnThumb />
                </div>
              </FloatingCard>

              <FloatingCard>
                <div className="flex items-center justify-center mb-1 md:mb-1.5">
                  <span className="size-7 md:size-9 rounded-lg md:rounded-xl bg-parkingrabbit-primary-50 flex items-center justify-center">
                    <ShieldCheck className="size-4 md:size-5 text-parkingrabbit-primary" strokeWidth={2} />
                  </span>
                </div>
                <p className="text-[10px] md:text-[11px] font-bold text-parkingrabbit-navy text-center leading-tight">
                  London drivers
                  <br />
                  trust ParkingRabbit
                </p>
                <div className="mt-1 md:mt-1.5 flex items-center justify-center gap-0.5">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Star key={i} className="size-2.5 md:size-3 text-yellow-400" fill="currentColor" />
                  ))}
                </div>
                <p className="text-[10px] md:text-[11px] font-bold text-parkingrabbit-navy text-center mt-0.5 md:mt-1">
                  4.8/5
                </p>
                <p className="text-[8.5px] md:text-[9px] text-parkingrabbit-muted text-center">
                  from 2,300+ reviews
                </p>
              </FloatingCard>

              <FloatingCard>
                <div className="flex items-center justify-center mb-1 md:mb-1.5">
                  <TrendingUp
                    className="size-3.5 md:size-4 text-parkingrabbit-success"
                    strokeWidth={2.25}
                  />
                </div>
                <p className="text-lg md:text-xl font-extrabold text-parkingrabbit-primary leading-none text-center">
                  49.4%
                </p>
                <p className="mt-1 md:mt-1.5 text-[8.5px] md:text-[10px] text-parkingrabbit-muted leading-snug text-center">
                  of formal appeals
                  <br />
                  upheld in London
                  <br />
                  2024–25
                </p>
              </FloatingCard>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FloatingCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white border border-parkingrabbit-border shadow-xl shadow-black/[0.06] p-2.5">
      {children}
    </div>
  );
}

function HeroHeadlineSvg() {
  const BAND_LEFT = 12;
  const BAND_WIDTH = 700;
  const BAND_RIGHT = BAND_LEFT + BAND_WIDTH;
  const VERT_BUMPS = 5;
  const VERT_STEP = 22;
  const VERT_DEPTH = 11;
  const BAND_BOTTOM = VERT_BUMPS * VERT_STEP;

  const rightEdge = Array.from({ length: VERT_BUMPS }, (_, i) => {
    const tipY = VERT_STEP / 2 + i * VERT_STEP;
    const baseY = VERT_STEP + i * VERT_STEP;
    return `L ${BAND_RIGHT + VERT_DEPTH} ${tipY} L ${BAND_RIGHT} ${baseY}`;
  }).join(" ");

  const leftEdge = Array.from({ length: VERT_BUMPS }, (_, i) => {
    const tipY = BAND_BOTTOM - VERT_STEP / 2 - i * VERT_STEP;
    const baseY = BAND_BOTTOM - VERT_STEP - i * VERT_STEP;
    return `L ${BAND_LEFT - VERT_DEPTH} ${tipY} L ${BAND_LEFT} ${baseY}`;
  }).join(" ");

  const ticketPath = `M ${BAND_LEFT} 0 L ${BAND_RIGHT} 0 ${rightEdge} L ${BAND_LEFT} ${BAND_BOTTOM} ${leftEdge} Z`;

  return (
    <svg
      viewBox="0 -12 740 275"
      className="block w-full max-w-[740px] h-auto"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      <text
        x="0"
        y="92"
        fontFamily="Inter, system-ui, sans-serif"
        fontWeight="800"
        fontSize="96"
        fill="#0A1929"
        letterSpacing="-3"
        textLength="720"
        lengthAdjust="spacingAndGlyphs"
      >
        Appeal an unfair
      </text>

      <g transform="translate(0, 143)">
        <path d={ticketPath} fill="#FACC15" />
        <line
          x1="34"
          y1="14"
          x2="34"
          y2={BAND_BOTTOM - 14}
          stroke="#0A1929"
          strokeWidth="3"
          strokeDasharray="9,8"
          opacity="0.8"
        />
        <text
          x="58"
          y="86"
          fontFamily="Inter, system-ui, sans-serif"
          fontWeight="900"
          fontSize="84"
          fill="#0A1929"
          letterSpacing="-2"
          textLength={BAND_RIGHT - 76}
          lengthAdjust="spacingAndGlyphs"
        >
          PARKING TICKET.
        </text>
      </g>
    </svg>
  );
}

function UnionJackMuted() {
  const blue = "#4a6b96";
  const white = "#f5f5f5";
  const red = "#c08891";
  return (
    <svg
      viewBox="0 0 60 30"
      preserveAspectRatio="xMidYMid slice"
      className="block w-full h-full"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="60" height="30" fill={blue} />
      <line x1="0" y1="0" x2="60" y2="30" stroke={white} strokeWidth="6" />
      <line x1="60" y1="0" x2="0" y2="30" stroke={white} strokeWidth="6" />
      <line x1="0" y1="0" x2="60" y2="30" stroke={red} strokeWidth="2" />
      <line x1="60" y1="0" x2="0" y2="30" stroke={red} strokeWidth="2" />
      <rect x="25" y="0" width="10" height="30" fill={white} />
      <rect x="0" y="10" width="60" height="10" fill={white} />
      <rect x="27" y="0" width="6" height="30" fill={red} />
      <rect x="0" y="12" width="60" height="6" fill={red} />
    </svg>
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
  return (
    <section
      id="why"
      className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-16 lg:mt-20 relative z-10"
    >
      <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4 sm:gap-5 items-stretch">
        <FeatureCard
          icon={Sparkles}
          title="AI-Assisted Appeals"
          body="Guided by AI, reviewed for clarity, and tailored to your case."
          pill={{ icon: MapPin, label: "Built for London drivers" }}
        />
        <StatCard
          icon={TrendingUp}
          value="7,842+"
          title="Appeals overturned"
          body="Successful challenges for drivers so far."
        />
        <StatCard
          icon={PoundSterling}
          value="£318,400+"
          title="Saved for clients"
          body="Estimated parking charges avoided."
        />
        <FeatureCard
          icon={Tag}
          title="Free To Draft"
          body="Generate and save every appeal letter for free. Pay only when you auto-submit through the council's portal."
          pill={{ label: "£2.99 per submission" }}
        />
      </div>
    </section>
  );
}

type LucideIcon = React.ComponentType<{
  className?: string;
  strokeWidth?: number;
}>;

function FeatureCard({
  icon: Icon,
  title,
  body,
  pill,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  pill: { icon?: LucideIcon; label: string };
}) {
  const PillIcon = pill.icon;
  return (
    <div className="rounded-2xl bg-white border border-parkingrabbit-border p-5 flex flex-col h-full hover:border-parkingrabbit-primary/40 transition">
      <span className="size-11 rounded-2xl bg-parkingrabbit-primary-50 flex items-center justify-center">
        <Icon className="size-5 text-parkingrabbit-primary" strokeWidth={1.75} />
      </span>
      <h3 className="mt-5 text-[17px] font-bold text-parkingrabbit-navy">{title}</h3>
      <p className="mt-2 text-[13px] text-parkingrabbit-muted leading-relaxed">
        {body}
      </p>
      <div className="mt-auto pt-5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-parkingrabbit-primary-50 px-3 py-1.5 text-[12px] font-semibold text-parkingrabbit-primary">
          {PillIcon && <PillIcon className="size-3.5" strokeWidth={2} />}
          {pill.label}
        </span>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  value,
  title,
  body,
}: {
  icon: LucideIcon;
  value: string;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl bg-white border border-parkingrabbit-border p-5 flex flex-col h-full hover:border-parkingrabbit-primary/40 transition">
      <div className="flex items-start justify-between gap-3">
        <span className="size-11 rounded-2xl bg-parkingrabbit-primary flex items-center justify-center shadow-sm shadow-parkingrabbit-primary/30">
          <Icon className="size-5 text-white" strokeWidth={2.25} />
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-[11px] font-semibold text-green-700">
          <span className="size-1.5 rounded-full bg-green-500" />
          Live total
        </span>
      </div>
      <div className="mt-5 flex items-center gap-0.5">
        {Array.from(value).map((ch, i) => (
          <span
            key={i}
            className="inline-flex h-8 min-w-[1.25rem] items-center justify-center rounded-md border border-parkingrabbit-border bg-white px-1 text-xl font-extrabold text-parkingrabbit-primary leading-none"
          >
            {ch}
          </span>
        ))}
      </div>
      <h3 className="mt-4 text-[15px] font-bold text-parkingrabbit-navy">{title}</h3>
      <p className="mt-1.5 text-[13px] text-parkingrabbit-muted leading-relaxed">
        {body}
      </p>
    </div>
  );
}

function CouncilStrip({
  councils,
}: {
  councils: { slug: string; name: string; logoUrl: string | null; logoBg: string | null }[];
}) {
  if (councils.length === 0) return null;
  return (
    <section
      id="authorities"
      className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-16 lg:mt-20 relative z-10"
    >
      <p className="text-center text-xs font-semibold uppercase tracking-wide text-parkingrabbit-muted">
        Covering these London authorities
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
        {councils.map((c) => (
          <div
            key={c.slug}
            className="flex items-center gap-2.5 rounded-full bg-white border border-parkingrabbit-border pl-1.5 pr-4 py-1.5 shadow-sm"
            title={c.name}
          >
            <span
              className="size-8 rounded-full overflow-hidden flex items-center justify-center border border-parkingrabbit-border/60"
              style={{ background: c.logoBg ?? "#ffffff" }}
            >
              {c.logoUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={c.logoUrl}
                  alt=""
                  className="max-w-full max-h-full object-contain"
                />
              ) : (
                <span className="text-[10px] font-bold text-parkingrabbit-navy">
                  {c.name.slice(0, 2).toUpperCase()}
                </span>
              )}
            </span>
            <span className="text-[13px] font-semibold text-parkingrabbit-navy">
              {c.name}
            </span>
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
      className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-16 lg:mt-20"
    >
      <div className="rounded-3xl bg-parkingrabbit-primary-50/50 border border-parkingrabbit-border/60 p-6 sm:p-10 lg:p-14">
        <h2 className="text-3xl sm:text-4xl font-bold text-parkingrabbit-navy text-center tracking-tight">
          How it works
        </h2>
        <p className="mt-3 text-parkingrabbit-muted text-center max-w-2xl mx-auto">
          Five taps. £2.99. Your London parking ticket appealed — drafted by
          AI, submitted to the council, tracked end to end.
        </p>

        <ol className="mt-10 lg:mt-14 grid sm:grid-cols-2 md:grid-cols-4 gap-5 md:gap-6 relative">
          {steps.map((step, i) => (
            <li key={step.n} className="relative">
              {/* Card */}
              <div className="relative rounded-2xl bg-white border border-parkingrabbit-border p-6 h-full">
                {/* Big blue rounded-square step number — top-left */}
                <div className="absolute -top-3.5 -left-3.5 size-9 rounded-xl bg-parkingrabbit-primary text-white text-sm font-extrabold flex items-center justify-center shadow-lg shadow-parkingrabbit-primary/40 ring-4 ring-parkingrabbit-primary-50/60">
                  {step.n}
                </div>
                {/* Icon — centred horizontally in the card */}
                <span className="mx-auto size-12 rounded-2xl bg-parkingrabbit-primary-100 flex items-center justify-center mb-4">
                  <step.icon className="size-6 text-parkingrabbit-primary" />
                </span>
                <h3 className="text-lg font-bold text-parkingrabbit-navy">
                  {step.title}
                </h3>
                <p className="text-sm text-parkingrabbit-muted mt-1.5 leading-relaxed">
                  {step.body}
                </p>
              </div>

              {/* Dashed connector arrow to next step (desktop only) */}
              {i < steps.length - 1 && (
                <span
                  aria-hidden
                  className="hidden md:flex absolute top-1/2 -right-4 -translate-y-1/2 z-10 items-center gap-0.5 text-parkingrabbit-primary/55"
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
      className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-16 lg:mt-20 pb-16 lg:pb-24"
    >
      <div className="rounded-3xl bg-parkingrabbit-navy text-white p-8 sm:p-12 lg:p-16 grid md:grid-cols-2 gap-8 items-center">
        <div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Get ParkingRabbit on your phone
          </h2>
          <p className="mt-4 text-white/75 text-base leading-relaxed max-w-md">
            Native iOS and Android apps are coming soon. In the meantime, you
            can install ParkingRabbit as a web app — same experience, same icon on
            your home screen.
          </p>

          <ul className="mt-6 space-y-2.5 text-sm text-white/85">
            <li className="flex items-center gap-2.5">
              <CheckCircle2 className="size-4 text-parkingrabbit-success" />
              Works on iPhone, Android, and desktop
            </li>
            <li className="flex items-center gap-2.5">
              <CheckCircle2 className="size-4 text-parkingrabbit-success" />
              No login required for v0.1
            </li>
            <li className="flex items-center gap-2.5">
              <CheckCircle2 className="size-4 text-parkingrabbit-success" />
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
            Or open <span className="font-semibold text-white">parkingrabbit.com</span>{" "}
            on your phone and tap <em>Add to Home Screen</em>.
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-parkingrabbit-border bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 grid sm:grid-cols-2 gap-6 items-start">
        <div>
          <Wordmark />
          <p className="mt-3 text-xs text-parkingrabbit-muted max-w-sm leading-relaxed">
            ParkingRabbit drafts and submits representations against London Penalty
            Charge Notices. It is not a solicitor and doesn&apos;t guarantee an
            outcome.
          </p>
        </div>
        <div className="flex flex-wrap gap-5 text-sm text-parkingrabbit-muted sm:justify-end">
          <Link href="#pricing" className="hover:text-parkingrabbit-navy">
            Pricing
          </Link>
          <Link href="#faq" className="hover:text-parkingrabbit-navy">
            FAQ
          </Link>
          <Link href="/privacy" className="hover:text-parkingrabbit-navy">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-parkingrabbit-navy">
            Terms
          </Link>
          <Link href="mailto:hello@parkingrabbit.com" className="hover:text-parkingrabbit-navy">
            Contact
          </Link>
        </div>
      </div>
      <div className="border-t border-parkingrabbit-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between text-xs text-parkingrabbit-muted">
          <span>© 2026 ParkingRabbit · Made in London</span>
          <span>v0.1 prototype · mock data</span>
        </div>
      </div>
    </footer>
  );
}
