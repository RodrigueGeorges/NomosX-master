/**
 * DEGRADED-STEP LEDGER — silent-failure disclosure (CTO review: "un run
 * peut aboutir en ayant perdu la moitié de ses étapes sans que la
 * publication le dise").
 *
 * Non-blocking catches are correct engineering — a provider outage must
 * not kill a run. The defect is INVISIBILITY: nothing aggregates which
 * steps degraded, so a published note can't disclose what it lost.
 *
 * `recordDegradedStep(stats, step, reason)` appends to
 * `stats.degradedSteps[]` (deduped by step, capped). The ledger lands in
 * PipelineRun.steps via stats persistence and is surfaced on the gate
 * record — every publication decision becomes auditable for degradation.
 */

const MAX_DEGRADED_STEPS = 50;

export function recordDegradedStep(
  stats: Record<string, any> | undefined | null,
  step: string,
  reason?: unknown,
): void {
  if (!stats) return;
  const detail = reason instanceof Error ? reason.message.slice(0, 200) : String(reason ?? '').slice(0, 200);
  const list = (stats.degradedSteps ??= []) as Array<{ step: string; reason?: string }>;
  if (list.some(d => d.step === step)) {
    // Keep the first record but refresh recency is unnecessary — dedupe.
    return;
  }
  if (list.length >= MAX_DEGRADED_STEPS) return;
  list.push(detail ? { step, reason: detail } : { step });
}

export function degradedStepCount(stats: Record<string, any> | undefined | null): number {
  return Array.isArray(stats?.degradedSteps) ? stats.degradedSteps.length : 0;
}
