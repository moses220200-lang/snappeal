# Features

What is in scope, by version. ✅ shipped, 🟡 in progress, ⬜ planned, ⛔ deliberately out.

| Feature | v0.1 | v0.2 | v0.3 |
|---|:---:|:---:|:---:|
| **Capture** | | | |
| PCN photo capture | ⬜ | ✅ | ✅ |
| Multi-photo evidence (up to 6) | ⬜ | ✅ | ✅ |
| Photo library upload (not just camera) | ⬜ | ✅ | ✅ |
| OCR + vision extraction of PCN fields | ⬜ | ✅ | ✅ |
| **Notes** | | | |
| Free-text notes (≤ 2000 chars, hard cap matching server contract) | ⬜ | ✅ | ✅ |
| Guided prompt chips derived from selected grounds | ⬜ | ✅ | ✅ |
| Voice-to-text dictation via Whisper-compatible endpoint (OpenAI / Groq / LiteLLM) | ⛔ | ⬜ | ✅ |
| Pause/resume + mm:ss timer on voice capture | ⛔ | ⛔ | ✅ |
| Append-mode voice transcripts (multiple takes accumulate) | ⛔ | ⛔ | ✅ |
| **Grounds quiz** | | | |
| 6 hard-coded reasons | ⛔ | ✅ | ⛔ (replaced) |
| Deep 75-card grounds catalog across 12 categories | ⛔ | ⛔ | ✅ |
| Inline picker inside the smart card (no popup) | ⛔ | ⛔ | ✅ |
| Lucide outline icons + sticky search + chip filters | ⛔ | ⛔ | ✅ |
| Per-card `promptHook` baked into the drafter prompt | ⛔ | ⛔ | ✅ |
| "Suggested for code N" sort when contravention code is known | ⛔ | ⛔ | ✅ |
| **Knowledge base** | | | |
| Markdown precedent corpus (`apps/web/knowledge/precedents/`) | ⛔ | ⛔ | ✅ |
| Per-contravention-code briefs (12 common London codes) | ⛔ | ⛔ | ✅ |
| Per-council quirks briefs (top 6 London authorities) | ⛔ | ⛔ | ✅ |
| Deterministic ranker + 2500-token-cap renderer | ⛔ | ⛔ | ✅ |
| pgvector embedding retrieval | ⛔ | ⛔ | ⬜ (when corpus > 200 docs) |
| **Appeal strength** | | | |
| AI-returned 0–100 strength score on every draft | ⛔ | ⛔ | ✅ |
| Server-side cap when evidence is thin (no photos + < 50 chars notes) | ⛔ | ⛔ | ✅ |
| Strong/Solid/Weak badge surfaced on the letter-ready card | ⛔ | ⛔ | ✅ |
| Weak-appeal warning banner above Pay £2.99 CTA | ⛔ | ⛔ | ✅ |
| **Payment** | | | |
| Stripe Payment Element | ⬜ | ✅ | ✅ |
| Apple Pay | ⬜ | ✅ | ✅ |
| Google Pay | ⬜ | ✅ | ✅ |
| Card fallback | ⬜ | ✅ | ✅ |
| Service-failure refund (system didn't deliver the work) | ⬜ | ✅ | ✅ |
| **Letter** | | | |
| Single AI call (extract + identify council + draft) | ⬜ | ✅ | ✅ |
| Streaming output (token-by-token) | ⬜ | ✅ | ✅ |
| Inline-editable letter | ⬜ | ✅ | ✅ |
| Copy / Share / Submit actions | ⬜ | ✅ | ✅ |
| Multi-language (en-GB only in v0.1) | ⛔ | ⛔ | ⬜ |
| **Submission** | | | |
| Email fallback (all councils with an appeal email address) | ⬜ | ✅ | ✅ |
| Portal automation via LLM + Playwright MCP (top 7 councils) | ⬜ | ✅ | ✅ |
| Portal automation (all 33 London authorities) | ⛔ | ⬜ | ✅ |
| Portal automation (UK-wide expansion) | ⛔ | ⛔ | ⬜ |
| Confirmation reference / message-id captured | ⬜ | ✅ | ✅ |
| Engine auto-routes (portal → email on congestion) | ⬜ | ✅ | ✅ |
| Manual fallback (copy + open portal) — last-resort path | ⬜ | ✅ | ✅ |
| **Tracking** | | | |
| Per-appeal status (draft / ready / sent / resolved) | ⬜ | ✅ | ✅ |
| Appeals history list on home | ⬜ | ✅ | ✅ |
| Push notifications on council response | ⛔ | ⛔ | ⬜ |
| Email + SMS notifications | ⛔ | ⛔ | ⬜ |
| **Account** | | | |
| Anonymous use (localStorage / IndexedDB) | ⬜ | ⬜ | ⬜ |
| Sign in (Clerk: email magic link / passkeys) | ⛔ | ⬜ | ✅ |
| Migrate local appeals to account on sign-in | ⛔ | ⬜ | ✅ |
| **Distribution** | | | |
| PWA (installable from Safari/Chrome) | ⬜ | ✅ | ✅ |
| iOS app (Capacitor wrapper) | ⛔ | ⛔ | ⬜ |
| Android app (Capacitor wrapper) | ⛔ | ⛔ | ⬜ |
| **Admin** | | | |
| Council KB CRUD | ⬜ (read-only in Phase B) | ✅ | ✅ |
| User management CRUD | ✅ (Phase B) | ✅ | ✅ |
| Appeals dashboard (operator view) | ⬜ | ✅ | ✅ |
| Wiki editor | ⬜ (Phase B) | ✅ | ✅ |

## Out of scope — permanently

- **Speeding tickets / criminal notices** — different regulatory regime (solicitor territory).
- **Private parking operators (ParkingEye, NCP, IAS/POPLA)** — different evidence regime; revisit post-v0.3.
- **Cross-jurisdiction expansion (Scotland, Northern Ireland)** — different statute; England-first.
- **"AI lawyer" framing** — we draft letters, we are not a lawyer. Ever. See [risks](../business/risks.md).
- **In-person tribunal representation** — pointer to the London Tribunals self-rep guidance only.
- **General-purpose AI legal product** — DoNotPay's failure mode; we stay narrow.
