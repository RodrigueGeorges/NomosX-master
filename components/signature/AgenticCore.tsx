"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * AgenticCore — a brain in continuous thought.
 *
 * What you see:
 *   • ~50 nodes scattered across the screen, each gently breathing (pulsing)
 *   • Curved bezier connections between nearby nodes (organic, not mechanical)
 *   • Signals fire CONTINUOUSLY — bright pulses travel along connections
 *   • When a signal reaches a node, it can BRANCH to multiple neighbors
 *     (propagation cascades through the network — the brain "thinking")
 *   • Signals leave a glowing trail behind them (synapse firing)
 *   • The structure (nodes + connections) is subtle; the ACTIVITY (signals)
 *     is bright — you see the thoughts, not the wiring
 *
 * Inspired by: Synaptic Pro, NeuroMesh, neural-bg
 * Charter: black canvas, #f0f0fa, white = only accent, light = life.
 */

interface AgenticCoreProps {
  className?: string;
  variant?: "section" | "atmosphere";
}

interface Node {
  x: number;
  y: number;
  // Breathing
  phase: number;
  phaseSpeed: number;
  baseSize: number;
  baseOpacity: number;
  // Activation flash when signal arrives
  flash: number;
}

interface Signal {
  fromIdx: number;
  toIdx: number;
  progress: number;
  speed: number;
  intensity: number;
  // Trail positions for glowing trail
  trail: Array<{ x: number; y: number; alpha: number }>;
}

// Precomputed connections (adjacency list)
interface Conn {
  a: number;
  b: number;
  dist: number;
  // Control point for bezier curve (offset perpendicular to the line)
  cx: number;
  cy: number;
}

const COLOR = "240, 240, 250";

