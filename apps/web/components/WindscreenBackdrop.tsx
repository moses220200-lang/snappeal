/**
 * Stylised PCN-on-windscreen backdrop for the hero.
 *
 * Mirrors the photo in the mockup: cool-grey/blue windscreen glass with a
 * yellow PCN ticket pinned to it, slightly rotated. Purely CSS — no photo
 * asset needed for the prototype.
 */
export function WindscreenBackdrop() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 -z-10 overflow-hidden rounded-3xl"
    >
      {/* Windscreen glass — cool grey-blue gradient with subtle horizontal striations */}
      <div
        className="absolute inset-0 rounded-3xl"
        style={{
          background:
            "linear-gradient(125deg, #cdd6e0 0%, #b9c2ce 35%, #d8dfe7 60%, #a7b1bd 100%)",
        }}
      />
      {/* Soft glass highlight */}
      <div
        className="absolute inset-0 rounded-3xl"
        style={{
          background:
            "linear-gradient(160deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0) 35%, rgba(255,255,255,0) 65%, rgba(255,255,255,0.25) 100%)",
        }}
      />
      {/* Wiper streaks (very faint) */}
      <div className="absolute inset-0 opacity-15">
        <div className="absolute top-1/4 left-0 right-0 h-px bg-white" />
        <div className="absolute top-2/4 left-0 right-0 h-px bg-white" />
        <div className="absolute top-3/4 left-0 right-0 h-px bg-white" />
      </div>

      {/* Yellow PCN ticket — pinned to the windscreen */}
      <div
        className="absolute right-4 bottom-12 sm:right-10 sm:bottom-20 w-44 sm:w-56 rotate-[8deg]"
        style={{
          filter: "drop-shadow(0 6px 14px rgba(0,0,0,0.35))",
        }}
      >
        <div
          className="rounded-sm overflow-hidden text-[10px] sm:text-[11px] font-bold tracking-tight text-black"
          style={{
            background:
              "linear-gradient(180deg, #fde047 0%, #f5d142 60%, #e6bf30 100%)",
          }}
        >
          <div className="bg-red-600 text-white px-3 py-2 text-center leading-tight uppercase">
            Penalty Charge
            <br />
            Notice
          </div>
          <div className="px-3 py-2 leading-tight uppercase">
            <div className="font-extrabold text-[11px] sm:text-[12px] mb-1">
              ⚠ Warning
            </div>
            <p className="text-[8px] sm:text-[9px] font-semibold text-black/85 leading-snug">
              It is an offence for any
              <br />
              person other than the
              <br />
              driver to remove this
              <br />
              notice
            </p>
          </div>
          <div className="bg-black/5 px-3 py-1 text-[7px] sm:text-[8px] font-mono font-bold">
            WC12345678 · 12/05/26
          </div>
        </div>
      </div>

      {/* Decorative dots, top-left of the visual area */}
      <div
        className="absolute top-4 left-4 sm:top-8 sm:left-8 size-20 sm:size-28 opacity-50"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(11, 31, 68, 0.35) 1.2px, transparent 1.5px)",
          backgroundSize: "12px 12px",
        }}
      />
    </div>
  );
}
