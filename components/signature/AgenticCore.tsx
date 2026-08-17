"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * AgenticCore — the agentic think tank, visible and alive.
 *
 * What you SEE:
 *   • Agent nodes with a core + ring (processing units, not dots)
 *   • A structured network — agents connected in a visible topology
 *   • Signals traveling clearly from agent to agent (communication)
 *   • Cascades: one agent activates → signals spread to neighbors →
 *     they activate → it propagates through the network (the system working)
 *   • A central convergence node that collects and breathes (the position)
 *
 * Not subtle. Not a galaxy. A working agent network you can see.
 *
 * Charter: black canvas, #f0f0fa, white = only accent, light = life.
 */

interface AgenticCoreProps {
  className?: string;
  variant?: "section" | "atmosphere";
}

interface Agent {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  ringSize: number;
  baseOpacity: number;
  activation: number; // 0..1, decays — glows when active
  pulsePhase: number;
  connections: number[]; // indices of connected agents
}

interface Signal {
  fromIdx: number;
  toIdx: number;
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

    // --- Agent network ---
    // Layout: agents in a loose ring around center + a few scattered
    // This creates a visible topology, not random noise
    const AGENT_COUNT = isAtmos ? 12 : 8;
    const agents: Agent[] = [];
    const signals: Signal[] = [];

    const initAgents = () => {
      agents.length = 0;
      signals.length = 0;
      const cx = W / 2;
      const cy = H / 2;
      const ringRadius = Math.min(W, H) * (isAtmos ? 0.32 : 0.35);

      for (let i = 0; i < AGENT_COUNT; i++) {
        // Distribute on a ring with jitter
        const angle = (i / AGENT_COUNT) * Math.PI * 2 - Math.PI / 2;
        const jitter = (Math.random() - 0.5) * ringRadius * 0.3;
        const r = ringRadius + jitter;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;

        agents.push({
          x,
          y,
          vx: 0,
          vy: 0,
          size: isAtmos ? 2.5 : 3.5,
          ringSize: isAtmos ? 7 : 10,
          baseOpacity: isAtmos ? 0.35 : 0.5,
          activation: 0,
          pulsePhase: Math.random() * Math.PI * 2,
          connections: [],
        });
      }

      // Build connections: each agent connects to 2-3 nearest neighbors
      for (let i = 0; i < agents.length; i++) {
        const dists: Array<{ idx: number; d: number }> = [];
        for (let j = 0; j < agents.length; j++) {
          if (i === j) continue;
          const d = Math.hypot(agents[i].x - agents[j].x, agents[i].y - agents[j].y);
          dists.push({ idx: j, d });
        }
        dists.sort((a, b) => a.d - b.d);
        // Connect to 2-3 nearest
        const numConn = 2 + Math.floor(Math.random() * 2);
        agents[i].connections = dists.slice(0, numConn).map((d) => d.idx);
      }
    };

    initAgents();
    window.addEventListener("resize", () => { resize(); initAgents(); });

    // --- Cascade logic ---
    let cascadeTimer = 0;
    const cascadeInterval = isAtmos ? 3500 : 2500;
    const maxSignals = isAtmos ? 6 : 10;

    const triggerCascade = () => {
      if (agents.length === 0) return;
      const origin = Math.floor(Math.random() * agents.length);
      agents[origin].activation = 1;

      // Send signals to connected agents
      for (const targetIdx of agents[origin].connections.slice(0, 3)) {
        if (signals.length < maxSignals) {
          signals.push({
            fromIdx: origin,
            toIdx: targetIdx,
            progress: 0,
            speed: 0.012 + Math.random() * 0.006,
            intensity: 0.7,
          });
        }
      }
    };

