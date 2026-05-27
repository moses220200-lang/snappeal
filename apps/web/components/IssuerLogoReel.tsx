"use client";

/**
 * IssuerLogoReel — the issuer tile on a ticket card.
 *
 * Two lives in one component:
 *   1. Idle  — renders the normal static council logo tile (the same
 *      112px square the card always showed). Tappable when `onCouncilClick`
 *      is supplied so the user can change the issuer via the picker sheet.
 *   2. Scanning — while a freshly uploaded PCN is being read (`scanning`
 *      true) it turns into a vertical "slot machine" that cycles through
 *      UK council logos. The moment OCR settles (`scanning` flips false)
 *      it decelerates, glides, and locks precisely onto the detected
 *      council with a bounce + glow, then hands back to the static tile.
 *
 * Why it owns both states: the landing has to keep playing *after*
 * `scanning` goes false, so a parent that simply unmounts the reel on
 * `scanning=false` would cut the most satisfying moment. Keeping the
 * whole lifecycle here means the header just renders one element.
 *
 * Animation engine: the reel is driven imperatively against a ref
 * (`stripRef.style.transform`) on a `setTimeout` chain so the spin never
 * causes a React re-render per frame. Each step applies a CSS transition
 * whose duration follows the speed curve, so the linear steps chain into
 * one continuous scroll. The final settle is a single long ease-out glide
 * over a few cells, which reads as a natural deceleration. Lock-in
 * flourishes (bounce + glow) live in globals.css.
 *
 * Performance: the strip holds many cells but they reference only the
 * handful of unique council logo URLs, so the browser dedupes them to a
 * few cached image loads. Transforms + opacity + a small blur are all
 * GPU-friendly, so it stays smooth on mobile.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Building2 } from "lucide-react";

export interface ReelCouncil {
  slug?: string;
  name: string;
  logoUrl?: string | null;
  logoBg?: string | null;
}

interface Props {
  /** True while OCR is reading the PCN (card kind scanning/processing). */
  scanning: boolean;
  /** The resolved council to land on once detected, or null. */
  council: { name: string; logoUrl?: string | null; logoBg?: string | null } | null;
  /** Fallback issuer name (OCR'd) for the landed tile when no logo. */
  councilName: string | null;
  /** Candidate councils to cycle through (those with logos look best). */
  pool: ReelCouncil[];
  /** When supplied, the idle tile is tappable (opens the council picker). */
  onCouncilClick?: () => void;
}

// Speed curve + landing constants. Tuned so the reel reads fast and
// playful at first, calms down if reading takes a while, and always
// stays on screen long enough (MIN_SPIN_MS) to feel intentional.
const FAST_STEP_MS = 125;
const MED_STEP_MS = 215;
const FAST_PHASE_MS = 1_600;
const MIN_SPIN_MS = 1_200;
const SETTLE_LEAD = 5; // cells glided through during the final decel
const SETTLE_MS = 900;
const INIT_CELLS = 160; // ~16s of spin before we ever need to extend
const EXTEND_CELLS = 120;

// Used only when the live council list hasn't loaded yet — keeps the reel
// believable (cycling London authority initials) instead of stalling.
const FALLBACK_NAMES = [
  "Westminster",
  "Camden",
  "Islington",
  "Lambeth",
  "Hackney",
  "Southwark",
  "Wandsworth",
  "Barnet",
  "Tower Hamlets",
  "Transport for London",
];

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

function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Build `n` reel cells by drawing from `pool` in reshuffled bags, so the
 *  same logo never repeats back-to-back. */
function buildCells(pool: ReelCouncil[], n: number): ReelCouncil[] {
  const out: ReelCouncil[] = [];
  let bag: ReelCouncil[] = [];
  while (out.length < n) {
    if (bag.length === 0) bag = shuffle(pool);
    out.push(bag.pop() as ReelCouncil);
  }
  return out;
}

function pickFrom(pool: ReelCouncil[]): ReelCouncil {
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Shared logo face — img → initials → generic government icon. Used by
 *  the reel cells, the landed tile, and the idle tile, so handing between
 *  them is visually seamless. */
function LogoFace({
  logoUrl,
  name,
}: {
  logoUrl?: string | null;
  name?: string | null;
}) {
  if (logoUrl) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={logoUrl}
        alt=""
        loading="eager"
        decoding="async"
        className="max-w-[80%] max-h-[80%] object-contain"
      />
    );
  }
  if (name) {
    return (
      <span className="text-[24px] font-bold text-parkingrabbit-navy">
        {initials(name)}
      </span>
    );
  }
  return <Building2 className="size-7 text-parkingrabbit-muted" strokeWidth={1.75} />;
}

