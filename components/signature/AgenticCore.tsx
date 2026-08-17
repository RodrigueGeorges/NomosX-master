"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * AgenticCore — latent space, breathing.
 *
 * A continuous noise field rendered at low resolution and scaled up.
 * No blobs, no dots, no nodes, no bands — just black that breathes.
 * The field shifts slowly (the system thinking) and very rarely,
 * a soft convergence brightens a region (a thought emerging).
 *
 * Technique: low-res canvas (80×50) with smoothed noise → scaled to full screen.
 * This is the domain-warped gradient approach used by Stripe, Vercel, and
 * the best 2026 shader backgrounds — but on 2D canvas, no WebGL needed.
 *
 * Charter: black canvas, #f0f0fa, white = only accent, light = life.
 */

interface AgenticCoreProps {
  className?: string;
  variant?: "section" | "atmosphere";
}

// --- Value noise (cheap, smooth, no deps) ---
// We use a grid of random values + bilinear interpolation.
// This produces smooth, organic fields — not blocky.

const GRID_W = 80;
const GRID_H = 50;

function makeNoiseGrid(): Float32Array {
  const g = new Float32Array(GRID_W * GRID_H);
  for (let i = 0; i < g.length; i++) g[i] = Math.random();
  return g;
}

// Smooth interpolation between grid points
function sampleNoise(
  grids: Float32Array[],
  x: number,
  y: number,
  t: number
): number {
  // Wrap coordinates
  const gx = ((x % GRID_W) + GRID_W) % GRID_W;
  const gy = ((y % GRID_H) + GRID_H) % GRID_H;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const x1 = (x0 + 1) % GRID_W;
  const y1 = (y0 + 1) % GRID_H;
  const fx = gx - x0;
  const fy = gy - y0;
  // Smoothstep
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  // Cycle through grids over time for temporal variation
  const cycle = t * 0.00008;
  const i0 = Math.floor(cycle) % grids.length;
  const i1 = (Math.floor(cycle) + 1) % grids.length;
  const tf = cycle - Math.floor(cycle);
  const tfSmooth = tf * tf * (3 - 2 * tf);

  const g0 = grids[i0];
  const g1 = grids[i1];

  const v00 = g0[y0 * GRID_W + x0];
  const v10 = g0[y0 * GRID_W + x1];
  const v01 = g0[y1 * GRID_W + x0];
  const v11 = g0[y1 * GRID_W + x1];
  const v00b = g1[y0 * GRID_W + x0];
  const v10b = g1[y0 * GRID_W + x1];
  const v01b = g1[y1 * GRID_W + x0];
  const v11b = g1[y1 * GRID_W + x1];

  const a = v00 * (1 - sx) + v10 * sx;
  const b = v01 * (1 - sx) + v11 * sx;
  const c = v00b * (1 - sx) + v10b * sx;
  const d = v01b * (1 - sx) + v11b * sx;

  const v0 = a * (1 - sy) + b * sy;
  const v1 = c * (1 - sy) + d * sy;

  return v0 * (1 - tfSmooth) + v1 * tfSmooth;
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

    let W = 0, H = 0, dpr = 1;

    // Low-res buffer for noise field
    const buffer = document.createElement("canvas");
    const bufCtx = buffer.getContext("2d");
    if (!bufCtx) return;
    buffer.width = GRID_W;
    buffer.height = GRID_H;
    const imageData = bufCtx.createImageData(GRID_W, GRID_H);

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
      // Scale buffer to full screen with smoothing
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
    };
    resize();
    window.addEventListener("resize", resize);

    // Pre-generate noise grids (cycle through them for temporal evolution)
    const NUM_GRIDS = 8;
    const grids: Float32Array[] = [];
    for (let i = 0; i < NUM_GRIDS; i++) grids.push(makeNoiseGrid());

    // --- Convergence events ---
    interface Convergence {
      gx: number;
      gy: number;
      radius: number;
      maxRadius: number;
      life: number;
    }
    const convergences: Convergence[] = [];
    let convTimer = 0;
    const CONV_INTERVAL = isAtmos ? 12000 : 8000;

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

    // Opacity settings — tuned to be visible but not distracting
    const BASE_BRIGHTNESS = isAtmos ? 10 : 16; // 0-255 scale, very low
    const BREATH_AMP = isAtmos ? 4 : 6; // how much it oscillates
    const CONV_BOOST = isAtmos ? 18 : 28; // convergence brightening

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (!visible) return;
      const dt = Math.min(now - lastTime, 50);
      lastTime = now;
      time += dt;

      // Convergence timer
      convTimer += dt;
      if (convTimer > CONV_INTERVAL + Math.random() * 5000) {
        convTimer = 0;
        convergences.push({
          gx: 10 + Math.random() * (GRID_W - 20),
          gy: 8 + Math.random() * (GRID_H - 16),
          radius: 0,
          maxRadius: 25,
          life: 0,
        });
      }

      // Update convergences
      for (let i = convergences.length - 1; i >= 0; i--) {
        const c = convergences[i];
        c.life += dt / 4000;
        c.radius = c.life * c.maxRadius;
        if (c.life >= 1) convergences.splice(i, 1);
      }

      // Render noise field to low-res buffer
      const data = imageData.data;
      const breath = Math.sin(time * 0.0003) * 0.5 + 0.5; // 0..1, slow breath

      // Offset for domain warping — shifts the field over time
      const warpX = time * 0.003;
      const warpY = time * 0.002;

      for (let y = 0; y < GRID_H; y++) {
        for (let x = 0; x < GRID_W; x++) {
          // Domain-warped noise: sample at warped coordinates
          const wx = x + warpX + sampleNoise(grids, x * 0.5, y * 0.5, time) * 4;
          const wy = y + warpY + sampleNoise(grids, x * 0.5 + 100, y * 0.5 + 100, time) * 4;
          const n = sampleNoise(grids, wx, wy, time);

          // Base brightness from noise + breathing
          let brightness = BASE_BRIGHTNESS + n * BREATH_AMP + breath * BREATH_AMP * 0.3;

          // Convergence boost
          for (const c of convergences) {
            const dx = x - c.gx;
            const dy = y - c.gy;
            const d = Math.sqrt(dx * dx + dy * dy);
            const distFromFront = Math.abs(d - c.radius);
            const waveWidth = 8;
            if (distFromFront < waveWidth) {
              const proximity = 1 - distFromFront / waveWidth;
              const fade = Math.sin(c.life * Math.PI); // fade in and out
              brightness += proximity * CONV_BOOST * fade;
            }
          }

          // Clamp
          brightness = Math.min(40, Math.max(0, brightness));

          const idx = (y * GRID_W + x) * 4;
          data[idx] = brightness * 0.94;     // R (240/255)
          data[idx + 1] = brightness * 0.94; // G
          data[idx + 2] = brightness;        // B (250/255)
          data[idx + 3] = 255;
        }
      }

      bufCtx.putImageData(imageData, 0, 0);

      // Draw scaled to full screen
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(buffer, 0, 0, GRID_W, GRID_H, 0, 0, W, H);

      // Optional: subtle vignette mask to fade edges (blend with pure black)
      const vGrad = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
      vGrad.addColorStop(0, "rgba(0, 0, 0, 0)");
      vGrad.addColorStop(1, "rgba(0, 0, 0, 0.5)");
      ctx.fillStyle = vGrad;
      ctx.fillRect(0, 0, W, H);
    };

    if (!reduce) {
      raf = requestAnimationFrame(draw);
    } else {
      // Static: faint noise
      const data = imageData.data;
      for (let y = 0; y < GRID_H; y++) {
        for (let x = 0; x < GRID_W; x++) {
          const n = grids[0][y * GRID_W + x];
          const b = (BASE_BRIGHTNESS + n * BREATH_AMP) * 0.5;
          const idx = (y * GRID_W + x) * 4;
          data[idx] = b * 0.94;
          data[idx + 1] = b * 0.94;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        }
      }
      bufCtx.putImageData(imageData, 0, 0);
      ctx.drawImage(buffer, 0, 0, GRID_W, GRID_H, 0, 0, W, H);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
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
