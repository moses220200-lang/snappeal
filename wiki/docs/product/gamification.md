# Gamification

Gamification in ParkingRabbit is **light, earned, and never coercive**. Users come to fight a parking ticket — not to grind XP. The goal is to make the wins feel like wins and to surface honest progress.

## What's live today

### Win-rate ring (`components/WinRateRing.tsx`)
A circular SVG progress ring on the Home navy hero. Shows the user's **personal win rate** as a percent — `cancelled appeals / (cancelled + rejected)`. Stays muted until at least one appeal has resolved (a 0% ring on day one would be the wrong message). The fill animates from 0 to the target over 600 ms on first paint.

### Confetti burst (`components/Confetti.tsx`)
A 30-piece confetti shower triggered when an appeal flips to `cancelled`. Particles are pre-computed in `useEffect` (purity-safe), fall with random horizontal drift and rotation, fade out over 3 seconds. `sessionStorage`-gated so it fires **once per appeal id** — refreshing the page doesn't re-fire it. Respects `prefers-reduced-motion` via `snappeal-confetti-fall` keyframes (not yet, see open work).

### Haptic success buzz
On the same `cancelled` transition the device buzzes with the `success` haptic pattern (12-40-18 ms). Combined with the confetti, it lands as a small but satisfying "you did it" moment.

### Streak counter (planned)
Three-in-a-row wins should earn a "Streak: 3" badge on the Home hero. Schema for tracking is already in place (`appeals.status` + `appeals.userId`); the rendering is open work.

## What we deliberately avoid

- **XP, levels, ranks.** A driver fighting a fine doesn't want to "level up". They want their money back.
- **Daily streaks / push to engage.** We don't want users hoping for more parking tickets.
- **Leaderboards.** Public win rates would humiliate users who lose — the opposite of trust.
- **Coercive loops.** No "watch an ad to unlock", no "share to win", no FOMO countdown timers on appeals.

## What we will do

- **Honest progress.** The win-rate ring is honest math, even when it makes us look bad. If a user's win rate is 33%, that's what they see.
- **Pro-social proof.** Anonymised community win-rate per council ("Westminster appeals via ParkingRabbit win 64%") on the paywall — backed by the actual data (planned, see [roadmap #3](../business/roadmap.md)).
- **Earned celebrations.** Confetti only on actual `cancelled`. Never on submission, never on a tier purchase. Wins are wins.

## Open work

- Streak badge on Home hero + Tickets list ("On a 4-appeal win streak").
- Per-council win-rate aggregation endpoint + paywall surface.
- `prefers-reduced-motion` short-circuit for confetti (CSS already has this for the Splash; copy the pattern).
- Apple Wallet pass arrival animation when a submission completes (separate file TBD).
