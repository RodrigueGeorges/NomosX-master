"use client";

/**
 * ManifestoCrawl — short premium brand reveal for the NomosX home.
 *
 * Inspired by the best 2026 intros (Telha Clarke, Bisous, Vectr):
 *   - 5 seconds total (not 25)
 *   - Wordmark animation, not text crawl
 *   - One punchline, not a paragraph
 *   - Atmospheric background (grid + aurora), not black void
 *   - Smooth fade into the page, not a hard cut
 *
 * Phases:
 *   1. reveal  (0–2.5s)   — grid/aurora fade in, punchline types in
 *   2. brand   (2.5–4s)   — wordmark glows in with subtitle
 *   3. exit    (4–5s)     — everything lifts and fades, page emerges
 *
 * Gating: prefers-reduced-motion, sessionStorage, low-end devices.
 * Skip: Esc / Enter / Space / click anywhere.
 */

import { useEffect, useRef, useState } from "react";

type Phase = "reveal" | "brand" | "exit";

const STORAGE_KEY = "nomosx:intro:seen";

const REVEAL_MS = 2500;
const BRAND_MS = 1500;
const EXIT_MS = 1000;
const TOTAL_MS = REVEAL_MS + BRAND_MS;
const SAFETY_MS = TOTAL_MS + 3000;

function shouldSkipAutoplay(): boolean {
  if (typeof window === "undefined") return true;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
  try {
    if (sessionStorage.getItem(STORAGE_KEY) === "1") return true;
  } catch {
    /* ignore */
  }
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

export function ManifestoCrawl({ onComplete }: { onComplete?: () => void }) {
  const [phase, setPhase] = useState<Phase>("reveal");
  const [hidden, setHidden] = useState(false);
  const [shouldPlay, setShouldPlay] = useState(false);
  const timers = useRef<number[]>([]);
  const completedRef = useRef(false);
  const skipBtnRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  const finish = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    clearTimers();
    setPhase("exit");
    const t = window.setTimeout(() => {
      setHidden(true);
      previousFocus.current?.focus?.();
      onComplete?.();
    }, EXIT_MS);
    timers.current.push(t);
  };

  useEffect(() => {
    if (shouldSkipAutoplay()) {
      setHidden(true);
      completedRef.current = true;
      onComplete?.();
      return;
    }

    setShouldPlay(true);

    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }

    previousFocus.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const mainContent = document.querySelector("[data-nx-main]") as HTMLElement | null;
    if (mainContent) mainContent.inert = true;

    requestAnimationFrame(() => skipBtnRef.current?.focus());

    timers.current.push(
      window.setTimeout(() => setPhase("brand"), REVEAL_MS),
      window.setTimeout(finish, TOTAL_MS),
      window.setTimeout(finish, SAFETY_MS),
    );

    return () => {
      clearTimers();
      document.body.style.overflow = prevOverflow;
      if (mainContent) mainContent.inert = false;
    };
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
  }, [hidden, shouldPlay]);

  if (hidden || !shouldPlay) return null;

  return (
    <div
      className={`nx-intro-overlay${phase === "exit" ? " nx-intro-exit" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="NomosX — intro"
      onClick={finish}
    >
      <div className="nx-grid-bg-enhanced nx-intro-grid" aria-hidden="true" />
      <div className="nx-aurora nx-intro-aurora" aria-hidden="true" />

      <button
        ref={skipBtnRef}
        type="button"
        className="nx-intro-skip"
        onClick={(e) => {
          e.stopPropagation();
          finish();
        }}
        aria-label="Skip intro and go to homepage"
      >
        Skip →
      </button>

      {/* Phase 1: Punchline reveal */}
      <div className={`nx-intro-reveal${phase === "reveal" ? " nx-intro-active" : ""}`} aria-hidden="true">
        <p className="nx-intro-line">The world doesn&apos;t suffer</p>
        <p className="nx-intro-line">from a lack of information.</p>
        <div className="nx-intro-divider" />
        <p className="nx-intro-line nx-intro-line--accent">
          It suffers from a lack of structure.
        </p>
      </div>

      {/* Phase 2: Wordmark brand reveal */}
      <div className={`nx-intro-brand${phase === "brand" ? " nx-intro-active" : ""}${phase === "exit" ? " nx-intro-brand-out" : ""}`} aria-hidden="true">
        <h2 className="nx-intro-wordmark">
          Nomos<span className="nx-intro-x">X</span>
        </h2>
        <p className="nx-intro-tagline">From Chaos to Clarity</p>
      </div>

      {/* Progress indicator — minimal line at bottom */}
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
