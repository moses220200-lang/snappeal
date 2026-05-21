# Design principles

The rules every screen follows. Anything that violates one of these is wrong, even if it tests well.

## 1. One decision per screen

A screen that asks for two things asks for none. Each step has exactly one primary action and exactly one continue button. Secondary actions (e.g. *Skip*) live as text links, not buttons, and only when they're genuinely escape hatches.

## 2. The user has one free hand

Every interactive element is reachable with a thumb on a phone held in one hand, in portrait, in the rain. No hover states. No drag-and-drop. No long-press as the only path to a feature.

## 3. Plain English, always

No "contravention code". No "TMA 2004". No "statutory grounds". In the UI we say: *"the rule the council says you broke"* and *"why you think it's wrong"*. The legal terms appear in the letter (because the council reviewer reads it), never in the user's screen.

## 4. Honesty is a feature

The pricing screen says "£2.99 — one-off, non-refundable. You're paying for the appeal we draft and submit, not for the outcome." The letter screen says "drafted by ParkingRabbit, not a solicitor." The submit screen says "your appeal isn't sent until the council confirms." We never use words like "guaranteed", "win", or "expert".

## 5. Show the work

The AI runs once, but the user sees what it did: the extracted ticket fields are visible above the letter; the chosen contravention code and ground are labelled. The user can edit any of it. Black-box AI loses trust on the first wrong word.

## 6. Streaming over spinners

Anything that takes more than a second streams. The letter generation streams token-by-token. Photo extraction shows the fields populating one-by-one as the AI identifies them. A spinner is a confession of weakness; streaming is a confession of progress.

## 7. The empty state is the design

The user's first launch — no appeals yet — is the most-seen screen in the product. It must (a) explain what ParkingRabbit does in one sentence, (b) show the £2.99 price honestly, (c) put the "Start Your Appeal" CTA exactly where the thumb is.

## 8. Mobile-first means mobile-only-second

We design for the iPhone SE first (the smallest modern Safari viewport). Anything that works there works everywhere. Desktop is not the design target; desktop is the consolation prize for non-installers.

## 9. Errors are explanations

When something goes wrong — extraction fails, payment fails, submission fails — the message names the cause and offers a next step. "Couldn't read the ticket. You can enter the details manually" is a good error. "An error occurred" is unacceptable.

## 10. Tap less, type less, scroll less

The PCN photo replaces a 14-field form. The notes textarea replaces a multi-screen interview. The letter is generated; the user edits if needed but doesn't write from scratch. If a screen asks the user to type something the camera could see or the AI could infer, the screen is wrong.
