"use client";

import { useEffect, useRef, useState } from "react";

/**
 * useScrollReveal — reveals an element when it enters the viewport.
 * Returns a ref to attach and a boolean for visibility.
 *
 * @param options.threshold  How much of the element must be visible (0-1)
 * @param options.rootMargin Margin around the root (e.g. "0px 0px -80px 0px")
 * @param options.once       Only animate once (default true)
 */
export function useScrollReveal<T extends HTMLElement = HTMLDivElement>(
  options: { threshold?: number; rootMargin?: string; once?: boolean } = {}
) {
  const { threshold = 0.15, rootMargin = "0px 0px -60px 0px", once = true } = options;
  const ref = useRef<T>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // If IntersectionObserver isn't available, just show it.
    if (typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          if (once) observer.unobserve(entry.target);
        } else if (!once) {
          setIsVisible(false);
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, rootMargin, once]);

  return { ref, isVisible } as const;
}
