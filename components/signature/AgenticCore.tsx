"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

/**
 * AgenticCore — the visual soul of NomosX.
 *
 * Not a schema. Not a diagram. A living metaphor:
 * points of light drift, connect, and occasionally pulse —
 * the autonomous think tank, felt not explained.
 *
 * Two variants:
 *   "section"    — focal visual (larger, brighter, breathing center)
 *   "atmosphere" — full-page fixed background (subtle, immersive, no center)
 *
 * Atmosphere mode innovations:
 *   • 42 particles spread across the full viewport
 *   • Opacity so low you feel it rather than see it (3-7%)
 *   • Connections that pulse briefly when they form (a soft "thought" passing)
 *   • Particles that twinkle — slowly fade in and out (the system is alive)
 *   • No center attraction — free drift across the whole canvas
 *   • Throttled to 30fps for battery life (imperceptible at this speed)
 *
 * Charter: black canvas, #f0f0fa, white = only accent, light = life.
 */

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  baseOpacity: number;
  twinklePhase: number;
  twinkleSpeed: number;
}

interface AgenticCoreProps {
  className?: string;
  variant?: "section" | "atmosphere";
}

const SECTION_COUNT = 28;
const ATMOS_COUNT = 42;
const SECTION_CONNECT = 18;
const ATMOS_CONNECT = 14;
const CENTER = { x: 50, y: 50 };

