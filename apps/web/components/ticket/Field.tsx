"use client";

/**
 * `<Field>` — small label + value cell used inside the "Council confirms"
 * extracted block on a ticket card. `humanize` + `formatFieldValue` are
 * the helpers that turn raw SSE-stream entries (camelCase keys, pence
 * integers, ISO timestamps) into customer-facing display strings.
 *
 * Extracted out of TicketCard.tsx — pure presentational + pure data
 * formatters.
 */

export function Field({ label, value }: { label: string; value: string }) {
  const display = formatFieldValue(label, value);
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wide text-parkingrabbit-muted">
        {humanize(label)}
      </dt>
      <dd className="text-parkingrabbit-navy font-semibold truncate" title={display}>
        {display}
      </dd>
    </div>
  );
}

/** camelCase → "Camel Case"; strips trailing "Pence" so price fields read
 *  cleanly (the formatter already converts pence → £). */
export function humanize(field: string): string {
  return field
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/\s*Pence$/, "");
}

/** SSE-driven `extracted` events arrive as raw stringified pence /
 *  ISO timestamps because that's what the connector emits. Format on
 *  display so the customer doesn't see "16000" under "Amount" or a
 *  raw ISO under "Issued At". */
export function formatFieldValue(field: string, raw: string): string {
  if (raw == null || raw === "") return "—";
  // Amounts — any field name ending in "Pence" carries integer pence.
  if (/Pence$/.test(field)) {
    const n = Number(raw);
    if (Number.isFinite(n)) {
      return new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
        maximumFractionDigits: 0,
      }).format(n / 100);
    }
  }
  // Timestamps — issuedAt, paidAt, fetchedAt, dueDateAt, discountUntil,
  // fullChargeFrom — anything that parses cleanly as a date.
  if (/At$|Date$|Until$|From$|Date[A-Z]/.test(field)) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      // Same-day events get a time too — daily deadlines just need
      // the date.
      const hasTime = /T\d{2}:/.test(raw);
      return hasTime
        ? d.toLocaleString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : d.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          });
    }
  }
  return raw;
}
