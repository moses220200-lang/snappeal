"use client";

import { useEffect, useState } from "react";

/**
 * One-shot confetti burst — lightweight, zero-dep. Triggered when an
 * appeal flips to `cancelled` (we won!). Runs once per appeal id via
 * sessionStorage so refreshing the page doesn't re-fire it.
 *
 * Particles are pre-computed in useEffect (not in render) so React's
 * purity rule stays happy.
 */
const COLORS = ["#34c759", "#007aff", "#f5454d", "#ff9500", "#fde047"];
const COUNT = 30;
const DURATION_MS = 3000;

interface Particle {
  i: number;
  left: number;
  drift: number;
  delay: number;
  duration: number;
  rotation: number;
  color: string;
  size: number;
}

export function Confetti({ trigger }: { trigger: string | null }) {
  const [particles, setParticles] = useState<Particle[] | null>(null);

  useEffect(() => {
    if (!trigger) return;
    if (typeof window === "undefined") return;
    const key = `snappeal.confetti.${trigger}`;
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, "1");
    const computed: Particle[] = Array.from({ length: COUNT }, (_, i) => ({
      i,
      left: Math.random() * 100,
      drift: (Math.random() - 0.5) * 120,
      delay: Math.random() * 400,
      duration: 2400 + Math.random() * 900,
      rotation: (Math.random() - 0.5) * 720,
      color: COLORS[i % COLORS.length],
      size: 6 + Math.random() * 6,
    }));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setParticles(computed);
    const t = window.setTimeout(() => setParticles(null), DURATION_MS + 200);
    return () => window.clearTimeout(t);
  }, [trigger]);

  if (!particles) return null;

  return (
    <div className="fixed inset-0 z-[150] pointer-events-none overflow-hidden">
      {particles.map((p) => (
        <span
          key={p.i}
          className="snappeal-confetti absolute top-[-10px] block"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.6,
            backgroundColor: p.color,
            borderRadius: 2,
            animation: `snappeal-confetti-fall ${p.duration}ms cubic-bezier(0.16, 1, 0.3, 1) ${p.delay}ms forwards`,
            ["--snappeal-confetti-drift" as string]: `${p.drift}px`,
            ["--snappeal-confetti-rotate" as string]: `${p.rotation}deg`,
          }}
        />
      ))}
    </div>
  );
}
