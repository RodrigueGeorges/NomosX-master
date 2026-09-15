"use client";

/**
 * ManifestoCrawl v7 — "From Chaos to Nomos"
 *
 * DA: white background, dark text, charter NomosX.
 * Narrative: Greek letters + binary start chaotic, a scan line
 * organizes them into structure, then they crystallize into NomosX.
 *
 * Phase 1 — CHAOS   (0-5s)    Letters scattered, drifting chaotically
 * Phase 2 — SCAN   (5-10s)   Scan line descends, letters align, manifesto
 * Phase 3 — NOMOS  (10-15s)  Wordmark bloom, meander, tagline + subtitle
 * Phase 4 — EXIT   (15-16s)  Fade out
 *
 * Brand DNA:
 *   Tagline:    "From Chaos to Nomos."
 *   Subtitle:   "An AI think tank that publishes positions, not opinions."
 *   Manifesto: "The world doesn't suffer from a lack of information.
 *                It suffers from a lack of structure."
 */

import { useEffect, useRef, useState, useCallback } from "react";

type Phase = "chaos" | "scan" | "nomos" | "exit";

const CHAOS_MS = 5000;
const SCAN_MS = 5000;
const NOMOS_MS = 5000;
const EXIT_MS = 1000;
const TOTAL_MS = CHAOS_MS + SCAN_MS + NOMOS_MS;
const SAFETY_MS = TOTAL_MS + 5000;

const GREEK_CHARS = "ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩαβγδεζηθικλμνξοπρστυφχψω";
const BINARY_CHARS = "01";

function shouldSkipAutoplay(): boolean {
  if (typeof window === "undefined") return true;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean; effectiveType?: string };
  };
  if (typeof nav.deviceMemory === "number" && nav.deviceMemory < 2) return true;
  if (typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency < 2) return true;
  if (nav.connection?.saveData) return true;
  if (/(2g)/i.test(nav.connection?.effectiveType || "")) return true;
  return false;
}

// ── Scramble text hook ──────────────────────────────────────────────
const SCRAMBLE_CHARS = "ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ0123456789@#$%&*<>{}[]/\\|";

function useScrambleText(target: string, active: boolean, durationMs = 2000): string {
  const [display, setDisplay] = useState(target);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!active || typeof window === "undefined") {
      setDisplay(target);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(target);
      return;
    }

    const chars = target.split("");
    const resolveTimes = chars.map((_, i) => {
      const base = (i / chars.length) * durationMs * 0.6;
      const jitter = Math.random() * durationMs * 0.4;
      return base + jitter;
    });
    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      let done = true;
      const out = chars.map((ch, i) => {
        if (ch === " " || ch === "." || ch === "'" || ch === "-" || ch === ",") return ch;
        if (elapsed >= resolveTimes[i]) return ch;
        done = false;
        return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
      });
      setDisplay(out.join(""));
      if (!done) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplay(target);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, active, durationMs]);

  return display;
}

// ── Floating char grid: Greek letters × binary ─────────────────────
// Each char has a random initial chaotic offset/rotation.
// When `organized` is true, chars animate to aligned grid position.
function FloatingCharGrid({ organized }: { organized: boolean }) {
  const cols = 16;
  const rows = 10;
  const cells: React.ReactNode[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isGreek = Math.random() > 0.4;
      const pool = isGreek ? GREEK_CHARS : BINARY_CHARS;
      const char = pool[Math.floor(Math.random() * pool.length)];

      // Chaotic initial state
      const rot = (Math.random() - 0.5) * 60; // -30 to +30 deg
      const offsetX = (Math.random() - 0.5) * 20; // -10 to +10 px
      const offsetY = (Math.random() - 0.5) * 20;
      const delay = (r * 0.12).toFixed(2); // staggered by row
      const driftDuration = (4 + Math.random() * 3).toFixed(1);
      const baseOpacity = (0.03 + Math.random() * 0.05).toFixed(3);

      cells.push(
        <span
          key={`${r}-${c}`}
          className={`nx-intro-grid-char ${organized ? "nx-intro-grid-char-organized" : ""}`}
          style={{
            // CSS custom properties for chaos → order transition
            ["--rot" as string]: `${rot}deg`,
            ["--ox" as string]: `${offsetX}px`,
            ["--oy" as string]: `${offsetY}px`,
            ["--delay" as string]: `${delay}s`,
            animationDelay: `${delay}s`,
            animationDuration: `${driftDuration}s`,
            opacity: parseFloat(baseOpacity),
            color: isGreek ? "var(--nx-text-primary)" : "rgba(10, 10, 15, 0.5)",
            fontFamily: isGreek
              ? "var(--nx-font-heading)"
              : "var(--font-mono), ui-monospace, monospace",
          }}
        >
          {char}
        </span>
      );
    }
  }

  return <div className="nx-intro-grid">{cells}</div>;
}

