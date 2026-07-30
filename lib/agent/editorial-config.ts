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
