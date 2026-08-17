"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * AgenticCore — the agentic think tank, felt not explained.
 *
 * What it evokes:
 *   • Nodes (agents) positioned in a loose constellation, each oscillating
 *     gently around its anchor — alive but purposeful, not drifting
 *   • Connections form between nearby nodes (the system mapping territory)
 *   • Signals travel along connections (agents communicating, debating)
 *   • Periodically a wave of activation spreads from one node to its
 *     neighbors — a "thought cascade" (the system working, not just existing)
 *   • A central node breathes — the emerging position
 *   • Depth: 3 layers (far/mid/near) for parallax richness
 *
 * Not a galaxy. Not a particle field. A working mind.
 *
 * Charter: black canvas, #f0f0fa, white = only accent, light = life.
 */

interface AgenticCoreProps {
  className?: string;
  variant?: "section" | "atmosphere";
}

interface Node {
  // Anchor position (the "home" position this agent oscillates around)
  ax: number;
  ay: number;
  // Current position
  x: number;
  y: number;
  // Oscillation
  oscPhase: number;
  oscSpeed: number;
  oscAmp: number;
  // Visual
  size: number;
  baseOpacity: number;
  layer: number; // 0=far, 1=mid, 2=near
  // Activation (when a signal arrives or a cascade starts here)
  activation: number; // 0..1, decays
}

interface Signal {
  from: Node;
  to: Node;
  progress: number;
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

    // --- Nodes: positioned in a loose constellation ---
    // 3 layers. Each node has an anchor + oscillation.
    const nodes: Node[] = [];
    const nodeCounts = isAtmos ? [14, 10, 6] : [10, 8, 5];
    const connectDist = isAtmos ? 160 : 180;

    const initNodes = () => {
      nodes.length = 0;
      for (let layer = 0; layer < 3; layer++) {
        const count = nodeCounts[layer];
        const layerScale = [0.5, 0.75, 1.0][layer];
        const layerOpacity = isAtmos
          ? [0.15, 0.28, 0.45][layer]
          : [0.3, 0.5, 0.7][layer];

        for (let i = 0; i < count; i++) {
          // Distribute in a loose grid with jitter — looks intentional, not random
          const cols = Math.ceil(Math.sqrt(count * (W / H)));
          const rows = Math.ceil(count / cols);
          const col = i % cols;
          const row = Math.floor(i / cols);
          const cellW = W / cols;
          const cellH = H / rows;
          const jitterX = (Math.random() - 0.5) * cellW * 0.6;
          const jitterY = (Math.random() - 0.5) * cellH * 0.6;

          const ax = cellW * (col + 0.5) + jitterX;
          const ay = cellH * (row + 0.5) + jitterY;

          nodes.push({
            ax,
            ay,
            x: ax,
            y: ay,
            oscPhase: Math.random() * Math.PI * 2,
            oscSpeed: Math.random() * 0.0008 + 0.0004,
            oscAmp: Math.random() * 12 + 6,
            size: (Math.random() * 1.0 + 0.8) * layerScale,
            baseOpacity: layerOpacity * (Math.random() * 0.3 + 0.7),
            layer,
            activation: 0,
          });
        }
      }
    };
    initNodes();
    // Re-init on resize
    window.addEventListener("resize", initNodes);

    // --- Signals ---
    const signals: Signal[] = [];
    const maxSignals = isAtmos ? 4 : 8;

    // --- Cascade timer ---
    let cascadeTimer = 0;
    const cascadeInterval = isAtmos ? 5000 : 3500;

    // --- Mouse parallax ---
    let mouseX = W / 2, mouseY = H / 2;
    let tMouseX = mouseX, tMouseY = mouseY;
    const onMouse = (e: MouseEvent) => {
      tMouseX = e.clientX;
      tMouseY = e.clientY;
    };
    window.addEventListener("mousemove", onMouse);

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

    // Find neighbors of a node (same layer, within connectDist)
    const neighbors = (n: Node): Node[] =>
      nodes.filter(
        (m) =>
          m !== n &&
          m.layer === n.layer &&
          Math.hypot(m.ax - n.ax, m.ay - n.ay) < connectDist
      );

    // Trigger a cascade: activate a node, spawn signals to neighbors
    const triggerCascade = () => {
      // Pick a random near/mid node as origin
      const candidates = nodes.filter((n) => n.layer >= 1);
      if (candidates.length === 0) return;
      const origin = candidates[Math.floor(Math.random() * candidates.length)];
      origin.activation = 1;

      const nbrs = neighbors(origin);
      for (const nb of nbrs.slice(0, 3)) {
        if (signals.length < maxSignals) {
          signals.push({
            from: origin,
            to: nb,
            progress: 0,
            speed: 0.006 + Math.random() * 0.004,
            intensity: 0.6 + Math.random() * 0.3,
          });
        }
      }
    };

    // Spawn a random signal between connected nodes
    const spawnRandomSignal = () => {
      const candidates = nodes.filter((n) => n.layer >= 1);
      if (candidates.length < 2) return;
      const from = candidates[Math.floor(Math.random() * candidates.length)];
      const nbrs = neighbors(from);
      if (nbrs.length === 0) return;
      const to = nbrs[Math.floor(Math.random() * nbrs.length)];
      if (signals.length < maxSignals) {
        signals.push({
          from,
          to,
          progress: 0,
          speed: 0.005 + Math.random() * 0.005,
          intensity: 0.3 + Math.random() * 0.3,
        });
      }
    };

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (!visible) return;
      const dt = Math.min(now - lastTime, 50);
      lastTime = now;
      time += dt;