// ── Main component ──────────────────────────────────────────────────
export function ManifestoCrawl({ onComplete }: { onComplete?: () => void }) {
  const [phase, setPhase] = useState<Phase>("chaos");
  const [hidden, setHidden] = useState(false);
  const [shouldPlay, setShouldPlay] = useState(false);
  const [gridKey, setGridKey] = useState(0);
  const timers = useRef<number[]>([]);
  const completedRef = useRef(false);
  const skipBtnRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  const manifestoText = useScrambleText(
    "The world doesn't suffer from a lack of information. It suffers from a lack of structure.",
    phase === "scan",
    3000
  );
  const nomosText = useScrambleText("NOMOS", phase === "nomos", 1500);

  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }, []);

  const finish = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    clearTimers();

    document.body.style.overflow = "";
    const mainContent = document.querySelector("[data-nx-main]") as HTMLElement | null;
    if (mainContent) mainContent.inert = false;

    setPhase("exit");
    const t = window.setTimeout(() => {
      setHidden(true);
      previousFocus.current?.focus?.();
      onComplete?.();
    }, EXIT_MS);
    timers.current.push(t);
  }, [clearTimers, onComplete]);

  const startSequence = useCallback(() => {
    completedRef.current = false;
    setPhase("chaos");
    setHidden(false);
    setShouldPlay(true);
    setGridKey((k) => k + 1);

    previousFocus.current = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";

    const mainContent = document.querySelector("[data-nx-main]") as HTMLElement | null;
    if (mainContent) mainContent.inert = true;

    requestAnimationFrame(() => skipBtnRef.current?.focus());

    timers.current.push(
      window.setTimeout(() => setPhase("scan"), CHAOS_MS),
      window.setTimeout(() => setPhase("nomos"), CHAOS_MS + SCAN_MS),
      window.setTimeout(finish, TOTAL_MS),
      window.setTimeout(finish, SAFETY_MS),
    );
  }, [finish]);

  useEffect(() => {
    if (shouldSkipAutoplay()) {
      setHidden(true);
      completedRef.current = true;
      document.body.style.overflow = "";
      const main = document.querySelector("[data-nx-main]") as HTMLElement | null;
      if (main) main.inert = false;
      onComplete?.();
      return;
    }

    startSequence();

    return () => {
      clearTimers();
      document.body.style.overflow = "";
      const mainContent = document.querySelector("[data-nx-main]") as HTMLElement | null;
      if (mainContent) mainContent.inert = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const replay = () => {
      clearTimers();
      startSequence();
    };
    window.addEventListener("nomosx:replay-intro", replay);
    return () => window.removeEventListener("nomosx:replay-intro", replay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (hidden || !shouldPlay) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        finish();
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        skipBtnRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hidden, shouldPlay, finish]);

  if (hidden || !shouldPlay) return null;

  const showChaos = phase === "chaos";
  const showScan = phase === "scan";
  const showNomos = phase === "nomos" || phase === "exit";
  const organized = showScan || showNomos;

  return (
    <div
      className={`nx-intro-overlay${phase === "exit" ? " nx-intro-exit" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="NomosX — intro"
      onClick={finish}
    >
      {/* Subtle aurora — matches landing page */}
      <div className="nx-intro-aurora" aria-hidden="true" />

      {/* ── Floating Greek × Binary grid ────────────────────────────── */}
      <div
        key={gridKey}
        className={`nx-intro-grid-container ${showChaos ? "nx-intro-grid-active" : ""} ${showNomos ? "nx-intro-grid-fading" : ""}`}
        aria-hidden="true"
      >
        <FloatingCharGrid organized={organized} />
      </div>

      {/* ── Phase 1: CHAOS — scattered letters drift ─────────────────── */}
      <div className={`nx-intro-phase ${showChaos ? "nx-intro-phase-active" : ""}`} aria-hidden="true">
        <p className="nx-intro-phase-label">CHAOS</p>
      </div>

      {/* ── Phase 2: SCAN — scan line descends, letters align, manifesto ─ */}
      <div className={`nx-intro-phase ${showScan ? "nx-intro-phase-active" : ""}`} aria-hidden="true">
        <div className="nx-intro-scan-container">
          <div className="nx-intro-scan-line" />
          <div className="nx-intro-scan-glow" />
        </div>
        <div className="nx-intro-text-block">
          <p className="nx-intro-manifesto">{manifestoText}</p>
        </div>
      </div>

      {/* ── Phase 3: NOMOS — wordmark bloom + meander + tagline ────────── */}
      <div className={`nx-intro-phase ${showNomos ? "nx-intro-phase-active" : ""}`} aria-hidden="true">
        <span className="nx-intro-eyebrow">
          <span className="nx-intro-eyebrow-dot" />
          The first AI think tank, always on
        </span>
        <h2 className="nx-intro-wordmark">
          {nomosText}<span className="nx-intro-x">X</span>
        </h2>
        {/* Greek meander divider */}
        <svg className="nx-intro-meander-mini" viewBox="0 0 160 8" preserveAspectRatio="none" aria-hidden="true">
          <path
            d="M0,4 L20,4 L20,1 L8,1 L8,7 L32,7 L32,0 L44,0 L44,4 L60,4 L60,1 L72,1 L72,7 L96,7 L96,0 L108,0 L108,4 L124,4 L124,1 L136,1 L136,7 L160,7"
            fill="none"
            stroke="rgba(10,10,15,0.3)"
            strokeWidth="1"
          />
        </svg>
        <p className="nx-intro-tagline">From Chaos to Nomos.</p>
        <p className="nx-intro-subtitle">An AI think tank that publishes positions, not opinions.</p>
      </div>

      {/* Skip button */}
      <button
        ref={skipBtnRef}
        type="button"
        className="nx-intro-skip"
        onClick={(e) => {
          e.stopPropagation();
          finish();
        }}
        aria-label="Skip intro"
      >
        Skip →
      </button>

      {/* Progress bar */}
      <div className="nx-intro-progress" aria-hidden="true">
        <div
          className="nx-intro-progress-bar"
          style={{
            animationDuration: `${TOTAL_MS}ms`,
            animationPlayState: phase === "exit" ? "paused" : "running",
          }}
        />
      </div>
    </div>
  );
}