export function IssuerLogoReel({
  scanning,
  council,
  councilName,
  pool,
  onCouncilClick,
}: Props) {
  // `engaged` latches on the first time we see `scanning` and stays true
  // through the landing; it's the reel that flips it back off once it has
  // locked in (so the static tile takes over again).
  const [engaged, setEngaged] = useState(scanning);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (scanning) setEngaged(true);
  }, [scanning]);

  if (!engaged) {
    return (
      <IdleTile
        council={council}
        councilName={councilName}
        onCouncilClick={onCouncilClick}
      />
    );
  }
  return (
    <SpinningReel
      scanning={scanning}
      council={council}
      councilName={councilName}
      pool={pool}
      onLanded={() => setEngaged(false)}
    />
  );
}

/* ─────────────────────── idle (static) tile ─────────────────────── */

function IdleTile({
  council,
  councilName,
  onCouncilClick,
}: {
  council: Props["council"];
  councilName: Props["councilName"];
  onCouncilClick?: () => void;
}) {
  const tile = (
    <span
      className="size-28 rounded-2xl border border-parkingrabbit-border shrink-0 flex items-center justify-center overflow-hidden"
      style={{ background: council?.logoBg || "#ffffff" }}
      aria-hidden
    >
      {council?.logoUrl || councilName ? (
        <LogoFace logoUrl={council?.logoUrl} name={councilName} />
      ) : (
        <span className="size-full bg-parkingrabbit-bg/60 animate-pulse" />
      )}
    </span>
  );

  if (!onCouncilClick) return tile;
  return (
    <button
      type="button"
      onClick={onCouncilClick}
      className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-parkingrabbit-primary/40 transition active:scale-[0.98]"
      aria-label={
        council ? `Change issuer (currently ${council.name})` : "Select issuer"
      }
    >
      {tile}
    </button>
  );
}

/* ─────────────────────── spinning reel ─────────────────────── */