      // Smooth mouse
      mouseX += (tMouseX - mouseX) * 0.02;
      mouseY += (tMouseY - mouseY) * 0.02;
      const parallaxX = (mouseX - W / 2) * 0.01;
      const parallaxY = (mouseY - H / 2) * 0.01;

      // Trail clear (motion blur)
      ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
      ctx.fillRect(0, 0, W, H);

      // Update nodes — oscillate around anchor
      for (const n of nodes) {
        n.oscPhase += n.oscSpeed * dt;
        n.x = n.ax + Math.cos(n.oscPhase) * n.oscAmp;
        n.y = n.ay + Math.sin(n.oscPhase * 0.7) * n.oscAmp;
        n.activation *= 0.97; // decay
      }

      // Cascade timer
      cascadeTimer += dt;
      if (cascadeTimer > cascadeInterval) {
        cascadeTimer = 0;
        triggerCascade();
      }

      // Random signals
      if (Math.random() < 0.015) spawnRandomSignal();

      // Draw connections (same layer)
      for (let layer = 0; layer < 3; layer++) {
        const layerNodes = nodes.filter((n) => n.layer === layer);
        const px = parallaxX * (layer + 1) * 0.4;
        const py = parallaxY * (layer + 1) * 0.4;

        for (let i = 0; i < layerNodes.length; i++) {
          for (let j = i + 1; j < layerNodes.length; j++) {
            const a = layerNodes[i];
            const b = layerNodes[j];
            const d = Math.hypot(a.x - b.x, a.y - b.y);
            if (d > connectDist) continue;

            const proximity = 1 - d / connectDist;
            let alpha = proximity * (isAtmos ? 0.05 : 0.1);

            // Boost if either endpoint is activated
            const actBoost = Math.max(a.activation, b.activation) * proximity * 0.15;
            alpha += actBoost;

            if (alpha < 0.005) continue;

            const ax = a.x + px;
            const ay = a.y + py;
            const bx = b.x + px;
            const by = b.y + py;

            const grad = ctx.createLinearGradient(ax, ay, bx, by);
            grad.addColorStop(0, `rgba(${COLOR}, 0)`);
            grad.addColorStop(0.5, `rgba(${COLOR}, ${alpha})`);
            grad.addColorStop(1, `rgba(${COLOR}, 0)`);
            ctx.strokeStyle = grad;
            ctx.lineWidth = (layer + 1) * 0.35;
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.stroke();
          }
        }
      }

      // Draw and update signals
      for (let i = signals.length - 1; i >= 0; i--) {
        const s = signals[i];
        s.progress += s.speed * dt / 16;
        if (s.progress >= 1) {
          // Arrived — activate target
          s.to.activation = Math.min(1, s.to.activation + s.intensity * 0.5);
          // Chain: spawn new signals from target to its neighbors
          if (s.intensity > 0.4) {
            const nbrs = neighbors(s.to).filter((n) => n !== s.from);
            for (const nb of nbrs.slice(0, 2)) {
              if (signals.length < maxSignals) {
                signals.push({
                  from: s.to,
                  to: nb,
                  progress: 0,
                  speed: 0.005 + Math.random() * 0.003,
                  intensity: s.intensity * 0.6,
                });
              }
            }
          }
          signals.splice(i, 1);
          continue;
        }

        const px = parallaxX * (s.from.layer + 1) * 0.4;
        const py = parallaxY * (s.from.layer + 1) * 0.4;
        const x = s.from.x + (s.to.x - s.from.x) * s.progress + px;
        const y = s.from.y + (s.to.y - s.from.y) * s.progress + py;
        const fade = Math.sin(s.progress * Math.PI);
        const alpha = fade * s.intensity * (isAtmos ? 0.3 : 0.6);

        // Glow
        const glow = ctx.createRadialGradient(x, y, 0, x, y, 8);
        glow.addColorStop(0, `rgba(${COLOR}, ${alpha})`);
        glow.addColorStop(0.5, `rgba(${COLOR}, ${alpha * 0.3})`);
        glow.addColorStop(1, `rgba(${COLOR}, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw nodes with glow
      for (const n of nodes) {
        const px = parallaxX * (n.layer + 1) * 0.4;
        const py = parallaxY * (n.layer + 1) * 0.4;
        const x = n.x + px;
        const y = n.y + py;
        const alpha = n.baseOpacity + n.activation * 0.3;

        // Outer glow
        const glowSize = n.size * (4 + n.activation * 3);
        const glow = ctx.createRadialGradient(x, y, 0, x, y, glowSize);
        glow.addColorStop(0, `rgba(${COLOR}, ${alpha * 0.6})`);
        glow.addColorStop(0.4, `rgba(${COLOR}, ${alpha * 0.15})`);
        glow.addColorStop(1, `rgba(${COLOR}, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, glowSize, 0, Math.PI * 2);
        ctx.fill();

        // Core
        ctx.fillStyle = `rgba(${COLOR}, ${Math.min(1, alpha)})`;
        ctx.beginPath();
        ctx.arc(x, y, n.size, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    if (!reduce) {
      raf = requestAnimationFrame(draw);
    } else {
      // Static
      for (const n of nodes) {
        ctx.fillStyle = `rgba(${COLOR}, ${n.baseOpacity * 0.5})`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("resize", initNodes);
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
