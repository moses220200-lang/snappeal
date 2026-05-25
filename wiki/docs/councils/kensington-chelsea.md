# Royal Borough of Kensington and Chelsea

!!! info "Verification status"
    **✅ Verified 2026-05-19** against the council's own website.

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

- **Automation status** lives on `councils.automation_status` — view at `/admin/councils/kensington-chelsea`. Chatbot Max conversation handling is one of the per-council `agent_prompt` customisations; edit + dry-run at `/admin/councils/kensington-chelsea/automation`.
- The engine routes through email fallback (`appealEmail` on the council row) if portal automation throws / returns `success: false`.

## Sources

- RBKC, *Help with your Penalty Charge Notice (PCN)* — <https://www.rbkc.gov.uk/parking-permissions/parking-fines-and-penalty-charge-notices-pcns/help-your-penalty-charge-notice-pcn>
- RBKC, *Chatbot Max* — <https://www.rbkc.gov.uk/parking-permissions/parking-fines-and-penalty-charge-notices-pcns/help-your-penalty-charge-notice-pcn/chatbot-max-your-247-parking-assistance-tool>
