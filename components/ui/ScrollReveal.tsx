"use client";

import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  stagger?: boolean;
  threshold?: number;
  rootMargin?: string;
  delay?: number;
  as?: React.ElementType;
}

/**
 * ScrollReveal — wraps children in a scroll-triggered reveal animation.
 * Uses IntersectionObserver. Falls back to visible if observer unavailable.
 *
 * @param stagger  Stagger direct children with incremental delays
 * @param delay    Manual delay in ms (applied to the wrapper)
 */
export function ScrollReveal({
  children,
  className,
  stagger = false,
  threshold = 0.15,
  rootMargin = "0px 0px -60px 0px",
  delay = 0,
  as: Tag = "div",
}: ScrollRevealProps) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, rootMargin]);

  return (
    <Tag
      ref={ref as React.RefObject<HTMLElement>}
      className={cn(
        stagger ? "nx-reveal-stagger" : "nx-reveal",
        visible && "nx-reveal-visible",
        className
      )}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
