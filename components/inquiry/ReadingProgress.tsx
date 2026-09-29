"use client";

import { useEffect, useRef } from "react";

/**
 * ReadingProgress — hairline scroll-progress bar pinned to the top of the
 * viewport. Zero re-renders: the width is written to the DOM directly in a
 * passive scroll handler. Hidden when printing.
 */
export function ReadingProgress() {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const pct = max > 0 ? Math.min(1, window.scrollY / max) : 0;
      if (barRef.current) barRef.current.style.transform = `scaleX(${pct})`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="fixed top-0 left-0 right-0 h-[2px] z-50 print:hidden"
    >
      <div
        ref={barRef}
        className="h-full w-full bg-black dark:bg-white origin-left"
        style={{ transform: "scaleX(0)" }}
      />
    </div>
  );
}
