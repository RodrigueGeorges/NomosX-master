"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * AgenticCore — Living agent mesh for NomosX.
 * ─────────────────────────────────────────────
 * A neural-network canvas that evokes the agentic pipeline:
 * nodes drift, connections form, light pulses travel the graph,
 * and hub nodes anchor the composition.
 *
 * Layers:
 *   1. Mesh gradient (CSS base — cool depth)
 *   2. Far nodes (dim, slow — depth illusion)
 *   3. Mid connections + pulses (the agent graph)
 *   4. Near hub nodes (large, bright — the "thinkers")
 *   5. Data streams (vertical light traces — data flowing)
 *   6. Cursor halo (interaction feedback)
 *   7. Scan sweep (slow horizontal light pass)
 */

interface AgentNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  layer: 0 | 1 | 2;
  isHub: boolean;
  phase: number;
  pulseIntensity: number;
  baseOpacity: number;
  connections: number;
  // Organic motion — each node has its own drift seed + wobble
  wobbleSeed: number;
  wobblePhase: number;
}

interface Pulse {
  fromIdx: number;
  toIdx: number;
  progress: number;
  speed: number;
  intensity: number;
  trail: { x: number; y: number; alpha: number }[];
  // Cubic Bézier control points — organic axon path
  cx1: number; cy1: number;
  cx2: number; cy2: number;
}

interface DataStream {
  x: number;
  y: number;
  vy: number;
  length: number;
  opacity: number;
  chars: string[];
  life: number;
}

interface AgenticCoreProps {
  className?: string;
  variant?: "section" | "atmosphere";
  nodeCount?: number;
  linkDistance?: number;
}