// Simple noise for organic node drift
function noise(x: number, y: number, t: number): number {
  return Math.sin(x * 0.01 + t * 0.0005) * Math.cos(y * 0.008 + t * 0.0003);
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

    // --- Nodes ---
    const NODE_COUNT = isAtmos ? 50 : 35;
    const CONNECT_DIST = isAtmos ? 140 : 160;
    const nodes: Node[] = [];
    let conns: Conn[] = [];
    const adjacency: Map<number, number[]> = new Map();
    const signals: Signal[] = [];
    const MAX_SIGNALS = isAtmos ? 12 : 18;

    const initNetwork = () => {
      nodes.length = 0;
      conns = [];
      adjacency.clear();
      signals.length = 0;

      for (let i = 0; i < NODE_COUNT; i++) {
        nodes.push({
          x: Math.random() * W,
          y: Math.random() * H,
          phase: Math.random() * Math.PI * 2,
          phaseSpeed: Math.random() * 0.001 + 0.0005,
          baseSize: Math.random() * 1.2 + 0.8,
          baseOpacity: isAtmos ? Math.random() * 0.12 + 0.08 : Math.random() * 0.2 + 0.15,
          flash: 0,
        });
      }

      // Build connections + adjacency
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < CONNECT_DIST) {
            // Bezier control point — perpendicular offset for curve
            const midX = (nodes[i].x + nodes[j].x) / 2;
            const midY = (nodes[i].y + nodes[j].y) / 2;
            const curveOffset = (Math.random() - 0.5) * d * 0.25;
            const angle = Math.atan2(dy, dx) + Math.PI / 2;
            conns.push({
              a: i,
              b: j,
              dist: d,
              cx: midX + Math.cos(angle) * curveOffset,
              cy: midY + Math.sin(angle) * curveOffset,
            });

            // Adjacency
            if (!adjacency.has(i)) adjacency.set(i, []);
            if (!adjacency.has(j)) adjacency.set(j, []);
            adjacency.get(i)!.push(j);
            adjacency.get(j)!.push(i);
          }
        }
      }
    };

    initNetwork();
    window.addEventListener("resize", () => { resize(); initNetwork(); });

    // --- Signal spawning ---
    // Fire signals continuously — every ~200-400ms
    let signalTimer = 0;

    const fireSignal = (fromIdx?: number) => {
      if (signals.length >= MAX_SIGNALS) return;
      const origin = fromIdx ?? Math.floor(Math.random() * nodes.length);
      const neighbors = adjacency.get(origin);
      if (!neighbors || neighbors.length === 0) return;
      const target = neighbors[Math.floor(Math.random() * neighbors.length)];

      signals.push({
        fromIdx: origin,
        toIdx: target,
        progress: 0,
        speed: 0.008 + Math.random() * 0.006,
        intensity: 0.5 + Math.random() * 0.4,
        trail: [],
      });
    };

    // Quadratic bezier point
    const bezierPoint = (
      t: number,
      p0x: number, p0y: number,
      cpx: number, cpy: number,
      p1x: number, p1y: number
    ) => {
      const mt = 1 - t;
      return {
        x: mt * mt * p0x + 2 * mt * t * cpx + t * t * p1x,
        y: mt * mt * p0y + 2 * mt * t * cpy + t * t * p1y,
      };
    };

    // Find the connection between two nodes
    const findConn = (a: number, b: number): Conn | undefined =>
      conns.find((c) => (c.a === a && c.b === b) || (c.a === b && c.b === a));

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

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (!visible) return;
      const dt = Math.min(now - lastTime, 50);
      lastTime = now;
      time += dt;

      // Smooth mouse
      mouseX += (tMouseX - mouseX) * 0.02;
      mouseY += (tMouseY - mouseY) * 0.02;
      const px = (mouseX - W / 2) * 0.01;
      const py = (mouseY - H / 2) * 0.01;

      // Trail clear — slight motion blur
      ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
      ctx.fillRect(0, 0, W, H);

      // Update nodes — gentle drift via noise + breathing
      for (const n of nodes) {
        n.phase += n.phaseSpeed * dt;
        // Tiny drift
        const nx = noise(n.x, n.y, time);
        const ny = noise(n.y + 100, n.x + 100, time);
        n.x += nx * 0.08;
        n.y += ny * 0.08;
        // Keep in bounds
        if (n.x < 0) n.x = W;
        if (n.x > W) n.x = 0;
        if (n.y < 0) n.y = H;
        if (n.y > H) n.y = 0;
        // Flash decay
        n.flash *= 0.93;
      }

      // Continuous signal firing
      signalTimer += dt;
      if (signalTimer > 150 + Math.random() * 200) {
        signalTimer = 0;
        fireSignal();
        // Sometimes fire 2 at once
        if (Math.random() < 0.3) fireSignal();
      }

      // --- Draw connections (subtle, curved) ---
      for (const c of conns) {
        const a = nodes[c.a];
        const b = nodes[c.b];
        if (!a || !b) continue;

        const flashBoost = Math.max(a.flash, b.flash);
        const baseAlpha = isAtmos ? 0.04 : 0.08;
        const alpha = baseAlpha + flashBoost * 0.15;

        const ax = a.x + px;
        const ay = a.y + py;
        const bx = b.x + px;
        const by = b.y + py;
        const cx = c.cx + px;
        const cy = c.cy + py;

        ctx.strokeStyle = `rgba(${COLOR}, ${alpha})`;
        ctx.lineWidth = isAtmos ? 0.4 : 0.7;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.quadraticCurveTo(cx, cy, bx, by);
        ctx.stroke();
      }

      // --- Draw signals (bright pulses with trails) ---
      for (let i = signals.length - 1; i >= 0; i--) {
        const s = signals[i];
        s.progress += s.speed * dt / 16;

        const from = nodes[s.fromIdx];
        const to = nodes[s.toIdx];
        if (!from || !to) { signals.splice(i, 1); continue; }

        const conn = findConn(s.fromIdx, s.toIdx);
        if (!conn) { signals.splice(i, 1); continue; }

        // Position along bezier curve
        const pos = bezierPoint(
          s.progress,
          from.x + px, from.y + py,
          conn.cx + px, conn.cy + py,
          to.x + px, to.y + py
        );

        // Update trail
        s.trail.push({ x: pos.x, y: pos.y, alpha: 1 });
        if (s.trail.length > 12) s.trail.shift();

        // Draw trail (fading)
        for (let t = 0; t < s.trail.length; t++) {
          const tp = s.trail[t];
          const trailAlpha = (t / s.trail.length) * s.intensity * (isAtmos ? 0.3 : 0.5);
          const trailR = 3 * (t / s.trail.length);
          const trailGlow = ctx.createRadialGradient(tp.x, tp.y, 0, tp.x, tp.y, trailR + 2);
          trailGlow.addColorStop(0, `rgba(${COLOR}, ${trailAlpha})`);
          trailGlow.addColorStop(1, `rgba(${COLOR}, 0)`);
          ctx.fillStyle = trailGlow;
          ctx.beginPath();
          ctx.arc(tp.x, tp.y, trailR + 2, 0, Math.PI * 2);
          ctx.fill();
        }

        // Draw signal head (bright glow)
        const fade = Math.sin(s.progress * Math.PI); // bright in middle
        const headAlpha = fade * s.intensity * (isAtmos ? 0.6 : 0.9);
        const headR = 8;

        const headGlow = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, headR);
        headGlow.addColorStop(0, `rgba(${COLOR}, ${headAlpha})`);
        headGlow.addColorStop(0.3, `rgba(${COLOR}, ${headAlpha * 0.4})`);
        headGlow.addColorStop(1, `rgba(${COLOR}, 0)`);
        ctx.fillStyle = headGlow;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, headR, 0, Math.PI * 2);
        ctx.fill();

        // Bright core
        ctx.fillStyle = `rgba(${COLOR}, ${Math.min(1, headAlpha * 2)})`;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 1.2, 0, Math.PI * 2);
        ctx.fill();

        // Check arrival
        if (s.progress >= 1) {
          // Flash the target node
          to.flash = Math.min(1, to.flash + s.intensity * 0.7);

          // Branch: propagate to 1-2 neighbors (excluding sender)
          if (s.intensity > 0.3) {
            const neighbors = adjacency.get(s.toIdx) || [];
            const candidates = neighbors.filter((n) => n !== s.fromIdx);
            // Shuffle and pick 1-2
            for (let k = candidates.length - 1; k > 0; k--) {
              const r = Math.floor(Math.random() * (k + 1));
              [candidates[k], candidates[r]] = [candidates[r], candidates[k]];
            }
            const branchCount = s.intensity > 0.6 ? 2 : 1;
            for (let k = 0; k < Math.min(branchCount, candidates.length); k++) {
              if (signals.length < MAX_SIGNALS) {
                signals.push({
                  fromIdx: s.toIdx,
                  toIdx: candidates[k],
                  progress: 0,
                  speed: 0.007 + Math.random() * 0.005,
                  intensity: s.intensity * 0.65,
                  trail: [],
                });
              }
            }
          }
          signals.splice(i, 1);
        }
      }

      // --- Draw nodes (subtle, breathing, flash on activation) ---
      for (const n of nodes) {
        const x = n.x + px;
        const y = n.y + py;
        const breath = 0.7 + Math.sin(n.phase) * 0.3;
        const alpha = n.baseOpacity * breath + n.flash * 0.5;
        const size = n.baseSize * (1 + n.flash * 0.5);

        // Glow
        const glowR = size * 5 * (1 + n.flash * 0.5);
        const glow = ctx.createRadialGradient(x, y, 0, x, y, glowR);
        glow.addColorStop(0, `rgba(${COLOR}, ${alpha * 0.5})`);
        glow.addColorStop(0.4, `rgba(${COLOR}, ${alpha * 0.1})`);
        glow.addColorStop(1, `rgba(${COLOR}, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, glowR, 0, Math.PI * 2);
        ctx.fill();

        // Core
        ctx.fillStyle = `rgba(${COLOR}, ${Math.min(1, alpha)})`;
        ctx.beginPath();
        ctx.arc(x, y, size * 0.5, 0, Math.PI * 2);
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
        ctx.arc(n.x, n.y, n.baseSize * 0.5, 0, Math.PI * 2);
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
