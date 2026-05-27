# Royal Borough of Kensington and Chelsea

Last refreshed **2026-05-27 (v0.3.10)**.

!!! info "Verification status"
    **✅ Verified 2026-05-19** against the council's own website.

!!! warning "Manual today — Chatbot Max needs a specialised prompt"
    RBKC's challenge route is **Chatbot Max** (a conversational LLM frontend), not a traditional form. No `agent_prompt` / `lookup_agent_prompt` and no grounds-registry entry — runs as `manual` until a Chatbot Max-aware prompt is authored and dry-run. The Lambeth/Westminster Imperial-stack pattern does NOT fork cleanly here.

## Issuer details

- **Authority**: Royal Borough of Kensington and Chelsea (RBKC)
- **PCN reference prefix**: PCN numbers issued by RBKC
- **Issuer type**: borough

## Where to send representations

### Online (preferred)
- **Help hub**: <https://www.rbkc.gov.uk/parking-permissions/parking-fines-and-penalty-charge-notices-pcns/help-your-penalty-charge-notice-pcn>
- **Chatbot Max** (24/7 conversational challenge tool): <https://www.rbkc.gov.uk/parking-permissions/parking-fines-and-penalty-charge-notices-pcns/help-your-penalty-charge-notice-pcn/challenge-your-pcn-chatbot-max>
- **Accepted file formats**: JPEG/JPG, BMP, PDF
- **Maximum file size**: 10 MB per file; up to **6 files** per challenge
- **Maximum files**: 6

### Phone (automated guidance)
- `020 7046 1500` — 24-hour automated tailored guidance

## Timelines

- **Discount window**: 14 days from PCN issue (informal challenge must be made within this window for the 50% discount to be paused).
- **Notice to Owner deadline**: 28 days from NtO issue for formal representations.

## Notes

- RBKC operates **Chatbot Max** as the first-line challenge route. ParkingRabbit's submission engine (v0.3) needs to handle the chatbot conversation flow rather than a traditional form.
- The portal **times out after 60 minutes**, so the council advises drafting the letter in a separate editor and pasting it in. ParkingRabbit already does this by drafting locally and copying to clipboard.

## Submission method

- **Automation status** lives on `councils.automation_status` — view at `/admin/councils/kensington-chelsea`. **As of v0.3.7 K&C is `manual`** — no `lookup_agent_prompt` or `agent_prompt` exists yet, and the MCP agent is not trained for Chatbot Max's conversational shape (Westminster's fork-base is a traditional form-fill prompt, not a chat-loop). ⚠️ **Do not flip K&C to `automated_beta` without writing a Chatbot Max-aware prompt and dry-running it** — the form-fill agent will hang or pick the wrong button on the chat flow.
- The engine routes through email fallback (`appealEmail` on the council row) if portal automation throws / returns `success: false`.

## Sources

- RBKC, *Help with your Penalty Charge Notice (PCN)* — <https://www.rbkc.gov.uk/parking-permissions/parking-fines-and-penalty-charge-notices-pcns/help-your-penalty-charge-notice-pcn>
- RBKC, *Chatbot Max* — <https://www.rbkc.gov.uk/parking-permissions/parking-fines-and-penalty-charge-notices-pcns/help-your-penalty-charge-notice-pcn/chatbot-max-your-247-parking-assistance-tool>
