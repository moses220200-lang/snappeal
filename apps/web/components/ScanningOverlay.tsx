"use client";

/**
 * ScanningOverlay — animated overlay placed over the uploaded PCN
 * image preview while OCR is running. Horizontal scan line + corner
 * brackets + label. Uses the existing `snappeal-hero-scan` keyframe
 * (vertical sweep loop) defined in globals.css.
 */
export function ScanningOverlay({ label = "Scanning PCN..." }: { label?: string }) {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"
      aria-hidden
    >
      {/* Soft blue veil */}
      <div className="absolute inset-0 bg-snappeal-primary/10" />

      {/* Sweep scan line — vertical loop */}
      <div className="absolute inset-x-0 top-0 h-full snappeal-hero-scan">
        <div className="absolute inset-x-2 top-0 h-[2px] bg-gradient-to-r from-transparent via-snappeal-primary to-transparent shadow-[0_0_18px_3px_rgba(0,122,255,0.55)]" />
      </div>

      {/* Corner brackets */}
      <ScanBracket className="top-2 left-2" rotation={0} />
      <ScanBracket className="top-2 right-2" rotation={90} />
      <ScanBracket className="bottom-2 right-2" rotation={180} />
      <ScanBracket className="bottom-2 left-2" rotation={270} />

      {/* Label pill */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full bg-snappeal-navy/85 text-white text-[10.5px] font-semibold px-2.5 py-1 backdrop-blur-sm">
        <span className="size-1.5 rounded-full bg-snappeal-primary snappeal-mcp-tick-dot" />
        {label}
      </div>
    </div>
  );
}

function ScanBracket({
  className,
  rotation,
}: {
  className?: string;
  rotation: number;
}) {
  return (
    <span
      className={`absolute size-5 ${className ?? ""}`}
      style={{ transform: `rotate(${rotation}deg)` }}
    >
      <span className="absolute left-0 top-0 h-0.5 w-4 bg-white/95 rounded-full" />
      <span className="absolute left-0 top-0 w-0.5 h-4 bg-white/95 rounded-full" />
    </span>
  );
}
