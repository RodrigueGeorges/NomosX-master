"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * AgenticCore — atmospheric convergence field.
 *
 * Canvas-based. What it evokes (not shows):
 *   • Points of light drift along an invisible flow field (organic, not random)
 *   • Hairlines form between nearby points (the system mapping territory)
 *   • Pulses travel along connections (thoughts passing between agents)
 *   • Periodically, a region brightens — convergence (the system focusing)
 *   • Depth: 3 layers (far/mid/near) at different scales and opacities
 *
 * Inspired by: Stripe gradient mesh, Linear particle field, Vercel grid,
 * OpenAI's dark aesthetic. Premium, cinematic, never distracting.
 *
 * Performance: single canvas, 60fps, ~60 particles total, pauses off-screen
 * and on reduced-motion. No external libs.
 *
 * Charter: black canvas, #f0f0fa, white = only accent, light = life.
 */

interface AgenticCoreProps {
  className?: string;
  variant?: "section" | "atmosphere";
}

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  layer: number; // 0=far, 1=mid, 2=near
  phase: number;
}

interface Pulse {
  conn: [P, P];
  progress: number; // 0..1
  speed: number;
}

interface Convergence {
  x: number;
  y: number;
  radius: number;
  intensity: number;
  life: number; // 0..1
}

const COLOR = "240, 240, 250";

