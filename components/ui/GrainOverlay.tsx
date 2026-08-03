"use client";

/**
 * GrainOverlay — a barely-perceptible film grain texture across the page.
 * Gives the pure-black surface tactile depth (analog warmth).
 * Animated with a subtle 8s step shift so it's alive, not static.
 */
export function GrainOverlay() {
  return <div className="nx-grain" aria-hidden="true" />;
}
