"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * AgenticCore — Living agent mesh for NomosX.
 * ─────────────────────────────────────────────
 * A neural-network-style canvas that evokes the agentic pipeline:
 * nodes drift, connections form, and light pulses travel the graph.
 *
 * Design principles:
 *   • Felt, not seen — but PRESENT (unlike the old 2% opacity version)
 *   • Monochrome with a whisper of cool blue on active pulses
 *   • Depth via parallax layers (far / mid / near)
 *   • Reacts to mouse — nearby nodes brighten
 *   • Reacts to scroll — mesh drifts slightly (parallax)
 *   • 60fps, pauses on hidden tab, respects reduced-motion
 *
 * Visual layers (bottom → top):
 *   1. Mesh gradient (CSS, static base atmosphere)
 *   2. Far-layer nodes (small, dim, slow) — depth illusion
 *   3. Mid-layer connections + pulses — the "agent graph"
 *   4. Near-layer nodes (larger, brighter) — foreground agents
 *   5. Cursor halo — subtle interaction feedback
 */

interface AgentNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  layer: 0 | 1 | 2;       // 0=far, 1=mid, 2=near
  phase: number;
  pulseIntensity: number;
  baseOpacity: number;
}

interface Pulse {
  fromIdx: number;
  toIdx: number;
  progress: number;
  speed: number;
  intensity: number;
  trail: { x: number; y: number; alpha: number }[];
}

interface AgenticCoreProps {
  className?: string;
  variant?: "section" | "atmosphere";
  /** Total node count across all layers (default: 28) */
  nodeCount?: number;
  /** Max connection distance in px (default: 320) */
  linkDistance?: number;
}

