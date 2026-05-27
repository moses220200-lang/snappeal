/**
 * Shared formatters used across the ticket card surfaces.
 *
 * Kept ultra-light (no Intl.NumberFormat instantiation) because these
 * fire on every card render and the GB locale is fixed for v0.2.
 */
import { parseUkDate } from "./parseUkDate";

export function formatGBP(pence: number): string {
  const pounds = pence / 100;
  return Number.isInteger(pounds) ? `£${pounds}` : `£${pounds.toFixed(2)}`;
}

/**
 * "30 Apr" style short date, robust against the dd/mm/yyyy mis-parse
 * V8 does on UK-format strings. Delegates to `parseUkDate` so the
 * UK-first → native-fallback order matches what we persist server-side.
 * Returns "" rather than "Invalid Date" so the UI doesn't surface the
 * raw failure string.
 */
export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const parsed = parseUkDate(iso);
  if (!parsed) return "";
  return parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}
