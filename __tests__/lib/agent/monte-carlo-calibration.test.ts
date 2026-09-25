/**
 * Monte Carlo calibration regression tests.
 *
 * The previous implementation used winner-take-all argmax over a score that
 * double-counted the prior (assumptions were fabricated FROM the prior, then
 * prior*0.5 was added again). Priors 40/30/20/10 collapsed to ~82/16/2/0
 * without any new evidence. The sampler must propagate uncertainty instead.
 */

import { runMonteCarloSimulation } from '@/lib/agent/simulation-agent';

const PRIORS = [
  { name: 'A', description: 'a', assumptions: {}, priorProbability: 0.4 },
  { name: 'B', description: 'b', assumptions: {}, priorProbability: 0.3 },
  { name: 'C', description: 'c', assumptions: {}, priorProbability: 0.2 },
  { name: 'D', description: 'd', assumptions: {}, priorProbability: 0.1 },
];
const PARAMS = { momentum: 0.5, uncertainty: 0.3, adoption: 0.5 };

describe('Monte Carlo — uncertainty propagation (no artificial concentration)', () => {
  test('neutral evidence preserves prior ordering without collapse', async () => {
    const r = await runMonteCarloSimulation({ scenarios: PRIORS, parameters: PARAMS, runs: 3000, seed: 42 });
    const p = r.probabilities;
    expect(p.A).toBeGreaterThan(p.B);
    expect(p.B).toBeGreaterThan(p.C);
    expect(p.C).toBeGreaterThan(p.D);
    // No sharpening: top stays near prior, small prior is not annihilated
    expect(p.A).toBeLessThan(0.6);
    expect(p.D).toBeGreaterThan(0.03);
    const sum = p.A + p.B + p.C + p.D;
    expect(Math.abs(sum - 1)).toBeLessThan(0.02);
  });

  test('matching explicit assumptions move probability toward the scenario', async () => {
    const favored = PRIORS.map((s) =>
      s.name === 'C'
        ? { ...s, assumptions: { momentum: 0.5, uncertainty: 0.3, adoption: 0.5 } }
        : { ...s, assumptions: { momentum: 0.02, uncertainty: 0.02, adoption: 0.02 } }
    );
    const r = await runMonteCarloSimulation({ scenarios: favored, parameters: PARAMS, runs: 3000, seed: 7 });
    expect(r.probabilities.C).toBeGreaterThan(0.35);
    expect(r.probabilities.C).toBeGreaterThan(r.probabilities.A);
  });

  test('deterministic for a fixed seed', async () => {
    const a = await runMonteCarloSimulation({ scenarios: PRIORS, parameters: PARAMS, runs: 800, seed: 99 });
    const b = await runMonteCarloSimulation({ scenarios: PRIORS, parameters: PARAMS, runs: 800, seed: 99 });
    expect(a.probabilities).toEqual(b.probabilities);
    expect(a.runsUsed).toBe(b.runsUsed);
  });

  test('reports standard errors for all scenarios', async () => {
    const r = await runMonteCarloSimulation({ scenarios: PRIORS, parameters: PARAMS, runs: 1000, seed: 5 });
    for (const s of PRIORS) {
      expect(r.standardErrors[s.name]).toBeGreaterThanOrEqual(0);
      expect(r.standardErrors[s.name]).toBeLessThan(0.1);
    }
  });
});
