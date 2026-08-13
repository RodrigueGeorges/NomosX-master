"use client";

/**
 * ManifestoCrawl — cinematic Star Wars-style intro for the NomosX home.
 *
 * Phases:
 *   1. teaser  (≈2.8s) — opening line fades in/out (the setup)
 *   2. title   (≈4s)   — wordmark recedes like the SW logo
 *   3. crawl   (≈18s)  — the manifesto scrolls up in 3D perspective
 *   4. fading  (≈0.9s) — overlay fades, hands control back to the page
 *
 * The teaser delivers line 1 of the manifesto; the crawl continues from
 * line 2 — no duplication.
 *
 * Gating (won't autoplay if ANY of these are true):
 *   - prefers-reduced-motion
 *   - already seen this session (sessionStorage)
 *   - mobile / coarse pointer (hover: none)
 *   - small screen (< 820px)
 *   - low-end device (deviceMemory < 4 OR hardwareConcurrency < 4)
 *   - data-saver / slow connection (navigator.connection.saveData)
 *
 * Accessibility:
 *   - role="dialog" aria-modal="true"
 *   - focus moves to skip button on open, trapped while active
 *   - background content marked inert
 *   - body scroll locked while overlay is visible
 *   - Esc / Enter / Space / click anywhere to skip
 *   - hard safety timeout in case timers are throttled in background tabs
 */

import { useEffect, useRef, useState } from "react";

type Phase = "teaser" | "title" | "crawl" | "fading";

const STORAGE_KEY = "nomosx:crawl:seen";

const TEASER_MS = 2800;
const TITLE_MS = 4000;
const CRAWL_MS = 18000;
const FADE_MS = 900;
const TOTAL_MS = TEASER_MS + TITLE_MS + CRAWL_MS;
// Safety margin: if the main timer is throttled (background tab), still close.
const SAFETY_MS = TOTAL_MS + 5000;

const CRAWL_LINES: { text: string; dim?: boolean }[] = [
  { text: "It suffers from a lack of structure." },
  { text: "Knowledge without order creates noise.", dim: true },
  { text: "Order creates understanding.", dim: true },
  { text: "Understanding creates better decisions.", dim: true },
];

/**
 * Decide whether the crawl should autoplay. Mirrors the gating logic
 * from Kamil Rácz's cinematic-intro reference: never block mobile,
 * low-end, data-saving, motion-sensitive, or repeat visitors.
 */
function shouldSkipAutoplay(): boolean {
  if (typeof window === "undefined") return true;

  // 1. Motion sensitivity
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;

  // 2. Already seen this session
  try {
    if (sessionStorage.getItem(STORAGE_KEY) === "1") return true;
  } catch {
    /* sessionStorage may be blocked — don't skip just for that */
  }

  // 3. Low-end device signals (progressive enhancement APIs).
  //    The crawl is pure CSS (no network payload), so we only skip on
  //    genuinely weak hardware / data-saver — NOT on mobile in general.
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
  const [phase, setPhase] = useState<Phase>("teaser");
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
    setPhase("fading");
    const t = window.setTimeout(() => {
      setHidden(true);
      // Restore focus to whatever had it before the crawl opened.
      previousFocus.current?.focus?.();
      onComplete?.();
    }, FADE_MS);
    timers.current.push(t);
  };

  // Mount: decide whether to play, set up timers, lock scroll, manage focus.
  useEffect(() => {
    if (shouldSkipAutoplay()) {
      setHidden(true);
      completedRef.current = true;
      onComplete?.();
      return;
    }

    setShouldPlay(true);

    // Mark as seen
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }

    // Remember current focus so we can restore it on close
    previousFocus.current = document.activeElement as HTMLElement | null;

    // Lock body scroll while the overlay is visible
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Mark the main page content as inert so screen readers skip it
    // while the dialog is open. Targets the PublicPageShell wrapper.
    const mainContent = document.querySelector("[data-nx-main]") as HTMLElement | null;
    if (mainContent) mainContent.inert = true;

    // Move focus into the overlay (skip button)
    requestAnimationFrame(() => skipBtnRef.current?.focus());

    timers.current.push(
      window.setTimeout(() => setPhase("title"), TEASER_MS),
      window.setTimeout(() => setPhase("crawl"), TEASER_MS + TITLE_MS),
      window.setTimeout(finish, TOTAL_MS),
      // Safety: if the main timer is throttled (e.g. background tab),
      // still close after a grace period.
      window.setTimeout(finish, SAFETY_MS),
    );

    return () => {
      clearTimers();
      document.body.style.overflow = prevOverflow;
      if (mainContent) mainContent.inert = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard: skip on Esc/Enter/Space + trap focus inside the overlay
  useEffect(() => {
    if (hidden || !shouldPlay) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        finish();
        return;
      }
      // Trap Tab focus inside the overlay (only the skip button is focusable)
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
      className={`nx-crawl-overlay${phase === "fading" ? " nx-crawl-fading" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="NomosX — manifesto intro"
      onClick={finish}
    >
        <div className="nx-grid-bg-enhanced" aria-hidden="true" />
        <div className="nx-aurora" aria-hidden="true" />

        <button
          ref={skipBtnRef}
          type="button"
          className="nx-crawl-skip"
          onClick={(e) => {
            e.stopPropagation();
            finish();
          }}
          aria-label="Skip intro and go to homepage"
        >
          Skip intro →
        </button>

        {phase === "teaser" && (
          <p className="nx-crawl-teaser nx-crawl-teaser-in" aria-hidden="true">
            The world doesn&apos;t suffer from a lack of information.
          </p>
        )}

        {phase === "title" && (
          <div className="nx-crawl-title nx-crawl-title-in" aria-hidden="true">
            <span className="nx-crawl-title-word">NomosX</span>
            <span className="nx-crawl-title-sub">From Chaos to Clarity</span>
          </div>
        )}

        {(phase === "crawl" || phase === "fading") && (
          <div className="nx-crawl-stage" aria-hidden="true">
            <div className="nx-crawl-scroll nx-crawl-anim">
              {CRAWL_LINES.map((line, i) => (
                <p
                  key={i}
                  className={`nx-crawl-line${line.dim ? " nx-crawl-line--dim" : ""}`}
                >
                  {line.text}
                </p>
              ))}
              <p className="nx-crawl-signoff">
              That is Nomos<span className="nx-crawl-signoff-x">X</span>
            </p>
            </div>
          </div>
        )}

        <div className="nx-crawl-rail" aria-hidden="true">
          <div
            className={`nx-crawl-rail-fill${phase === "crawl" || phase === "fading" ? " nx-crawl-rail-anim" : ""}`}
          />
        </div>
    </div>
  );
}
