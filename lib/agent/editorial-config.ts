/**
 * Editorial V2 feature flag — position-first, foresight-in-core pipeline reorder.
 * When false: legacy step order (editor at step 8).
 */

export function isEditorialV2Enabled(): boolean {
  const v = process.env.EDITORIAL_V2;
  return v === '1' || v?.toLowerCase() === 'true';
}

/** Strategic pipeline budget — foresight in-core needs headroom. */
export function getPipelineMaxBudgetUsd(isStrategic: boolean, editorialV2: boolean): number {
  if (!isStrategic) return 3.0;
  return editorialV2 ? 12.0 : 8.0;
}
