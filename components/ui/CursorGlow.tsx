"use client";

import { useEffect, useRef } from "react";

/**
 * CursorGlow — a subtle ambient radial glow that follows the cursor.
 * Emerald-tinted, ~4% opacity, 480px radius. The page breathes with you.
 * Disabled on touch devices and when prefers-reduced-motion.
 */
export function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Skip on touch / reduced-motion
    if (window.matchMedia("(pointer: coarse)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const el = ref.current;
    if (!el) return;

    let raf = 0;
    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;
    let currentX = targetX;
    let currentY = targetY;
    let active = false;

    const onMove = (e: MouseEvent) => {
      targetX = e.clientX;
      targetY = e.clientY;
      if (!active) {
        active = true;
        el.classList.add("nx-cursor-active");
      }
    };

    const onLeave = () => {
      active = false;
      el.classList.remove("nx-cursor-active");
    };

    const tick = () => {
      // Smooth lerp for fluid trailing
      currentX += (targetX - currentX) * 0.08;
      currentY += (targetY - currentY) * 0.08;
      el.style.transform = `translate(${currentX}px, ${currentY}px) translate(-50%, -50%)`;
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("mousemove", onMove);
    document.addEventListener("mouseleave", onLeave);
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);

  return <div ref={ref} className="nx-cursor-glow" aria-hidden="true" />;
}