export function AgenticCore({ className, variant = "section" }: AgenticCoreProps) {
  const t = useTranslations();
  const [mounted, setMounted] = useState(false);
  const [, forceRender] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number>(0);
  const lastTickRef = useRef<number>(0);
  const pulseRef = useRef<number>(0);

  const isAtmos = variant === "atmosphere";
  const count = isAtmos ? ATMOS_COUNT : SECTION_COUNT;
  const connectDist = isAtmos ? ATMOS_CONNECT : SECTION_CONNECT;

  // Initialize particles
  useEffect(() => {
    particlesRef.current = Array.from({ length: count }, (_, i) => ({
      id: i,
      x: isAtmos ? Math.random() * 100 : 15 + Math.random() * 70,
      y: isAtmos ? Math.random() * 100 : 15 + Math.random() * 70,
      vx: (Math.random() - 0.5) * (isAtmos ? 0.03 : 0.08),
      vy: (Math.random() - 0.5) * (isAtmos ? 0.03 : 0.08),
      size: Math.random() * (isAtmos ? 0.5 : 0.8) + (isAtmos ? 0.2 : 0.3),
      baseOpacity: isAtmos
        ? Math.random() * 0.08 + 0.06
        : Math.random() * 0.25 + 0.15,
      twinklePhase: Math.random() * Math.PI * 2,
      twinkleSpeed: Math.random() * 0.008 + 0.003,
    }));
    setMounted(true);
  }, [count, isAtmos]);

  // Animation loop
  useEffect(() => {
    if (!mounted) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    let visible = true;
    const el = containerRef.current;
    const io =
      el && "IntersectionObserver" in window
        ? new IntersectionObserver(
            (entries) => { visible = entries[0]?.isIntersecting ?? false; },
            { threshold: 0.02 }
          )
        : null;
    if (el && io) io.observe(el);

    const tick = (now: number) => {
      rafRef.current = requestAnimationFrame(tick);
      // Throttle: atmosphere at ~30fps, section at 60fps
      const interval = isAtmos ? 33 : 16;
      if (now - lastTickRef.current < interval) return;
      lastTickRef.current = now;

      if (!visible) return;

      const ps = particlesRef.current;
      for (const p of ps) {
        if (!isAtmos) {
          // Section: gentle attraction to center
          const dx = CENTER.x - p.x;
          const dy = CENTER.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 5) {
            p.vx += (dx / dist) * 0.002;
            p.vy += (dy / dist) * 0.002;
          }
        }
        // Damping
        p.vx *= 0.985;
        p.vy *= 0.985;
        // Tiny random drift
        p.vx += (Math.random() - 0.5) * (isAtmos ? 0.005 : 0.01);
        p.vy += (Math.random() - 0.5) * (isAtmos ? 0.005 : 0.01);
        p.x += p.vx;
        p.y += p.vy;
        // Bounds
        if (isAtmos) {
          // Wrap around (seamless infinite field)
          if (p.x < -2) p.x = 102;
          if (p.x > 102) p.x = -2;
          if (p.y < -2) p.y = 102;
          if (p.y > 102) p.y = -2;
        } else {
          if (p.x < 10) { p.x = 10; p.vx *= -0.5; }
          if (p.x > 90) { p.x = 90; p.vx *= -0.5; }
          if (p.y < 10) { p.y = 10; p.vy *= -0.5; }
          if (p.y > 90) { p.y = 90; p.vy *= -0.5; }
        }
        // Twinkle
        p.twinklePhase += p.twinkleSpeed;
      }
      // Pulse counter for connection shimmering
      pulseRef.current = (pulseRef.current + 1) % 100000;
      forceRender((n) => (n + 1) % 100000);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      io?.disconnect();
    };
  }, [mounted, isAtmos]);

  const particles = particlesRef.current;
  const pulse = pulseRef.current;

  // Compute connections
  const connections: Array<{ a: Particle; b: Particle; dist: number; idx: number }> = [];
  if (mounted) {
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < connectDist) {
          connections.push({ a: particles[i], b: particles[j], dist: d, idx: i * 100 + j });
        }
      }
    }
  }

  // Compute twinkle opacity for a particle
  const twinkleOpacity = (p: Particle) => {
    const twinkle = (Math.sin(p.twinklePhase) + 1) / 2; // 0..1
    const factor = isAtmos ? 0.5 + twinkle * 0.5 : 0.7 + twinkle * 0.3;
    return p.baseOpacity * factor;
  };

  // Connection pulse — each connection has a slow shimmer based on pulse + idx
  const connectionAlpha = (dist: number, idx: number) => {
    const proximity = 1 - dist / connectDist; // 0..1
    const base = isAtmos ? 0.06 : 0.12;
    // Slow shimmer — different phase per connection
    const shimmer = (Math.sin(pulse * 0.015 + idx * 0.7) + 1) / 2; // 0..1
    const shimmerBoost = isAtmos ? shimmer * 0.04 : shimmer * 0.06;
    return proximity * (base + shimmerBoost);
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        isAtmos
          ? "fixed inset-0 pointer-events-none overflow-hidden z-0"
          : "relative w-full flex items-center justify-center min-h-[360px] sm:min-h-[440px]",
        className
      )}
      aria-label={isAtmos ? undefined : t("AgenticCore.ariaLabel")}
      aria-hidden={isAtmos}
    >
      {/* Radial glow — only in section variant */}
      {!isAtmos && (
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(60%,420px)] aspect-square pointer-events-none"
          style={{
            background: "radial-gradient(circle, rgba(240,240,250,0.06) 0%, transparent 65%)",
          }}
        />
      )}

      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 100 100"
        preserveAspectRatio={isAtmos ? "xMidYMid slice" : "xMidYMid meet"}
      >
        {/* Connections — hairlines with slow shimmer */}
        {connections.map((c) => {
          const alpha = connectionAlpha(c.dist, c.idx);
          return (
            <line
              key={`c-${c.idx}`}
              x1={c.a.x}
              y1={c.a.y}
              x2={c.b.x}
              y2={c.b.y}
              stroke={`rgba(240,240,250,${alpha})`}
              strokeWidth={isAtmos ? "0.08" : "0.12"}
            />
          );
        })}

        {/* Particles — points of light that twinkle */}
        {particles.map((p) => (
          <circle
            key={p.id}
            cx={p.x}
            cy={p.y}
            r={p.size}
            fill={`rgba(240,240,250,${twinkleOpacity(p)})`}
          />
        ))}

        {/* Breathing center — only in section variant */}
        {!isAtmos && (
          <>
            <circle
              cx={CENTER.x}
              cy={CENTER.y}
              r="2.5"
              fill="rgba(240,240,250,0.08)"
              stroke="rgba(240,240,250,0.45)"
              strokeWidth="0.18"
              className="nx-core-breath"
            />
            <circle
              cx={CENTER.x}
              cy={CENTER.y}
              r="2.5"
              fill="none"
              stroke="rgba(240,240,250,0.2)"
              strokeWidth="0.1"
              className="nx-core-emit"
            />
            <circle
              cx={CENTER.x}
              cy={CENTER.y}
              r="2.5"
              fill="none"
              stroke="rgba(240,240,250,0.15)"
              strokeWidth="0.08"
              className="nx-core-emit-2"
            />
          </>
        )}
      </svg>

      <style jsx global>{`
        @keyframes nx-core-breath {
          0%, 100% { stroke-opacity: 0.45; r: 2.5; }
          50% { stroke-opacity: 0.8; r: 3; }
        }
        .nx-core-breath { animation: nx-core-breath 4s ease-in-out infinite; }
        @keyframes nx-core-emit {
          0% { r: 2.5; stroke-opacity: 0.2; }
          100% { r: 14; stroke-opacity: 0; }
        }
        .nx-core-emit { animation: nx-core-emit 5s ease-out infinite; }
        @keyframes nx-core-emit-2 {
          0% { r: 2.5; stroke-opacity: 0.15; }
          100% { r: 22; stroke-opacity: 0; }
        }
        .nx-core-emit-2 { animation: nx-core-emit-2 7s ease-out infinite; animation-delay: 2s; }
        @media (prefers-reduced-motion: reduce) {
          .nx-core-breath, .nx-core-emit, .nx-core-emit-2 { animation: none; }
        }
      `}</style>
    </div>
  );
}
