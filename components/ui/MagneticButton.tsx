"use client";

import React, { useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

interface MagneticButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  strength?: number;
  className?: string;
}

/**
 * MagneticButton — a button that subtly pulls toward the cursor.
 * v2: spring physics — the button eases toward the cursor target with
 * momentum, and springs back on leave. Feels organic, not robotic.
 * Disabled on touch devices and when prefers-reduced-motion.
 */
export function MagneticButton({
  children,
  strength = 0.25,
  className,
  ...props
}: MagneticButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const springRef = useRef({ x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, raf: 0, tick: null as null | (() => void) });

  const reducedMotion = typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const startTick = useCallback(() => {
    const s = springRef.current;
    if (s.raf === 0 && s.tick) {
      s.raf = requestAnimationFrame(s.tick);
    }
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (reducedMotion) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    springRef.current.tx = x * strength;
    springRef.current.ty = y * strength;
    startTick();
  };

  const handleMouseLeave = () => {
    if (reducedMotion) return;
    springRef.current.tx = 0;
    springRef.current.ty = 0;
    startTick();
  };

  useEffect(() => {
    const s = springRef.current;
    s.tick = () => {
      // Spring physics: stiffness=0.15, damping=0.65
      const fx = (s.tx - s.x) * 0.15;
      const fy = (s.ty - s.y) * 0.15;
      s.vx = (s.vx + fx) * 0.65;
      s.vy = (s.vy + fy) * 0.65;
      s.x += s.vx;
      s.y += s.vy;

      const el = ref.current;
      if (el) {
        el.style.transform = `translate(${s.x.toFixed(2)}px, ${s.y.toFixed(2)}px)`;
      }

      // Continue if still moving
      if (Math.abs(s.vx) > 0.01 || Math.abs(s.vy) > 0.01 || Math.abs(s.tx - s.x) > 0.1) {
        s.raf = requestAnimationFrame(s.tick!);
      } else {
        s.raf = 0;
      }
    };
    return () => {
      if (s.raf) cancelAnimationFrame(s.raf);
    };
  }, []);

  return (
    <button
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={cn("nx-magnetic", className)}
      {...props}
    >
      {children}
    </button>
  );
}
