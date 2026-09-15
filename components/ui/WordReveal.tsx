"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface WordRevealProps {
  text: string;
  className?: string;
  wordClassName?: string;
  baseDelay?: number;
  stagger?: number;
  effect?: "blur" | "rise" | "scramble";
}

/**
 * WordReveal — splits text into words and reveals each with a
 * blur-to-focus or rise animation, staggered. Subtle, editorial, premium.
 *
 * Effects:
 *   blur     — blur(8px) → focus, opacity 0 → 1 (default, original)
 *   rise     — translateY(20px) → 0, opacity 0 → 1
 *   scramble — characters resolve from random → target per word
 *
 * Preserves spaces between words. Punctuation stays attached.
 */
const SCRAMBLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function useScrambleWord(target: string, active: boolean, durationMs = 600): string {
  const [display, setDisplay] = React.useState(target);
  const rafRef = React.useRef<number>(0);

  React.useEffect(() => {
    if (!active || typeof window === "undefined") {
      setDisplay(target);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(target);
      return;
    }

    const chars = target.split("");
    const resolveTimes = chars.map((_, i) => (i / chars.length) * durationMs * 0.7 + Math.random() * durationMs * 0.3);
    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      let done = true;
      const out = chars.map((ch, i) => {
        if (ch === " " || ch === "." || ch === "'" || ch === "-") return ch;
        if (elapsed >= resolveTimes[i]) return ch;
        done = false;
        return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
      });
      setDisplay(out.join(""));
      if (!done) rafRef.current = requestAnimationFrame(tick);
      else setDisplay(target);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, active, durationMs]);

  return display;
}

export function WordReveal({
  text,
  className,
  wordClassName,
  baseDelay = 200,
  stagger = 120,
  effect = "blur",
}: WordRevealProps) {
  const words = text.split(" ");

  const reducedMotion = typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (effect === "scramble" && !reducedMotion) {
    return (
      <span className={cn("inline", className)}>
        {words.map((word, i) => (
          <ScrambleWord
            key={`${word}-${i}`}
            word={word}
            delay={baseDelay + i * stagger}
            isLast={i === words.length - 1}
            className={wordClassName}
          />
        ))}
      </span>
    );
  }

  const effectClass = effect === "rise" ? "nx-word-rise" : "nx-word";

  return (
    <span className={cn("inline", className)}>
      {words.map((word, i) => (
        <span
          key={`${word}-${i}`}
          className={cn(effectClass, wordClassName)}
          style={reducedMotion ? undefined : { animationDelay: `${baseDelay + i * stagger}ms` }}
        >
          {word}
          {i < words.length - 1 ? "\u00A0" : ""}
        </span>
      ))}
    </span>
  );
}

function ScrambleWord({
  word,
  delay,
  isLast,
  className,
}: {
  word: string;
  delay: number;
  isLast: boolean;
  className?: string;
}) {
  const [active, setActive] = React.useState(false);

  React.useEffect(() => {
    const t = setTimeout(() => setActive(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  const display = useScrambleWord(word, active);

  return (
    <span
      className={cn("nx-word", className)}
      style={{ animationDelay: `${delay}ms` }}
    >
      {display}
      {isLast ? "" : "\u00A0"}
    </span>
  );
}
