/**
 * Light wrapper around the Vibration API. No-op when unsupported (desktop
 * browsers, iOS Safari without user-gesture permission, etc.) so callers
 * never need a guard.
 *
 * Use these named intents, not raw durations, so we can re-tune the
 * vibration grammar centrally if needed.
 */
type HapticIntent = "tap" | "success" | "warning" | "error" | "select";

const PATTERNS: Record<HapticIntent, number | number[]> = {
  tap: 8,           // micro-tap (button)
  select: 12,       // option pick
  success: [12, 40, 18],  // 1-2 punch — appeal submitted, draft ready
  warning: [20, 50, 20],
  error: [40, 60, 40, 60, 40],
};

export function haptic(intent: HapticIntent = "tap") {
  if (typeof navigator === "undefined") return;
  if (typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(PATTERNS[intent]);
  } catch {
    /* ignore */
  }
}
