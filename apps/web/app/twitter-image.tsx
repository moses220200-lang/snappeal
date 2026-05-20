// Twitter card image — same 1200×630 PNG as the OpenGraph image. Route
// segment config (runtime / size / contentType / alt) must be defined
// inline per Next.js convention; only the default handler is re-exported.
import OgImage from "./opengraph-image";

export const runtime = "edge";
export const alt = "Snappeal — challenge your London parking ticket";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default OgImage;
