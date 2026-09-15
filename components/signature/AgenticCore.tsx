"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * AgenticCore — Living neural mesh for NomosX.
 * ─────────────────────────────────────────────
 * Implements a leaky integrate-and-fire neuron model:
 *   • Each neuron has a membrane potential that leaks over time
 *   • Incoming pulses charge the potential
 *   • When potential crosses threshold → neuron fires → spawns outgoing pulses
 *   • Spontaneous firing (neural noise) keeps the network alive
 *   • Synaptic plasticity: used connections strengthen, idle ones weaken
 *   • Organic wobble via Perlin-like noise (not sin waves)
 *   • Curved axons via cubic Bézier with two control points
 *
 * Visual layers:
 *   1. Mesh gradient (CSS base — cool depth)
 *   2. Far neurons (dim, slow — depth)
 *   3. Mid axons + pulses (the neural graph)
 *   4. Near hub neurons (bright — the "thinkers")
 *   5. Data streams (vertical light traces)
 *   6. Cursor halo (interaction)
 *   7. Scan sweep (slow horizontal pass)
 */

// ── Types ──

interface Neuron {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  layer: 0 | 1 | 2;
  isHub: boolean;
  phase: number;
  // Membrane potential model
  potential: number;        // 0..1, leaks over time
  threshold: number;        // firing threshold
  leakRate: number;         // how fast potential decays
  refractory: number;       // cooldown after firing (frames)
  // Organic wobble
  wobbleSeed: number;
  wobblePhase: number;
  // Visual
  baseOpacity: number;
  connections: number;
  fireFlash: number;        // 0..1, decays after firing
}

interface Synapse {
  fromIdx: number;
  toIdx: number;
  // Plasticity
  strength: number;         // 0..1, grows with use, decays over time
  // Curved path — cubic Bézier control points (recomputed each frame)
  cx1: number; cy1: number;
  cx2: number; cy2: number;
  // Stable curve seeds
  curveSeed1: number;
  curveSeed2: number;
}

interface Pulse {
  synapseIdx: number;
  progress: number;
  speed: number;
  intensity: number;
  trail: { x: number; y: number; alpha: number }[];
}

interface DataStream {
  x: number;
  y: number;
  vy: number;
  length: number;
  opacity: number;
}

interface AgenticCoreProps {
  className?: string;
  variant?: "section" | "atmosphere";
  neuronCount?: number;
  linkDistance?: number;
}

// ── Pseudo-Perlin noise (cheap, no deps) ──
function noise1D(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const a = Math.sin((i + seed * 13) * 12.9898) * 43758.5453;
  const b = Math.sin((i + 1 + seed * 13) * 12.9898) * 43758.5453;
  const fa = a - Math.floor(a);
  const fb = b - Math.floor(b);
  // Smoothstep interpolation
  const t = f * f * (3 - 2 * f);
  return fa * (1 - t) + fb * t;
}

