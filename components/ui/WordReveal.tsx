"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface WordRevealProps {
  text: string;
  className?: string;
  wordClassName?: string;
  baseDelay?: number;
  stagger?: number;
}

/**
 * WordReveal — splits text into words and reveals each with a
 * blur-to-focus animation, staggered. Subtle, editorial, premium.
 *
 * Preserves spaces between words. Punctuation stays attached.
 */
export function WordReveal({
  text,
  className,
  wordClassName,
  baseDelay = 200,
  stagger = 120,
}: WordRevealProps) {
  const words = text.split(" ");

  const reducedMotion = typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <span className={cn("inline", className)}>
      {words.map((word, i) => (
        <span
          key={`${word}-${i}`}
          className={cn("nx-word", wordClassName)}
          style={reducedMotion ? undefined : { animationDelay: `${baseDelay + i * stagger}ms` }}
        >
          {word}
          {i < words.length - 1 ? "\u00A0" : ""}
        </span>
      ))}
    </span>
  );
}
