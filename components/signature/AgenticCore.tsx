"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * AgenticCore — quiet intelligence, felt not seen.
 *
 * 2026 approach: shader-like mesh gradient on canvas. No particles,
 * no nodes, no lines. Just light that breathes.
 *
 * What it does:
 *   • 5 soft radial gradients drift slowly across the screen (the "mind")
 *   • They breathe — opacity oscillates over ~20s cycles (the system is alive)
 *   • Very rarely (~10s), a convergence wave rippled outward from a point
 *     (a thought cascading) — a brief brightening that fades
 *   • Everything sits at 1-4% above pure black — you feel it, not see it
 *
 * Inspired by: Stripe mesh gradient, Vercel dark aesthetic,
 * OpenAI restraint, Anthropic editorial calm.
 *
 * Charter: black canvas, #f0f0fa, white = only accent, light = life.
 */

interface AgenticCoreProps {
  className?: string;
  variant?: "section" | "atmosphere";
}

interface Blob {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseOpacity: number;
  phase: number;
  phaseSpeed: number;
}

interface Ripple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  speed: number;
  intensity: number;
}

const COLOR = "240, 240, 250";

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

    // --- Blobs (soft radial gradients that drift) ---
    const BLOB_COUNT = isAtmos ? 5 : 4;
    const blobs: Blob[] = [];
    const ripples: Ripple[] = [];

    const initBlobs = () => {
      blobs.length = 0;
      for (let i = 0; i < BLOB_COUNT; i++) {
        blobs.push({
          x: Math.random() * W,
          y: Math.random() * H,
          vx: (Math.random() - 0.5) * 0.08,
          vy: (Math.random() - 0.5) * 0.08,
          radius: Math.min(W, H) * (0.3 + Math.random() * 0.2),
          baseOpacity: isAtmos ? 0.015 + Math.random() * 0.01 : 0.03 + Math.random() * 0.015,
          phase: Math.random() * Math.PI * 2,
          phaseSpeed: 0.0003 + Math.random() * 0.0002,
        });
      }
    };
    initBlobs();
    window.addEventListener("resize", initBlobs);

    // --- Ripple timer ---
    let rippleTimer = 0;
    const RIPPLE_INTERVAL = isAtmos ? 10000 : 7000;

    const spawnRipple = () => {
      ripples.push({
        x: W * (0.2 + Math.random() * 0.6),
        y: H * (0.2 + Math.random() * 0.6),
        radius: 0,
        maxRadius: Math.max(W, H) * 0.5,
        speed: isAtmos ? 0.8 : 1.2,
        intensity: isAtmos ? 0.015 : 0.03,
      });
    };

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

      // Clear
      ctx.clearRect(0, 0, W, H);

      // Ripple timer
      rippleTimer += dt;
      if (rippleTimer > RIPPLE_INTERVAL + Math.random() * 4000) {
        rippleTimer = 0;
        spawnRipple();
      }

      // Update + draw blobs (soft radial gradients)
      for (const b of blobs) {
        // Drift
        b.x += b.vx * dt / 16;
        b.y += b.vy * dt / 16;
        // Wrap
        if (b.x < -b.radius) b.x = W + b.radius;
        if (b.x > W + b.radius) b.x = -b.radius;
        if (b.y < -b.radius) b.y = H + b.radius;
        if (b.y > H + b.radius) b.y = -b.radius;
        // Breathe
        b.phase += b.phaseSpeed * dt;
        const breath = 0.7 + Math.sin(b.phase) * 0.3;
        const opacity = b.baseOpacity * breath;

        // Radial gradient — soft, organic
        const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.radius);
        grad.addColorStop(0, `rgba(${COLOR}, ${opacity})`);
        grad.addColorStop(0.5, `rgba(${COLOR}, ${opacity * 0.3})`);
        grad.addColorStop(1, `rgba(${COLOR}, 0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
      }

      // Update + draw ripples (convergence waves)
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        r.radius += r.speed * dt / 16;
        if (r.radius > r.maxRadius) {
          ripples.splice(i, 1);
          continue;
        }

        const fade = 1 - r.radius / r.maxRadius;
        const alpha = r.intensity * fade;

        // Soft ring
        const ringWidth = 80;
        const innerR = Math.max(0, r.radius - ringWidth);
        const grad = ctx.createRadialGradient(r.x, r.y, innerR, r.x, r.y, r.radius);
        grad.addColorStop(0, `rgba(${COLOR}, 0)`);
        grad.addColorStop(0.5, `rgba(${COLOR}, ${alpha})`);
        grad.addColorStop(1, `rgba(${COLOR}, 0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
      }
    };

    if (!reduce) {
      raf = requestAnimationFrame(draw);
    } else {
      // Static: one faint blob
      const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.min(W, H) * 0.4);
      grad.addColorStop(0, `rgba(${COLOR}, 0.015)`);
      grad.addColorStop(1, `rgba(${COLOR}, 0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("resize", initBlobs);
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
