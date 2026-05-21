# Risks

The honest list. We grade each as **Likelihood** × **Impact** and note the mitigation.

## Regulatory

### R1. Re-classification as a Claims Management Company (FCA)
**Likelihood: Low. Impact: High.**
Drafting a PCN representation is **not** currently a "reserved legal activity" under the Legal Services Act 2007, and PCN/parking representation is **not** within the six FCA Claims Management sectors[^1]. We are unregulated for this activity. The risk is policy creep: if the FCA broadens claims-management regulation to include consumer dispute services generally, we would need authorisation (~£8k–£15k initial application + ongoing compliance).
**Mitigation**: monitor FCA policy statements; keep a 30-day exit plan to suspend operations and refund pending appeals if regulation lands; structure the company so authorisation is achievable rather than disqualifying.

### R2. Solicitor Regulation Authority intervention
**Likelihood: Very low. Impact: Medium.**
The SRA could in principle assert that AI-generated representation letters are "holding out as a solicitor" if our marketing implies legal advice. **DoNotPay's FTC settlement in January 2025 is the cautionary tale**[^2].
**Mitigation**: every screen says "drafted by ParkingRabbit, not a solicitor"; we never use the words "lawyer", "legal advice", or "guaranteed outcome"; the [values](values.md) page is the brand guardrail.

### R3. UK GDPR / ICO action
**Likelihood: Low. Impact: High.**
Photos of PCNs contain vehicle reg + location + driver inference. Photos of the car may capture bystanders. Notes may contain medical or other sensitive personal data (e.g., "I was rushing to A&E").
**Mitigation**: privacy policy stated up-front; 90-day auto-delete of photos after appeal resolution; UK data residency (Neon EU region); user-initiated DSAR endpoint by v0.2; never share photos with third parties beyond the council to which the appeal is addressed.

## Operational

### R4. AI quality regression
**Likelihood: Medium. Impact: High.**
A new model release that subtly degrades the letter quality could push our acceptance rate below the tribunal-success-rate benchmark, harming reputation and council acceptance rates.
**Mitigation**: locked model versions in production (not `latest`); a golden-set of 50 known-outcome cases re-run weekly; manual review of all appeals during v0.1; automated regression alerts on success-rate drop > 5%.

### R5. Auto-submission breakage (v0.2)
**Likelihood: High. Impact: Medium.**
Council portals change without notice. A site redesign at Westminster could break the Playwright MCP flow overnight.
**Mitigation**: per-council health-check job (synthetic submission daily); fallback to "letter copied, portal opened in browser" UX when automation fails; admin dashboard surfaces broken councils; Phase B's admin CRUD lets ops fix selectors without a code deploy.

### R6. Stripe + Apple Pay merchant verification delays
**Likelihood: Medium. Impact: Medium.**
Stripe Apple Pay requires merchant domain verification + Apple Developer Account. For App Store submission, In-App Purchase rules become relevant — though legal services qualify as "real-world goods/services" under App Store guideline 3.1.3(e) and Stripe Apple Pay is permitted.
**Mitigation**: complete Apple Developer enrollment in parallel with v0.1 build; have card fallback ready if Apple Pay verification slips.

## Reputational

### R7. A high-profile lost appeal
**Likelihood: Medium. Impact: Medium.**
A user appeals via ParkingRabbit, loses, then writes a viral Twitter thread.
**Mitigation**: clear pre-purchase copy that we charge for the work, not the outcome (consistent with our [pricing](pricing.md)); an in-app post-mortem ("here's why we think this was rejected") helps users feel respected; honest copy ("ParkingRabbit helps you contest — it doesn't guarantee you win") set the expectation up front.

### R8. Council pushback
**Likelihood: Medium. Impact: Medium.**
A borough publicly criticises ParkingRabbit for "encouraging frivolous appeals" or flagging our submissions as low-quality.
**Mitigation**: per-letter quality bar (the [values](values.md) commitment); proactive outreach to top-volume councils' parking ops teams in v0.2; willingness to suppress weak appeals at our end rather than dump them on councils.

## Financial

### R9. Chargeback liability from disappointed users
**Likelihood: Medium. Impact: Medium.**
We charge £2.99 non-refundably for the work, not the outcome. Users who lose their council appeal may dispute the Stripe charge as "service not as described", even though they received the drafted + submitted appeal we promised. Stripe charges a dispute fee (~£15–£20) per chargeback regardless of outcome.
**Mitigation**: pre-purchase copy is unambiguous ("you're paying for the appeal we draft and submit, not the outcome"); post-purchase email re-states this; in-app receipt itemises what was delivered (letter, submission, timestamps, council reference). Track chargeback rate as a KPI from day one; if it exceeds 1% of transactions, harden the pre-purchase screen further before raising prices.

### R10. CAC > LTV
**Likelihood: Medium. Impact: Medium.**
Paid acquisition CAC could exceed contribution margin in early months until SEO compounds.
**Mitigation**: don't scale paid spend until SEO contributes ≥ 30% of volume; soft cap on weekly user acquisition during v0.1.

## Things we don't know yet (research gaps)

Tracked from [market.md](market.md):

- Per-borough PCN volume breakdown.
- % of PCNs paid at discount vs full vs written off (London Councils TEC committee report or FOI required).
- AppealNow's current pricing.
- UK keyword-search volume for PCN-appeal intent.

These get closed before any external fundraising or significant paid-acquisition spend.

[^1]: FCA Handbook PERG 2.4A — <https://handbook.fca.org.uk/handbook/PERG/2/4A.html>
[^2]: FTC, *FTC Finalizes Order with DoNotPay…* — <https://www.ftc.gov/news-events/news/press-releases/2025/02/ftc-finalizes-order-donotpay-prohibits-deceptive-ai-lawyer-claims-imposes-monetary-relief-requires>
