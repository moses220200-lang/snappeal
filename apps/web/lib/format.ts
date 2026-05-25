/**
 * Shared formatters used across the ticket card surfaces.
 *
 * Kept ultra-light (no Intl.NumberFormat instantiation) because these
 * fire on every card render and the GB locale is fixed for v0.2.
 */

export function formatGBP(pence: number): string {
  const pounds = pence / 100;
  return Number.isInteger(pounds) ? `£${pounds}` : `£${pounds.toFixed(2)}`;
}

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}