export function AgenticCore({
  className,
  variant = "atmosphere",
  neuronCount = 52,
  linkDistance = 420,
}: AgenticCoreProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const neuronsRef = useRef<Neuron[]>([]);
  const synapsesRef = useRef<Synapse[]>([]);
  const pulsesRef = useRef<Pulse[]>([]);
  const streamsRef = useRef<DataStream[]>([]);
  const lastStreamRef = useRef<number>(0);
  const scanRef = useRef<number>(0);
  const mouseRef = useRef<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false });
  const scrollRef = useRef<number>(0);
  const timeRef = useRef<number>(0);

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

    // ── Initialize neurons ──
    const initNeurons = () => {
      const neurons: Neuron[] = [];
      const farCount = Math.round(neuronCount * 0.40);
      const midCount = Math.round(neuronCount * 0.38);
      const nearCount = neuronCount - farCount - midCount;
      const hubCount = 4;

      for (let i = 0; i < farCount; i++) {
        neurons.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.05,
          vy: (Math.random() - 0.5) * 0.05,
          radius: Math.random() * 0.6 + 0.3,
          layer: 0,
          isHub: false,
          phase: Math.random() * Math.PI * 2,
          potential: Math.random() * 0.3,
          threshold: 0.7 + Math.random() * 0.2,
          leakRate: 0.002 + Math.random() * 0.001,
          refractory: 0,
          wobbleSeed: Math.random() * 100,
          wobblePhase: Math.random() * Math.PI * 2,
          baseOpacity: 0.012 + Math.random() * 0.008,
          connections: 0,
          fireFlash: 0,
        });
      }

      for (let i = 0; i < midCount; i++) {
        neurons.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.10,
          vy: (Math.random() - 0.5) * 0.10,
          radius: Math.random() * 0.8 + 0.5,
          layer: 1,
          isHub: false,
          phase: Math.random() * Math.PI * 2,
          potential: Math.random() * 0.3,
          threshold: 0.65 + Math.random() * 0.2,
          leakRate: 0.003 + Math.random() * 0.002,
          refractory: 0,
          wobbleSeed: Math.random() * 100,
          wobblePhase: Math.random() * Math.PI * 2,
          baseOpacity: 0.018 + Math.random() * 0.012,
          connections: 0,
          fireFlash: 0,
        });
      }

      for (let i = 0; i < nearCount; i++) {
        const isHub = i < hubCount;
        neurons.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * (isHub ? 0.05 : 0.14),
          vy: (Math.random() - 0.5) * (isHub ? 0.05 : 0.14),
          radius: isHub ? Math.random() * 1.0 + 2.2 : Math.random() * 1.0 + 0.8,
          layer: 2,
          isHub,
          phase: Math.random() * Math.PI * 2,
          potential: Math.random() * 0.3,
          threshold: isHub ? 0.55 + Math.random() * 0.15 : 0.65 + Math.random() * 0.2,
          leakRate: isHub ? 0.002 + Math.random() * 0.001 : 0.003 + Math.random() * 0.002,
          refractory: 0,
          wobbleSeed: Math.random() * 100,
          wobblePhase: Math.random() * Math.PI * 2,
          baseOpacity: isHub ? 0.04 + Math.random() * 0.015 : 0.025 + Math.random() * 0.012,
          connections: 0,
          fireFlash: 0,
        });
      }

      neuronsRef.current = neurons;
      rebuildSynapses();
    };

    // ── Build synapses based on proximity ──
    const rebuildSynapses = () => {
      const neurons = neuronsRef.current;
      const synapses: Synapse[] = [];

      for (let i = 0; i < neurons.length; i++) {
        if (neurons[i].layer === 0) continue;
        for (let j = i + 1; j < neurons.length; j++) {
          if (neurons[j].layer === 0) continue;
          if (Math.abs(neurons[i].layer - neurons[j].layer) > 1) continue;

          const dx = neurons[i].x - neurons[j].x;
          const dy = neurons[i].y - neurons[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < linkDistance) {
            synapses.push({
              fromIdx: i,
              toIdx: j,
              strength: 0.3 + Math.random() * 0.3,
              cx1: 0, cy1: 0, cx2: 0, cy2: 0,
              curveSeed1: ((i * 73 + j * 37) % 100) / 100 - 0.5,
              curveSeed2: ((i * 41 + j * 89) % 100) / 100 - 0.5,
            });
          }
        }
      }

      synapsesRef.current = synapses;
    };

    resize();
    initNeurons();

    const handleResize = () => { resize(); initNeurons(); };
    window.addEventListener("resize", handleResize);

    const handleScroll = () => { scrollRef.current = window.scrollY; };
    window.addEventListener("scroll", handleScroll, { passive: true });

    // ── Fire a neuron: spawn pulses on its outgoing synapses ──
    const fireNeuron = (idx: number, neurons: Neuron[], synapses: Synapse[], pulses: Pulse[], intensity: number) => {
      neurons[idx].fireFlash = 1;
      neurons[idx].potential = 0;
      neurons[idx].refractory = 30 + Math.floor(Math.random() * 30);

      // Find all synapses connected to this neuron and fire pulses
      for (let s = 0; s < synapses.length; s++) {
        const syn = synapses[s];
        if (syn.fromIdx === idx || syn.toIdx === idx) {
          // Strengthen this synapse (plasticity)
          syn.strength = Math.min(1, syn.strength + 0.08);
          // Only fire if synapse is strong enough
          if (syn.strength > 0.2 && Math.random() < syn.strength * 0.7) {
            pulses.push({
              synapseIdx: s,
              progress: 0,
              speed: 0.0025 + Math.random() * 0.003,
              intensity: intensity * (0.6 + syn.strength * 0.4),
              trail: [],
            });
          }
        }
      }
    };

    // ── Animation loop ──
    const draw = (time: number) => {
      ctx.clearRect(0, 0, width, height);

      const neurons = neuronsRef.current;
      const synapses = synapsesRef.current;
      const pulses = pulsesRef.current;
      const streams = streamsRef.current;
      const mouse = mouseRef.current;
      const scrollY = scrollRef.current;
      const t = time * 0.001; // seconds
      timeRef.current = t;

      const parallax = [scrollY * 0.015, scrollY * 0.04, scrollY * 0.08];

      // Rendered position with parallax + organic wobble
      const rx = (n: Neuron) => {
        const wobble = noise1D(t * 0.3 + n.wobblePhase, n.wobbleSeed) - 0.5;
        return n.x + wobble * 2;
      };
      const ry = (n: Neuron) => {
        const wobble = noise1D(t * 0.3 + n.wobblePhase + 50, n.wobbleSeed) - 0.5;
        return n.y + wobble * 2 - parallax[n.layer];
      };

      // ── Update neurons: drift, leak, spontaneous firing ──
      if (!reduceMotion) {
        for (let i = 0; i < neurons.length; i++) {
          const n = neurons[i];
          n.x += n.vx;
          n.y += n.vy;
          const m = 50;
          if (n.x < -m) n.x = width + m;
          if (n.x > width + m) n.x = -m;
          if (n.y < -m) n.y = height + m;
          if (n.y > height + m) n.y = -m;

          n.phase += 0.005;
          n.fireFlash *= 0.92;
          n.connections = 0;

          // Refractory period
          if (n.refractory > 0) {
            n.refractory--;
            continue;
          }

          // Leaky integrate-and-fire
          n.potential -= n.leakRate;
          if (n.potential < 0) n.potential = 0;

          // Spontaneous firing (neural noise) — hubs fire more often
          const noiseProb = n.isHub ? 0.003 : n.layer === 2 ? 0.0015 : n.layer === 1 ? 0.001 : 0.0005;
          if (Math.random() < noiseProb) {
            n.potential += 0.3 + Math.random() * 0.2;
          }

          // Fire!
          if (n.potential >= n.threshold) {
            fireNeuron(i, neurons, synapses, pulses, 0.75 + Math.random() * 0.25);
          }
        }
      }

      // ── Update synapse control points + plasticity decay ──
      for (const syn of synapses) {
        const from = neurons[syn.fromIdx], to = neurons[syn.toIdx];
        const ax = rx(from), ay = ry(from);
        const bx = rx(to), by = ry(to);
        const dist = Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
        const perpAngle = Math.atan2(by - ay, bx - ax) + Math.PI / 2;
        const ca1 = dist * 0.28 * syn.curveSeed1;
        const ca2 = dist * 0.22 * syn.curveSeed2;
        const t1x = ax + (bx - ax) * 0.33;
        const t1y = ay + (by - ay) * 0.33;
        const t2x = ax + (bx - ax) * 0.66;
        const t2y = ay + (by - ay) * 0.66;
        // Add subtle time-based wobble to control points — axons breathe
        const wobble1 = Math.sin(t * 0.5 + syn.fromIdx * 0.7) * dist * 0.02;
        const wobble2 = Math.cos(t * 0.4 + syn.toIdx * 0.7) * dist * 0.02;
        syn.cx1 = t1x + Math.cos(perpAngle) * (ca1 + wobble1);
        syn.cy1 = t1y + Math.sin(perpAngle) * (ca1 + wobble1);
        syn.cx2 = t2x + Math.cos(perpAngle) * (ca2 + wobble2);
        syn.cy2 = t2y + Math.sin(perpAngle) * (ca2 + wobble2);

        // Plasticity: idle synapses weaken slowly
        syn.strength -= 0.0003;
        if (syn.strength < 0.1) syn.strength = 0.1;

        neurons[syn.fromIdx].connections++;
        neurons[syn.toIdx].connections++;
      }

      // ── Draw synapses ──
      for (const syn of synapses) {
        const from = neurons[syn.fromIdx], to = neurons[syn.toIdx];
        const ax = rx(from), ay = ry(from);
        const bx = rx(to), by = ry(to);
        const dist = Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);

        if (dist >= linkDistance) continue;

        const t = 1 - dist / linkDistance;
        const hasHub = from.isHub || to.isHub;
        const layerBoost = hasHub ? 1.4 : (from.layer === 2 || to.layer === 2 ? 1.2 : 1.0);
        // Strength modulates opacity — weak synapses are barely visible
        const baseOpacity = t * t * 0.025 * layerBoost * (0.4 + syn.strength * 0.6);

        // Check for active pulse on this synapse
        let pulseBoost = 0;
        let pulseR = 20, pulseG = 40, pulseB = 90;
        for (const p of pulses) {
          if (p.synapseIdx === synapses.indexOf(syn)) {
            pulseBoost = Math.max(pulseBoost, p.intensity * 0.15);
            pulseR = 40; pulseG = 80; pulseB = 160;
          }
        }

        const opacity = baseOpacity + pulseBoost;

        if (hasHub && t > 0.3) {
          const grad = ctx.createLinearGradient(ax, ay, bx, by);
          const hubEnd = from.isHub ? 0 : 1;
          grad.addColorStop(hubEnd, `rgba(60, 100, 180, ${opacity * 1.3})`);
          grad.addColorStop(0.5, `rgba(${pulseR}, ${pulseG}, ${pulseB}, ${opacity})`);
          grad.addColorStop(1 - hubEnd, `rgba(${pulseR}, ${pulseG}, ${pulseB}, ${opacity * 0.7})`);
          ctx.strokeStyle = grad;
        } else {
          ctx.strokeStyle = `rgba(${pulseR}, ${pulseG}, ${pulseB}, ${opacity})`;
        }

        ctx.lineWidth = hasHub ? 0.9 : (from.layer === 2 || to.layer === 2 ? 0.7 : 0.45);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.bezierCurveTo(syn.cx1, syn.cy1, syn.cx2, syn.cy2, bx, by);
        ctx.stroke();
      }

      // ── Update + draw pulses ──
      for (let k = pulses.length - 1; k >= 0; k--) {
        const p = pulses[k];
        p.progress += p.speed;

        const syn = synapses[p.synapseIdx];
        if (!syn) { pulses.splice(k, 1); continue; }

        const from = neurons[syn.fromIdx], to = neurons[syn.toIdx];
        const fx = rx(from), fy = ry(from);
        const tx = rx(to), ty = ry(to);

        if (p.progress >= 1) {
          // Pulse arrives → charge the destination neuron
          const destIdx = syn.toIdx;
          const dest = neurons[destIdx];
          if (dest.refractory === 0) {
            dest.potential += p.intensity * 0.4 * syn.strength;
            dest.fireFlash = Math.max(dest.fireFlash, 0.5);
          }
          pulses.splice(k, 1);
          continue;
        }

        const eased = p.progress < 0.5
          ? 2 * p.progress * p.progress
          : 1 - Math.pow(-2 * p.progress + 2, 2) / 2;

        // Cubic Bézier position
        const u = 1 - eased;
        const px = u * u * u * fx + 3 * u * u * eased * syn.cx1 + 3 * u * eased * eased * syn.cx2 + eased * eased * eased * tx;
        const py = u * u * u * fy + 3 * u * u * eased * syn.cy1 + 3 * u * eased * eased * syn.cy2 + eased * eased * eased * ty;

        // Synaptic flicker
        const flicker = 0.85 + Math.sin(time * 0.08 + k * 1.7) * 0.10 + (Math.random() < 0.08 ? 0.15 : 0);
        const liveIntensity = p.intensity * flicker;

        p.trail.push({ x: px, y: py, alpha: liveIntensity });
        if (p.trail.length > 15) p.trail.shift();

        // Trail
        if (p.trail.length > 2) {
          ctx.beginPath();
          ctx.moveTo(p.trail[0].x, p.trail[0].y);
          for (let tr = 1; tr < p.trail.length; tr++) {
            ctx.lineTo(p.trail[tr].x, p.trail[tr].y);
          }
          const trailGrad = ctx.createLinearGradient(p.trail[0].x, p.trail[0].y, px, py);
          trailGrad.addColorStop(0, "rgba(40, 80, 160, 0)");
          trailGrad.addColorStop(1, `rgba(40, 80, 160, ${liveIntensity * 0.08})`);
          ctx.strokeStyle = trailGrad;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }

        // Pulse glow
        const glowR = 10;
        const grad = ctx.createRadialGradient(px, py, 0, px, py, glowR);
        grad.addColorStop(0, `rgba(60, 100, 180, ${liveIntensity * 0.1})`);
        grad.addColorStop(0.3, `rgba(40, 80, 160, ${liveIntensity * 0.04})`);
        grad.addColorStop(1, "rgba(40, 80, 160, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(px, py, glowR, 0, Math.PI * 2);
        ctx.fill();

        // Pulse core
        ctx.fillStyle = `rgba(30, 60, 120, ${liveIntensity * 0.18})`;
        ctx.beginPath();
        ctx.arc(px, py, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── Draw neurons ──
      for (const n of neurons) {
        const x = rx(n), y = ry(n);
        const breath = Math.sin(n.phase) * 0.5 + 0.5;
        // Potential makes the neuron glow brighter as it charges
        const potentialGlow = n.potential * 0.08;
        const fireGlow = n.fireFlash * 0.15;
        const breathOpacity = n.baseOpacity + breath * 0.02 + potentialGlow + fireGlow;
        let opacity = breathOpacity;
        let r = n.radius + n.fireFlash * (n.isHub ? 2.5 : 1.5);

        // Connection weight
        const connBoost = Math.min(n.connections * 0.004, 0.02);
        opacity += connBoost;


        // Fire flash glow — bright burst when neuron fires
        if (n.fireFlash > 0.05) {
          const flashR = r * 5;
          const flash = ctx.createRadialGradient(x, y, 0, x, y, flashR);
          const flashColor = n.isHub ? "40, 80, 160" : "30, 60, 120";
          flash.addColorStop(0, `rgba(${flashColor}, ${n.fireFlash * 0.04})`);
          flash.addColorStop(1, `rgba(${flashColor}, 0)`);
          ctx.fillStyle = flash;
          ctx.beginPath();
          ctx.arc(x, y, flashR, 0, Math.PI * 2);
          ctx.fill();
        }

        // Neuron core — color shifts cooler when potential is high
        const charge = n.potential / n.threshold;
        const nodeColor = n.isHub
          ? `rgba(${30 + charge * 20}, ${50 + charge * 30}, ${100 + charge * 40}, ${opacity})`
          : n.layer === 2
            ? `rgba(${20 + charge * 30}, ${40 + charge * 40}, ${90 + charge * 50}, ${opacity})`
            : n.layer === 1
              ? `rgba(${30 + charge * 20}, ${45 + charge * 30}, ${80 + charge * 40}, ${opacity})`
              : `rgba(50, 60, 90, ${opacity})`;
        ctx.fillStyle = nodeColor;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
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
      window.removeEventListener("scroll", handleScroll);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [neuronCount, linkDistance]);

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
