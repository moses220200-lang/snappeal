/**
 * Canonical Snappeal logo system.
 *
 *   <SnappealMark  size={n} variant="dark|light" />     // shield only
 *   <SnappealLogo  size={n} variant="dark|light" layout="horizontal|stacked" />
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

const SHIELD_PATH =
  // 80×80 viewBox. Rounded-rectangle shield with a soft pointed base —
  // matches the brand reference (navy rounded shield silhouette, slightly
  // taller than wide so it reads as a shield rather than a tile).
  "M40 4 C 24 4, 14 6, 10 10 C 8 12, 8 16, 8 24 V 44 C 8 58, 18 68, 40 76 C 62 68, 72 58, 72 44 V 24 C 72 16, 72 12, 70 10 C 66 6, 56 4, 40 4 Z";

const CHECK_PATH =
  // Hollow check / tick centred in the shield. Drawn as a stroked
  // polyline (rounded caps + joins) so it matches the brand reference
  // rather than rendering as a filled glyph.
  "M24 42 L 35 53 L 56 30";

export function SnappealMark({
  size = 40,
  variant = "dark",
  className = "",
  title = "Snappeal",
}: MarkProps) {
  const shieldFill = variant === "dark" ? "#0b1f44" : "#ffffff";
  const checkStroke = variant === "dark" ? "#ffffff" : "#0b1f44";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
      className={`shrink-0 ${className}`}
    >
      <path d={SHIELD_PATH} fill={shieldFill} />
      <path
        d={CHECK_PATH}
        fill="none"
        stroke={checkStroke}
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type LogoProps = {
  size?: number;
  variant?: Variant;
  layout?: Layout;
  tagline?: string | null;
  className?: string;
};

export function SnappealLogo({
  size = 40,
  variant = "dark",
  layout = "horizontal",
  tagline = null,
  className = "",
}: LogoProps) {
  const wordmarkColor =
    variant === "dark" ? "text-snappeal-navy" : "text-white";
  const taglineColor =
    variant === "dark" ? "text-snappeal-muted" : "text-white/75";
  const wordmarkSize = size <= 32 ? "text-base" : size <= 44 ? "text-xl" : "text-2xl";

  if (layout === "stacked") {
    return (
      <div className={`flex flex-col items-center gap-2 ${className}`}>
        <SnappealMark size={size} variant={variant} />
        <span
          className={`${wordmarkSize} font-bold tracking-tight ${wordmarkColor}`}
        >
          Snappeal
        </span>
        {tagline && (
          <span className={`text-[11px] ${taglineColor}`}>{tagline}</span>
        )}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <SnappealMark size={size} variant={variant} />
      <div className="flex flex-col leading-tight">
        <span
          className={`${wordmarkSize} font-bold tracking-tight ${wordmarkColor}`}
        >
          Snappeal
        </span>
        {tagline && (
          <span className={`text-[11px] ${taglineColor}`}>{tagline}</span>
        )}
      </div>
    </div>
  );
}

/* ─── backward-compat aliases ───
 * Old callsites (app/page.tsx, app/terms, app/privacy) imported
 * `ShieldLogo` + `Wordmark`. Keep the names so nothing breaks; they map
 * to the canonical components above. */

export function ShieldLogo({
  size = 40,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return <SnappealMark size={size} variant="dark" className={className} />;
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <SnappealLogo
      size={40}
      variant="dark"
      layout="horizontal"
      tagline="We draft & submit your parking-ticket appeal"
      className={className}
    />
  );
}