function SpinningReel({
  scanning,
  council,
  councilName,
  pool,
  onLanded,
}: {
  scanning: boolean;
  council: Props["council"];
  councilName: Props["councilName"];
  pool: ReelCouncil[];
  onLanded: () => void;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);

  const [cells, setCells] = useState<ReelCouncil[]>([]);
  const [cellH, setCellH] = useState(112);
  const [landed, setLanded] = useState(false);
  const [finalFace, setFinalFace] = useState<ReelCouncil | null>(null);

  // Mutable engine state — kept in refs so the timeout loop reads the
  // latest values without re-subscribing.
  const cellsRef = useRef<ReelCouncil[]>([]);
  const cellHRef = useRef(112);
  const idxRef = useRef(0);
  const startRef = useRef(0);
  const settlingRef = useRef(false);
  const startedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Latest props for the loop to read at settle time (the loop closes over
  // the values at engine-start, when the council is still unknown).
  const scanningRef = useRef(scanning);
  const councilRef = useRef(council);
  const nameRef = useRef(councilName);
  useEffect(() => {
    scanningRef.current = scanning;
    councilRef.current = council;
    nameRef.current = councilName;
  }, [scanning, council, councilName]);

  const reelPool = useMemo<ReelCouncil[]>(() => {
    const withLogos = pool.filter((p) => p.logoUrl);
    const base = withLogos.length >= 3 ? withLogos : pool.length ? pool : [];
    if (base.length) return shuffle(base);
    return FALLBACK_NAMES.map((name) => ({ name }));
  }, [pool]);

  // The council list is fetched async, so the reel often starts before any
  // logos are available (it spins through name-initials as a stand-in).
  // The moment the real logo pool arrives, swap the not-yet-shown cells to
  // it so the reel upgrades to logos within a frame or two of the fetch.
  const poolRef = useRef(reelPool);
  useEffect(() => {
    poolRef.current = reelPool;
    if (!startedRef.current || settlingRef.current || landed) return;
    if (!reelPool.some((p) => p.logoUrl)) return; // only upgrade *to* logos
    const keep = Math.min(idxRef.current + 2, cellsRef.current.length);
    const head = cellsRef.current.slice(0, keep);
    const tail = buildCells(reelPool, Math.max(INIT_CELLS, keep + 48) - keep);
    const next = head.concat(tail);
    cellsRef.current = next;
    setCells(next);
  }, [reelPool, landed]);

  const reducedMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  // Measure the tile so the reel scrolls in exact cell-height steps (no
  // sub-pixel drift from the border box).
  useLayoutEffect(() => {
    const h = viewportRef.current?.clientHeight;
    if (h && h > 0) {
      cellHRef.current = h;
      setCellH(h);
    }
  }, []);

  useEffect(() => {
    const pickRandom = () => pickFrom(poolRef.current);

    const initial = buildCells(poolRef.current, INIT_CELLS);
    cellsRef.current = initial;

    const applyTransform = (i: number, durMs: number, ease: string) => {
      const strip = stripRef.current;
      if (!strip) return;
      strip.style.transition = `transform ${durMs}ms ${ease}, filter ${durMs}ms ${ease}`;
      strip.style.transform = `translate3d(0, ${-(i * cellHRef.current)}px, 0)`;
    };

    if (reducedMotion) {
      // No spin — resolve straight to the landed face.
      const c = councilRef.current;
      setFinalFace({
        logoUrl: c?.logoUrl ?? null,
        logoBg: c?.logoBg ?? "#ffffff",
        name: c?.name ?? nameRef.current ?? "",
      });
      setLanded(true);
      const t = setTimeout(onLanded, 500);
      return () => clearTimeout(t);
    }

    idxRef.current = 0;
    settlingRef.current = false;
    startRef.current = performance.now();

    const settle = () => {
      settlingRef.current = true;
      const c = councilRef.current;
      const face: ReelCouncil = {
        logoUrl: c?.logoUrl ?? null,
        logoBg: c?.logoBg ?? "#ffffff",
        name: c?.name ?? nameRef.current ?? "",
      };
      const landIdx = idxRef.current + SETTLE_LEAD;
      const arr = cellsRef.current.slice();
      while (arr.length <= landIdx) arr.push(pickRandom());
      for (let k = idxRef.current + 1; k < landIdx; k++) arr[k] = pickRandom();
      arr[landIdx] = face;
      cellsRef.current = arr;
      setCells(arr);
      setFinalFace(face);

      // Next frame: glide to the final cell with a long ease-out and lift
      // the motion blur.
      requestAnimationFrame(() => {
        idxRef.current = landIdx;
        const strip = stripRef.current;
        if (strip) strip.style.filter = "blur(0px)";
        applyTransform(landIdx, SETTLE_MS, "cubic-bezier(0.12, 0.66, 0.18, 1)");
      });

      // After the glide, reveal the lock-in (bounce + glow) then hand
      // control back to the static tile.
      timerRef.current = setTimeout(() => {
        setLanded(true);
        timerRef.current = setTimeout(onLanded, 720);
      }, SETTLE_MS + 40);
    };

    const step = () => {
      if (settlingRef.current) return;
      const elapsed = performance.now() - startRef.current;
      if (!scanningRef.current && elapsed >= MIN_SPIN_MS) {
        settle();
        return;
      }
      idxRef.current += 1;
      // Keep a healthy runway of cells ahead of the cursor.
      if (idxRef.current > cellsRef.current.length - 16) {
        const next = cellsRef.current.concat(
          buildCells(poolRef.current, EXTEND_CELLS),
        );
        cellsRef.current = next;
        setCells(next);
      }
      const dur = elapsed < FAST_PHASE_MS ? FAST_STEP_MS : MED_STEP_MS;
      applyTransform(idxRef.current, dur, "linear");
      timerRef.current = setTimeout(step, dur);
    };

    const raf = requestAnimationFrame(() => {
      const h = viewportRef.current?.clientHeight;
      if (h && h > 0) {
        cellHRef.current = h;
        setCellH(h);
      }
      // Rebuild from the freshest pool (the council list may have arrived
      // in the frame between the effect running and this rAF), commit the
      // cells (deferred off the effect body), and lay the strip out at the
      // top before the first step kicks in.
      cellsRef.current = buildCells(poolRef.current, INIT_CELLS);
      setCells(cellsRef.current);
      startedRef.current = true;
      applyTransform(0, 0, "linear");
      if (stripRef.current) stripRef.current.style.filter = "blur(0.5px)";
      timerRef.current = setTimeout(step, FAST_STEP_MS);
    });

    return () => {
      cancelAnimationFrame(raf);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // Engine runs once for the lifetime of the spinning reel. Latest props
    // are read through refs; reelPool/reducedMotion are stable per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={viewportRef}
      className="size-28 rounded-2xl border border-parkingrabbit-border shrink-0 relative overflow-hidden bg-white"
      role="img"
      aria-label="Identifying the issuing council"
    >
      {landed && finalFace ? (
        <div
          className="absolute inset-0 flex items-center justify-center parkingrabbit-issuer-land"
          style={{ background: finalFace.logoBg || "#ffffff" }}
        >
          <LogoFace logoUrl={finalFace.logoUrl} name={finalFace.name} />
          <span className="pointer-events-none absolute inset-0 rounded-2xl parkingrabbit-issuer-glow" />
        </div>
      ) : (
        <div
          ref={stripRef}
          className="absolute inset-x-0 top-0 will-change-transform"
          style={{ transform: "translate3d(0,0,0)" }}
        >
          {cells.map((c, i) => (
            <div
              key={i}
              className="flex items-center justify-center"
              style={{ height: cellH, background: c.logoBg || "#ffffff" }}
            >
              <LogoFace logoUrl={c.logoUrl} name={c.name} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