export function AgenticCore({
  className,
  variant = "atmosphere",
  nodeCount = 52,
  linkDistance = 420,
}: AgenticCoreProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const nodesRef = useRef<AgentNode[]>([]);
  const pulsesRef = useRef<Pulse[]>([]);
  const streamsRef = useRef<DataStream[]>([]);
  const lastPulseRef = useRef<number>(0);
  const lastStreamRef = useRef<number>(0);
  const scanRef = useRef<number>(0);
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
      const farCount = Math.round(nodeCount * 0.40);
      const midCount = Math.round(nodeCount * 0.38);
      const nearCount = nodeCount - farCount - midCount;
      const hubCount = 4; // 4 hub nodes in the near layer

      // Far layer — small, dim, slow
      for (let i = 0; i < farCount; i++) {
        nodes.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.06,
          vy: (Math.random() - 0.5) * 0.06,
          radius: Math.random() * 0.7 + 0.3,
          layer: 0,
          isHub: false,
          phase: Math.random() * Math.PI * 2,
          pulseIntensity: 0,
          baseOpacity: 0.025 + Math.random() * 0.02,
          connections: 0,
          wobbleSeed: Math.random() * 100,
          wobblePhase: Math.random() * Math.PI * 2,
        });
      }

      // Mid layer — medium, the graph backbone
      for (let i = 0; i < midCount; i++) {
        nodes.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.12,
          vy: (Math.random() - 0.5) * 0.12,
          radius: Math.random() * 1.0 + 0.6,
          layer: 1,
          isHub: false,
          phase: Math.random() * Math.PI * 2,
          pulseIntensity: 0,
          baseOpacity: 0.045 + Math.random() * 0.025,
          connections: 0,
          wobbleSeed: Math.random() * 100,
          wobblePhase: Math.random() * Math.PI * 2,
        });
      }

      // Near layer — large, bright, with hubs
      for (let i = 0; i < nearCount; i++) {
        const isHub = i < hubCount;
        nodes.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * (isHub ? 0.06 : 0.18),
          vy: (Math.random() - 0.5) * (isHub ? 0.06 : 0.18),
          radius: isHub ? Math.random() * 1.2 + 2.5 : Math.random() * 1.2 + 1.0,
          layer: 2,
          isHub,
          phase: Math.random() * Math.PI * 2,
          pulseIntensity: 0,
          baseOpacity: isHub ? 0.11 + Math.random() * 0.03 : 0.07 + Math.random() * 0.025,
          connections: 0,
          wobbleSeed: Math.random() * 100,
          wobblePhase: Math.random() * Math.PI * 2,
        });
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

    const handleScroll = () => { scrollRef.current = window.scrollY; };
    window.addEventListener("scroll", handleScroll, { passive: true });

    // ── Animation loop ──
    const draw = (time: number) => {
      ctx.clearRect(0, 0, width, height);

      const nodes = nodesRef.current;
      const pulses = pulsesRef.current;
      const streams = streamsRef.current;
      const mouse = mouseRef.current;
      const scrollY = scrollRef.current;

      // Parallax per layer
      const parallax = [scrollY * 0.015, scrollY * 0.04, scrollY * 0.08];

      const rx = (n: AgentNode) => n.x;
      const ry = (n: AgentNode) => n.y - parallax[n.layer];

      // ── Update nodes ──
      if (!reduceMotion) {
        for (const node of nodes) {
          node.x += node.vx;
          node.y += node.vy;
          const m = 50;
          if (node.x < -m) node.x = width + m;
          if (node.x > width + m) node.x = -m;
          if (node.y < -m) node.y = height + m;
          if (node.y > height + m) node.y = -m;
          node.phase += 0.005;
          node.pulseIntensity *= 0.94;
          node.connections = 0;
        }
      }

      // ── Draw connections ──
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].layer === 0) continue;
        for (let j = i + 1; j < nodes.length; j++) {
          if (nodes[j].layer === 0) continue;
          if (Math.abs(nodes[i].layer - nodes[j].layer) > 1) continue;

          const ax = rx(nodes[i]), ay = ry(nodes[i]);
          const bx = rx(nodes[j]), by = ry(nodes[j]);
          const dx = ax - bx, dy = ay - by;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < linkDistance) {
            const t = 1 - dist / linkDistance;
            const hasHub = nodes[i].isHub || nodes[j].isHub;
            const layerBoost = hasHub ? 1.4 : (nodes[i].layer === 2 || nodes[j].layer === 2 ? 1.2 : 1.0);
            const baseOpacity = t * t * 0.05 * layerBoost;

            nodes[i].connections++;
            nodes[j].connections++;

            // Pulse boost
            let pulseBoost = 0;
            let pulseR = 240, pulseG = 240, pulseB = 250;
            for (const p of pulses) {
              if ((p.fromIdx === i && p.toIdx === j) || (p.fromIdx === j && p.toIdx === i)) {
                pulseBoost = Math.max(pulseBoost, p.intensity * 0.15);
                pulseR = 170; pulseG = 195; pulseB = 255;
              }
            }

            const opacity = baseOpacity + pulseBoost;

            // Curved connection — organic axon, not a straight wire.
            // Two control points with large perpendicular offset create
            // the sinuous, meandering curves of real neural networks.
            const angleAB = Math.atan2(by - ay, bx - ax);
            const perpAngle = angleAB + Math.PI / 2;
            // Deterministic curve seeds from indices — stable per connection
            const curveSeed1 = ((i * 73 + j * 37) % 100) / 100 - 0.5;
            const curveSeed2 = ((i * 41 + j * 89) % 100) / 100 - 0.5;
            // Large offset — 25-35% of distance — gives real axon-like meandering
            const curveAmount1 = dist * 0.28 * curveSeed1;
            const curveAmount2 = dist * 0.22 * curveSeed2;
            // Two control points at 1/3 and 2/3 along the line, offset perpendicularly
            const t1x = ax + (bx - ax) * 0.33;
            const t1y = ay + (by - ay) * 0.33;
            const t2x = ax + (bx - ax) * 0.66;
            const t2y = ay + (by - ay) * 0.66;
            const cx1 = t1x + Math.cos(perpAngle) * curveAmount1;
            const cy1 = t1y + Math.sin(perpAngle) * curveAmount1;
            const cx2 = t2x + Math.cos(perpAngle) * curveAmount2;
            const cy2 = t2y + Math.sin(perpAngle) * curveAmount2;

            // Gradient line — fade from both ends toward center
            if (hasHub && t > 0.3) {
              const grad = ctx.createLinearGradient(ax, ay, bx, by);
              const hubEnd = nodes[i].isHub ? 0 : 1;
              grad.addColorStop(hubEnd, `rgba(200, 215, 255, ${opacity * 1.3})`);
              grad.addColorStop(0.5, `rgba(${pulseR}, ${pulseG}, ${pulseB}, ${opacity})`);
              grad.addColorStop(1 - hubEnd, `rgba(${pulseR}, ${pulseG}, ${pulseB}, ${opacity * 0.7})`);
              ctx.strokeStyle = grad;
            } else {
              ctx.strokeStyle = `rgba(${pulseR}, ${pulseG}, ${pulseB}, ${opacity})`;
            }

            ctx.lineWidth = hasHub ? 0.9 : (nodes[i].layer === 2 || nodes[j].layer === 2 ? 0.7 : 0.45);
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.bezierCurveTo(cx1, cy1, cx2, cy2, bx, by);
            ctx.stroke();
          }
        }
      }

      // ── Spawn pulses ──
      if (!reduceMotion) {
        if (time - lastPulseRef.current > 600 + Math.random() * 1200) {
          lastPulseRef.current = time;
          // Prefer hub nodes as pulse origins
          const hubCandidates = nodes.map((n, i) => ({ n, i })).filter(({ n }) => n.isHub);
          const allCandidates = nodes.map((n, i) => ({ n, i })).filter(({ n }) => n.layer >= 1);
          const sourcePool = hubCandidates.length > 0 && Math.random() < 0.5 ? hubCandidates : allCandidates;

          if (sourcePool.length > 0) {
            const pick = sourcePool[Math.floor(Math.random() * sourcePool.length)];
            const i = pick.i;
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
              // Compute cubic Bézier control points — same formula as connection drawing
              const fx0 = rx(nodes[i]), fy0 = ry(nodes[i]);
              const tx0 = rx(nodes[j]), ty0 = ry(nodes[j]);
              const d0 = Math.sqrt((fx0 - tx0) ** 2 + (fy0 - ty0) ** 2);
              const ang0 = Math.atan2(ty0 - fy0, tx0 - fx0);
              const perp0 = ang0 + Math.PI / 2;
              const cs1 = ((i * 73 + j * 37) % 100) / 100 - 0.5;
              const cs2 = ((i * 41 + j * 89) % 100) / 100 - 0.5;
              const ca1 = d0 * 0.28 * cs1;
              const ca2 = d0 * 0.22 * cs2;
              const t1x0 = fx0 + (tx0 - fx0) * 0.33;
              const t1y0 = fy0 + (ty0 - fy0) * 0.33;
              const t2x0 = fx0 + (tx0 - fx0) * 0.66;
              const t2y0 = fy0 + (ty0 - fy0) * 0.66;
              pulses.push({
                fromIdx: i, toIdx: j,
                progress: 0,
                speed: 0.0025 + Math.random() * 0.003,
                intensity: 0.75 + Math.random() * 0.25,
                trail: [],
                cx1: t1x0 + Math.cos(perp0) * ca1,
                cy1: t1y0 + Math.sin(perp0) * ca1,
                cx2: t2x0 + Math.cos(perp0) * ca2,
                cy2: t2y0 + Math.sin(perp0) * ca2,
              });
              nodes[i].pulseIntensity = 1;
              // Sometimes chain — spawn a second pulse from the destination
              if (Math.random() < 0.3) {
                setTimeout(() => {
                  const secondNeighbors: number[] = [];
                  for (let k = 0; k < nodes.length; k++) {
                    if (k === j || nodes[k].layer === 0) continue;
                    if (Math.abs(nodes[j].layer - nodes[k].layer) > 1) continue;
                    const dx = rx(nodes[j]) - rx(nodes[k]);
                    const dy = ry(nodes[j]) - ry(nodes[k]);
                    if (Math.sqrt(dx * dx + dy * dy) < linkDistance) secondNeighbors.push(k);
                  }
                  if (secondNeighbors.length > 0) {
                    const k = secondNeighbors[Math.floor(Math.random() * secondNeighbors.length)];
                    const fx1 = rx(nodes[j]), fy1 = ry(nodes[j]);
                    const tx1 = rx(nodes[k]), ty1 = ry(nodes[k]);
                    const d1 = Math.sqrt((fx1 - tx1) ** 2 + (fy1 - ty1) ** 2);
                    const ang1 = Math.atan2(ty1 - fy1, tx1 - fx1);
                    const perp1 = ang1 + Math.PI / 2;
                    const cs1b = ((j * 73 + k * 37) % 100) / 100 - 0.5;
                    const cs2b = ((j * 41 + k * 89) % 100) / 100 - 0.5;
                    const ca1b = d1 * 0.28 * cs1b;
                    const ca2b = d1 * 0.22 * cs2b;
                    const t1x1 = fx1 + (tx1 - fx1) * 0.33;
                    const t1y1 = fy1 + (ty1 - fy1) * 0.33;
                    const t2x1 = fx1 + (tx1 - fx1) * 0.66;
                    const t2y1 = fy1 + (ty1 - fy1) * 0.66;
                    pulses.push({
                      fromIdx: j, toIdx: k,
                      progress: 0,
                      speed: 0.003 + Math.random() * 0.003,
                      intensity: 0.6 + Math.random() * 0.2,
                      trail: [],
                      cx1: t1x1 + Math.cos(perp1) * ca1b,
                      cy1: t1y1 + Math.sin(perp1) * ca1b,
                      cx2: t2x1 + Math.cos(perp1) * ca2b,
                      cy2: t2y1 + Math.sin(perp1) * ca2b,
                    });
                    nodes[j].pulseIntensity = 0.8;
                  }
                }, 400 + Math.random() * 600);
              }
            }
          }
        }

        // Update + draw pulses
        for (let k = pulses.length - 1; k >= 0; k--) {
          const p = pulses[k];
          p.progress += p.speed;

          const from = nodes[p.fromIdx], to = nodes[p.toIdx];
          const fx = rx(from), fy = ry(from);
          const tx = rx(to), ty = ry(to);

          if (p.progress >= 1) {
            nodes[p.toIdx].pulseIntensity = Math.max(nodes[p.toIdx].pulseIntensity, 0.7);
            pulses.splice(k, 1);
            continue;
          }

          const eased = p.progress < 0.5
            ? 2 * p.progress * p.progress
            : 1 - Math.pow(-2 * p.progress + 2, 2) / 2;

          // Cubic Bézier position — follows the organic axon path
          const u = 1 - eased;
          const px = u * u * u * fx + 3 * u * u * eased * p.cx1 + 3 * u * eased * eased * p.cx2 + eased * eased * eased * tx;
          const py = u * u * u * fy + 3 * u * u * eased * p.cy1 + 3 * u * eased * eased * p.cy2 + eased * eased * eased * ty;

          // Synaptic flicker — micro-discharges that make the pulse feel alive
          // The intensity oscillates rapidly, like a neural spike
          const flicker = 0.85 + Math.sin(time * 0.08 + k * 1.7) * 0.10 + (Math.random() < 0.08 ? 0.15 : 0);
          const liveIntensity = p.intensity * flicker;

          // Trail
          p.trail.push({ x: px, y: py, alpha: liveIntensity });
          if (p.trail.length > 15) p.trail.shift();

          // Draw trail as a fading curved line
          if (p.trail.length > 2) {
            ctx.beginPath();
            ctx.moveTo(p.trail[0].x, p.trail[0].y);
            for (let t = 1; t < p.trail.length; t++) {
              ctx.lineTo(p.trail[t].x, p.trail[t].y);
            }
            const trailGrad = ctx.createLinearGradient(p.trail[0].x, p.trail[0].y, px, py);
            trailGrad.addColorStop(0, "rgba(170, 195, 255, 0)");
            trailGrad.addColorStop(1, `rgba(170, 195, 255, ${liveIntensity * 0.15})`);
            ctx.strokeStyle = trailGrad;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }

          // Pulse glow
          const glowR = 16;
          const grad = ctx.createRadialGradient(px, py, 0, px, py, glowR);
          grad.addColorStop(0, `rgba(200, 220, 255, ${liveIntensity * 0.2})`);
          grad.addColorStop(0.3, `rgba(170, 195, 255, ${liveIntensity * 0.08})`);
          grad.addColorStop(1, "rgba(170, 195, 255, 0)");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(px, py, glowR, 0, Math.PI * 2);
          ctx.fill();

          // Pulse core — brightens during flicker spikes
          ctx.fillStyle = `rgba(230, 240, 255, ${liveIntensity * 0.35})`;
          ctx.beginPath();
          ctx.arc(px, py, 1.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // ── Data streams (vertical light traces) ──
      if (!reduceMotion) {
        if (time - lastStreamRef.current > 3000 + Math.random() * 4000) {
          lastStreamRef.current = time;
          if (streams.length < 3) {
            streams.push({
              x: Math.random() * width,
              y: -50,
              vy: 0.3 + Math.random() * 0.4,
              length: 80 + Math.random() * 120,
              opacity: 0.02 + Math.random() * 0.015,
              chars: [],
              life: 1,
            });
          }
        }

        for (let k = streams.length - 1; k >= 0; k--) {
          const s = streams[k];
          s.y += s.vy;
          if (s.y > height + 100) { streams.splice(k, 1); continue; }

          // Draw as a soft vertical gradient line
          const grad = ctx.createLinearGradient(s.x, s.y - s.length, s.x, s.y);
          grad.addColorStop(0, "rgba(170, 195, 255, 0)");
          grad.addColorStop(0.7, `rgba(170, 195, 255, ${s.opacity})`);
          grad.addColorStop(1, `rgba(200, 220, 255, ${s.opacity * 1.5})`);
          ctx.strokeStyle = grad;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y - s.length);
          ctx.lineTo(s.x, s.y);
          ctx.stroke();

          // Bright head
          ctx.fillStyle = `rgba(200, 220, 255, ${s.opacity * 2})`;
          ctx.beginPath();
          ctx.arc(s.x, s.y, 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // ── Scan sweep (slow horizontal light pass) ──
      if (!reduceMotion) {
        scanRef.current += 0.15;
        const scanY = (scanRef.current % (height + 400)) - 200;
        if (scanY > -200 && scanY < height + 200) {
          const scanGrad = ctx.createLinearGradient(0, scanY - 60, 0, scanY + 60);
          scanGrad.addColorStop(0, "rgba(170, 195, 255, 0)");
          scanGrad.addColorStop(0.5, "rgba(170, 195, 255, 0.008)");
          scanGrad.addColorStop(1, "rgba(170, 195, 255, 0)");
          ctx.fillStyle = scanGrad;
          ctx.fillRect(0, scanY - 60, width, 120);
        }
      }

      // ── Draw nodes ──
      for (const node of nodes) {
        const x = rx(node), y = ry(node);
        const breath = Math.sin(node.phase) * 0.5 + 0.5;
        const breathOpacity = node.baseOpacity + breath * 0.02;
        const pulseOpacity = node.pulseIntensity * 0.12;
        let opacity = breathOpacity + pulseOpacity;
        let r = node.radius + node.pulseIntensity * (node.isHub ? 2 : 1.5);

        // Connection weight — nodes with more connections are slightly brighter
        const connBoost = Math.min(node.connections * 0.004, 0.02);
        opacity += connBoost;

        // Mouse proximity
        if (mouse.active) {
          const mdx = x - mouse.x, mdy = y - mouse.y;
          const mdist = Math.sqrt(mdx * mdx + mdy * mdy);
          const mouseRadius = 160;
          if (mdist < mouseRadius) {
            const mt = 1 - mdist / mouseRadius;
            opacity += mt * 0.08;
            r += mt * (node.isHub ? 1.2 : 0.8);
          }
        }

        // Pulse glow
        if (node.pulseIntensity > 0.08) {
          const glowR = r * (node.isHub ? 6 : 4);
          const glow = ctx.createRadialGradient(x, y, 0, x, y, glowR);
          const glowColor = node.isHub ? "200, 220, 255" : "180, 200, 255";
          glow.addColorStop(0, `rgba(${glowColor}, ${node.pulseIntensity * 0.06})`);
          glow.addColorStop(0.5, `rgba(${glowColor}, ${node.pulseIntensity * 0.02})`);
          glow.addColorStop(1, `rgba(${glowColor}, 0)`);
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(x, y, glowR, 0, Math.PI * 2);
          ctx.fill();
        }

        // Hub nodes — persistent soft glow
        if (node.isHub) {
          const hubGlow = ctx.createRadialGradient(x, y, 0, x, y, r * 3.5);
          hubGlow.addColorStop(0, `rgba(200, 220, 255, 0.03)`);
          hubGlow.addColorStop(0.5, `rgba(180, 200, 255, 0.01)`);
          hubGlow.addColorStop(1, "rgba(180, 200, 255, 0)");
          ctx.fillStyle = hubGlow;
          ctx.beginPath();
          ctx.arc(x, y, r * 3.5, 0, Math.PI * 2);
          ctx.fill();
        }

        // Node core
        const nodeColor = node.isHub ? "220, 235, 255" : node.layer === 2 ? "240, 240, 250" : node.layer === 1 ? "220, 225, 240" : "170, 175, 195";
        ctx.fillStyle = `rgba(${nodeColor}, ${opacity})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();

        // Near + hub nodes get a ring
        if ((node.layer === 2 || node.isHub) && opacity > 0.12) {
          ctx.strokeStyle = `rgba(200, 220, 255, ${opacity * 0.25})`;
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.arc(x, y, r + (node.isHub ? 4 : 2.5), 0, Math.PI * 2);
          ctx.stroke();

          // Hub nodes get a second outer ring
          if (node.isHub) {
            ctx.strokeStyle = `rgba(180, 200, 255, ${opacity * 0.12})`;
            ctx.lineWidth = 0.4;
            ctx.beginPath();
            ctx.arc(x, y, r + 8, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }

      // ── Cursor halo ──
      if (mouse.active) {
        const haloGrad = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 200);
        haloGrad.addColorStop(0, "rgba(170, 195, 255, 0.025)");
        haloGrad.addColorStop(0.4, "rgba(170, 195, 255, 0.01)");
        haloGrad.addColorStop(1, "rgba(170, 195, 255, 0)");
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
      <div className="absolute inset-0 nx-mesh-bg-v2" />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ display: "block" }}
      />
    </div>
  );
}