// Simple 2D pseudo-noise for the flow field (cheaper than Perlin)
function flowAngle(x: number, y: number, t: number): number {
  return (
    Math.sin(x * 0.008 + t * 0.0003) * Math.cos(y * 0.006 + t * 0.0002) * Math.PI * 2 +
    Math.sin(y * 0.01 + t * 0.00015) * Math.PI
  );
}

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

    // --- Setup ---
    let W = 0;
    let H = 0;
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
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

    // --- Particles (3 depth layers) ---
    const counts = isAtmos
      ? [28, 18, 10] // far, mid, near
      : [18, 12, 6];
    const total = counts.reduce((a, b) => a + b, 0);
    const particles: P[] = [];

    const initParticles = () => {
      particles.length = 0;
      let id = 0;
      for (let layer = 0; layer < 3; layer++) {
        for (let i = 0; i < counts[layer]; i++) {
          const layerScale = [0.6, 0.8, 1.2][layer];
          const layerOpacity = isAtmos
            ? [0.12, 0.2, 0.35][layer]
            : [0.25, 0.4, 0.6][layer];
          particles.push({
            x: Math.random() * W,
            y: Math.random() * H,
            vx: 0,
            vy: 0,
            size: (Math.random() * 1.2 + 0.6) * layerScale,
            opacity: layerOpacity * (Math.random() * 0.4 + 0.6),
            layer,
            phase: Math.random() * Math.PI * 2,
          });
          id++;
        }
      }
    };
    initParticles();

    // --- Pulses (signals traveling along connections) ---
    const pulses: Pulse[] = [];
    const maxPulses = isAtmos ? 3 : 5;

    // --- Convergence events ---
    const convergences: Convergence[] = [];

    // --- Mouse parallax ---
    let mouseX = W / 2;
    let mouseY = H / 2;
    let targetMouseX = mouseX;
    let targetMouseY = mouseY;
    const onMouse = (e: MouseEvent) => {
      targetMouseX = e.clientX;
      targetMouseY = e.clientY;
    };
    window.addEventListener("mousemove", onMouse);

    // --- Connection distance per layer ---
    const connectDist = isAtmos ? 130 : 160;

    // --- Animation ---
    let raf = 0;
    let visible = true;
    let lastTime = 0;
    let time = 0;
    let convTimer = 0;

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

      // Smooth mouse
      mouseX += (targetMouseX - mouseX) * 0.02;
      mouseY += (targetMouseY - mouseY) * 0.02;
      const parallaxX = (mouseX - W / 2) * 0.008;
      const parallaxY = (mouseY - H / 2) * 0.008;

      // Clear with slight trail (creates motion blur on connections)
      ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
      ctx.fillRect(0, 0, W, H);

      // Update particles via flow field
      for (const p of particles) {
        const angle = flowAngle(p.x, p.y, time);
        const speed = isAtmos ? 0.15 : 0.25;
        p.vx += Math.cos(angle) * speed * 0.02;
        p.vy += Math.sin(angle) * speed * 0.02;
        p.vx *= 0.96;
        p.vy *= 0.96;
        p.x += p.vx;
        p.y += p.vy;

        // Wrap around
        if (p.x < -10) p.x = W + 10;
        if (p.x > W + 10) p.x = -10;
        if (p.y < -10) p.y = H + 10;
        if (p.y > H + 10) p.y = -10;

        p.phase += 0.003;
      }

      // Convergence events — spawn every ~7s
      convTimer += dt;
      if (convTimer > 7000 && convergences.length < 1) {
        convTimer = 0;
        convergences.push({
          x: W * (0.2 + Math.random() * 0.6),
          y: H * (0.2 + Math.random() * 0.6),
          radius: 0,
          intensity: 0,
          life: 0,
        });
      }
      for (let i = convergences.length - 1; i >= 0; i--) {
        const c = convergences[i];
        c.life += dt / 4000; // 4s life
        c.radius = c.life * 200;
        c.intensity = Math.sin(c.life * Math.PI) * 0.15; // fade in and out
        if (c.life >= 1) convergences.splice(i, 1);
      }

      // Draw connections (same layer only)
      const layerOffsets = [0, 0, 0]; // parallax per layer
      for (let layer = 0; layer < 3; layer++) {
        const layerParts = particles.filter((p) => p.layer === layer);
        const px = parallaxX * (layer + 1) * 0.5;
        const py = parallaxY * (layer + 1) * 0.5;

        for (let i = 0; i < layerParts.length; i++) {
          for (let j = i + 1; j < layerParts.length; j++) {
            const a = layerParts[i];
            const b = layerParts[j];
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d > connectDist) continue;

            const proximity = 1 - d / connectDist;
            const baseAlpha = isAtmos ? 0.04 : 0.08;
            let alpha = proximity * baseAlpha;

            // Boost near convergence events
            for (const c of convergences) {
              const midX = (a.x + b.x) / 2;
              const midY = (a.y + b.y) / 2;
              const cd = Math.sqrt((midX - c.x) ** 2 + (midY - c.y) ** 2);
              if (cd < c.radius) {
                const convProx = 1 - cd / c.radius;
                alpha += convProx * c.intensity * proximity;
              }
            }

            if (alpha < 0.005) continue;

            const ax = a.x + px;
            const ay = a.y + py;
            const bx = b.x + px;
            const by = b.y + py;

            // Gradient stroke — fade at both ends (premium look)
            const grad = ctx.createLinearGradient(ax, ay, bx, by);
            grad.addColorStop(0, `rgba(${COLOR}, 0)`);
            grad.addColorStop(0.5, `rgba(${COLOR}, ${alpha})`);
            grad.addColorStop(1, `rgba(${COLOR}, 0)`);
            ctx.strokeStyle = grad;
            ctx.lineWidth = (layer + 1) * 0.3;
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.stroke();

            // Occasionally spawn a pulse on this connection
            if (pulses.length < maxPulses && Math.random() < 0.0008 * proximity) {
              pulses.push({ conn: [a, b], progress: 0, speed: 0.008 + Math.random() * 0.006 });
            }
          }
        }
      }

      // Draw and update pulses
      for (let i = pulses.length - 1; i >= 0; i--) {
        const pulse = pulses[i];
        pulse.progress += pulse.speed;
        if (pulse.progress >= 1) {
          pulses.splice(i, 1);
          continue;
        }
        const [a, b] = pulse.conn;
        const px = parallaxX * (a.layer + 1) * 0.5;
        const py = parallaxY * (a.layer + 1) * 0.5;
        const x = a.x + (b.x - a.x) * pulse.progress + px;
        const y = a.y + (b.y - a.y) * pulse.progress + py;
        const fade = Math.sin(pulse.progress * Math.PI); // bright in middle
        const pulseAlpha = fade * (isAtmos ? 0.25 : 0.5);

        // Glow
        const glow = ctx.createRadialGradient(x, y, 0, x, y, 6);
        glow.addColorStop(0, `rgba(${COLOR}, ${pulseAlpha})`);
        glow.addColorStop(1, `rgba(${COLOR}, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw particles with glow
      for (const p of particles) {
        const px = parallaxX * (p.layer + 1) * 0.5;
        const py = parallaxY * (p.layer + 1) * 0.5;
        const x = p.x + px;
        const y = p.y + py;
        const twinkle = 0.7 + Math.sin(p.phase) * 0.3;
        let alpha = p.opacity * twinkle;

        // Boost near convergence
        for (const c of convergences) {
          const cd = Math.sqrt((x - c.x) ** 2 + (y - c.y) ** 2);
          if (cd < c.radius) {
            alpha += (1 - cd / c.radius) * c.intensity;
          }
        }

        // Soft radial glow
        const glowSize = p.size * 4;
        const glow = ctx.createRadialGradient(x, y, 0, x, y, glowSize);
        glow.addColorStop(0, `rgba(${COLOR}, ${alpha * 0.8})`);
        glow.addColorStop(0.4, `rgba(${COLOR}, ${alpha * 0.2})`);
        glow.addColorStop(1, `rgba(${COLOR}, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, glowSize, 0, Math.PI * 2);
        ctx.fill();

        // Core dot
        ctx.fillStyle = `rgba(${COLOR}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw convergence ripple
      for (const c of convergences) {
        if (c.intensity <= 0) continue;
        const ripple = ctx.createRadialGradient(c.x, c.y, c.radius * 0.7, c.x, c.y, c.radius);
        ripple.addColorStop(0, `rgba(${COLOR}, 0)`);
        ripple.addColorStop(0.8, `rgba(${COLOR}, ${c.intensity * 0.3})`);
        ripple.addColorStop(1, `rgba(${COLOR}, 0)`);
        ctx.fillStyle = ripple;
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    if (!reduce) {
      raf = requestAnimationFrame(draw);
    } else {
      // Static frame
      ctx.fillStyle = "rgba(0, 0, 0, 1)";
      ctx.fillRect(0, 0, W, H);
      for (const p of particles) {
        ctx.fillStyle = `rgba(${COLOR}, ${p.opacity * 0.5})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouse);
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
