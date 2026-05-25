/**
 * `/app/capture` — back-compat redirect (v0.2.18).
 *
 * The upload entry point moved onto `/app/tickets` so the user never
 * leaves the smart-card surface. The home page's "Scan PCN" hero now
 * deep-links to `/app/tickets?scan=1`, which auto-triggers the file
 * picker on mount via the same-page activation gesture.
 *
 * This stub redirects any back-compat link (notification, bookmark,
 * deep-link in email) to the new entry. The previous 1480-LoC capture
 * page (camera live-preview, in-page OCR review, manual entry) was
 * deleted; the equivalent functionality now lives across:
 *
 *   - `/app/tickets` — file picker entry + Scan/Upload buttons
 *   - `<TicketCard mode="list" />` — pending-review surface (image
 *     preview, three editable fields, T&Cs CTA)
 *   - `<TicketCardBody>` `GatheringEvidenceCard` — grounds quiz
 *
 * Live camera capture (the legacy `navigator.mediaDevices` flow) is
 * paused for v0.2.18; the file-input's `capture="environment"` attr on
 * the Scan button opens the system camera on mobile, which covers the
 * primary use case. The fancy auto-snap with edge detection can come
 * back in a later pass if needed.
 */
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function CaptureRedirect() {
  redirect("/app/tickets?scan=1");
}
