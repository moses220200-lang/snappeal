import Link from "next/link";
import { Wordmark } from "@/components/Logo";

export default function TermsPage() {
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

      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-12">
        <p className="text-xs uppercase tracking-wide text-snappeal-muted">
          Last updated 2026-05-19
        </p>
        <h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight">
          Terms of service
        </h1>
        <p className="mt-3 rounded-2xl bg-snappeal-primary-50 text-sm text-snappeal-navy px-4 py-3 border border-snappeal-primary-100">
          <strong>Draft / placeholder.</strong> v0.1 prototype terms. Final
          wording will be lawyer-reviewed before public launch.
        </p>

        <section className="mt-8 space-y-6">
          <Block
            title="What Snappeal is"
            body="Snappeal is a software tool that drafts a representation against a London Penalty Charge Notice (PCN) from photos and notes you provide, and submits it to the issuing council on your behalf via the council's portal or email."
          />
          <Block
            title="What Snappeal isn't"
            body="Snappeal is not a solicitor, barrister, claims-management company, or regulated legal service. We don't provide legal advice. We don't represent you at oral tribunal hearings. We can't and don't guarantee any outcome."
          />
          <Block
            title="What you pay"
            body="£2.99 per appeal. One-off, non-refundable. You're paying for the service we deliver (the drafted and submitted appeal), not for the outcome (whether the council cancels the PCN). The price is shown before payment and confirmed in your receipt."
          />
          <Block
            title="Service-failure refund"
            body="If our system fails to deliver — generation fails repeatedly, payment is taken but no appeal is produced, the council portal is unreachable for 48+ hours, etc. — we issue a refund for that specific appeal. This is a Consumer Rights Act 2015 service-quality remedy, not an outcome refund."
          />
          <Block
            title="Honest evidence"
            body="The appeal is grounded in the facts you give us. You agree not to give us fabricated photos, false statements, or evidence of contraventions that didn't happen as you describe. We rely on your honesty; if a council finds dishonesty in an appeal we drafted, that's between you and them."
          />
          <Block
            title="Council decisions"
            body="The council, not Snappeal, decides the appeal. We facilitate the representation; we don't decide it. Statistics about appeal success rates in this app refer to historical London Tribunal outcomes — they don't predict your case."
          />
          <Block
            title="If you change your mind"
            body="Because the service runs end-to-end as soon as you pay (AI generation + submission), the standard 14-day distance-selling cooling-off period does not apply once we've started work on your appeal. This is the 'consumer agrees that the right to cancel is lost' exception under the Consumer Contracts Regulations 2013."
          />
          <Block
            title="Liability"
            body="Snappeal's total liability for any claim related to your use of the service is limited to the amount you paid us for the relevant appeal. Nothing in these terms excludes liability for things UK law doesn't allow us to exclude (e.g. death or personal injury caused by negligence)."
          />
          <Block
            title="Governing law"
            body="These terms are governed by the laws of England and Wales. Disputes are subject to the exclusive jurisdiction of the English courts."
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
