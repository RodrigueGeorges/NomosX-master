"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * EtherealBackground — Atmospheric particle field + subtle radial glow
 * ─────────────────────────────────────────────────────────────────
 * The ambient layer beneath every NomosX page.
 * Not a "background effect" — it's the atmosphere of the think tank.
 *
 * Principles:
 *   • Particles at 2-4% opacity = barely perceptible
 *   • Drift motion = 60s cycle = imperceptible but alive
 *   • No bright colors, no fast movement
 *   • Radial glow at top = single light source metaphor
 */

interface Particle {
  id: number;
  x: number;      // % 0-100
  y: number;      // % 0-100
  size: number;   // px
  opacity: number;
  duration: number; // seconds
  delay: number;
}

function generateParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 2 + 1,        // 1-3px
    opacity: Math.random() * 0.03 + 0.01, // 1-4%
    duration: Math.random() * 40 + 40,    // 40-80s
    delay: Math.random() * -60,           // start mid-cycle
  }));
}

interface EtherealBackgroundProps {
  /** Number of ambient particles (default: 24) */
  particleCount?: number;
  /** Show top radial glow (default: true) */
  radialGlow?: boolean;
  /** Additional className */
  className?: string;
}

export function EtherealBackground({
  particleCount = 24,
  radialGlow = true,
  className,
}: EtherealBackgroundProps) {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    setParticles(generateParticles(particleCount));
  }, [particleCount]);

  return (
    <div
      className={cn("fixed inset-0 pointer-events-none overflow-hidden z-0", className)}
      aria-hidden="true"
    >
      {/* Radial top glow — single ethereal light source */}
      {radialGlow && (
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(74, 158, 255, 0.045), transparent 70%)",
          }}
        />
      )}

      {/* Subtle warm noise texture */}
      <div
        className="absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: "128px 128px",
        }}
      />

      {/* Ambient particles */}
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full bg-black"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            opacity: p.opacity,
            animation: `drift ${p.duration}s ease-in-out infinite`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
