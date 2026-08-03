"use client";

import { useEffect, useRef, useState } from "react";

/**
 * useAnimatedCounter — animates a number from 0 to `end` when triggered.
 *
 * @param end        Final value
 * @param options.duration  Animation duration in ms (default 1800)
 * @param options.start     Whether to start the animation (default true)
 * @param options.suffix    String appended after the number (e.g. "M+")
 * @param options.prefix    String prepended before the number
 */
export function useAnimatedCounter(
  end: number,
  options: { duration?: number; start?: boolean; suffix?: string; prefix?: string } = {}
) {
  const { duration = 1800, start = true, suffix = "", prefix = "" } = options;
  const [value, setValue] = useState(0);
  const frameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!start) return;

    const animate = (timestamp: number) => {
      if (startTimeRef.current === null) startTimeRef.current = timestamp;
      const progress = Math.min((timestamp - startTimeRef.current) / duration, 1);
      // easeOutExpo for a satisfying deceleration
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setValue(eased * end);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        setValue(end);
      }
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      startTimeRef.current = null;
    };
  }, [end, duration, start]);

  const display = value >= end ? `${prefix}${end}${suffix}` : `${prefix}${Math.floor(value)}${suffix}`;
  return display;
}
