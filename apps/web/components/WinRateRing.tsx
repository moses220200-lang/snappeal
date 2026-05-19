"use client";

import { Trophy } from "lucide-react";

/**
 * Circular progress ring that visualises the user's win rate. Used on the
 * home screen — a small, glanceable badge that turns the abstract "AI
 * picked the strongest ground" promise into a felt number.
 *
 * Stays muted until at least one appeal has resolved (wins+losses > 0),
 * because a 0% ring on day one is psychologically the wrong message.
 */
export function WinRateRing({
  wins,
  losses,
  size = 88,
}: {
  wins: number;
  losses: number;
  size?: number;
}) {
  const resolved = wins + losses;
  const winRate = resolved > 0 ? wins / resolved : 0;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - winRate);
  const hasData = resolved > 0;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="#e5e5ea"
          strokeWidth={stroke}
          fill="none"
        />
        {hasData && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke="#34c759"
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 600ms ease-out" }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {hasData ? (
          <>
            <p className="text-2xl font-bold text-snappeal-navy leading-none">
              {Math.round(winRate * 100)}%
            </p>
            <p className="text-[9px] font-bold uppercase tracking-wide text-snappeal-muted mt-0.5">
              Win rate
            </p>
          </>
        ) : (
          <>
            <Trophy className="size-6 text-snappeal-muted" />
            <p className="text-[9px] font-bold uppercase tracking-wide text-snappeal-muted mt-1">
              Soon
            </p>
          </>
        )}
      </div>
    </div>
  );
}