export function AgenticCore({
  className,
  variant = "atmosphere",
  nodeCount = 28,
  linkDistance = 320,
}: AgenticCoreProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const nodesRef = useRef<AgentNode[]>([]);
  const pulsesRef = useRef<Pulse[]>([]);
  const lastPulseRef = useRef<number>(0);
  const mouseRef = useRef<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false });
  const scrollRef = useRef<number>(0);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const initNodes = () => {
      const nodes: AgentNode[] = [];
      // Distribute nodes across 3 depth layers
      const layerCounts = [
        Math.round(nodeCount * 0.45), // far — 45%
        Math.round(nodeCount * 0.35), // mid — 35%
        nodeCount - Math.round(nodeCount * 0.45) - Math.round(nodeCount * 0.35), // near — 20%
      ];

      for (let layer = 0; layer < 3; layer++) {
        for (let i = 0; i < layerCounts[layer]; i++) {
          const isFar = layer === 0;
          const isNear = layer === 2;
          nodes.push({
            x: Math.random() * width,
            y: Math.random() * height,
            vx: (Math.random() - 0.5) * (isFar ? 0.08 : isNear ? 0.22 : 0.15),
            vy: (Math.random() - 0.5) * (isFar ? 0.08 : isNear ? 0.22 : 0.15),
            radius: isFar ? Math.random() * 0.8 + 0.4 : isNear ? Math.random() * 2 + 1.5 : Math.random() * 1.2 + 0.8,
            layer: layer as 0 | 1 | 2,
            phase: Math.random() * Math.PI * 2,
            pulseIntensity: 0,
            baseOpacity: isFar ? 0.08 : isNear ? 0.22 : 0.14,
          });
        }
      }
      nodesRef.current = nodes;
    };

    resize();
    initNodes();

    const handleResize = () => { resize(); initNodes(); };
    window.addEventListener("resize", handleResize);

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;
      mouseRef.current.active = true;
    };
    const handleMouseLeave = () => { mouseRef.current.active = false; };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseleave", handleMouseLeave);

    const handleScroll = () => {
      scrollRef.current = window.scrollY;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });

    // ── Animation loop ──
    const draw = (time: number) => {
      ctx.clearRect(0, 0, width, height);

      const nodes = nodesRef.current;
      const pulses = pulsesRef.current;
      const mouse = mouseRef.current;
      const scrollY = scrollRef.current;

      // Parallax offset per layer (far moves less than near)
      const parallax = [scrollY * 0.02, scrollY * 0.05, scrollY * 0.09];

      // ── Update node positions ──
      if (!reduceMotion) {
        for (const node of nodes) {
          node.x += node.vx;
          node.y += node.vy;

          // Wrap around with margin
          const margin = 40;
          if (node.x < -margin) node.x = width + margin;
          if (node.x > width + margin) node.x = -margin;
          if (node.y < -margin) node.y = height + margin;
          if (node.y > height + margin) node.y = -margin;

          node.phase += 0.006;
          node.pulseIntensity *= 0.95;
        }
      }

      // Helper: get rendered position with parallax
      const rx = (n: AgentNode) => n.x;
      const ry = (n: AgentNode) => n.y - parallax[n.layer];

      // ── Draw connections (mid + near layers only — far is too dim) ──
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].layer === 0) continue; // skip far layer
        for (let j = i + 1; j < nodes.length; j++) {
          if (nodes[j].layer === 0) continue;
          // Only connect same-layer or adjacent layers
          if (Math.abs(nodes[i].layer - nodes[j].layer) > 1) continue;

          const ax = rx(nodes[i]);
          const ay = ry(nodes[i]);
          const bx = rx(nodes[j]);
          const by = ry(nodes[j]);
          const dx = ax - bx;
          const dy = ay - by;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < linkDistance) {
            const t = 1 - dist / linkDistance;
            const layerBoost = nodes[i].layer === 2 || nodes[j].layer === 2 ? 1.3 : 1.0;
            const baseOpacity = t * t * 0.09 * layerBoost;

            // Check for active pulse on this link
            let pulseBoost = 0;
            let pulseColor: [number, number, number] = [240, 240, 250];
            for (const p of pulses) {
              if ((p.fromIdx === i && p.toIdx === j) || (p.fromIdx === j && p.toIdx === i)) {
                pulseBoost = Math.max(pulseBoost, p.intensity * 0.25);
                // Active pulses get a subtle cool tint
                pulseColor = [180, 200, 255];
              }
            }

            const opacity = baseOpacity + pulseBoost;
            const [r, g, b] = pulseColor;

            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${opacity})`;
            ctx.lineWidth = nodes[i].layer === 2 || nodes[j].layer === 2 ? 0.7 : 0.5;
            ctx.stroke();
          }
        }
      }

      // ── Spawn pulses ──
      if (!reduceMotion) {
        if (time - lastPulseRef.current > 1200 + Math.random() * 1800) {
          lastPulseRef.current = time;
          // Pick a random mid/near node
          const candidates = nodes.map((n, i) => ({ n, i })).filter(({ n }) => n.layer >= 1);
          if (candidates.length > 0) {
            const pick = candidates[Math.floor(Math.random() * candidates.length)];
            const i = pick.i;
            // Find neighbors
            const neighbors: number[] = [];
            for (let j = 0; j < nodes.length; j++) {
              if (j === i || nodes[j].layer === 0) continue;
              if (Math.abs(nodes[i].layer - nodes[j].layer) > 1) continue;
              const dx = rx(nodes[i]) - rx(nodes[j]);
              const dy = ry(nodes[i]) - ry(nodes[j]);
              if (Math.sqrt(dx * dx + dy * dy) < linkDistance) neighbors.push(j);
            }
            if (neighbors.length > 0) {
              const j = neighbors[Math.floor(Math.random() * neighbors.length)];
              pulses.push({
                fromIdx: i,
                toIdx: j,
                progress: 0,
                speed: 0.003 + Math.random() * 0.003,
                intensity: 0.7 + Math.random() * 0.3,
                trail: [],
              });
              nodes[i].pulseIntensity = 1;
            }
          }
        }

        // Update + draw pulses
        for (let k = pulses.length - 1; k >= 0; k--) {
          const p = pulses[k];
          p.progress += p.speed;

          const from = nodes[p.fromIdx];
          const to = nodes[p.toIdx];
          const fx = rx(from);
          const fy = ry(from);
          const tx = rx(to);
          const ty = ry(to);

          if (p.progress >= 1) {
            nodes[p.toIdx].pulseIntensity = Math.max(nodes[p.toIdx].pulseIntensity, 0.7);
            pulses.splice(k, 1);
            continue;
          }

          // Ease-in-out for smooth travel
          const eased = p.progress < 0.5
            ? 2 * p.progress * p.progress
            : 1 - Math.pow(-2 * p.progress + 2, 2) / 2;

          const px = fx + (tx - fx) * eased;
          const py = fy + (ty - fy) * eased;

          // Trail — last 8 positions
          p.trail.push({ x: px, y: py, alpha: p.intensity });
          if (p.trail.length > 10) p.trail.shift();

          // Draw trail
          for (let t = 0; t < p.trail.length; t++) {
            const tp = p.trail[t];
            const trailAlpha = (t / p.trail.length) * tp.alpha * 0.3;
            const trailR = 1 + (t / p.trail.length) * 2;
            ctx.fillStyle = `rgba(180, 200, 255, ${trailAlpha})`;
            ctx.beginPath();
            ctx.arc(tp.x, tp.y, trailR, 0, Math.PI * 2);
            ctx.fill();
          }

          // Pulse glow — soft radial
          const glowR = 16;
          const grad = ctx.createRadialGradient(px, py, 0, px, py, glowR);
          grad.addColorStop(0, `rgba(200, 215, 255, ${p.intensity * 0.4})`);
          grad.addColorStop(0.3, `rgba(180, 200, 255, ${p.intensity * 0.15})`);
          grad.addColorStop(1, "rgba(180, 200, 255, 0)");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(px, py, glowR, 0, Math.PI * 2);
          ctx.fill();

          // Pulse core
          ctx.fillStyle = `rgba(220, 230, 255, ${p.intensity * 0.6})`;
          ctx.beginPath();
          ctx.arc(px, py, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // ── Draw nodes ──
      for (const node of nodes) {
        const x = rx(node);
        const y = ry(node);
        const breath = Math.sin(node.phase) * 0.5 + 0.5;
        const breathOpacity = node.baseOpacity + breath * 0.04;
        const pulseOpacity = node.pulseIntensity * 0.2;
        let opacity = breathOpacity + pulseOpacity;
        let r = node.radius + node.pulseIntensity * 2;

        // Mouse proximity — brighten nearby nodes
        if (mouse.active) {
          const mdx = x - mouse.x;
          const mdy = y - mouse.y;
          const mdist = Math.sqrt(mdx * mdx + mdy * mdy);
          const mouseRadius = 180;
          if (mdist < mouseRadius) {
            const mt = 1 - mdist / mouseRadius;
            opacity += mt * 0.15;
            r += mt * 1;
          }
        }

        // Pulse glow
        if (node.pulseIntensity > 0.1) {
          const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 5);
          const glowColor = node.layer === 2 ? "200, 215, 255" : "180, 200, 255";
          glow.addColorStop(0, `rgba(${glowColor}, ${node.pulseIntensity * 0.1})`);
          glow.addColorStop(1, `rgba(${glowColor}, 0)`);
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(x, y, r * 5, 0, Math.PI * 2);
          ctx.fill();
        }

        // Node core
        const nodeColor = node.layer === 2 ? "240, 240, 250" : node.layer === 1 ? "220, 225, 240" : "180, 185, 200";
        ctx.fillStyle = `rgba(${nodeColor}, ${opacity})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();

        // Near-layer nodes get a subtle ring
        if (node.layer === 2 && opacity > 0.15) {
          ctx.strokeStyle = `rgba(240, 240, 250, ${opacity * 0.3})`;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.arc(x, y, r + 2, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // ── Cursor halo ──
      if (mouse.active) {
        const haloGrad = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 200);
        haloGrad.addColorStop(0, "rgba(180, 200, 255, 0.04)");
        haloGrad.addColorStop(0.5, "rgba(180, 200, 255, 0.015)");
        haloGrad.addColorStop(1, "rgba(180, 200, 255, 0)");
        ctx.fillStyle = haloGrad;
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, 200, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!reduceMotion) {
        rafRef.current = requestAnimationFrame(draw);
      }
    };

    rafRef.current = requestAnimationFrame(draw);

    const handleVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(rafRef.current);
      } else if (!reduceMotion) {
        rafRef.current = requestAnimationFrame(draw);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("scroll", handleScroll);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [nodeCount, linkDistance]);

  return (
    <div
      className={cn(
        variant === "atmosphere"
          ? "fixed inset-0 pointer-events-none overflow-hidden z-0"
          : "absolute inset-0 pointer-events-none overflow-hidden",
        className
      )}
      aria-hidden="true"
    >
      {/* Base mesh gradient — richer than before, gives real depth */}
      <div className="absolute inset-0 nx-mesh-bg-v2" />
      {/* Agent mesh canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ display: "block" }}
      />
    </div>
  );
}