    const spawnRandomSignal = () => {
      if (agents.length < 2 || signals.length >= maxSignals) return;
      const fromIdx = Math.floor(Math.random() * agents.length);
      const conns = agents[fromIdx].connections;
      if (conns.length === 0) return;
      const toIdx = conns[Math.floor(Math.random() * conns.length)];
      signals.push({
        fromIdx,
        toIdx,
        progress: 0,
        speed: 0.01 + Math.random() * 0.006,
        intensity: 0.3 + Math.random() * 0.2,
      });
    };

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
    let breathPhase = 0;

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
      breathPhase += dt * 0.001;

      // Smooth mouse parallax
      mouseX += (tMouseX - mouseX) * 0.02;
      mouseY += (tMouseY - mouseY) * 0.02;
      const px = (mouseX - W / 2) * 0.015;
      const py = (mouseY - H / 2) * 0.015;

      // Trail clear
      ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
      ctx.fillRect(0, 0, W, H);

      // Update agents — gentle oscillation around their position
      for (const a of agents) {
        a.pulsePhase += dt * 0.002;
        a.x += Math.sin(a.pulsePhase) * 0.15;
        a.y += Math.cos(a.pulsePhase * 0.8) * 0.15;
        a.activation *= 0.96;
      }

      // Cascade timer
      cascadeTimer += dt;
      if (cascadeTimer > cascadeInterval) {
        cascadeTimer = 0;
        triggerCascade();
      }

      // Random signals
      if (Math.random() < 0.02) spawnRandomSignal();

