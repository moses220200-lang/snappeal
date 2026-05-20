import { Building2 } from "lucide-react";

type Size = "sm" | "md" | "lg";

interface Props {
  slug?: string | null;
  name?: string | null;
  logoUrl?: string | null;
  logoBg?: string | null;
  size?: Size;
  showName?: boolean;
  className?: string;
}

const SWATCH: Record<Size, string> = {
  sm: "size-5 rounded-md",
  md: "size-7 rounded-md",
  lg: "size-10 rounded-lg",
};

const NAME_CLASS: Record<Size, string> = {
  sm: "text-[13px] font-semibold",
  md: "text-sm font-semibold",
  lg: "text-base font-bold",
};

const FALLBACK_ICON: Record<Size, string> = {
  sm: "size-3 text-snappeal-muted",
  md: "size-4 text-snappeal-muted",
  lg: "size-5 text-snappeal-muted",
};

const INITIAL_CLASS: Record<Size, string> = {
  sm: "text-[9px]",
  md: "text-[11px]",
  lg: "text-[13px]",
};

function initials(name?: string | null): string {
  if (!name) return "";
  const words = name
    .replace(/\b(of|the|borough|city|council|royal|corporation)\b/gi, "")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return name.charAt(0).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function CouncilBadge({
  name,
  logoUrl,
  logoBg,
  size = "sm",
  showName = true,
  className = "",
}: Props) {
  const ini = initials(name);
  return (
    <span className={`inline-flex items-center gap-2 min-w-0 ${className}`}>
      <span
        className={`shrink-0 flex items-center justify-center overflow-hidden border border-snappeal-border ${SWATCH[size]}`}
        style={{ background: logoBg || "#ffffff" }}
        aria-hidden
      >
        {logoUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={logoUrl}
            alt=""
            className="max-w-full max-h-full object-contain"
          />
        ) : ini ? (
          <span
            className={`font-bold text-snappeal-navy ${INITIAL_CLASS[size]}`}
          >
            {ini}
          </span>
        ) : (
          <Building2 className={FALLBACK_ICON[size]} strokeWidth={2} />
        )}
      </span>
      {showName && name && (
        <span
          className={`truncate text-snappeal-navy ${NAME_CLASS[size]}`}
          title={name}
        >
          {name}
        </span>
      )}
    </span>
  );
}
