type LogoProps = {
  size?: number;
  className?: string;
};

export function ShieldLogo({ size = 36, className = "" }: LogoProps) {
  return (
    <svg
      width={size}
      height={(size * 72) / 64}
      viewBox="0 0 64 72"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Snappeal"
      className={className}
    >
      <path
        d="M32 2 L60 10 V36 C60 52 49 64 32 70 C15 64 4 52 4 36 V10 Z"
        fill="#0b1f44"
      />
      <text
        x="32"
        y="46"
        fontFamily="var(--font-inter), Inter, system-ui, sans-serif"
        fontSize="32"
        fontWeight={700}
        textAnchor="middle"
        fill="#ffffff"
        letterSpacing={-1}
      >
        S
      </text>
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <ShieldLogo size={40} />
      <div className="flex flex-col leading-tight">
        <span className="text-xl font-bold text-snappeal-navy tracking-tight">
          Snappeal
        </span>
        <span className="text-[11px] text-snappeal-muted">
          We draft &amp; submit your parking-ticket appeal
        </span>
      </div>
    </div>
  );
}
