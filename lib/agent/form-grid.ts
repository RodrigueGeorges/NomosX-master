/**
 * THINK-TANK FORM GRID — lever 8 (shadow mode).
 *
 * Deterministic checklist applied to the FINAL rendered HTML — the same
 * artifact a reader sees. Each criterion is a conservative regex/structural
 * check; a criterion only fails when the element is clearly absent, never
 * on stylistic ambiguity.
 *
 * Shadow mode: results are recorded in stats.thinkTankFormGrid on every
 * run for measurement. Promotion to a publication-gate check happens only
 * after ~10 live runs show the grid is stable (same rollout discipline as
 * the binary gate).
 */

export interface FormCriterion {
  name: string;
  passed: boolean;
  detail: string;
}

export interface FormGridResult {
  score: number;        // 0-100
  passed: number;
  total: number;
  criteria: FormCriterion[];
}

const has = (html: string, re: RegExp) => re.test(html);

function headingOrBody(html: string, re: RegExp): boolean {
  // Stronger signal in headings, acceptable in body text.
  return has(html, re);
}

export function evaluateThinkTankForm(opts: {
  html: string;
  fatalChallenges?: number;
  stats?: Record<string, any>;
}): FormGridResult {
  const html = opts.html ?? '';
  const stats = opts.stats ?? {};
  const fatal = opts.fatalChallenges ?? 0;

  const criteria: FormCriterion[] = [];

  // 1. Actionable recommendations — think-tank notes tell a decision-maker
  //    what to do, not just what is happening.
  criteria.push({
    name: 'recommendations',
    passed: headingOrBody(html, /<(h[1-6]|b|strong)[^>]*>[^<]{0,80}(recommend|implication|course of action|policy option|decision)/i)
      || has(html, /(should|must|needs? to|ought to)\s+\w+[^.]{10,160}(because|given|to (?:avoid|secure|enable|reduce))/i),
    detail: 'Addressed recommendations / implications section present',
  });

  // 2. Objections handled — either zero fatal challenges survived, or the
  //    artifact visibly engages counter-arguments.
  const objectionsEngaged = fatal === 0
    || has(html, /(objection|counter-?argument|strongest (?:critique|challenge|case against)|devil'?s advocate|steel-?man|alternative (?:view|scenario|explanation))/i);
  criteria.push({
    name: 'objections_addressed',
    passed: objectionsEngaged,
    detail: fatal === 0
      ? 'No fatal challenges remained after adversarial review'
      : has(html, /(objection|counter-?argument|strongest (?:critique|challenge|case against)|devil'?s advocate|steel-?man|alternative (?:view|scenario|explanation))/i)
        ? `Fatal challenges present (${fatal}) but counter-arguments visible in artifact`
        : `Fatal challenges present (${fatal}) and no visible objection handling`,
  });

  // 3. Methodology & limits — an epistemic box: how we know, where it breaks.
  criteria.push({
    name: 'methodology_limits',
    passed: has(html, /(methodolog|analytical approach|data sources?|evidence base|limitation|caveat|scope of|confidence interval|uncertainty)/i),
    detail: 'Methodology, data sources or limitations disclosed in artifact',
  });

  // 4. Sources disclosed as a list — bibliography/references section.
  criteria.push({
    name: 'sources_disclosed',
    passed: has(html, /references-section|>\s*Sources\s*<|class="[^"]*bibliography/i),
    detail: 'Rendered source list present',
  });

  // 5. Probabilistic stance — think-tank = calibrated uncertainty, not
  //    false certainty. Scenario/confidence/probability language.
  criteria.push({
    name: 'calibrated_uncertainty',
    passed: has(html, /(scenario|probabilit|confidence|forecast|central scenario|most likely|plausible|contingen)/i),
    detail: 'Scenario / probability / confidence framing present',
  });

  // 6. Computed exhibit — lever 7: one piece produced by code.
  criteria.push({
    name: 'computed_exhibit',
    passed: Boolean(stats.computedExhibit) || has(html, /computed-exhibit|nx-computed-exhibit|nx-quant-section/i),
    detail: stats.computedExhibit
      ? `Computed exhibit injected (${stats.computedExhibit})`
      : 'No computed exhibit recorded',
  });

  // 7. Executive summary / orientation — reader can grasp the answer fast.
  criteria.push({
    name: 'executive_summary',
    passed: has(html, /(executive summary|key findings|bottom line|in short|overview|tl;?dr|summary)/i),
    detail: 'Summary / orientation section present',
  });

  // 8. Pipeline integrity — degraded-step ledger: steps whose failure
  //    removes evidence/gate capability are critical; enrichment-only
  //    degradations are tolerated but disclosed.
  const degraded = Array.isArray(stats.degradedSteps) ? stats.degradedSteps as Array<{ step?: string }> : [];
  const CRITICAL_STEPS = new Set([
    'FACT_CHECKER', 'CITATION_VERIFIER_LLM', 'CLAIM_GROUNDING', 'SYMBOLIC_VERIFY',
    'THESIS_BINDING_NARROWING', 'THESIS_BINDING_REPAIR', 'CRITIC', 'CRITIC_PANEL',
    'OUTPUT_GUARD', 'LOCAL_JUDGE', 'CITATION_REPAIR', 'CITATION_FILTER',
  ]);
  const criticalLost = degraded.filter(d => CRITICAL_STEPS.has(String(d.step)));
  criteria.push({
    name: 'pipeline_integrity',
    passed: criticalLost.length === 0,
    detail: degraded.length === 0
      ? 'No degraded steps recorded'
      : criticalLost.length > 0
        ? `${criticalLost.length} critical step(s) degraded: ${criticalLost.map(d => d.step).join(', ')}`
        : `${degraded.length} non-critical step(s) degraded: ${degraded.map(d => d.step).join(', ')}`,
  });

  const passed = criteria.filter(c => c.passed).length;
  const total = criteria.length;
  return { score: Math.round((passed / total) * 100), passed, total, criteria };
}
