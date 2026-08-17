"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * AgenticCore — medusa mode.
 *
 * Translucent organisms drifting in dark water.
 * No black fill — pure alpha canvas that blends with the page.
 * Soft radial glows that breathe, drift, and trail.
 * Bioluminescent. Organic. Alive.
 *
 * Charter: black canvas (from page), #f0f0fa, white = only accent, light = life.
 */

interface AgenticCoreProps {
  className?: string;
  variant?: "section" | "atmosphere";
}

interface Medusa {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseAlpha: number;
  pulsePhase: number;
  pulseSpeed: number;
  // Trail — past positions for soft trailing glow
  trail: Array<{ x: number; y: number; alpha: number }>;
}

const COLOR_R = 240;
const COLOR_G = 240;
const COLOR_B = 250;

export function AgenticCore({ className, variant = "atmosphere" }: AgenticCoreProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const isAtmos = variant === "atmosphere";

    let W = 0, H = 0, dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, isAtmos ? 1.5 : 2);
      const rect = container.getBoundingClientRect();
      W = rect.width;
      H = rect.height;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // --- Medusas ---
    const COUNT = isAtmos ? 4 : 3;
    const medusas: Medusa[] = [];

    const initMedusas = () => {
      medusas.length = 0;
      for (let i = 0; i < COUNT; i++) {
        const r = Math.min(W, H) * (0.15 + Math.random() * 0.12);
        medusas.push({
          x: Math.random() * W,
          y: Math.random() * H,
          vx: (Math.random() - 0.5) * 0.15,
          vy: (Math.random() - 0.5) * 0.12,
          radius: r,
          baseAlpha: isAtmos ? 0.025 + Math.random() * 0.015 : 0.04 + Math.random() * 0.02,
          pulsePhase: Math.random() * Math.PI * 2,
          pulseSpeed: 0.0004 + Math.random() * 0.0003,
          trail: [],
        });
      }
    };
    initMedusas();
    window.addEventListener("resize", initMedusas);

    // --- Animation ---
    let raf = 0;
    let visible = true;
    let lastTime = 0;
    let time = 0;

    const io =
      "IntersectionObserver" in window
        ? new IntersectionObserver(
            (entries) => { visible = entries[0]?.isIntersecting ?? false; },
            { threshold: 0.02 }
          )
        : null;
    if (container) io?.observe(container);

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (!visible) return;
      const dt = Math.min(now - lastTime, 50);
      lastTime = now;
      time += dt;

      // Transparent clear — NO black fill, just fade old frames slightly
      // This creates natural trails without covering the page background
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0, 0, 0, 0.06)";
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "source-over";

      for (const m of medusas) {
        // Drift — slow, organic
        m.x += m.vx * dt / 16;
        m.y += m.vy * dt / 16;

        // Gentle direction changes (organic wandering)
        m.vx += (Math.random() - 0.5) * 0.003;
        m.vy += (Math.random() - 0.5) * 0.003;
        // Clamp speed
        const speed = Math.sqrt(m.vx * m.vx + m.vy * m.vy);
        const maxSpeed = 0.25;
        if (speed > maxSpeed) {
          m.vx = (m.vx / speed) * maxSpeed;
          m.vy = (m.vy / speed) * maxSpeed;
        }

        // Wrap around screen
        const margin = m.radius;
        if (m.x < -margin) m.x = W + margin;
        if (m.x > W + margin) m.x = -margin;
        if (m.y < -margin) m.y = H + margin;
        if (m.y > H + margin) m.y = -margin;

        // Pulse — the medusa contracts and expands
        m.pulsePhase += m.pulseSpeed * dt;
        const pulse = 0.75 + Math.sin(m.pulsePhase) * 0.25; // 0.5..1.0
        const alpha = m.baseAlpha * pulse;
        const radius = m.radius * pulse;

        // Update trail
        m.trail.push({ x: m.x, y: m.y, alpha: alpha });
        if (m.trail.length > 20) m.trail.shift();

        // Draw trail — soft, fading glows behind the medusa
        for (let i = 0; i < m.trail.length; i++) {
          const t = m.trail[i];
          const trailFade = (i / m.trail.length) * 0.3; // trails are much fainter
          const trailAlpha = t.alpha * trailFade;
          const trailR = radius * (0.6 + (i / m.trail.length) * 0.4);

          const grad = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, trailR);
          grad.addColorStop(0, `rgba(${COLOR_R}, ${COLOR_G}, ${COLOR_B}, ${trailAlpha})`);
          grad.addColorStop(0.4, `rgba(${COLOR_R}, ${COLOR_G}, ${COLOR_B}, ${trailAlpha * 0.3})`);
          grad.addColorStop(1, `rgba(${COLOR_R}, ${COLOR_G}, ${COLOR_B}, 0)`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(t.x, t.y, trailR, 0, Math.PI * 2);
          ctx.fill();
        }

        // Draw medusa body — soft translucent glow
        const bodyGrad = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, radius);
        bodyGrad.addColorStop(0, `rgba(${COLOR_R}, ${COLOR_G}, ${COLOR_B}, ${alpha * 0.8})`);
        bodyGrad.addColorStop(0.3, `rgba(${COLOR_R}, ${COLOR_G}, ${COLOR_B}, ${alpha * 0.4})`);
        bodyGrad.addColorStop(0.7, `rgba(${COLOR_R}, ${COLOR_G}, ${COLOR_B}, ${alpha * 0.1})`);
        bodyGrad.addColorStop(1, `rgba(${COLOR_R}, ${COLOR_G}, ${COLOR_B}, 0)`);
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.arc(m.x, m.y, radius, 0, Math.PI * 2);
        ctx.fill();

        // Brighter core — the "nerve" of the medusa
        const coreR = radius * 0.15;
        const coreGrad = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, coreR);
        coreGrad.addColorStop(0, `rgba(${COLOR_R}, ${COLOR_G}, ${COLOR_B}, ${alpha * 1.5})`);
        coreGrad.addColorStop(1, `rgba(${COLOR_R}, ${COLOR_G}, ${COLOR_B}, 0)`);
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(m.x, m.y, coreR, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    if (!reduce) {
      raf = requestAnimationFrame(draw);
    } else {
      // Static: one faint medusa
      for (const m of medusas) {
        const grad = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.radius);
        grad.addColorStop(0, `rgba(${COLOR_R}, ${COLOR_G}, ${COLOR_B}, ${m.baseAlpha * 0.5})`);
        grad.addColorStop(1, `rgba(${COLOR_R}, ${COLOR_G}, ${COLOR_B}, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("resize", initMedusas);
      io?.disconnect();
    };
  }, [variant]);

  return (
    <div
      ref={containerRef}
      className={cn(
        variant === "atmosphere"
          ? "fixed inset-0 pointer-events-none overflow-hidden z-0"
          : "absolute inset-0 pointer-events-none overflow-hidden",
        className
      )}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}
