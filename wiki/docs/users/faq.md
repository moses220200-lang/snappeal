# FAQ

> :material-pencil-outline: **Stub.** Will be expanded as users ask real questions.

## Will ParkingRabbit represent me at a tribunal hearing?

No. We draft your written appeal at every stage including the Tribunal, but we don't appear in person. The Tribunal hearing is on the papers by default and most motorists win without ever attending one. If you need an oral hearing, see [London Tribunals self-rep guidance](https://www.londontribunals.gov.uk/).

## Does paying £2.99 guarantee I'll win?

No. £2.99 buys the appeal we draft and submit — not the outcome. ParkingRabbit drafts a competent representation grounded in your honest facts. If your evidence doesn't support a defence, no AI letter — and no human solicitor — will make it true. The fee is one-off and non-refundable; if our system fails to deliver the appeal we issue an exceptional refund, but we don't refund based on whether the council cancels.

## Is appealing free if I just write the letter myself?

Yes. Citizens Advice and MoneySavingExpert have free templates. ParkingRabbit saves you the writing and the council-routing, and (from v0.2) the submission. We charge for that, honestly.

## Can I appeal after paying the PCN?

Generally no. Paying a PCN is usually treated as accepting the contravention. Don't pay until you've decided whether to appeal.

## What about ULEZ / Congestion Charge / Dart Charge?

These are different regimes. ParkingRabbit v0.1 and v0.2 cover **civil parking enforcement** PCNs only (boroughs + TfL red routes + bus lanes). ULEZ and Congestion Charge are TfL but use different appeal mechanics — on the roadmap for v0.3.

## Will the council know I used an app?

The letter is signed by you and addresses the council in the first person. There's no obligation to disclose how you wrote it. We do recommend reading the letter before sending and editing anything that doesn't sound like you.

## Do I need an account?

You can scan a PCN, see the recommendation, and pick your grounds as a guest. Drafting the letter itself requires a free account — at the "Start drafting" step the app asks you to sign up (your selections + dictated notes are saved on the ticket so nothing is lost). This is partly so we can email or push you when the council replies, partly so you can pick up the appeal on another device.

## Can I dictate my notes instead of typing?

Yes. The "Add details" step has a microphone button with a live mm:ss timer; tap to record, tap again to pause/resume. Multiple takes stack — each new recording appends to the textarea. Guidance chips below the field suggest things worth covering based on which grounds you picked. Speech is transcribed by Whisper (OpenAI-compatible endpoint); if dictation isn't available you can always type.

## What's the "Watch live" thing while my appeal is being submitted?

A live stream of what our AI agent is doing on the council's portal — opening the page, finding the appeal form, pasting your letter, capturing the confirmation reference. It's a disclosure tucked under the smart card; tap to expand. Tucking it away (or admin globally disabling it via the `showMcpLiveView` flag) doesn't reboot the agent — the submission continues either way.

## Why did the appeal-strength score say my case was weak?

The score reflects the **evidence base** — photos + the detail in your notes — not whether you're right. The drafter is calibrated honestly: with no photos and a short note, even a strong-on-paper ground caps at 45. The red warning lists 2–3 specific things you could add to lift the score. You can still pay and submit a sub-50 appeal; the warning is so you're not surprised by an outcome.

**TODO**: many more questions to add as users surface them.
