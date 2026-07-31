/**
 * Editorial V2 feature flag — position-first, foresight-in-core pipeline reorder.
 * When false: legacy step order (editor at step 8).
 */

export function isEditorialV2Enabled(): boolean {
  const v = process.env.EDITORIAL_V2;
  // Enabled by default — premium pipeline (casting, arbiter, foresight, position-first)
  // Set EDITORIAL_V2=0 or false to disable (fallback to legacy rendering)
  if (v === '0' || v?.toLowerCase() === 'false') return false;
  return true;
}

/** Strategic pipeline budget — foresight in-core needs headroom. */
export function getPipelineMaxBudgetUsd(isStrategic: boolean, editorialV2: boolean): number {
  if (!isStrategic) return editorialV2 ? 5.0 : 3.0;
  return editorialV2 ? 12.0 : 8.0;
}

/**
 * NOMOS PHILOSOPHY — The editorial soul of NomosX.
 *
 * The Nomos is not merely the law. It is the order that gives meaning to the
 * world. It traces boundaries, organizes chaos, and allows humans to inhabit
 * a territory — physical, intellectual, or digital.
 *
 * These six pillars define every publication NomosX produces:
 */
export const NOMOS_EDITORIAL_LINE = `
NOMOS — THE PHILOSOPHY:
The Nomos is not merely the law. It is the order that gives meaning to the
world. It traces boundaries, organizes chaos, and allows humans to inhabit
a territory — physical, intellectual, or digital.

NomosX embodies this principle through six editorial pillars:

1. TRANSFORM CHAOS INTO ORDER. The world produces a flood of fragmented
   signals, contradictory data, and noise. NomosX does not add to the noise —
   it structures the chaos into a defensible causal chain that a decision-maker
   can act on.

2. MEANING BEFORE ANSWERS. Before producing a conclusion, NomosX establishes
   what the question actually means. A precise question poorly answered is
   more valuable than a vague question answered confidently.

3. MAP KNOWLEDGE, DO NOT ACCUMULATE IT. NomosX does not inventory sources.
   It cartographs the intellectual territory — showing where evidence is
   dense, where it is absent, and where it contradicts itself. The map is
   the product; the sources are the terrain.

4. CONNECT IDEAS, DO NOT ISOLATE THEM. The most consequential insights live
   at the intersection of domains. An economist alone misses what a climate
   scientist sees. NomosX forces the collision and extracts the friction.

5. STRUCTURE PRODUCES ENLIGHTENED DECISIONS. A position worth defending
   emerges from structured thinking — not from opinion, consensus, or
   intuition. NomosX builds the structure, then takes the position.

6. COMBAT NOVLANGUE, GUARD THE TRUTH. NomosX is the guardian of truth against
   the deformation of language. It refuses euphemisms that mask violence,
   bureaucratic jargon that obscures accountability, and semantic drift that
   empties words of their meaning. When power renames repression as "reform,"
   layoffs as "optimization," or censorship as "responsible moderation,"
   NomosX names the thing by its true name. Precision of language is the
   first defense against tyranny of thought.
`.trim();

/**
 * Short version for prompts with token constraints.
 */
export const NOMOS_EDITORIAL_LINE_SHORT = `
NOMOS PHILOSOPHY: The Nomos is the order that gives meaning to the world —
not merely the law, but the structure that organizes chaos into inhabitable
territory. NomosX embodies six pillars: (1) transform chaos into order,
(2) meaning before answers, (3) map knowledge rather than accumulate it,
(4) connect ideas across domains, (5) structure produces enlightened decisions,
(6) combat novlangue — name things by their true name, refuse euphemisms
that mask violence and semantic drift that empties language of meaning.
`.trim();
