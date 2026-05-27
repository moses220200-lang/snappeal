/**
 * Canonical ParkingRabbit logo system.
 *
 *   <ParkingRabbitMark  size={n} variant="dark|light" />     // shield only
 *   <ParkingRabbitLogo  size={n} variant="dark|light" layout="horizontal|stacked" />
 *
 * One shield definition. All sizes scale via the `size` prop; all colour
 * shifts happen via `variant`. The dark variant is the production default
 * (navy fill, white check); the light variant flips for use on dark hero
 * sections. Render this everywhere — favicon, OG, app header, splash,
 * marketing site — so the brand identity stays pixel-identical at every
 * size.
 */

type Variant = "dark" | "light";
type Layout = "horizontal" | "stacked";

type MarkProps = {
  size?: number;
  variant?: Variant;
  className?: string;
  title?: string;
};

/**
 * ParkingRabbit logo mark. Renders the canonical PNG (navy shield + white
 * rabbit silhouette) from `public/logo.png`. The same file backs the
 * favicon (`app/icon.png`), Apple touch icon (`app/apple-icon.png`), and
 * the in-app brand surfaces — so the identity is pixel-identical
 * everywhere. The `variant="light"` flag applies a CSS invert so the mark
 * reads cleanly when laid over dark hero sections; the source PNG itself
 * stays in its dark form.
 */
export function ParkingRabbitMark({
  size = 40,
  variant = "dark",
  className = "",
  title = "ParkingRabbit",
}: MarkProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt={title}
      width={size}
      height={size}
      className={`shrink-0 ${variant === "light" ? "invert" : ""} ${className}`}
      draggable={false}
    />
  );
}

type LogoProps = {
  size?: number;
  variant?: Variant;
  layout?: Layout;
  tagline?: string | null;
  className?: string;
};

export function ParkingRabbitLogo({
  size = 40,
  variant = "dark",
  layout = "horizontal",
  tagline = null,
  className = "",
}: LogoProps) {
  const wordmarkColor =
    variant === "dark" ? "text-parkingrabbit-navy" : "text-white";
  const taglineColor =
    variant === "dark" ? "text-parkingrabbit-muted" : "text-white/75";
  const wordmarkSize = size <= 32 ? "text-base" : size <= 44 ? "text-xl" : "text-2xl";

  if (layout === "stacked") {
    return (
      <div className={`flex flex-col items-center gap-2 ${className}`}>
        <ParkingRabbitMark size={size} variant={variant} />
        <span
          className={`${wordmarkSize} font-bold tracking-tight ${wordmarkColor}`}
        >
          ParkingRabbit
        </span>
        {tagline && (
          <span className={`text-[11px] ${taglineColor}`}>{tagline}</span>
        )}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <ParkingRabbitMark size={size} variant={variant} />
      <div className="flex flex-col leading-tight">
        <span
          className={`${wordmarkSize} font-bold tracking-tight ${wordmarkColor}`}
        >
          ParkingRabbit
        </span>
        {tagline && (
          <span className={`text-[11px] ${taglineColor}`}>{tagline}</span>
        )}
      </div>
    </div>
  );
}

/* ─── backward-compat alias ───
 * `app/page.tsx`, `app/terms`, and `app/privacy` import `Wordmark` (the
 * full lockup with the "we draft & submit your parking-ticket appeal"
 * tagline). Keep the name so those callsites don't churn — it maps to
 * the canonical `ParkingRabbitLogo` above.
 *
 * The sibling `ShieldLogo` alias was removed 2026-05-21 (zero importers).
 */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <ParkingRabbitLogo
      size={40}
      variant="dark"
      layout="horizontal"
      tagline="We draft & submit your parking-ticket appeal"
      className={className}
    />
  );
}
