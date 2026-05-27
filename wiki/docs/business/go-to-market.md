# Go-to-market

Last refreshed **2026-05-27 (v0.3.10)**.

## Target user

A Londoner who:

- Drives or owns a vehicle parked in inner London (Zones 1–3 disproportionately).
- Has received a PCN in the last 14 days (still inside the discount window).
- Believes the PCN may be unfair, but isn't sure they can win or how to start.
- Is comfortable installing a web app to their home screen or, later, downloading from the App Store.

Demographics: skews 25–55, mixed income, mixed tech-comfort. Not the lawyer (they self-serve), not the giver-upper (they pay). The user in the middle.

## Three launch channels

### 1. Search — intent capture (Google Ads + organic SEO)

People who get a PCN type one of a small set of queries within 48 hours:

- *"appeal a parking ticket london"*
- *"how to appeal a pcn"*
- *"camden pcn appeal" / "westminster pcn appeal"* etc.
- *"contravention code 12 appeal"*

Paid: Google Ads with tightly bound keywords; expected CPC £0.80–£2.50 in this category, conversion-to-pay rate (target) ~5%, so blended CAC £20–£60. At £2.62 contribution margin per appeal, this is **only viable if average user submits ≥ 8 appeals over lifetime, or if SEO captures most volume**.

Organic: per-borough landing pages on the wiki itself (already structured: `/councils/westminster`, `/councils/camden` …). These pages target borough-specific queries with high commercial intent. Wiki-as-marketing-site is a structural advantage — the same MkDocs site that's the business knowledge base is also our SEO surface.

### 2. TikTok — first-touch awareness

PCN-related content is a well-established TikTok genre (#parkingticket, #PCN, "I got a ticket, here's what I did", warden-confrontation videos). The drivers of this content are exactly the audience we want.

Strategy:
- Founder-led explanation videos: *"You probably didn't know you can appeal a PCN if the signage is hidden by a tree. Here's how."*
- Borough-specific guides: *"How to win a Westminster PCN appeal."*
- Outcome content (with user consent): *"This is how ParkingRabbit got me £160 back."*

Cost: founder time (initially) plus £2k/mo paid ads to amplify best-performing content from month 2.

### 3. Borough-specific SEO (compound moat)

The 33 council pages on this wiki are not just internal documentation. Each is a public landing page tuned to one query: *"appeal a [borough] pcn"*. Five-year compounding effect: each page that ranks #1 for its borough captures every PCN recipient in that borough at the moment of highest intent.

This is the long-term defensible channel. We will not be the cheapest paid advertiser forever; we can be the most useful page on the internet for "appeal a Lambeth PCN" forever.

## Channels we are NOT pursuing at launch

- **Council partnerships** — politically tricky in v0.1. Revisit in v0.3 once we have data on appeal-quality and council acceptance rate.
- **Insurance partnerships** — interesting (PCN exposure overlaps with motor insurance) but a long sales cycle.
- **App Store discoverability** — the App Store is a distribution channel, not an acquisition channel for niche utilities. We treat App Store presence as table-stakes for credibility, not as a driver.
- **Affiliates** — too early; no measurable funnel yet.

## Launch sequence

| Week | Milestone |
|---|---|
| **v0.1 launch (beta)** | Soft launch via TikTok founder content; link to PWA at `parkingrabbit.com`; manual user-acquisition cap at 200/week to ensure quality monitoring. |
| **+4 weeks** | First Google Ads campaign on top 20 highest-intent keywords. |
| **+8 weeks** | Per-borough landing-page SEO push (already wiki-resident; submit sitemap). |
| **+12 weeks** | If unit economics hold, scale paid acquisition to 5,000 appeals/month run-rate. |
| **v0.2 launch** | Re-launch with auto-submission as the headline feature; pitch to UK press (Telegraph motoring desk, This is Money, MSE). |

## Success metrics (v0.1)

- **Activation**: % of users who reach the "Pay" screen after photo capture (target ≥ 60%).
- **Conversion**: % of users on the "Pay" screen who pay (target ≥ 75%).
- **Appeal acceptance rate** (proxy for product quality): % of submitted appeals cancelled at informal-rep stage (target ≥ 40%; benchmark: London Tribunal success rate is 49.4%[^1] — we should be in that range or higher since informal-rep stage is more forgiving).
- **NPS / referral**: 14-day post-appeal NPS (target ≥ 50).

[^1]: London Councils, *Enforcement and appeals statistics 2024-25* — <https://www.londoncouncils.gov.uk/news-and-press-releases/2025/london-councils-enforcement-and-appeals-statistics-2024-25>
