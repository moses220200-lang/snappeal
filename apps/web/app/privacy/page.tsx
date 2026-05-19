import Link from "next/link";
import { Wordmark } from "@/components/Logo";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-snappeal-bg text-snappeal-navy">
      <header className="border-b border-snappeal-border bg-snappeal-bg/85 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-3 flex items-center justify-between">
          <Link href="/">
            <Wordmark />
          </Link>
          <Link
            href="/"
            className="text-sm font-medium text-snappeal-muted hover:text-snappeal-navy"
          >
            ← Home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-12 prose-base">
        <p className="text-xs uppercase tracking-wide text-snappeal-muted">
          Last updated 2026-05-19
        </p>
        <h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight">
          Privacy policy
        </h1>
        <p className="mt-3 rounded-2xl bg-snappeal-primary-50 text-sm text-snappeal-navy px-4 py-3 border border-snappeal-primary-100">
          <strong>Draft / placeholder.</strong> This is the v0.1 prototype of
          our privacy policy. Final wording will be reviewed before public
          launch — see the privacy commitments below for the substance.
        </p>

        <section className="mt-8 space-y-6">
          <Block
            title="What we collect"
            body="Photos of your Penalty Charge Notice (PCN), photos of the car and the scene if you choose to upload them, the contents of the 'what happened' notes box, and the payment record from Stripe. We also collect technical identifiers (anonymous session ID, device type, browser) to make the app work."
          />
          <Block
            title="What we don't collect"
            body="We don't ask for your name, address, phone number, or email unless you choose to add an email for your receipt. We don't track you across other websites. We don't run third-party advertising trackers."
          />
          <Block
            title="How long we keep your data"
            body="Photos and appeal content are stored for up to 90 days after your appeal resolves, then automatically deleted. Payment records are kept for 6 years (UK statutory retention for financial records). Anonymous analytics are aggregated and don't identify you."
          />
          <Block
            title="Who we share it with"
            body="The council you're appealing to — we send your appeal letter and any photos you've attached. Stripe — for payment processing. No-one else, ever."
          />
          <Block
            title="Your rights (UK GDPR)"
            body="You can ask us to show you what data we hold about you, correct it, or delete it. Email hello@snappeal.ai (placeholder) and we'll respond within 30 days."
          />
          <Block
            title="Our promises"
            body="No selling your data. No advertising trackers. No surprise integrations. If we change anything material in this policy, we'll tell you 14 days in advance."
          />
        </section>

        <footer className="mt-12 pt-6 border-t border-snappeal-border text-xs text-snappeal-muted">
          Questions?{" "}
          <Link
            href="mailto:hello@snappeal.ai"
            className="text-snappeal-primary font-semibold"
          >
            hello@snappeal.ai
          </Link>
        </footer>
      </main>
    </div>
  );
}

function Block({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h2 className="text-lg font-bold text-snappeal-navy">{title}</h2>
      <p className="mt-2 text-snappeal-muted leading-relaxed text-sm">{body}</p>
    </div>
  );
}