      // --- Draw connections ---
      for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        for (const j of a.connections) {
          if (j <= i) continue; // avoid double-draw
          const b = agents[j];
          const actBoost = Math.max(a.activation, b.activation);
          const baseAlpha = isAtmos ? 0.08 : 0.15;
          const alpha = baseAlpha + actBoost * 0.25;

          const ax = a.x + px;
          const ay = a.y + py;
          const bx = b.x + px;
          const by = b.y + py;

          // Gradient line — fade at ends
          const grad = ctx.createLinearGradient(ax, ay, bx, by);
          grad.addColorStop(0, `rgba(${COLOR}, ${alpha * 0.3})`);
          grad.addColorStop(0.5, `rgba(${COLOR}, ${alpha})`);
          grad.addColorStop(1, `rgba(${COLOR}, ${alpha * 0.3})`);
          ctx.strokeStyle = grad;
          ctx.lineWidth = isAtmos ? 0.5 : 0.8;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
        }
      }

      // --- Draw signals (traveling pulses) ---
      for (let i = signals.length - 1; i >= 0; i--) {
        const s = signals[i];
        s.progress += s.speed * dt / 16;

        if (s.progress >= 1) {
          // Arrived — activate target and chain
          const target = agents[s.toIdx];
          if (target) {
            target.activation = Math.min(1, target.activation + s.intensity * 0.6);
            // Chain: propagate to neighbors (but weaker)
            if (s.intensity > 0.35) {
              for (const nextIdx of target.connections.slice(0, 2)) {
                if (nextIdx !== s.fromIdx && signals.length < maxSignals) {
                  signals.push({
                    fromIdx: s.toIdx,
                    toIdx: nextIdx,
                    progress: 0,
                    speed: 0.01 + Math.random() * 0.004,
                    intensity: s.intensity * 0.55,
                  });
                }
              }
            }
          }
          signals.splice(i, 1);
          continue;
        }

        const from = agents[s.fromIdx];
        const to = agents[s.toIdx];
        if (!from || !to) continue;

        const x = from.x + (to.x - from.x) * s.progress + px;
        const y = from.y + (to.y - from.y) * s.progress + py;
        const fade = Math.sin(s.progress * Math.PI);
        const alpha = fade * s.intensity * (isAtmos ? 0.5 : 0.8);

        // Bright glowing pulse
        const glowR = 10;
        const glow = ctx.createRadialGradient(x, y, 0, x, y, glowR);
        glow.addColorStop(0, `rgba(${COLOR}, ${alpha})`);
        glow.addColorStop(0.3, `rgba(${COLOR}, ${alpha * 0.5})`);
        glow.addColorStop(1, `rgba(${COLOR}, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, glowR, 0, Math.PI * 2);
        ctx.fill();

        // Bright core of the pulse
        ctx.fillStyle = `rgba(${COLOR}, ${Math.min(1, alpha * 2)})`;
        ctx.beginPath();
        ctx.arc(x, y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // --- Draw agents ---
      for (const a of agents) {
        const x = a.x + px;
        const y = a.y + py;
        const act = a.activation;
        const breath = 0.85 + Math.sin(breathPhase + a.pulsePhase) * 0.15;
        const alpha = a.baseOpacity + act * 0.4;

        // Outer glow — expands when activated
        const glowR = a.ringSize * (1 + act * 0.8) * breath;
        const glow = ctx.createRadialGradient(x, y, 0, x, y, glowR);
        glow.addColorStop(0, `rgba(${COLOR}, ${alpha * 0.4 + act * 0.3})`);
        glow.addColorStop(0.5, `rgba(${COLOR}, ${alpha * 0.1 + act * 0.1})`);
        glow.addColorStop(1, `rgba(${COLOR}, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, glowR, 0, Math.PI * 2);
        ctx.fill();

        // Ring — the "agent unit" look
        const ringR = a.ringSize * 0.5 * breath;
        ctx.strokeStyle = `rgba(${COLOR}, ${alpha * 0.5 + act * 0.4})`;
        ctx.lineWidth = isAtmos ? 0.6 : 1;
        ctx.beginPath();
        ctx.arc(x, y, ringR, 0, Math.PI * 2);
        ctx.stroke();

        // Core dot
        ctx.fillStyle = `rgba(${COLOR}, ${Math.min(1, alpha + act * 0.5)})`;
        ctx.beginPath();
        ctx.arc(x, y, a.size * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }

      // --- Central convergence node ---
      const cx = W / 2 + px * 0.5;
      const cy = H / 2 + py * 0.5;
      const centerBreath = 0.7 + Math.sin(breathPhase * 0.8) * 0.3;
      const centerAlpha = isAtmos ? 0.2 : 0.35;

      // Convergence lines from each agent to center (very faint)
      for (const a of agents) {
        const ax = a.x + px;
        const ay = a.y + py;
        const grad = ctx.createLinearGradient(ax, ay, cx, cy);
        grad.addColorStop(0, `rgba(${COLOR}, 0)`);
        grad.addColorStop(1, `rgba(${COLOR}, ${0.04 + a.activation * 0.08})`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 0.3;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(cx, cy);
        ctx.stroke();
      }

      // Center glow
      const cGlowR = 25 * centerBreath;
      const cGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, cGlowR);
      cGlow.addColorStop(0, `rgba(${COLOR}, ${centerAlpha * 0.3})`);
      cGlow.addColorStop(0.5, `rgba(${COLOR}, ${centerAlpha * 0.08})`);
      cGlow.addColorStop(1, `rgba(${COLOR}, 0)`);
      ctx.fillStyle = cGlow;
      ctx.beginPath();
      ctx.arc(cx, cy, cGlowR, 0, Math.PI * 2);
      ctx.fill();

      // Center ring
      ctx.strokeStyle = `rgba(${COLOR}, ${centerAlpha * centerBreath})`;
      ctx.lineWidth = isAtmos ? 0.8 : 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, 6 * centerBreath, 0, Math.PI * 2);
      ctx.stroke();

      // Center core
      ctx.fillStyle = `rgba(${COLOR}, ${centerAlpha * 1.5 * centerBreath})`;
      ctx.beginPath();
      ctx.arc(cx, cy, 2, 0, Math.PI * 2);
      ctx.fill();
    };

    if (!reduce) {
      raf = requestAnimationFrame(draw);
    } else {
      // Static frame
      for (const a of agents) {
        ctx.fillStyle = `rgba(${COLOR}, ${a.baseOpacity * 0.6})`;
        ctx.beginPath();
        ctx.arc(a.x, a.y, a.size * 0.4, 0, Math.PI * 2);
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
