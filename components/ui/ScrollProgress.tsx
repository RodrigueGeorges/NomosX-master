"use client";

import { useEffect, useState } from "react";

/**
 * ScrollProgress — a thin gradient bar at the top of the viewport
 * that fills as the user scrolls down the page.
 */
export function ScrollProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(docHeight > 0 ? (scrollTop / docHeight) * 100 : 0);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className="nx-scroll-progress"
      style={{ width: `${progress}%` }}
      aria-hidden="true"
    />
  );
}
