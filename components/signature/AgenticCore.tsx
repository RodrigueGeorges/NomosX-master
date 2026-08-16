"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

/**
 * AgenticCore — the visual soul of NomosX.
 *
 * Not a schema. Not a pipeline diagram. A living metaphor:
 * points of light drift in chaos, connect, and converge into order.
 * That's what the think tank does. That's all we show.
 *
 * Three layers of motion:
 *   1. Drift — scattered points wander slowly (the chaos of raw information)
 *   2. Connect — hairlines form between nearby points (the system mapping)
 *   3. Converge — everything pulses toward a breathing center (order emerges)
 *
 * No labels. No agent names. No metrics. Just light, motion, and structure.
 * Sexy enough to stop the scroll. Serious enough for a think tank.
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
  opacity: number;
}

const PARTICLE_COUNT = 28;
const CONNECT_DISTANCE = 18; // viewBox units
const CENTER = { x: 50, y: 50 };

interface AgenticCoreProps {
  className?: string;
  /** "hero" = large, centered, with breathing center (home/About sections) */
  variant?: "hero";
}

export function AgenticCore({ className }: AgenticCoreProps) {
  const t = useTranslations();
  const [mounted, setMounted] = useState(false);
  const [frame, setFrame] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number>(0);

  // Initialize particles once
  useEffect(() => {
    particlesRef.current = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      id: i,
      x: 20 + Math.random() * 60,
      y: 20 + Math.random() * 60,
      vx: (Math.random() - 0.5) * 0.08,
      vy: (Math.random() - 0.5) * 0.08,
      size: Math.random() * 0.8 + 0.4,
      opacity: Math.random() * 0.3 + 0.15,
    }));
    setMounted(true);
  }, []);

  // Animation loop — drift + gentle attraction toward center
  useEffect(() => {
    if (!mounted) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    let visible = true;
    const el = containerRef.current;
    const io =
      el && "IntersectionObserver" in window
        ? new IntersectionObserver(
            (entries) => {
              visible = entries[0]?.isIntersecting ?? false;
            },
            { threshold: 0.05 }
          )
        : null;
    if (el && io) io.observe(el);

    const tick = () => {
      if (!visible) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const ps = particlesRef.current;
      for (const p of ps) {
        // Gentle attraction to center (order emerging from chaos)
        const dx = CENTER.x - p.x;
        const dy = CENTER.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 5) {
          p.vx += (dx / dist) * 0.002;
          p.vy += (dy / dist) * 0.002;
        }
        // Damping
        p.vx *= 0.985;
        p.vy *= 0.985;
        // Small random drift
        p.vx += (Math.random() - 0.5) * 0.01;
        p.vy += (Math.random() - 0.5) * 0.01;
        p.x += p.vx;
        p.y += p.vy;
        // Bounds — wrap softly
        if (p.x < 10) { p.x = 10; p.vx *= -0.5; }
        if (p.x > 90) { p.x = 90; p.vx *= -0.5; }
        if (p.y < 10) { p.y = 10; p.vy *= -0.5; }
        if (p.y > 90) { p.y = 90; p.vy *= -0.5; }
      }
      setFrame((f) => (f + 1) % 100000);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      io?.disconnect();
    };
  }, [mounted]);

  const particles = particlesRef.current;

  // Compute connections (only render nearby pairs — O(n²) but n=28 is fine)
  const connections: Array<{ a: Particle; b: Particle; dist: number }> = [];
  if (mounted) {
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < CONNECT_DISTANCE) {
          connections.push({ a: particles[i], b: particles[j], dist: d });
        }
      }
    }
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative w-full flex items-center justify-center min-h-[360px] sm:min-h-[440px]",
        className
      )}
      aria-label={t("AgenticCore.ariaLabel")}
    >
      {/* Faint radial glow — the light source */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(60%,420px)] aspect-square pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(240,240,250,0.06) 0%, transparent 65%)",
        }}
      />

      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Connections — hairlines that fade with distance */}
        {connections.map((c, i) => {
          const alpha = (1 - c.dist / CONNECT_DISTANCE) * 0.12;
          return (
            <line
              key={`c-${i}-${frame}`}
              x1={c.a.x}
              y1={c.a.y}
              x2={c.b.x}
              y2={c.b.y}
              stroke={`rgba(240,240,250,${alpha})`}
              strokeWidth="0.12"
            />
          );
        })}

        {/* Particles — points of light */}
        {particles.map((p) => (
          <circle
            key={p.id}
            cx={p.x}
            cy={p.y}
            r={p.size}
            fill={`rgba(240,240,250,${p.opacity})`}
          />
        ))}

        {/* Center — the position, breathing */}
        <circle
          cx={CENTER.x}
          cy={CENTER.y}
          r="2.5"
          fill="rgba(240,240,250,0.08)"
          stroke="rgba(240,240,250,0.45)"
          strokeWidth="0.18"
          className="nx-core-breath"
        />
        {/* Emit ring — the position radiating outward */}
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
      </svg>

      <style jsx global>{`
        @keyframes nx-core-breath {
          0%, 100% { stroke-opacity: 0.45; r: 2.5; }
          50% { stroke-opacity: 0.8; r: 3; }
        }
        .nx-core-breath {
          animation: nx-core-breath 4s ease-in-out infinite;
        }
        @keyframes nx-core-emit {
          0% { r: 2.5; stroke-opacity: 0.2; }
          100% { r: 14; stroke-opacity: 0; }
        }
        .nx-core-emit {
          animation: nx-core-emit 5s ease-out infinite;
        }
        @keyframes nx-core-emit-2 {
          0% { r: 2.5; stroke-opacity: 0.15; }
          100% { r: 22; stroke-opacity: 0; }
        }
        .nx-core-emit-2 {
          animation: nx-core-emit-2 7s ease-out infinite;
          animation-delay: 2s;
        }
        @media (prefers-reduced-motion: reduce) {
          .nx-core-breath, .nx-core-emit, .nx-core-emit-2 {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
