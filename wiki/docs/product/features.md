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
| Free-text notes (≤ 800 chars soft limit) | ⬜ | ✅ | ✅ |
| Guided prompt rotation | ⬜ | ✅ | ✅ |
| Voice-to-text dictation | ⛔ | ⬜ | ⬜ |
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
